import {
    BadRequestException,
    ConflictException,
    HttpException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

import {
    calculateRefund,
    hoursUntilStart,
    parseDepositPercent,
    parseHoldMinutes,
    parseRefundPolicy,
    refundPercentFor,
    type RefundPolicy,
} from '../bookings/booking-policy.js';
import { restoreServiceStock } from '../bookings/booking-stock.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { MyBookingsService } from '../bookings/my-bookings.service.js';
import { getVietnamNow } from '../common/time.util.js';
import { DatabaseService } from '../database/database.service.js';
import { buildTransferContent } from '../payments/payments.utils.js';
import {
    ACTIVE_STATUSES,
    buildScheduleCells,
    derivePaymentSummary,
    escapeLike,
    evaluateActions,
    formatMinutes,
    parseSearch,
    round2,
    toMinutes,
    vietnamToday,
    type ScheduleBooking,
    type TimeRange,
} from './admin-bookings.utils.js';
import type {
    CollectCashDto,
    CounterQuoteDto,
    CreateCounterBookingDto,
    ListAdminBookingsQueryDto,
    NoShowDto,
    ScheduleQueryDto,
    StaffCancelDto,
} from './dto/admin-bookings.dto.js';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const DEFAULT_WINDOW = { start: 6 * 60, end: 22 * 60 };

interface ListRow extends RowDataPacket {
    booking_id: number;
    booking_date: string;
    start_time: string;
    end_time: string;
    status: string;
    total_pitch_price: string | number;
    customer_id: number;
    full_name: string;
    phone_number: string;
    pitch_id: number;
    pitch_name: string;
    services_total: string | number;
    paid_amount: string | number;
    refunded_amount: string | number;
    hold_seconds_left: string | number;
}

interface LockedBooking extends RowDataPacket {
    booking_id: number;
    customer_id: number;
    pitch_id: number;
    status: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    total_pitch_price: string | number;
}

interface InvoiceRow extends RowDataPacket {
    invoice_id: number;
    total_amount: string | number;
    status: string;
}

interface PaymentRow extends RowDataPacket {
    payment_id: number;
    amount: string | number;
}

interface UserRow extends RowDataPacket {
    user_id: number;
    full_name: string;
    is_active: number;
}

interface ServiceLineLike {
    service_id: number;
    service_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
}

@Injectable()
export class AdminBookingsService {
    constructor(
        private readonly database: DatabaseService,
        private readonly config: ConfigService,
        private readonly bookings: BookingsService,
        private readonly myBookings: MyBookingsService,
    ) { }

    // ---------------------------------------------------------------
    // Cấu hình (đọc mỗi lần để lỗi cấu hình không làm app không khởi động)
    // ---------------------------------------------------------------

    private get holdMinutes(): number {
        try {
            return parseHoldMinutes(this.config.get<string>('PAYMENT_HOLD_MINUTES'));
        } catch (error) {
            throw new InternalServerErrorException((error as Error).message);
        }
    }

    private get depositPercent(): number {
        try {
            return parseDepositPercent(this.config.get<string>('DEPOSIT_PERCENT'));
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

    // Đặt COMPLETE_REQUIRES_MATCH_END=false để cho phép "Hoàn thành" trước khi
    // hết giờ đá (tiện khi demo)
    private get requireMatchEnd(): boolean {
        return this.config.get<string>('COMPLETE_REQUIRES_MATCH_END') !== 'false';
    }

    // ---------------------------------------------------------------
    // Bảng đơn theo ngày
    // ---------------------------------------------------------------

    async list(query: ListAdminBookingsQueryDto) {
        const date = query.date ?? vietnamToday();
        this.assertRealDate(date);

        const limit = Math.min(
            Math.max(1, Math.floor(query.limit ?? DEFAULT_PAGE_SIZE)),
            MAX_PAGE_SIZE,
        );
        const page = Math.max(1, Math.floor(query.page ?? 1));
        const offset = (page - 1) * limit;
        const holdSeconds = Math.floor(this.holdMinutes * 60);

        // Bộ lọc nền: ngày + sân (dùng cho cả danh sách và số đếm theo trạng thái)
        const baseWhere = ['b.booking_date = ?'];
        const baseParams: unknown[] = [date];

        if (query.pitch_id) {
            baseWhere.push('b.pitch_id = ?');
            baseParams.push(query.pitch_id);
        }

        const where = [...baseWhere];
        const params = [...baseParams];

        if (query.status) {
            where.push('b.status = ?');
            params.push(query.status);
        }

        const term = parseSearch(query.q);
        if (term?.kind === 'code') {
            where.push('b.booking_id = ?');
            params.push(term.bookingId);
        } else if (term?.kind === 'phone') {
            where.push('u.phone_number LIKE ?');
            params.push(`%${escapeLike(term.digits)}%`);
        } else if (term?.kind === 'name') {
            where.push('u.full_name LIKE ?');
            params.push(`%${escapeLike(term.text)}%`);
        }

        const [rows, countRows, statusRows] = await Promise.all([
            this.database.query<ListRow[]>(
                `
                SELECT
                    b.booking_id,
                    DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
                    b.start_time,
                    b.end_time,
                    b.status,
                    b.total_pitch_price,
                    u.user_id AS customer_id,
                    u.full_name,
                    u.phone_number,
                    pt.pitch_id,
                    pt.pitch_name,
                    COALESCE((
                        SELECT SUM(bs.quantity * bs.unit_price)
                        FROM booking_services bs
                        WHERE bs.booking_id = b.booking_id
                    ), 0) AS services_total,
                    COALESCE((
                        SELECT SUM(py.amount)
                        FROM payments py
                        JOIN invoices i ON i.invoice_id = py.invoice_id
                        WHERE i.booking_id = b.booking_id AND py.status = 'Successful'
                    ), 0) AS paid_amount,
                    COALESCE((
                        SELECT SUM(r.amount)
                        FROM payment_refunds r
                        JOIN payments py ON py.payment_id = r.payment_id
                        JOIN invoices i ON i.invoice_id = py.invoice_id
                        WHERE i.booking_id = b.booking_id AND r.status = 'Successful'
                    ), 0) AS refunded_amount,
                    GREATEST(0, ${holdSeconds} - TIMESTAMPDIFF(SECOND, b.created_at, NOW())) AS hold_seconds_left
                FROM bookings b
                JOIN users u ON u.user_id = b.customer_id
                JOIN pitches pt ON pt.pitch_id = b.pitch_id
                WHERE ${where.join(' AND ')}
                ORDER BY b.start_time ASC, b.booking_id ASC
                LIMIT ${limit} OFFSET ${offset}
                `,
                params,
            ),
            this.database.query<(RowDataPacket & { total: string | number })[]>(
                `
                SELECT COUNT(*) AS total
                FROM bookings b
                JOIN users u ON u.user_id = b.customer_id
                WHERE ${where.join(' AND ')}
                `,
                params,
            ),
            this.database.query<(RowDataPacket & { status: string; n: string | number })[]>(
                `
                SELECT b.status, COUNT(*) AS n
                FROM bookings b
                WHERE ${baseWhere.join(' AND ')}
                GROUP BY b.status
                `,
                baseParams,
            ),
        ]);

        const total = Number(countRows[0]?.total ?? 0);
        const byStatus: Record<string, number> = {};
        let all = 0;
        for (const row of statusRows) {
            byStatus[row.status] = Number(row.n);
            all += Number(row.n);
        }

        return {
            date,
            page,
            limit,
            total,
            total_pages: Math.max(1, Math.ceil(total / limit)),
            summary: { total: all, by_status: byStatus },
            items: rows.map((row) => this.toListItem(row)),
        };
    }

    private toListItem(row: ListRow) {
        const total = round2(Number(row.total_pitch_price) + Number(row.services_total));
        const paid = round2(Number(row.paid_amount));
        const refunded = round2(Number(row.refunded_amount));
        const due = ACTIVE_STATUSES.includes(row.status)
            ? Math.max(0, round2(total - paid))
            : 0;

        return {
            booking_id: row.booking_id,
            booking_code: buildTransferContent(row.booking_id),
            status: row.status,
            payment_status: derivePaymentSummary(total, paid, refunded),
            customer: {
                customer_id: row.customer_id,
                full_name: row.full_name,
                phone_number: row.phone_number,
            },
            pitch: { pitch_id: row.pitch_id, pitch_name: row.pitch_name },
            booking_date: row.booking_date,
            start_time: row.start_time,
            end_time: row.end_time,
            total_amount: total,
            paid_amount: paid,
            refunded_amount: refunded,
            due_amount: due,
            hold_seconds_left:
                row.status === 'Pending' ? Number(row.hold_seconds_left) : 0,
            actions: evaluateActions({
                status: row.status,
                bookingDate: row.booking_date,
                startTime: row.start_time,
                endTime: row.end_time,
                due,
                requireMatchEnd: this.requireMatchEnd,
            }),
        };
    }

    // ---------------------------------------------------------------
    // Chi tiết đang chọn (dùng lại chi tiết đơn của khách + thông tin khách và thao tác)
    // ---------------------------------------------------------------

    async getDetail(user: { sub: number; roles?: string[] }, bookingId: number) {
        const detail = await this.myBookings.getDetail(
            Number(user.sub),
            user.roles,
            bookingId,
        );

        const [customer] = await this.database.query<RowDataPacket[]>(
            `
            SELECT u.user_id AS customer_id, u.full_name, u.phone_number, u.email
            FROM bookings b
            JOIN users u ON u.user_id = b.customer_id
            WHERE b.booking_id = ?
            `,
            [bookingId],
        );

        const { total_amount: total, paid, refunded, remaining } = detail.amounts;
        const due = ACTIVE_STATUSES.includes(detail.status) ? remaining : 0;

        return {
            ...detail,
            customer: customer ?? null,
            payment_status: derivePaymentSummary(total, paid, refunded),
            cash_due: due,
            actions: evaluateActions({
                status: detail.status,
                bookingDate: detail.booking_date,
                startTime: detail.start_time,
                endTime: detail.end_time,
                due,
                requireMatchEnd: this.requireMatchEnd,
            }),
        };
    }

    // ---------------------------------------------------------------
    // Chế độ Lịch: lưới sân x giờ
    // ---------------------------------------------------------------

    async schedule(query: ScheduleQueryDto) {
        const today = vietnamToday();
        const date = query.date ?? today;
        this.assertRealDate(date);

        const [pitches, priceSlots, bookingRows] = await Promise.all([
            this.database.query<
                (RowDataPacket & {
                    pitch_id: number;
                    pitch_name: string;
                    status: string;
                    category_id: number | null;
                    category_name: string | null;
                })[]
            >(
                `
                SELECT pt.pitch_id, pt.pitch_name, pt.status, pt.category_id, pc.category_name
                FROM pitches pt
                LEFT JOIN pitch_categories pc ON pc.category_id = pt.category_id
                WHERE pt.status <> 'Inactive'
                ORDER BY pt.pitch_name ASC, pt.pitch_id ASC
                `,
            ),
            this.database.query<
                (RowDataPacket & { category_id: number; start_time: string; end_time: string })[]
            >(`SELECT category_id, start_time, end_time FROM price_slots`),
            this.database.query<
                (RowDataPacket & {
                    booking_id: number;
                    pitch_id: number;
                    status: string;
                    start_time: string;
                    end_time: string;
                    full_name: string;
                    phone_number: string;
                })[]
            >(
                `
                SELECT b.booking_id, b.pitch_id, b.status, b.start_time, b.end_time,
                       u.full_name, u.phone_number
                FROM bookings b
                JOIN users u ON u.user_id = b.customer_id
                WHERE b.booking_date = ? AND b.status <> 'Cancelled'
                ORDER BY b.start_time ASC
                `,
                [date],
            ),
        ]);

        // Khung giá theo loại sân
        const coverageByCategory = new Map<number, TimeRange[]>();
        for (const slot of priceSlots) {
            const list = coverageByCategory.get(slot.category_id) ?? [];
            list.push({ start: toMinutes(slot.start_time), end: toMinutes(slot.end_time) });
            coverageByCategory.set(slot.category_id, list);
        }

        // Cửa sổ giờ: theo query, hoặc theo bảng giá của các sân đang hiển thị
        const usedRanges = pitches.flatMap((p) =>
            p.category_id !== null ? (coverageByCategory.get(p.category_id) ?? []) : [],
        );
        let windowStart = DEFAULT_WINDOW.start;
        let windowEnd = DEFAULT_WINDOW.end;

        if (usedRanges.length > 0) {
            windowStart = Math.min(...usedRanges.map((r) => r.start));
            windowEnd = Math.max(...usedRanges.map((r) => r.end));
        }
        if (query.from) windowStart = toMinutes(query.from);
        if (query.to) windowEnd = toMinutes(query.to);

        windowStart = Math.floor(windowStart / 60) * 60;
        windowEnd = Math.ceil(windowEnd / 60) * 60;

        if (windowEnd <= windowStart) {
            throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu');
        }

        const now = getVietnamNow();

        const rows = pitches.map((pitch) => {
            const pitchBookings: ScheduleBooking[] = bookingRows
                .filter((b) => b.pitch_id === pitch.pitch_id)
                .map((b) => ({
                    booking_id: b.booking_id,
                    booking_code: buildTransferContent(b.booking_id),
                    status: b.status,
                    customer_name: b.full_name,
                    phone_number: b.phone_number,
                    start_time: b.start_time,
                    end_time: b.end_time,
                    start: toMinutes(b.start_time),
                    end: toMinutes(b.end_time),
                }));

            const cells = buildScheduleCells({
                windowStart,
                windowEnd,
                coverage:
                    pitch.category_id !== null
                        ? (coverageByCategory.get(pitch.category_id) ?? [])
                        : [],
                bookings: pitchBookings,
                pitchAvailable: pitch.status === 'Available',
                isToday: date === today,
                nowMinutes: now.minutes,
            }).map((cell) => ({
                ...cell,
                // Bỏ trường phút dùng nội bộ, FE chỉ cần giờ dạng chữ
                booking: cell.booking
                    ? Object.fromEntries(
                        Object.entries(cell.booking).filter(
                            ([key]) => key !== 'start' && key !== 'end',
                        ),
                    )
                    : null,
            }));

            return {
                pitch_id: pitch.pitch_id,
                pitch_name: pitch.pitch_name,
                category_name: pitch.category_name,
                status: pitch.status,
                cells,
            };
        });

        const hours: { start_time: string; end_time: string }[] = [];
        for (let start = windowStart; start + 60 <= windowEnd; start += 60) {
            hours.push({
                start_time: formatMinutes(start),
                end_time: formatMinutes(start + 60),
            });
        }

        return {
            date,
            window: { from: formatMinutes(windowStart), to: formatMinutes(windowEnd) },
            hours,
            pitches: rows,
        };
    }

    // ---------------------------------------------------------------
    // Thao tác trên một đơn
    // ---------------------------------------------------------------

    /** Check-in: Confirmed -> CheckedIn (chỉ khi đã đủ cọc, đúng ngày đá). */
    async checkIn(staffId: number, bookingId: number) {
        return this.database.transaction(async (connection) => {
            const booking = await this.lockBooking(connection, bookingId);
            this.assertAllowed(booking, 0, 'check_in');

            await this.transition(
                connection,
                staffId,
                bookingId,
                ['Confirmed'],
                'CheckedIn',
                'Check-in tại quầy',
            );

            return this.actionResult('Đã check-in', booking, 'CheckedIn');
        });
    }

    /** Ghi nhận khách trả tiền mặt tại sân (một phần hoặc toàn bộ phần còn lại). */
    async collectCash(staffId: number, bookingId: number, dto: CollectCashDto) {
        return this.database.transaction(async (connection) => {
            const booking = await this.lockBooking(connection, bookingId);
            const invoice = await this.lockInvoice(connection, bookingId);

            if (!invoice && ['Confirmed', 'CheckedIn', 'Playing'].includes(booking.status)) {
                throw new ConflictException('Đơn chưa có hóa đơn');
            }

            const paid = await this.sumPaid(connection, bookingId);
            const due = invoice
                ? Math.max(0, round2(Number(invoice.total_amount) - paid))
                : 0;

            this.assertAllowed(booking, due, 'collect_cash');

            const amount = round2(dto.amount);
            if (amount > due) {
                throw new BadRequestException(
                    `Số tiền vượt quá số còn phải thu (${due.toLocaleString('vi-VN')} đ)`,
                );
            }

            const [result] = await connection.execute<ResultSetHeader>(
                `
                INSERT INTO payments (invoice_id, payment_method, transaction_code, amount, status, paid_at)
                VALUES (?, 'Cash', NULL, ?, 'Successful', NOW())
                `,
                [invoice!.invoice_id, amount],
            );

            const paidTotal = round2(paid + amount);
            const newDue = Math.max(0, round2(Number(invoice!.total_amount) - paidTotal));

            await connection.execute(
                `
                UPDATE invoices
                SET status = ?,
                    staff_id = COALESCE((SELECT user_id FROM employees WHERE user_id = ?), staff_id)
                WHERE invoice_id = ?
                `,
                [newDue <= 0 ? 'Paid' : 'PartiallyPaid', staffId, invoice!.invoice_id],
            );

            return {
                message:
                    newDue <= 0
                        ? 'Đã thu đủ tiền, đơn đã thanh toán'
                        : 'Đã ghi nhận thu tiền mặt',
                booking_id: bookingId,
                booking_code: buildTransferContent(bookingId),
                payment_id: result.insertId,
                amount,
                paid_total: paidTotal,
                due_amount: newDue,
                invoice_status: newDue <= 0 ? 'Paid' : 'PartiallyPaid',
            };
        });
    }

    /** Hoàn thành sau trận: CheckedIn -> Completed (đã thu đủ, trận đã kết thúc). */
    async complete(staffId: number, bookingId: number) {
        return this.database.transaction(async (connection) => {
            const booking = await this.lockBooking(connection, bookingId);
            const invoice = await this.lockInvoice(connection, bookingId);

            if (!invoice && ['CheckedIn', 'Playing'].includes(booking.status)) {
                throw new ConflictException('Đơn chưa có hóa đơn');
            }

            const paid = await this.sumPaid(connection, bookingId);
            const due = invoice
                ? Math.max(0, round2(Number(invoice.total_amount) - paid))
                : 0;

            this.assertAllowed(booking, due, 'complete');

            await this.transition(
                connection,
                staffId,
                bookingId,
                ['CheckedIn', 'Playing'],
                'Completed',
                'Hoàn thành sau trận',
            );

            return this.actionResult('Đã hoàn thành đơn', booking, 'Completed');
        });
    }

    /** Khách không đến: Confirmed -> NoShow (mất cọc, trả lại tồn kho dịch vụ). */
    async noShow(staffId: number, bookingId: number, dto: NoShowDto) {
        return this.database.transaction(async (connection) => {
            const booking = await this.lockBooking(connection, bookingId);
            this.assertAllowed(booking, 0, 'no_show');

            const note = dto.reason
                ? `Khách không đến: ${dto.reason}`
                : 'Khách không đến';

            await this.transition(
                connection,
                staffId,
                bookingId,
                ['Confirmed'],
                'NoShow',
                note,
            );
            await restoreServiceStock(connection, bookingId);

            return this.actionResult(
                'Đã đánh dấu khách không đến. Tiền cọc không được hoàn.',
                booking,
                'NoShow',
            );
        });
    }

    /** Nhân viên hủy đơn; đơn đã có tiền thì tạo yêu cầu hoàn tiền chờ duyệt. */
    async cancel(staffId: number, bookingId: number, dto: StaffCancelDto) {
        const policy = this.refundPolicy;

        return this.database.transaction(async (connection) => {
            const booking = await this.lockBooking(connection, bookingId);
            this.assertAllowed(booking, 0, 'cancel');

            const payments = await this.exec<PaymentRow[]>(
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

            const paid = round2(payments.reduce((sum, p) => sum + Number(p.amount), 0));

            if (paid > 0 && !dto.reason) {
                throw new BadRequestException(
                    'Đơn đã đóng tiền, vui lòng nhập lý do hủy',
                );
            }

            const hours = hoursUntilStart(booking.booking_date, booking.start_time);
            const percent =
                paid > 0
                    ? dto.full_refund
                        ? 100
                        : refundPercentFor(hours, policy)
                    : 0;
            const refundTotal = calculateRefund(paid, percent);

            await this.transition(
                connection,
                staffId,
                bookingId,
                ['Pending', 'Confirmed'],
                'Cancelled',
                dto.reason ? `Nhân viên hủy đơn: ${dto.reason}` : 'Nhân viên hủy đơn',
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

            // Yêu cầu hoàn tiền ở trạng thái Pending, quản lý duyệt ở màn thanh toán
            let remaining = refundTotal;
            for (const payment of payments) {
                if (remaining <= 0) break;

                const amount = Math.min(remaining, Number(payment.amount));
                await connection.execute(
                    `INSERT INTO payment_refunds (payment_id, amount, reason, status)
                     VALUES (?, ?, ?, 'Pending')`,
                    [
                        payment.payment_id,
                        amount,
                        `Nhân viên hủy đơn ${buildTransferContent(bookingId)} (hoàn ${percent}% đã thu)`,
                    ],
                );
                remaining -= amount;
            }

            return {
                ...this.actionResult(
                    refundTotal > 0
                        ? 'Đã hủy đơn. Yêu cầu hoàn tiền đang chờ duyệt.'
                        : paid > 0
                            ? 'Đã hủy đơn. Theo chính sách, đơn này không được hoàn tiền.'
                            : 'Đã hủy đơn.',
                    booking,
                    'Cancelled',
                ),
                amount_paid: paid,
                refund: {
                    percent,
                    amount: refundTotal,
                    status: refundTotal > 0 ? 'Pending' : null,
                },
            };
        });
    }

    // ---------------------------------------------------------------
    // Đặt tại quầy
    // ---------------------------------------------------------------

    /** Kiểm tra trùng giờ + tính tiền cho form "Tạo booking tại quầy" (không giữ sân). */
    async counterQuote(dto: CounterQuoteDto) {
        this.assertCounterWindow(dto);

        const result = await this.database.transaction(async (connection) => {
            try {
                const prepared = await this.bookings.prepare(connection, dto, false);

                return { available: true as const, prepared };
            } catch (error) {
                if (error instanceof ConflictException && error.message.includes('trùng')) {
                    const conflicts = await this.findConflicts(connection, dto);

                    if (conflicts.length > 0) {
                        return { available: false as const, conflicts };
                    }
                }
                throw error;
            }
        });

        const customer = dto.phone_number
            ? await this.findCustomerByPhone(dto.phone_number)
            : null;

        if (!result.available) {
            return {
                available: false,
                conflicts: result.conflicts,
                customer,
            };
        }

        const amounts = this.bookings.buildAmounts(result.prepared);

        return {
            available: true,
            pitch_id: dto.pitch_id,
            booking_date: dto.booking_date,
            start_time: dto.start_time,
            end_time: dto.end_time,
            services: result.prepared.lines,
            ...amounts,
            cash_options: {
                full: amounts.total_amount,
                deposit: amounts.deposit_amount,
            },
            customer,
            conflicts: [],
        };
    }

    /** Tạo đơn tại quầy: đã thu tiền mặt nên vào thẳng trạng thái Confirmed. */
    async createCounter(staffId: number, dto: CreateCounterBookingDto) {
        this.assertCounterWindow(dto);

        const depositPercent = this.depositPercent;

        // Băm mật khẩu ngẫu nhiên trước khi mở transaction (tốn ~60ms) và chỉ
        // khi khách chưa có tài khoản, để không giữ khóa sân lâu
        const existing = await this.findCustomerByPhone(dto.phone_number);
        const passwordHash = existing
            ? null
            : await this.randomPasswordHash();

        try {
            return await this.database.transaction(async (connection) => {
                const prepared = await this.bookings.prepare(connection, dto, true);
                const customer = await this.resolveCustomer(
                    connection,
                    dto.customer_name,
                    dto.phone_number,
                    passwordHash,
                );

                const amounts = this.bookings.buildAmounts(prepared);
                const total = amounts.total_amount;
                const collected =
                    dto.payment_mode === 'full'
                        ? total
                        : calculateRefund(total, depositPercent);

                const bookingId = await this.withActor(connection, staffId, async () => {
                    const [result] = await connection.execute<ResultSetHeader>(
                        `
                        INSERT INTO bookings (
                            customer_id, pitch_id, booking_date, start_time, end_time,
                            total_pitch_price, status, customer_note
                        ) VALUES (?, ?, ?, ?, ?, ?, 'Confirmed', ?)
                        `,
                        [
                            customer.customer_id,
                            dto.pitch_id,
                            dto.booking_date,
                            dto.start_time,
                            dto.end_time,
                            prepared.pitchPrice,
                            dto.customer_note ?? null,
                        ],
                    );

                    return result.insertId;
                });

                await this.attachServices(connection, bookingId, prepared.lines);

                await this.createInvoiceAndPayment(connection, {
                    bookingId,
                    staffId,
                    total,
                    collected,
                    pitchPrice: prepared.pitchPrice,
                    lines: prepared.lines,
                });

                await this.annotateHistory(
                    connection,
                    bookingId,
                    'Confirmed',
                    dto.payment_mode === 'full'
                        ? 'Đặt tại quầy (thu toàn bộ tiền mặt)'
                        : 'Đặt tại quầy (thu cọc tiền mặt)',
                );

                return {
                    message: 'Đã tạo đơn tại quầy',
                    booking: {
                        booking_id: bookingId,
                        booking_code: buildTransferContent(bookingId),
                        status: 'Confirmed',
                        pitch_id: dto.pitch_id,
                        booking_date: dto.booking_date,
                        start_time: dto.start_time,
                        end_time: dto.end_time,
                        services: prepared.lines,
                        ...amounts,
                        payment_mode: dto.payment_mode,
                        paid_amount: collected,
                        due_amount: Math.max(0, round2(total - collected)),
                    },
                    customer: {
                        customer_id: customer.customer_id,
                        full_name: customer.full_name,
                        phone_number: dto.phone_number,
                        created: customer.created,
                    },
                };
            });
        } catch (error) {
            throw this.mapDbError(error);
        }
    }

    // ---------------------------------------------------------------
    // Hỗ trợ
    // ---------------------------------------------------------------

    private assertRealDate(date: string): void {
        const parsed = new Date(`${date}T00:00:00Z`);

        if (
            Number.isNaN(parsed.getTime()) ||
            parsed.toISOString().slice(0, 10) !== date
        ) {
            throw new BadRequestException('Ngày không hợp lệ');
        }
    }

    // Đặt tại quầy: không được ngày đã qua, khung giờ đã kết thúc; đang diễn ra vẫn được
    private assertCounterWindow(dto: {
        booking_date: string;
        start_time: string;
        end_time: string;
    }): void {
        this.assertRealDate(dto.booking_date);

        const start = toMinutes(dto.start_time);
        const end = toMinutes(dto.end_time);

        if (end <= start) {
            throw new BadRequestException(
                'Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày',
            );
        }

        const now = getVietnamNow();

        if (dto.booking_date < now.date) {
            throw new BadRequestException('Không thể đặt cho ngày đã qua');
        }

        if (dto.booking_date === now.date && end <= now.minutes) {
            throw new BadRequestException('Khung giờ này đã kết thúc');
        }
    }

    private async lockBooking(
        connection: PoolConnection,
        bookingId: number,
    ): Promise<LockedBooking> {
        const [booking] = await this.exec<LockedBooking[]>(
            connection,
            `
            SELECT booking_id, customer_id, pitch_id, status,
                   DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date,
                   start_time, end_time, total_pitch_price
            FROM bookings
            WHERE booking_id = ?
            FOR UPDATE
            `,
            [bookingId],
        );

        if (!booking) {
            throw new NotFoundException('Không tìm thấy đơn đặt sân');
        }

        return booking;
    }

    private async lockInvoice(
        connection: PoolConnection,
        bookingId: number,
    ): Promise<InvoiceRow | undefined> {
        const [invoice] = await this.exec<InvoiceRow[]>(
            connection,
            `SELECT invoice_id, total_amount, status FROM invoices WHERE booking_id = ? FOR UPDATE`,
            [bookingId],
        );

        return invoice;
    }

    private async sumPaid(
        connection: PoolConnection,
        bookingId: number,
    ): Promise<number> {
        const rows = await this.exec<PaymentRow[]>(
            connection,
            `
            SELECT py.payment_id, py.amount
            FROM payments py
            JOIN invoices i ON i.invoice_id = py.invoice_id
            WHERE i.booking_id = ? AND py.status = 'Successful'
            FOR UPDATE
            `,
            [bookingId],
        );

        return round2(rows.reduce((sum, row) => sum + Number(row.amount), 0));
    }

    // Từ chối kèm lý do cụ thể (hiển thị được cho nhân viên) nếu thao tác không hợp lệ
    private assertAllowed(
        booking: LockedBooking,
        due: number,
        action: 'check_in' | 'collect_cash' | 'complete' | 'no_show' | 'cancel',
    ): void {
        const state = evaluateActions({
            status: booking.status,
            bookingDate: booking.booking_date,
            startTime: booking.start_time,
            endTime: booking.end_time,
            due,
            requireMatchEnd: this.requireMatchEnd,
        })[action];

        if (!state.allowed) {
            throw new ConflictException(state.reason ?? 'Không thể thực hiện thao tác này');
        }
    }

    private actionResult(message: string, booking: LockedBooking, status: string) {
        return {
            message,
            booking_id: booking.booking_id,
            booking_code: buildTransferContent(booking.booking_id),
            status,
        };
    }

    // Đổi trạng thái (ghi người thao tác vào lịch sử qua @app_user_id) và ghi chú lý do
    private async transition(
        connection: PoolConnection,
        actorId: number,
        bookingId: number,
        from: string[],
        to: string,
        note: string,
    ): Promise<void> {
        await this.withActor(connection, actorId, async () => {
            const [result] = await connection.execute<ResultSetHeader>(
                `UPDATE bookings SET status = ?
                 WHERE booking_id = ? AND status IN (${from.map(() => '?').join(', ')})`,
                [to, bookingId, ...from],
            );

            if (result.affectedRows !== 1) {
                throw new ConflictException(
                    'Trạng thái đơn vừa thay đổi, vui lòng tải lại',
                );
            }

            await this.annotateHistory(connection, bookingId, to, note);
        });
    }

    private async annotateHistory(
        connection: PoolConnection,
        bookingId: number,
        newStatus: string,
        note: string,
    ): Promise<void> {
        await connection.execute(
            `
            UPDATE booking_status_history
            SET reason = ?
            WHERE booking_id = ? AND new_status = ?
            ORDER BY history_id DESC
            LIMIT 1
            `,
            [note.slice(0, 500), bookingId, newStatus],
        );
    }

    // Biến session @app_user_id để trigger ghi người thao tác; connection nằm
    // trong pool nên phải xóa trước khi trả lại.
    private async withActor<T>(
        connection: PoolConnection,
        actorId: number | null,
        work: () => Promise<T>,
    ): Promise<T> {
        await connection.query('SET @app_user_id = ?', [actorId]);

        try {
            return await work();
        } finally {
            await connection
                .query('SET @app_user_id = NULL')
                .catch(() => undefined);
        }
    }

    private async findConflicts(
        connection: PoolConnection,
        dto: { pitch_id: number; booking_date: string; start_time: string; end_time: string },
    ) {
        const rows = await this.exec<
            (RowDataPacket & {
                booking_id: number;
                status: string;
                start_time: string;
                end_time: string;
                full_name: string;
            })[]
        >(
            connection,
            `
            SELECT b.booking_id, b.status, b.start_time, b.end_time, u.full_name
            FROM bookings b
            JOIN users u ON u.user_id = b.customer_id
            WHERE b.pitch_id = ?
              AND b.booking_date = ?
              AND b.status IN ('Pending', 'Confirmed', 'CheckedIn', 'Playing')
              AND b.start_time < ?
              AND b.end_time > ?
            ORDER BY b.start_time ASC
            `,
            [dto.pitch_id, dto.booking_date, dto.end_time, dto.start_time],
        );

        return rows.map((row) => ({
            booking_id: row.booking_id,
            booking_code: buildTransferContent(row.booking_id),
            status: row.status,
            start_time: row.start_time,
            end_time: row.end_time,
            customer_name: row.full_name,
        }));
    }

    private async findCustomerByPhone(phone: string) {
        const [user] = await this.database.query<UserRow[]>(
            `SELECT user_id, full_name, is_active FROM users WHERE phone_number = ?`,
            [phone],
        );

        return user
            ? { customer_id: user.user_id, full_name: user.full_name, exists: true }
            : null;
    }

    private randomPasswordHash(): Promise<string> {
        // Mật khẩu ngẫu nhiên không ai biết: khách tạo tại quầy chưa đăng nhập
        // được cho đến khi tự đặt lại mật khẩu
        return bcrypt.hash(randomBytes(24).toString('hex'), 10);
    }

    /** Khách đã có tài khoản (theo SĐT) thì gắn vào; chưa có thì tạo khách mới. */
    private async resolveCustomer(
        connection: PoolConnection,
        fullName: string,
        phone: string,
        passwordHash: string | null,
    ): Promise<{ customer_id: number; full_name: string; created: boolean }> {
        const [user] = await this.exec<UserRow[]>(
            connection,
            `SELECT user_id, full_name, is_active FROM users WHERE phone_number = ? FOR UPDATE`,
            [phone],
        );

        if (user) {
            if (!user.is_active) {
                throw new ConflictException('Tài khoản của khách này đang bị khóa');
            }

            // Tài khoản nhân viên đặt hộ chính mình chưa có hồ sơ khách
            await connection.execute(
                `INSERT IGNORE INTO customers (user_id) VALUES (?)`,
                [user.user_id],
            );

            return { customer_id: user.user_id, full_name: user.full_name, created: false };
        }

        const [role] = await this.exec<(RowDataPacket & { role_id: number })[]>(
            connection,
            `SELECT role_id FROM roles WHERE role_name = 'Customer' LIMIT 1`,
        );

        if (!role) {
            throw new InternalServerErrorException('Thiếu vai trò Customer trong CSDL');
        }

        const hash = passwordHash ?? (await this.randomPasswordHash());

        const [created] = await connection.execute<ResultSetHeader>(
            `INSERT INTO users (full_name, phone_number, email, password_hash)
             VALUES (?, ?, NULL, ?)`,
            [fullName, phone, hash],
        );
        const userId = created.insertId;

        await connection.execute(`INSERT INTO customers (user_id) VALUES (?)`, [userId]);
        await connection.execute(
            `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
            [userId, role.role_id],
        );

        return { customer_id: userId, full_name: fullName, created: true };
    }

    // Chốt dịch vụ: lưu giá tại thời điểm đặt và trừ kho
    private async attachServices(
        connection: PoolConnection,
        bookingId: number,
        lines: ServiceLineLike[],
    ): Promise<void> {
        for (const line of lines) {
            await connection.execute(
                `INSERT INTO booking_services (booking_id, service_id, quantity, unit_price)
                 VALUES (?, ?, ?, ?)`,
                [bookingId, line.service_id, line.quantity, line.unit_price],
            );

            const [stock] = await connection.execute<ResultSetHeader>(
                `UPDATE services
                 SET stock_quantity = stock_quantity - ?
                 WHERE service_id = ? AND stock_quantity >= ?`,
                [line.quantity, line.service_id, line.quantity],
            );

            if (stock.affectedRows !== 1) {
                throw new ConflictException(
                    `Dịch vụ "${line.service_name}" vừa hết hàng, vui lòng chọn lại.`,
                );
            }
        }
    }

    private async createInvoiceAndPayment(
        connection: PoolConnection,
        input: {
            bookingId: number;
            staffId: number;
            total: number;
            collected: number;
            pitchPrice: number;
            lines: ServiceLineLike[];
        },
    ): Promise<void> {
        const status =
            input.collected >= input.total ? 'Paid' : 'PartiallyPaid';

        const [invoice] = await connection.execute<ResultSetHeader>(
            `
            INSERT INTO invoices (booking_id, staff_id, total_amount, status)
            VALUES (?, (SELECT user_id FROM employees WHERE user_id = ?), ?, ?)
            `,
            [input.bookingId, input.staffId, input.total, status],
        );
        const invoiceId = invoice.insertId;

        await connection.execute(
            `
            INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, line_total)
            VALUES (?, 'Pitch', ?, 1, ?, ?)
            `,
            [
                invoiceId,
                `Tiền thuê sân (đơn ${buildTransferContent(input.bookingId)})`,
                input.pitchPrice,
                input.pitchPrice,
            ],
        );

        for (const line of input.lines) {
            await connection.execute(
                `
                INSERT INTO invoice_items
                    (invoice_id, item_type, description, service_id, quantity, unit_price, line_total)
                VALUES (?, 'Service', ?, ?, ?, ?, ?)
                `,
                [
                    invoiceId,
                    line.service_name,
                    line.service_id,
                    line.quantity,
                    line.unit_price,
                    line.line_total,
                ],
            );
        }

        if (input.collected > 0) {
            await connection.execute(
                `
                INSERT INTO payments (invoice_id, payment_method, transaction_code, amount, status, paid_at)
                VALUES (?, 'Cash', NULL, ?, 'Successful', NOW())
                `,
                [invoiceId, input.collected],
            );
        }
    }

    private mapDbError(error: unknown): unknown {
        if (error instanceof HttpException) {
            return error;
        }

        const dbError = error as { code?: string; errno?: number; sqlState?: string };

        // Trigger chống trùng lịch trong DB
        if (dbError.sqlState === '45000' || dbError.errno === 1644) {
            return new ConflictException('Sân đã có đơn đặt trùng khung giờ.');
        }

        if (dbError.code === 'ER_DUP_ENTRY') {
            return new ConflictException(
                'Dữ liệu vừa được tạo bởi người khác, vui lòng thử lại',
            );
        }

        return error;
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
