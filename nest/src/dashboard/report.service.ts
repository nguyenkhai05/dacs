import { BadRequestException, Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2';

import { addDays } from '../common/date.util.js';
import { getVietnamNow } from '../common/time.util.js';
import { DatabaseService } from '../database/database.service.js';
import { buildCsv, csvNumber, csvText } from '../payment-admin/payment-admin.utils.js';
import { round2, startOfWeek, vietnamDayStartEpoch } from './dashboard.service.js';
import type { ReportGroup, ReportPeriod } from './dto/report-query.dto.js';

// Đơn đang giữ sân hoặc đã đá xong → tính giờ đã đặt (cùng định nghĩa với tổng quan)
const OCCUPYING_STATUSES = `'Pending','Confirmed','CheckedIn','Playing','Completed'`;

const TREND_DAYS = 7;
const VN_OFFSET_SECONDS = 7 * 3600;
const PEAK_WINDOW_HOURS = 2;

export interface ReportRange {
    from: string;
    to: string;
    days: number;
    label: string;
}

export interface BookedSlot {
    start_time: string;
    end_time: string;
    total: number;
}

export interface PeakWindow {
    start_hour: number;
    end_hour: number;
    label: string;
    booked_hours: number;
    occupancy_rate: number;
}

/** Làm tròn 1 chữ số thập phân. */
export const round1 = (value: number): number =>
    Math.round((value + Number.EPSILON) * 10) / 10;

/** Tỷ lệ phần trăm (1 số lẻ); mẫu số 0 → 0. */
export function percent(part: number, whole: number): number {
    return whole > 0 ? round1((part / whole) * 100) : 0;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

const toMinutes = (value: string): number => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + (minutes || 0);
};

/** Ngày cuối cùng của tháng chứa `date`. */
function endOfMonth(date: string): string {
    const [year, month] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Khoảng thời gian của kỳ báo cáo, tính thuần theo lịch (không phụ thuộc múi giờ máy). */
export function resolveReportRange(period: ReportPeriod, date: string): ReportRange {
    const [year, month] = date.split('-');

    if (period === 'month') {
        const from = `${year}-${month}-01`;
        const to = endOfMonth(date);
        return {
            from,
            to,
            days: Number(to.slice(8, 10)),
            label: `Tháng ${month}/${year}`,
        };
    }

    if (period === 'week') {
        const from = startOfWeek(date);
        const to = addDays(from, 6);
        return { from, to, days: 7, label: `Tuần ${from.split('-').reverse().slice(0, 2).join('/')}–${to.split('-').reverse().slice(0, 2).join('/')}` };
    }

    return { from: date, to: date, days: 1, label: `Ngày ${date.split('-').reverse().join('/')}` };
}

/**
 * Khung 2 giờ liên tiếp có nhiều giờ sân được đặt nhất trong kỳ.
 * Mức lấp đầy = giờ đã đặt trong khung ÷ (số sân đang hoạt động × 2 giờ × số ngày).
 */
export function computePeakWindow(
    slots: BookedSlot[],
    pitchCount: number,
    days: number,
): PeakWindow | null {
    const perHour = new Array<number>(24).fill(0);

    for (const slot of slots) {
        const start = toMinutes(slot.start_time);
        const end = toMinutes(slot.end_time);

        for (let hour = 0; hour < 24; hour++) {
            const overlap = Math.min(end, (hour + 1) * 60) - Math.max(start, hour * 60);
            if (overlap > 0) perHour[hour] += (overlap / 60) * Number(slot.total);
        }
    }

    let bestStart = -1;
    let best = 0;

    for (let hour = 0; hour + PEAK_WINDOW_HOURS <= 24; hour++) {
        const sum = perHour.slice(hour, hour + PEAK_WINDOW_HOURS).reduce((a, b) => a + b, 0);
        if (sum > best) {
            best = sum;
            bestStart = hour;
        }
    }

    if (bestStart < 0) return null;

    const capacity = pitchCount * PEAK_WINDOW_HOURS * days;

    return {
        start_hour: bestStart,
        end_hour: bestStart + PEAK_WINDOW_HOURS,
        label: `${pad2(bestStart)}:00–${pad2(bestStart + PEAK_WINDOW_HOURS)}:00`,
        booked_hours: round2(best),
        occupancy_rate: Math.min(100, percent(best, capacity)),
    };
}

export interface PitchHoursRow extends RowDataPacket {
    pitch_id: number;
    pitch_name: string;
    status: string;
    category_id: number | null;
    category_name: string | null;
    bookings: string | number;
    hours: string | number;
}

export interface MoneyRow extends RowDataPacket {
    pitch_id: number;
    kind: 'gross' | 'refund';
    amount: string | number | null;
}

interface RateRow extends RowDataPacket {
    total: string | number;
    cancelled: string | number | null;
    no_show: string | number | null;
}

interface DayAmountRow extends RowDataPacket {
    day_no: string | number;
    amount: string | number | null;
}

export interface ReportRow {
    key: string;
    label: string;
    bookings: number;
    booked_hours: number;
    gross: number;
    refunded: number;
    net_revenue: number;
}

/** Gộp số liệu từng sân thành từng dòng báo cáo (theo sân hoặc theo loại sân). */
export function buildReportRows(
    pitches: PitchHoursRow[],
    money: MoneyRow[],
    groupBy: ReportGroup,
): ReportRow[] {
    const moneyByPitch = new Map<number, { gross: number; refunded: number }>();

    for (const row of money) {
        const entry = moneyByPitch.get(Number(row.pitch_id)) ?? { gross: 0, refunded: 0 };
        if (row.kind === 'gross') entry.gross += Number(row.amount ?? 0);
        else entry.refunded += Number(row.amount ?? 0);
        moneyByPitch.set(Number(row.pitch_id), entry);
    }

    const groups = new Map<string, ReportRow>();

    for (const pitch of pitches) {
        const cash = moneyByPitch.get(Number(pitch.pitch_id)) ?? { gross: 0, refunded: 0 };
        const hours = Number(pitch.hours);
        const bookings = Number(pitch.bookings);
        const hasActivity = hours > 0 || bookings > 0 || cash.gross > 0 || cash.refunded > 0;

        // Sân ngừng hoạt động và không phát sinh gì trong kỳ → không đưa vào bảng
        if (pitch.status === 'Inactive' && !hasActivity) continue;

        const category = pitch.category_name ?? 'Chưa phân loại';
        const key = groupBy === 'pitch' ? `pitch-${pitch.pitch_id}` : `category-${pitch.category_id ?? 0}`;
        const label = groupBy === 'pitch' ? `${pitch.pitch_name} · ${category}` : category;

        const row = groups.get(key) ?? {
            key,
            label,
            bookings: 0,
            booked_hours: 0,
            gross: 0,
            refunded: 0,
            net_revenue: 0,
        };

        row.bookings += bookings;
        row.booked_hours += hours;
        row.gross += cash.gross;
        row.refunded += cash.refunded;
        groups.set(key, row);
    }

    return [...groups.values()].map((row) => ({
        ...row,
        booked_hours: round2(row.booked_hours),
        gross: round2(row.gross),
        refunded: round2(row.refunded),
        net_revenue: round2(row.gross - row.refunded),
    }));
}

@Injectable()
export class ReportService {
    constructor(private readonly database: DatabaseService) { }

    // Doanh thu thuần 7 ngày: thanh toán thành công − hoàn tiền thành công,
    // tính theo NGÀY GIAO DỊCH (giờ VN), không theo ngày đá.
    async getRevenueTrend(dateInput?: string) {
        const date = this.resolveDate(dateInput);
        const from = addDays(date, -(TREND_DAYS - 1));
        const startEpoch = vietnamDayStartEpoch(from);
        const endEpoch = vietnamDayStartEpoch(addDays(date, 1));

        // Gom theo số ngày kể từ epoch (đã cộng +7h) thay vì CONVERT_TZ: đúng với mọi time_zone của MySQL
        const [paid, refunded] = await Promise.all([
            this.database.query<DayAmountRow[]>(
                `SELECT FLOOR((UNIX_TIMESTAMP(paid_at) + ${VN_OFFSET_SECONDS}) / 86400) AS day_no,
                        SUM(amount) AS amount
                 FROM payments
                 WHERE status = 'Successful'
                   AND UNIX_TIMESTAMP(paid_at) >= ? AND UNIX_TIMESTAMP(paid_at) < ?
                 GROUP BY day_no`,
                [startEpoch, endEpoch],
            ),
            this.database.query<DayAmountRow[]>(
                `SELECT FLOOR((UNIX_TIMESTAMP(processed_at) + ${VN_OFFSET_SECONDS}) / 86400) AS day_no,
                        SUM(amount) AS amount
                 FROM payment_refunds
                 WHERE status = 'Successful'
                   AND UNIX_TIMESTAMP(processed_at) >= ? AND UNIX_TIMESTAMP(processed_at) < ?
                 GROUP BY day_no`,
                [startEpoch, endEpoch],
            ),
        ]);

        const toKey = (row: DayAmountRow) =>
            new Date(Number(row.day_no) * 86_400_000).toISOString().slice(0, 10);
        const paidByDay = new Map(paid.map((row) => [toKey(row), Number(row.amount ?? 0)]));
        const refundByDay = new Map(refunded.map((row) => [toKey(row), Number(row.amount ?? 0)]));

        const points = Array.from({ length: TREND_DAYS }, (_, index) => {
            const key = addDays(from, index);
            const gross = paidByDay.get(key) ?? 0;
            const refund = refundByDay.get(key) ?? 0;
            const [, month, day] = key.split('-');

            return {
                key,
                label: `${day}/${month}`,
                gross: round2(gross),
                refunded: round2(refund),
                net: round2(gross - refund),
                is_selected: key === date,
            };
        });

        return {
            date,
            from,
            to: date,
            total_net: round2(points.reduce((sum, point) => sum + point.net, 0)),
            points,
        };
    }

    async getReport(period: ReportPeriod = 'month', dateInput?: string, groupBy: ReportGroup = 'pitch') {
        const date = this.resolveDate(dateInput);
        const range = resolveReportRange(period, date);
        const startEpoch = vietnamDayStartEpoch(range.from);
        const endEpoch = vietnamDayStartEpoch(addDays(range.to, 1));

        const [pitches, money, slots, pitchCount, rates] = await Promise.all([
            this.database.query<PitchHoursRow[]>(
                `SELECT p.pitch_id, p.pitch_name, p.status, p.category_id, c.category_name,
                        COUNT(b.booking_id) AS bookings,
                        COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(b.end_time, b.start_time))) / 3600, 0) AS hours
                 FROM pitches p
                 LEFT JOIN pitch_categories c ON c.category_id = p.category_id
                 LEFT JOIN bookings b ON b.pitch_id = p.pitch_id
                      AND b.booking_date BETWEEN ? AND ?
                      AND b.status IN (${OCCUPYING_STATUSES})
                 GROUP BY p.pitch_id, p.pitch_name, p.status, p.category_id, c.category_name
                 ORDER BY p.pitch_name ASC`,
                [range.from, range.to],
            ),
            this.database.query<MoneyRow[]>(
                `SELECT b.pitch_id, 'gross' AS kind, SUM(pay.amount) AS amount
                 FROM payments pay
                 JOIN invoices i ON i.invoice_id = pay.invoice_id
                 JOIN bookings b ON b.booking_id = i.booking_id
                 WHERE pay.status = 'Successful'
                   AND UNIX_TIMESTAMP(pay.paid_at) >= ? AND UNIX_TIMESTAMP(pay.paid_at) < ?
                 GROUP BY b.pitch_id
                 UNION ALL
                 SELECT b.pitch_id, 'refund' AS kind, SUM(r.amount) AS amount
                 FROM payment_refunds r
                 JOIN payments pay ON pay.payment_id = r.payment_id
                 JOIN invoices i ON i.invoice_id = pay.invoice_id
                 JOIN bookings b ON b.booking_id = i.booking_id
                 WHERE r.status = 'Successful'
                   AND UNIX_TIMESTAMP(r.processed_at) >= ? AND UNIX_TIMESTAMP(r.processed_at) < ?
                 GROUP BY b.pitch_id`,
                [startEpoch, endEpoch, startEpoch, endEpoch],
            ),
            this.database.query<(BookedSlot & RowDataPacket)[]>(
                `SELECT TIME_FORMAT(start_time, '%H:%i') AS start_time,
                        TIME_FORMAT(end_time, '%H:%i') AS end_time,
                        COUNT(*) AS total
                 FROM bookings
                 WHERE booking_date BETWEEN ? AND ? AND status IN (${OCCUPYING_STATUSES})
                 GROUP BY start_time, end_time`,
                [range.from, range.to],
            ),
            this.database.query<RowDataPacket[]>(
                `SELECT COUNT(*) AS total FROM pitches WHERE status = 'Available'`,
            ),
            // Mẫu số tỷ lệ hủy/không đến: mọi booking có ngày đá trong kỳ, gồm mọi trạng thái
            this.database.query<RateRow[]>(
                `SELECT COUNT(*) AS total,
                        SUM(status = 'Cancelled') AS cancelled,
                        SUM(status = 'NoShow') AS no_show
                 FROM bookings
                 WHERE booking_date BETWEEN ? AND ?`,
                [range.from, range.to],
            ),
        ]);

        const rows = buildReportRows(pitches, money, groupBy);
        const totals = rows.reduce(
            (sum, row) => ({
                bookings: sum.bookings + row.bookings,
                booked_hours: sum.booked_hours + row.booked_hours,
                gross: sum.gross + row.gross,
                refunded: sum.refunded + row.refunded,
            }),
            { bookings: 0, booked_hours: 0, gross: 0, refunded: 0 },
        );

        const totalBookings = Number(rates[0]?.total ?? 0);
        const cancelled = Number(rates[0]?.cancelled ?? 0);
        const noShow = Number(rates[0]?.no_show ?? 0);

        return {
            period,
            group_by: groupBy,
            date,
            from: range.from,
            to: range.to,
            label: range.label,
            rows,
            totals: {
                bookings: totals.bookings,
                booked_hours: round2(totals.booked_hours),
                gross: round2(totals.gross),
                refunded: round2(totals.refunded),
                net_revenue: round2(totals.gross - totals.refunded),
            },
            peak: computePeakWindow(slots, Number(pitchCount[0]?.total ?? 0), range.days),
            rates: {
                total_bookings: totalBookings,
                cancelled,
                no_show: noShow,
                cancel_rate: percent(cancelled, totalBookings),
                no_show_rate: percent(noShow, totalBookings),
            },
        };
    }

    /** "Xuất CSV" của tab Báo cáo: cùng bộ lọc với bảng đang xem. */
    async exportReport(period: ReportPeriod = 'month', dateInput?: string, groupBy: ReportGroup = 'pitch') {
        const report = await this.getReport(period, dateInput, groupBy);

        const csv = buildCsv(
            [
                groupBy === 'pitch' ? 'Sân / loại' : 'Loại sân',
                'Số booking',
                'Giờ đã đặt',
                'Thu thành công',
                'Hoàn tiền thành công',
                'Doanh thu thuần',
            ],
            [
                ...report.rows.map((row) => [
                    csvText(row.label),
                    csvNumber(row.bookings),
                    csvNumber(row.booked_hours),
                    csvNumber(row.gross),
                    csvNumber(row.refunded),
                    csvNumber(row.net_revenue),
                ]),
                [
                    csvText('Tổng'),
                    csvNumber(report.totals.bookings),
                    csvNumber(report.totals.booked_hours),
                    csvNumber(report.totals.gross),
                    csvNumber(report.totals.refunded),
                    csvNumber(report.totals.net_revenue),
                ],
            ],
        );

        return { filename: `bao-cao-${report.from}_${report.to}.csv`, csv };
    }

    private resolveDate(input?: string): string {
        if (!input) return getVietnamNow().date;

        const parsed = new Date(`${input}T00:00:00Z`);

        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) {
            throw new BadRequestException('Ngày không hợp lệ.');
        }

        return input;
    }
}
