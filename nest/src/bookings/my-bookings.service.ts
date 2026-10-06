import {
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolConnection } from 'mysql2/promise';

import { getVietnamNow } from '../common/time.util.js';
import { DatabaseService } from '../database/database.service.js';
import { buildTransferContent } from '../payments/payments.utils.js';
import {
    calculateRefund,
    hoursUntilStart,
    parseHoldMinutes,
    parseRefundPolicy,
    refundPercentFor,
    round2,
    type RefundPolicy,
} from './booking-policy.js';
import { restoreServiceStock } from './booking-stock.js';
import type { BookingTab } from './dto/my-bookings-query.dto.js';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

// Đơn đang giữ sân (khớp với trigger trong DB)
const ACTIVE_STATUSES = ['Pending', 'Confirmed', 'CheckedIn', 'Playing'];
const CANCELLABLE_STATUSES = ['Pending', 'Confirmed'];

// Tab → danh sách trạng thái (all = không lọc).
// NoShow (không đến, mất cọc) được xếp chung tab "Đã hủy".
const TAB_STATUSES: Record<BookingTab, string[] | null> = {
    all: null,
    upcoming: ACTIVE_STATUSES,
    completed: ['Completed'],
    cancelled: ['Cancelled', 'NoShow'],
};

interface BookingListRow {
    booking_id: number;
    pitch_id: number;
    pitch_name: string;
    image_url: string | null;
    category_name: string | null;
    booking_date: string;
    start_time: string;
    end_time: string;
    status: string;
    total_pitch_price: string | number;
    services_total: string | number;
    paid_amount: string | number;
    refund_amount: string | number;
    hold_seconds_left: string | number;
}

interface CountsRow {
    all_count: string | number | null;
    upcoming_count: string | number | null;
    completed_count: string | number | null;
    cancelled_count: string | number | null;
}

interface DetailRow {
    booking_id: number;
    customer_id: number;
    pitch_id: number;
    pitch_name: string;
    image_url: string | null;
    surface_type: string | null;
    category_name: string | null;
    booking_date: string;
    start_time: string;
    end_time: string;
    status: string;
    total_pitch_price: string | number;
    customer_note: string | null;
    created_at: Date | string;
    hold_seconds_left: string | number;
}

interface LockedBookingRow {
    booking_id: number;
    customer_id: number;
    status: string;
    booking_date: string;
    start_time: string;
}

interface PaymentRow {
    payment_id: number;
    payment_method: string;
    transaction_code: string | null;
    amount: string | number;
    status: string;
    paid_at: Date | string | null;
    created_at: Date | string;
}

interface RefundRow {
    refund_id: number;
    payment_id: number;
    amount: string | number;
    reason: string | null;
    status: string;
    created_at: Date | string;
    processed_at: Date | string | null;
}

@Injectable()
export class MyBookingsService {
    constructor(
        private readonly database: DatabaseService,
        private readonly config: ConfigService,
    ) { }

    // ---------------------------------------------------------------
    // Cấu hình
    // ---------------------------------------------------------------

    private get holdMinutes(): number {
        try {
            return parseHoldMinutes(
                this.config.get<string>('PAYMENT_HOLD_MINUTES'),
            );
        } catch (error) {
            throw new InternalServerErrorException((error as Error).message);
        }
    }

    private get refundPolicy(): RefundPolicy {
        try {
            return parseRefundPolicy((key) => this.config.get<string>(key));
        } catch (error) {
            throw new InternalServerErrorException((error as Error).message);
        }
    }

    // ---------------------------------------------------------------
    // Màn 09: Lịch đặt của tôi
    // ---------------------------------------------------------------

    async listMine(
        customerId: number,
        options: { tab?: BookingTab; page?: number; limit?: number } = {},
    ) {
        const tab = options.tab ?? 'all';
        const limit = Math.min(
            Math.max(1, Math.floor(options.limit ?? DEFAULT_PAGE_SIZE)),
            MAX_PAGE_SIZE,
        );
        const page = Math.max(1, Math.floor(options.page ?? 1));
        const offset = (page - 1) * limit;
        const holdSeconds = Math.floor(this.holdMinutes * 60);

        const statuses = TAB_STATUSES[tab];
        const statusSql = statuses
            ? `AND b.status IN (${statuses.map((s) => `'${s}'`).join(',')})`
            : '';
        // Tab "sắp đá" xếp gần nhất lên trước; các tab còn lại xếp mới nhất lên trước
        const orderSql =
            tab === 'upcoming'
                ? 'b.booking_date ASC, b.start_time ASC'
                : 'b.booking_date DESC, b.start_time DESC';

        const now = getVietnamNow();

        const [rows, counts, spent, nextRows] = await Promise.all([
            this.database.query<BookingListRow[]>(
                `
                SELECT
                    b.booking_id,
                    pt.pitch_id,
                    pt.pitch_name,
                    pt.image_url,
                    pc.category_name,
                    DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
                    b.start_time,
                    b.end_time,
                    b.status,
                    b.total_pitch_price,
                    COALESCE((
                        SELECT SUM(bs.quantity * bs.unit_price)
                        FROM booking_services bs
                        WHERE bs.booking_id = b.booking_id
                    ), 0) AS services_total,
                    COALESCE((
                        SELECT SUM(py.amount)
                        FROM payments py
                        JOIN invoices i ON i.invoice_id = py.invoice_id
                        WHERE i.booking_id = b.booking_id
                          AND py.status = 'Successful'
                    ), 0) AS paid_amount,
                    COALESCE((
                        SELECT SUM(r.amount)
                        FROM payment_refunds r
                        JOIN payments py ON py.payment_id = r.payment_id
                        JOIN invoices i ON i.invoice_id = py.invoice_id
                        WHERE i.booking_id = b.booking_id
                          AND r.status IN ('Pending', 'Successful')
                    ), 0) AS refund_amount,
                    GREATEST(0, ${holdSeconds} - TIMESTAMPDIFF(SECOND, b.created_at, NOW())) AS hold_seconds_left
                FROM bookings b
                JOIN pitches pt ON pt.pitch_id = b.pitch_id
                LEFT JOIN pitch_categories pc ON pc.category_id = pt.category_id
                WHERE b.customer_id = ?
                ${statusSql}
                ORDER BY ${orderSql}, b.booking_id DESC
                LIMIT ${limit} OFFSET ${offset}
                `,
                [customerId],
            ),
            this.database.query<CountsRow[]>(
                `
                SELECT
                    COUNT(*) AS all_count,
                    SUM(status IN ('Pending','Confirmed','CheckedIn','Playing')) AS upcoming_count,
                    SUM(status = 'Completed') AS completed_count,
                    SUM(status IN ('Cancelled','NoShow')) AS cancelled_count
                FROM bookings
                WHERE customer_id = ?
                `,
                [customerId],
            ),
            this.database.query<{ paid: string | number; refunded: string | number }[]>(
                `
                SELECT
                    COALESCE((
                        SELECT SUM(py.amount)
                        FROM payments py
                        JOIN invoices i ON i.invoice_id = py.invoice_id
                        JOIN bookings b ON b.booking_id = i.booking_id
                        WHERE b.customer_id = ? AND py.status = 'Successful'
                    ), 0) AS paid,
                    COALESCE((
                        SELECT SUM(r.amount)
                        FROM payment_refunds r
                        JOIN payments py ON py.payment_id = r.payment_id
                        JOIN invoices i ON i.invoice_id = py.invoice_id
                        JOIN bookings b ON b.booking_id = i.booking_id
                        WHERE b.customer_id = ? AND r.status = 'Successful'
                    ), 0) AS refunded
                `,
                [customerId, customerId],
            ),
            this.database.query<
                {
                    booking_id: number;
                    pitch_name: string;
                    booking_date: string;
                    start_time: string;
                    end_time: string;
                }[]
            >(
                `
                SELECT
                    b.booking_id,
                    pt.pitch_name,
                    DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
                    b.start_time,
                    b.end_time
                FROM bookings b
                JOIN pitches pt ON pt.pitch_id = b.pitch_id
                WHERE b.customer_id = ?
                  AND b.status IN ('Confirmed', 'CheckedIn')
                  AND TIMESTAMP(b.booking_date, b.start_time) >= ?
                ORDER BY b.booking_date ASC, b.start_time ASC
                LIMIT 1
                `,
                [customerId, `${now.date} ${now.time}`],
            ),
        ]);

        const count = counts[0];
        const countOf: Record<BookingTab, number> = {
            all: Number(count?.all_count ?? 0),
            upcoming: Number(count?.upcoming_count ?? 0),
            completed: Number(count?.completed_count ?? 0),
            cancelled: Number(count?.cancelled_count ?? 0),
        };
        const total = countOf[tab];
        const next = nextRows[0];

        return {
            tab,
            page,
            limit,
            total,
            total_pages: Math.max(1, Math.ceil(total / limit)),
            summary: {
                counts: countOf,
                // Tổng đã trả trừ đi các khoản đã hoàn thành công
                total_spent: round2(
                    Number(spent[0]?.paid ?? 0) -
                    Number(spent[0]?.refunded ?? 0),
                ),
                next_booking: next
                    ? {
                        booking_id: next.booking_id,
                        booking_code: buildTransferContent(next.booking_id),
                        pitch_name: next.pitch_name,
                        booking_date: next.booking_date,
                        start_time: next.start_time,
                        end_time: next.end_time,
                    }
                    : null,
            },
            bookings: rows.map((row) => this.toListItem(row)),
        };
    }

    private toListItem(row: BookingListRow) {
        const pitchTotal = Number(row.total_pitch_price);
        const servicesTotal = Number(row.services_total);
        const total = round2(pitchTotal + servicesTotal);
        const paid = Number(row.paid_amount);
        const isPending = row.status === 'Pending';
        const hours = hoursUntilStart(row.booking_date, row.start_time);

        return {
            booking_id: row.booking_id,
            booking_code: buildTransferContent(row.booking_id),
            pitch_id: row.pitch_id,
            pitch_name: row.pitch_name,
            image_url: row.image_url,
            category_name: row.category_name,
            booking_date: row.booking_date,
            start_time: row.start_time,
            end_time: row.end_time,
            status: row.status,
            total_amount: total,
            deposit_paid: paid,
            refund_amount: Number(row.refund_amount),
            // Đơn chờ cọc còn hạn → frontend hiện nút "Tiếp tục thanh toán"
            hold_seconds_left: isPending ? Number(row.hold_seconds_left) : 0,
            can_cancel:
                row.status === 'Pending' ||
                (row.status === 'Confirmed' && hours > 0),
        };
    }

    // ---------------------------------------------------------------
    // Màn 10: Chi tiết booking
    // ---------------------------------------------------------------

    async getDetail(
        userId: number,
        roles: string[] | undefined,
        bookingId: number,
    ) {
        const holdSeconds = Math.floor(this.holdMinutes * 60);

        const [booking] = await this.database.query<DetailRow[]>(
            `
            SELECT
                b.booking_id,
                b.customer_id,
                pt.pitch_id,
                pt.pitch_name,
                pt.image_url,
                pt.surface_type,
                pc.category_name,
                DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
                b.start_time,
                b.end_time,
                b.status,
                b.total_pitch_price,
                b.customer_note,
                b.created_at,
                GREATEST(0, ${holdSeconds} - TIMESTAMPDIFF(SECOND, b.created_at, NOW())) AS hold_seconds_left
            FROM bookings b
            JOIN pitches pt ON pt.pitch_id = b.pitch_id
            LEFT JOIN pitch_categories pc ON pc.category_id = pt.category_id
            WHERE b.booking_id = ?
            `,
            [bookingId],
        );

        const isStaff = roles?.some((r) => r === 'Admin' || r === 'Staff');

        // Người lạ không được biết đơn có tồn tại → 404 thay vì 403
        if (!booking || (booking.customer_id !== userId && !isStaff)) {
            throw new NotFoundException('Không tìm thấy đơn đặt sân');
        }

        const [services, invoices, payments, refunds, history] =
            await Promise.all([
                this.database.query<
                    {
                        service_id: number;
                        service_name: string;
                        unit: string;
                        quantity: number;
                        unit_price: string | number;
                    }[]
                >(
                    `
                    SELECT bs.service_id, s.service_name, s.unit, bs.quantity, bs.unit_price
                    FROM booking_services bs
                    JOIN services s ON s.service_id = bs.service_id
                    WHERE bs.booking_id = ?
                    ORDER BY bs.booking_service_id ASC
                    `,
                    [bookingId],
                ),
                this.database.query<
                    { invoice_id: number; status: string; total_amount: string | number }[]
                >(
                    `SELECT invoice_id, status, total_amount FROM invoices WHERE booking_id = ? LIMIT 1`,
                    [bookingId],
                ),
                this.database.query<PaymentRow[]>(
                    `
                    SELECT py.payment_id, py.payment_method, py.transaction_code,
                           py.amount, py.status, py.paid_at, py.created_at
                    FROM payments py
                    JOIN invoices i ON i.invoice_id = py.invoice_id
                    WHERE i.booking_id = ?
                    ORDER BY py.payment_id ASC
                    `,
                    [bookingId],
                ),
                this.database.query<RefundRow[]>(
                    `
                    SELECT r.refund_id, r.payment_id, r.amount, r.reason,
                           r.status, r.created_at, r.processed_at
                    FROM payment_refunds r
                    JOIN payments py ON py.payment_id = r.payment_id
                    JOIN invoices i ON i.invoice_id = py.invoice_id
                    WHERE i.booking_id = ?
                    ORDER BY r.refund_id ASC
                    `,
                    [bookingId],
                ),
                this.database.query<
                    {
                        old_status: string | null;
                        new_status: string;
                        reason: string | null;
                        changed_at: Date | string;
                    }[]
                >(
                    `
                    SELECT old_status, new_status, reason, changed_at
                    FROM booking_status_history
                    WHERE booking_id = ?
                    ORDER BY history_id ASC
                    `,
                    [bookingId],
                ),
            ]);

        const serviceLines = services.map((line) => ({
            service_id: line.service_id,
            service_name: line.service_name,
            unit: line.unit,
            quantity: Number(line.quantity),
            unit_price: Number(line.unit_price),
            line_total: round2(Number(line.quantity) * Number(line.unit_price)),
        }));

        const pitchTotal = Number(booking.total_pitch_price);
        const servicesTotal = round2(
            serviceLines.reduce((sum, line) => sum + line.line_total, 0),
        );
        const total = round2(pitchTotal + servicesTotal);

        const paid = round2(
            payments
                .filter((p) => p.status === 'Successful')
                .reduce((sum, p) => sum + Number(p.amount), 0),
        );
        const refunded = round2(
            refunds
                .filter((r) => r.status === 'Successful')
                .reduce((sum, r) => sum + Number(r.amount), 0),
        );
        const refundPending = round2(
            refunds
                .filter((r) => r.status === 'Pending')
                .reduce((sum, r) => sum + Number(r.amount), 0),
        );

        const isPending = booking.status === 'Pending';
        const invoice = invoices[0];

        return {
            booking_id: booking.booking_id,
            booking_code: buildTransferContent(booking.booking_id),
            status: booking.status,
            booking_date: booking.booking_date,
            start_time: booking.start_time,
            end_time: booking.end_time,
            customer_note: booking.customer_note,
            created_at: booking.created_at,
            pitch: {
                pitch_id: booking.pitch_id,
                pitch_name: booking.pitch_name,
                category_name: booking.category_name,
                image_url: booking.image_url,
                surface_type: booking.surface_type,
            },
            services: serviceLines,
            amounts: {
                pitch_total: pitchTotal,
                services_total: servicesTotal,
                total_amount: total,
                paid,
                refunded,
                refund_pending: refundPending,
                // Số tiền còn phải trả tại sân (đơn đã hủy thì không còn)
                remaining:
                    booking.status === 'Cancelled' || booking.status === 'NoShow'
                        ? 0
                        : Math.max(0, round2(total - paid)),
            },
            invoice: invoice
                ? {
                    invoice_id: invoice.invoice_id,
                    status: invoice.status,
                    total_amount: Number(invoice.total_amount),
                }
                : null,
            payments: payments.map((p) => ({
                payment_id: p.payment_id,
                method: p.payment_method,
                transaction_code: p.transaction_code,
                amount: Number(p.amount),
                status: p.status,
                paid_at: p.paid_at,
                created_at: p.created_at,
            })),
            refunds: refunds.map((r) => ({
                refund_id: r.refund_id,
                amount: Number(r.amount),
                reason: r.reason,
                status: r.status,
                created_at: r.created_at,
                processed_at: r.processed_at,
            })),
            history,
            hold_seconds_left: isPending ? Number(booking.hold_seconds_left) : 0,
            cancellation: this.describeCancellation(
                booking.status,
                booking.booking_date,
                booking.start_time,
                paid,
            ),
        };
    }

    /** Xem trước kết quả nếu hủy ngay bây giờ (cho nút "Hủy booking" ở màn 10). */
    private describeCancellation(
        status: string,
        bookingDate: string,
        startTime: string,
        paid: number,
    ) {
        const policy = this.refundPolicy;
        const hours = hoursUntilStart(bookingDate, startTime);

        let canCancel = true;
        let reason: string | null = null;

        if (!CANCELLABLE_STATUSES.includes(status)) {
            canCancel = false;
            reason = 'Đơn ở trạng thái này không thể hủy';
        } else if (status === 'Confirmed' && hours <= 0) {
            canCancel = false;
            reason = 'Đã quá giờ bắt đầu, không thể hủy';
        }

        const percent =
            canCancel && paid > 0 ? refundPercentFor(hours, policy) : 0;

        return {
            can_cancel: canCancel,
            reason,
            hours_until_start: round2(hours),
            refund_percent: percent,
            refund_amount: canCancel ? calculateRefund(paid, percent) : 0,
            policy,
        };
    }

    // ---------------------------------------------------------------
    // Màn 10: Hủy booking + yêu cầu hoàn cọc
    // ---------------------------------------------------------------

    async cancel(userId: number, bookingId: number, reason?: string) {
        const policy = this.refundPolicy;

        return this.database.transaction(async (connection) => {
            // Khóa dòng booking trước (cùng thứ tự với phần thanh toán) để tránh deadlock
            const [booking] = await this.exec<LockedBookingRow[]>(
                connection,
                `
                SELECT
                    booking_id,
                    customer_id,
                    status,
                    DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date,
                    start_time
                FROM bookings
                WHERE booking_id = ?
                FOR UPDATE
                `,
                [bookingId],
            );

            if (!booking || booking.customer_id !== userId) {
                throw new NotFoundException('Không tìm thấy đơn đặt sân');
            }

            if (!CANCELLABLE_STATUSES.includes(booking.status)) {
                throw new ConflictException(
                    booking.status === 'Cancelled'
                        ? 'Đơn này đã được hủy trước đó'
                        : 'Đơn ở trạng thái này không thể hủy',
                );
            }

            const hours = hoursUntilStart(
                booking.booking_date,
                booking.start_time,
            );

            if (booking.status === 'Confirmed' && hours <= 0) {
                throw new ConflictException(
                    'Đã quá giờ bắt đầu, không thể hủy đơn',
                );
            }

            const paidPayments = await this.exec<
                { payment_id: number; amount: string | number }[]
            >(
                connection,
                `
                SELECT py.payment_id, py.amount
                FROM payments py
                JOIN invoices i ON i.invoice_id = py.invoice_id
                WHERE i.booking_id = ? AND py.status = 'Successful'
                ORDER BY py.payment_id ASC
                FOR UPDATE
                `,
                [bookingId],
            );

            const paid = round2(
                paidPayments.reduce((sum, p) => sum + Number(p.amount), 0),
            );
            const percent = paid > 0 ? refundPercentFor(hours, policy) : 0;
            const refundTotal = calculateRefund(paid, percent);

            await connection.query('SET @app_user_id = ?', [userId]);

            try {
                const [updated] = await connection.execute(
                    `
                    UPDATE bookings
                    SET status = 'Cancelled'
                    WHERE booking_id = ? AND status IN ('Pending', 'Confirmed')
                    `,
                    [bookingId],
                );

                if ((updated as { affectedRows: number }).affectedRows !== 1) {
                    throw new ConflictException('Không thể hủy đơn này');
                }

                // Ghi lý do vào dòng lịch sử mà trigger vừa tạo
                const note = reason?.trim()
                    ? `Khách hủy đơn: ${reason.trim()}`
                    : 'Khách hủy đơn';
                await connection.execute(
                    `
                    UPDATE booking_status_history
                    SET reason = ?
                    WHERE booking_id = ? AND new_status = 'Cancelled'
                    ORDER BY history_id DESC
                    LIMIT 1
                    `,
                    [note, bookingId],
                );

                // Khoản cọc đang chờ chuyển khoản không còn ý nghĩa
                await connection.execute(
                    `
                    UPDATE payments py
                    JOIN invoices i ON i.invoice_id = py.invoice_id
                    SET py.status = 'Failed'
                    WHERE i.booking_id = ? AND py.status = 'Pending'
                    `,
                    [bookingId],
                );

                await restoreServiceStock(connection, bookingId);
            } finally {
                await connection
                    .query('SET @app_user_id = NULL')
                    .catch(() => undefined);
            }

            // Yêu cầu hoàn cọc ở trạng thái Pending, quản lý sẽ duyệt ở màn 17
            let remainingRefund = refundTotal;

            for (const payment of paidPayments) {
                if (remainingRefund <= 0) {
                    break;
                }

                const amount = Math.min(remainingRefund, Number(payment.amount));

                await connection.execute(
                    `
                    INSERT INTO payment_refunds (payment_id, amount, reason, status)
                    VALUES (?, ?, ?, 'Pending')
                    `,
                    [
                        payment.payment_id,
                        amount,
                        `Khách hủy đơn ${buildTransferContent(bookingId)} (hoàn ${percent}% cọc)`,
                    ],
                );

                remainingRefund -= amount;
            }

            return {
                message:
                    refundTotal > 0
                        ? 'Đã hủy đơn. Yêu cầu hoàn cọc đang chờ duyệt.'
                        : paid > 0
                            ? 'Đã hủy đơn. Theo chính sách, đơn này không được hoàn cọc.'
                            : 'Đã hủy đơn.',
                booking_id: bookingId,
                booking_code: buildTransferContent(bookingId),
                status: 'Cancelled',
                deposit_paid: paid,
                refund: {
                    percent,
                    amount: refundTotal,
                    status: refundTotal > 0 ? 'Pending' : null,
                },
            };
        });
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
