import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { PoolConnection } from 'mysql2/promise';

import { DatabaseService } from '../database/database.service.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import type { ReviewsQueryDto } from './dto/reviews-query.dto.js';
import type { UpdateReviewDto } from './dto/update-review.dto.js';
import {
    buildRatingSummary,
    maskReviewerName,
    normalizeComment,
    reviewBlockReason,
    type RatingAggregateRow,
} from './reviews.utils.js';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const ALREADY_REVIEWED = 'Đơn này đã được đánh giá';
const BOOKING_NOT_FOUND = 'Không tìm thấy đơn đặt sân';

interface BookingRow {
    booking_id: number;
    customer_id: number;
    pitch_id: number;
    status: string;
}

interface ReviewRow {
    review_id: number;
    booking_id: number;
    customer_id: number;
    pitch_id: number;
    rating: number;
    comment: string | null;
    created_at: Date | string;
    updated_at: Date | string;
}

interface ReviewListRow {
    review_id: number;
    rating: number;
    comment: string | null;
    created_at: Date | string;
    full_name: string | null;
}

@Injectable()
export class ReviewsService {
    constructor(private readonly database: DatabaseService) { }

    // ---------------------------------------------------------------
    // Khách gửi đánh giá cho đơn đã hoàn thành (mỗi đơn 1 lần)
    // ---------------------------------------------------------------
    async create(userId: number, dto: CreateReviewDto) {
        try {
            return await this.database.transaction(async (connection) => {
                // Khóa đơn để hai lần gửi cùng lúc không tạo ra hai đánh giá
                const [booking] = await this.exec<BookingRow[]>(
                    connection,
                    `
                    SELECT booking_id, customer_id, pitch_id, status
                    FROM bookings
                    WHERE booking_id = ?
                    FOR UPDATE
                    `,
                    [dto.booking_id],
                );

                // Đơn của người khác -> 404 để không lộ đơn có tồn tại
                if (!booking || Number(booking.customer_id) !== userId) {
                    throw new NotFoundException(BOOKING_NOT_FOUND);
                }

                const blockReason = reviewBlockReason(booking.status);
                if (blockReason) {
                    throw new ConflictException(blockReason);
                }

                const [existing] = await this.exec<{ review_id: number }[]>(
                    connection,
                    `SELECT review_id FROM reviews WHERE booking_id = ?`,
                    [booking.booking_id],
                );
                if (existing) {
                    throw new ConflictException(ALREADY_REVIEWED);
                }

                const [result] = await connection.execute(
                    `
                    INSERT INTO reviews (booking_id, customer_id, pitch_id, rating, comment)
                    VALUES (?, ?, ?, ?, ?)
                    `,
                    [
                        booking.booking_id,
                        userId,
                        booking.pitch_id,
                        dto.rating,
                        normalizeComment(dto.comment),
                    ],
                );

                const [created] = await this.exec<ReviewRow[]>(
                    connection,
                    `SELECT * FROM reviews WHERE review_id = ?`,
                    [(result as { insertId: number }).insertId],
                );

                return {
                    message: 'Cảm ơn bạn đã đánh giá',
                    review: this.toView(created),
                };
            });
        } catch (error) {
            // Phòng hờ: DB đã chặn trùng bằng UNIQUE(booking_id)
            if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
                throw new ConflictException(ALREADY_REVIEWED);
            }
            throw error;
        }
    }

    // ---------------------------------------------------------------
    // Màn "Đơn của tôi": đơn này đã đánh giá chưa / có đánh giá được không
    // ---------------------------------------------------------------
    async getForBooking(userId: number, bookingId: number) {
        const [booking] = await this.database.query<BookingRow[]>(
            `
            SELECT booking_id, customer_id, pitch_id, status
            FROM bookings
            WHERE booking_id = ?
            `,
            [bookingId],
        );

        if (!booking || Number(booking.customer_id) !== userId) {
            throw new NotFoundException(BOOKING_NOT_FOUND);
        }

        const [review] = await this.database.query<ReviewRow[]>(
            `SELECT * FROM reviews WHERE booking_id = ?`,
            [bookingId],
        );

        const reason = review
            ? ALREADY_REVIEWED
            : reviewBlockReason(booking.status);

        return {
            booking_id: booking.booking_id,
            pitch_id: booking.pitch_id,
            can_review: !review && reason === null,
            reason,
            review: review ? this.toView(review) : null,
        };
    }

    // ---------------------------------------------------------------
    // Khách sửa đánh giá của chính mình
    // ---------------------------------------------------------------
    async update(userId: number, reviewId: number, dto: UpdateReviewDto) {
        return this.database.transaction(async (connection) => {
            const [review] = await this.exec<ReviewRow[]>(
                connection,
                `SELECT * FROM reviews WHERE review_id = ? FOR UPDATE`,
                [reviewId],
            );

            if (!review || Number(review.customer_id) !== userId) {
                throw new NotFoundException('Không tìm thấy đánh giá');
            }

            await connection.execute(
                `UPDATE reviews SET rating = ?, comment = ? WHERE review_id = ?`,
                [dto.rating, normalizeComment(dto.comment), reviewId],
            );

            const [updated] = await this.exec<ReviewRow[]>(
                connection,
                `SELECT * FROM reviews WHERE review_id = ?`,
                [reviewId],
            );

            return {
                message: 'Đã cập nhật đánh giá',
                review: this.toView(updated),
            };
        });
    }

    // ---------------------------------------------------------------
    // Công khai: đánh giá của một sân (tổng quan + danh sách phân trang)
    // ---------------------------------------------------------------
    async listByPitch(query: ReviewsQueryDto) {
        const limit = Math.min(
            Math.max(1, Math.floor(query.limit ?? DEFAULT_PAGE_SIZE)),
            MAX_PAGE_SIZE,
        );
        const page = Math.max(1, Math.floor(query.page ?? 1));
        const offset = (page - 1) * limit;
        const rating = query.rating ?? null;

        const [pitch] = await this.database.query<
            { pitch_id: number; pitch_name: string }[]
        >(`SELECT pitch_id, pitch_name FROM pitches WHERE pitch_id = ?`, [
            query.pitch_id,
        ]);

        if (!pitch) {
            throw new NotFoundException('Không tìm thấy sân');
        }

        const [summaryRows, countRows, items] = await Promise.all([
            this.database.query<RatingAggregateRow[]>(
                `
                SELECT
                    COUNT(*) AS review_count,
                    AVG(rating) AS average,
                    SUM(rating = 1) AS star_1,
                    SUM(rating = 2) AS star_2,
                    SUM(rating = 3) AS star_3,
                    SUM(rating = 4) AS star_4,
                    SUM(rating = 5) AS star_5
                FROM reviews
                WHERE pitch_id = ?
                `,
                [query.pitch_id],
            ),
            this.database.query<{ total: string | number }[]>(
                `
                SELECT COUNT(*) AS total
                FROM reviews
                WHERE pitch_id = ? AND (? IS NULL OR rating = ?)
                `,
                [query.pitch_id, rating, rating],
            ),
            // limit/offset đã ép về số nguyên ở trên nên chèn thẳng vào SQL
            // (mysql2 execute không nhận LIMIT ? ổn định trên MySQL 8)
            this.database.query<ReviewListRow[]>(
                `
                SELECT r.review_id, r.rating, r.comment, r.created_at, u.full_name
                FROM reviews r
                JOIN users u ON u.user_id = r.customer_id
                WHERE r.pitch_id = ? AND (? IS NULL OR r.rating = ?)
                ORDER BY r.created_at DESC, r.review_id DESC
                LIMIT ${limit} OFFSET ${offset}
                `,
                [query.pitch_id, rating, rating],
            ),
        ]);

        const total = Number(countRows[0]?.total ?? 0);

        return {
            pitch_id: pitch.pitch_id,
            pitch_name: pitch.pitch_name,
            summary: buildRatingSummary(summaryRows[0]),
            rating_filter: rating,
            page,
            limit,
            total,
            total_pages: Math.max(1, Math.ceil(total / limit)),
            items: items.map((row) => ({
                review_id: row.review_id,
                rating: row.rating,
                comment: row.comment,
                reviewer_name: maskReviewerName(row.full_name),
                created_at: row.created_at,
            })),
        };
    }

    // ---------------------------------------------------------------
    // Hỗ trợ
    // ---------------------------------------------------------------
    private toView(row: ReviewRow) {
        return {
            review_id: row.review_id,
            booking_id: row.booking_id,
            pitch_id: row.pitch_id,
            rating: row.rating,
            comment: row.comment,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }

    private async exec<T>(
        connection: PoolConnection,
        sql: string,
        params: unknown[] = [],
    ): Promise<T> {
        const [rows] = await connection.execute(sql, params as never[]);
        return rows as T;
    }
}
