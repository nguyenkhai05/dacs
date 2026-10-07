import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { ReviewsService } from './reviews.service.js';

const REVIEW_ROW = {
    review_id: 7,
    booking_id: 5,
    customer_id: 9,
    pitch_id: 2,
    rating: 5,
    comment: 'Sân đẹp',
    created_at: '2026-10-05T10:00:00.000Z',
    updated_at: '2026-10-05T10:00:00.000Z',
};

interface Options {
    booking?: Record<string, unknown> | null;
    existingReview?: boolean;
    review?: Record<string, unknown> | null;
    insertError?: Error;
}

// Giả lập DB: trả dữ liệu theo nội dung câu SQL
function setup(options: Options = {}) {
    const {
        booking = { booking_id: 5, customer_id: 9, pitch_id: 2, status: 'Completed' },
        existingReview = false,
        review = REVIEW_ROW,
        insertError,
    } = options;

    const execute = vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM bookings')) return [booking ? [booking] : []];
        if (sql.includes('SELECT review_id FROM reviews')) {
            return [existingReview ? [{ review_id: 1 }] : []];
        }
        if (sql.includes('INSERT INTO reviews')) {
            if (insertError) throw insertError;
            return [{ insertId: 7 }];
        }
        if (sql.includes('FROM reviews') && sql.includes('FOR UPDATE')) {
            return [review ? [review] : []];
        }
        if (sql.includes('SELECT * FROM reviews')) return [review ? [review] : []];
        return [{ affectedRows: 1, params }];
    });
    const connection = { execute };
    const query = vi.fn(async (sql: string) => {
        if (sql.includes('FROM bookings')) return booking ? [booking] : [];
        if (sql.includes('FROM reviews WHERE booking_id')) return existingReview && review ? [review] : [];
        return [];
    });
    const database = {
        transaction: vi.fn(async (cb: (c: typeof connection) => unknown) => cb(connection)),
        query,
    };

    return {
        service: new ReviewsService(database as unknown as DatabaseService),
        execute,
        query,
    };
}

describe('ReviewsService.create', () => {
    it('tạo đánh giá cho đơn đã hoàn thành của chính mình', async () => {
        const { service, execute } = setup();

        const result = await service.create(9, {
            booking_id: 5,
            rating: 5,
            comment: '  Sân đẹp  ',
        });

        expect(result.review.review_id).toBe(7);
        const insert = execute.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO reviews'),
        );
        // [booking_id, customer_id, pitch_id, rating, comment đã cắt khoảng trắng]
        expect(insert?.[1]).toEqual([5, 9, 2, 5, 'Sân đẹp']);
    });

    it('đơn không tồn tại hoặc của người khác -> 404', async () => {
        await expect(
            setup({ booking: null }).service.create(9, { booking_id: 5, rating: 4 }),
        ).rejects.toBeInstanceOf(NotFoundException);

        await expect(
            setup().service.create(123, { booking_id: 5, rating: 4 }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('đơn chưa hoàn thành hoặc đã hủy -> 409', async () => {
        for (const status of ['Pending', 'Confirmed', 'Playing', 'Cancelled', 'NoShow']) {
            const { service } = setup({
                booking: { booking_id: 5, customer_id: 9, pitch_id: 2, status },
            });
            await expect(
                service.create(9, { booking_id: 5, rating: 4 }),
            ).rejects.toBeInstanceOf(ConflictException);
        }
    });

    it('đơn đã đánh giá rồi -> 409', async () => {
        await expect(
            setup({ existingReview: true }).service.create(9, { booking_id: 5, rating: 4 }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hai lần gửi cùng lúc: lỗi UNIQUE của DB cũng trả 409 (không phải 500)', async () => {
        const duplicate = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });

        await expect(
            setup({ insertError: duplicate }).service.create(9, { booking_id: 5, rating: 4 }),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe('ReviewsService.getForBooking', () => {
    it('đơn hoàn thành chưa đánh giá -> can_review = true', async () => {
        const result = await setup().service.getForBooking(9, 5);

        expect(result.can_review).toBe(true);
        expect(result.reason).toBeNull();
        expect(result.review).toBeNull();
    });

    it('đơn đã đánh giá -> trả lại đánh giá, không đánh giá thêm được', async () => {
        const result = await setup({ existingReview: true }).service.getForBooking(9, 5);

        expect(result.can_review).toBe(false);
        expect(result.review?.review_id).toBe(7);
        expect(result.reason).toContain('đã được đánh giá');
    });

    it('đơn chưa đá xong -> can_review = false kèm lý do', async () => {
        const { service } = setup({
            booking: { booking_id: 5, customer_id: 9, pitch_id: 2, status: 'Confirmed' },
        });
        const result = await service.getForBooking(9, 5);

        expect(result.can_review).toBe(false);
        expect(result.reason).toContain('sau khi trận đấu');
    });

    it('đơn của người khác -> 404', async () => {
        await expect(setup().service.getForBooking(123, 5)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe('ReviewsService.update', () => {
    it('chủ đánh giá sửa được', async () => {
        const { service, execute } = setup();

        const result = await service.update(9, 7, { rating: 3, comment: '' });

        expect(result.message).toContain('cập nhật');
        const update = execute.mock.calls.find(([sql]) =>
            String(sql).includes('UPDATE reviews'),
        );
        // nhận xét rỗng được lưu thành NULL
        expect(update?.[1]).toEqual([3, null, 7]);
    });

    it('người khác hoặc đánh giá không tồn tại -> 404', async () => {
        await expect(
            setup().service.update(123, 7, { rating: 3 }),
        ).rejects.toBeInstanceOf(NotFoundException);

        await expect(
            setup({ review: null }).service.update(9, 7, { rating: 3 }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('ReviewsService.listByPitch', () => {
    function listService(pitchFound = true) {
        const query = vi.fn(async (sql: string) => {
            if (sql.includes('FROM pitches')) {
                return pitchFound ? [{ pitch_id: 2, pitch_name: 'Sân 5 - Số 1' }] : [];
            }
            if (sql.includes('AVG(rating)')) {
                return [{ review_count: '12', average: '4.25', star_1: '0', star_2: '1', star_3: '1', star_4: '4', star_5: '6' }];
            }
            if (sql.includes('COUNT(*) AS total')) return [{ total: '12' }];
            return [
                { review_id: 9, rating: 5, comment: 'Tuyệt', created_at: '2026-10-05', full_name: 'Nguyễn Văn Khách' },
            ];
        });
        return { service: new ReviewsService({ query } as unknown as DatabaseService), query };
    }

    it('trả tổng quan, phân trang và che tên người đánh giá', async () => {
        const result = await listService().service.listByPitch({ pitch_id: 2, limit: 5 });

        expect(result.summary.average).toBe(4.3);
        expect(result.summary.review_count).toBe(12);
        expect(result.total).toBe(12);
        expect(result.total_pages).toBe(3);
        expect(result.items[0].reviewer_name).toBe('N. V. Khách');
        expect(result.items[0]).not.toHaveProperty('customer_id');
    });

    it('chặn limit quá lớn và page nhỏ hơn 1', async () => {
        const { service, query } = listService();
        const result = await service.listByPitch({ pitch_id: 2, limit: 9999, page: 0 });

        expect(result.limit).toBe(50);
        expect(result.page).toBe(1);
        const listSql = query.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes('LIMIT'));
        expect(listSql).toContain('LIMIT 50 OFFSET 0');
    });

    it('sân không tồn tại -> 404', async () => {
        await expect(
            listService(false).service.listByPitch({ pitch_id: 99 }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
