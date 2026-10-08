import { BadRequestException, Injectable } from '@nestjs/common';

import { getVietnamNow } from '../common/time.util.js';
import { DatabaseService } from '../database/database.service.js';
import { buildTransferContent } from '../payments/payments.utils.js';
import type { ChartView } from './dto/overview-query.dto.js';

// Đơn đang giữ sân hoặc đã đá xong → tính vào mức lấp đầy
const OCCUPYING_STATUSES = `'Pending','Confirmed','CheckedIn','Playing','Completed'`;
// Đơn "có hiệu lực" cho thống kê/doanh thu: bỏ đơn hủy và khách không đến
const COUNTED_STATUSES = `'Pending','Confirmed','CheckedIn','Playing','Completed'`;
const UPCOMING_STATUSES = `'Confirmed','CheckedIn','Playing'`;

const LIST_LIMIT = 5;
// Biểu đồ theo giờ: 06:00 → 22:00 (khớp ma trận lịch sân ở màn 14)
const CHART_FIRST_HOUR = 6;
const CHART_LAST_HOUR = 21;

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export const round2 = (value: number): number =>
    Math.round((value + Number.EPSILON) * 100) / 100;

/** Thứ Hai của tuần chứa `date` (YYYY-MM-DD), tính thuần theo lịch, không phụ thuộc múi giờ máy. */
export function startOfWeek(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    const offset = (d.getUTCDay() + 6) % 7; // T2=0 ... CN=6
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Epoch (giây) của 00:00 giờ Việt Nam (UTC+7) ngày `date`. */
export function vietnamDayStartEpoch(date: string): number {
    return Date.parse(`${date}T00:00:00+07:00`) / 1000;
}

interface CountRow { total: string | number }
interface HoursRow { hours: string | number | null }
interface StatusRow { status: string; total: string | number }
interface RevenueRow { revenue: string | number | null }
interface BucketRow { bucket: string | number; bookings: string | number; revenue: string | number | null }
interface CollectedRow { amount: string | number | null }
interface BookingListRow {
    booking_id: number;
    booking_date: string;
    start_time: string;
    end_time: string;
    status: string;
    customer_name: string;
    pitch_name: string;
    total_amount: string | number;
    paid_amount: string | number;
    created_at: string;
}

@Injectable()
export class DashboardService {
    constructor(private readonly database: DatabaseService) { }

    async getOverview(dateInput?: string, view: ChartView = 'day') {
        const now = getVietnamNow();
        const date = this.resolveDate(dateInput, now.date);
        const dayStart = vietnamDayStartEpoch(date);
        const dayEnd = vietnamDayStartEpoch(addDays(date, 1));

        const [
            totalRows,
            pendingRows,
            statusRows,
            bookedHoursRows,
            capacityRows,
            revenueRows,
            collectedRows,
            chart,
            latest,
            upcoming,
        ] = await Promise.all([
            this.database.query<CountRow[]>(
                `SELECT COUNT(*) AS total FROM bookings
                 WHERE booking_date = ? AND status IN (${COUNTED_STATUSES})`,
                [date],
            ),
            this.database.query<CountRow[]>(
                `SELECT COUNT(*) AS total FROM bookings
                 WHERE booking_date = ? AND status = 'Pending'`,
                [date],
            ),
            this.database.query<StatusRow[]>(
                `SELECT status, COUNT(*) AS total FROM bookings
                 WHERE booking_date = ? GROUP BY status`,
                [date],
            ),
            this.database.query<HoursRow[]>(
                `SELECT SUM(TIME_TO_SEC(TIMEDIFF(end_time, start_time))) / 3600 AS hours
                 FROM bookings
                 WHERE booking_date = ? AND status IN (${OCCUPYING_STATUSES})`,
                [date],
            ),
            // Sức chứa = tổng số giờ có bảng giá của mọi sân đang hoạt động
            this.database.query<HoursRow[]>(
                `SELECT SUM(TIME_TO_SEC(TIMEDIFF(ps.end_time, ps.start_time))) / 3600 AS hours
                 FROM pitches p
                 JOIN price_slots ps ON ps.category_id = p.category_id
                 WHERE p.status = 'Available'`,
            ),
            this.database.query<RevenueRow[]>(
                `SELECT SUM(COALESCE(i.total_amount, b.total_pitch_price)) AS revenue
                 FROM bookings b
                 LEFT JOIN invoices i ON i.booking_id = b.booking_id
                 WHERE b.booking_date = ? AND b.status IN (${COUNTED_STATUSES})`,
                [date],
            ),
            // Tiền thực thu trong ngày (đã trừ hoàn cọc thành công).
            // So sánh theo UNIX_TIMESTAMP với mốc 00:00 giờ VN nên đúng bất kể
            // time_zone của MySQL (CONVERT_TZ với 'SYSTEM' trả về NULL).
            this.database.query<CollectedRow[]>(
                `SELECT
                    COALESCE((SELECT SUM(p.amount) FROM payments p
                              WHERE p.status = 'Successful'
                                AND UNIX_TIMESTAMP(p.paid_at) >= ?
                                AND UNIX_TIMESTAMP(p.paid_at) < ?), 0)
                  - COALESCE((SELECT SUM(r.amount) FROM payment_refunds r
                              WHERE r.status = 'Successful'
                                AND UNIX_TIMESTAMP(r.processed_at) >= ?
                                AND UNIX_TIMESTAMP(r.processed_at) < ?), 0)
                    AS amount`,
                [dayStart, dayEnd, dayStart, dayEnd],
            ),
            this.getChart(date, view),
            this.getLatestBookings(),
            this.getUpcoming(date, now),
        ]);

        const capacityHours = Number(capacityRows[0]?.hours ?? 0);
        const bookedHours = Number(bookedHoursRows[0]?.hours ?? 0);
        const occupancy =
            capacityHours > 0 ? Math.min(100, (bookedHours / capacityHours) * 100) : 0;

        return {
            date,
            kpis: {
                total_bookings: Number(totalRows[0]?.total ?? 0),
                pending_deposit_bookings: Number(pendingRows[0]?.total ?? 0),
                occupancy_rate: round2(occupancy),
                booked_hours: round2(bookedHours),
                capacity_hours: round2(capacityHours),
                estimated_revenue: round2(Number(revenueRows[0]?.revenue ?? 0)),
                collected_amount: round2(Number(collectedRows[0]?.amount ?? 0)),
            },
            status_counts: Object.fromEntries(
                statusRows.map((row) => [row.status, Number(row.total)]),
            ),
            chart,
            latest_bookings: latest,
            upcoming_bookings: upcoming,
        };
    }

    private async getChart(date: string, view: ChartView) {
        if (view === 'week') {
            const from = startOfWeek(date);
            const to = addDays(from, 6);

            const rows = await this.database.query<BucketRow[]>(
                `SELECT DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS bucket,
                        COUNT(*) AS bookings,
                        SUM(COALESCE(i.total_amount, b.total_pitch_price)) AS revenue
                 FROM bookings b
                 LEFT JOIN invoices i ON i.booking_id = b.booking_id
                 WHERE b.booking_date BETWEEN ? AND ?
                   AND b.status IN (${COUNTED_STATUSES})
                 GROUP BY b.booking_date`,
                [from, to],
            );

            const byDay = new Map(rows.map((row) => [String(row.bucket), row]));

            return {
                view,
                from,
                to,
                points: WEEKDAY_LABELS.map((label, index) => {
                    const day = addDays(from, index);
                    const row = byDay.get(day);

                    return {
                        label,
                        key: day,
                        bookings: Number(row?.bookings ?? 0),
                        revenue: round2(Number(row?.revenue ?? 0)),
                        is_selected: day === date,
                    };
                }),
            };
        }

        const rows = await this.database.query<BucketRow[]>(
            `SELECT HOUR(b.start_time) AS bucket,
                    COUNT(*) AS bookings,
                    SUM(COALESCE(i.total_amount, b.total_pitch_price)) AS revenue
             FROM bookings b
             LEFT JOIN invoices i ON i.booking_id = b.booking_id
             WHERE b.booking_date = ? AND b.status IN (${COUNTED_STATUSES})
             GROUP BY HOUR(b.start_time)`,
            [date],
        );

        const byHour = new Map(rows.map((row) => [Number(row.bucket), row]));
        const points = [];

        for (let hour = CHART_FIRST_HOUR; hour <= CHART_LAST_HOUR; hour++) {
            const row = byHour.get(hour);
            const label = `${String(hour).padStart(2, '0')}:00`;

            points.push({
                label,
                key: label,
                bookings: Number(row?.bookings ?? 0),
                revenue: round2(Number(row?.revenue ?? 0)),
            });
        }

        return { view, from: date, to: date, points };
    }

    // Đơn mới tạo gần đây nhất (không phụ thuộc ngày đang xem)
    private async getLatestBookings() {
        const rows = await this.database.query<BookingListRow[]>(
            `${this.bookingListSelect()}
             ORDER BY b.created_at DESC, b.booking_id DESC
             LIMIT ${LIST_LIMIT}`,
        );

        return rows.map((row) => this.toListItem(row));
    }

    // Lượt sân sắp diễn ra trong ngày đang xem (nếu là hôm nay: chỉ những lượt chưa kết thúc)
    private async getUpcoming(date: string, now: { date: string; time: string }) {
        const onlyFuture = date === now.date;

        const rows = await this.database.query<BookingListRow[]>(
            `${this.bookingListSelect()}
             WHERE b.booking_date = ?
               AND b.status IN (${UPCOMING_STATUSES})
               ${onlyFuture ? 'AND b.end_time > ?' : ''}
             ORDER BY b.start_time ASC, b.booking_id ASC
             LIMIT ${LIST_LIMIT}`,
            onlyFuture ? [date, now.time] : [date],
        );

        return rows.map((row) => this.toListItem(row));
    }

    private bookingListSelect(): string {
        return `
            SELECT
                b.booking_id,
                DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
                TIME_FORMAT(b.start_time, '%H:%i') AS start_time,
                TIME_FORMAT(b.end_time, '%H:%i') AS end_time,
                b.status,
                u.full_name AS customer_name,
                p.pitch_name,
                COALESCE(i.total_amount, b.total_pitch_price) AS total_amount,
                COALESCE((SELECT SUM(pay.amount) FROM payments pay
                          WHERE pay.invoice_id = i.invoice_id
                            AND pay.status = 'Successful'), 0) AS paid_amount,
                b.created_at
            FROM bookings b
            JOIN users u ON u.user_id = b.customer_id
            JOIN pitches p ON p.pitch_id = b.pitch_id
            LEFT JOIN invoices i ON i.booking_id = b.booking_id
        `;
    }

    private toListItem(row: BookingListRow) {
        const total = Number(row.total_amount);
        const paid = Number(row.paid_amount);

        return {
            booking_id: row.booking_id,
            booking_code: buildTransferContent(row.booking_id),
            customer_name: row.customer_name,
            pitch_name: row.pitch_name,
            booking_date: row.booking_date,
            start_time: row.start_time,
            end_time: row.end_time,
            status: row.status,
            total_amount: total,
            paid_amount: paid,
            remaining_amount: Math.max(0, round2(total - paid)),
        };
    }

    private resolveDate(input: string | undefined, today: string): string {
        if (!input) {
            return today;
        }

        const parsed = new Date(`${input}T00:00:00Z`);

        if (
            Number.isNaN(parsed.getTime()) ||
            parsed.toISOString().slice(0, 10) !== input
        ) {
            throw new BadRequestException('Ngày không hợp lệ.');
        }

        return input;
    }
}
