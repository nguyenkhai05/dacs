import {
    BadRequestException,
    ConflictException,
    GoneException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';

import type { AuthUser } from '../auth/auth-user.js';
import { DatabaseService } from '../database/database.service.js';
import type { BankWebhookDto } from './dto/bank-webhook.dto.js';
import {
    buildTransferContent,
    buildVietQrUrl,
    calculateDeposit,
    extractBookingId,
} from './payments.utils.js';

const STAFF_ROLES = ['Admin', 'Staff'];
const SWEEP_BATCH = 100;

interface BookingRow {
    booking_id: number;
    customer_id: number;
    status: string;
    total_pitch_price: string | number;
    hold_seconds_left: string | number;
}

interface InvoiceRow {
    invoice_id: number;
    total_amount: string | number;
    status: string;
}

interface PaymentRow {
    payment_id: number;
    invoice_id: number;
    amount: string | number;
    status: 'Pending' | 'Successful' | 'Failed';
    transaction_code: string | null;
}

interface ServiceLineRow {
    service_id: number;
    service_name: string;
    quantity: number;
    unit_price: string | number;
}

export interface ConfirmResult {
    handled: boolean;
    already_paid?: boolean;
    reason?: string;
    payment_id?: number;
    booking_id?: number;
}

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private readonly database: DatabaseService,
        private readonly config: ConfigService,
    ) { }

    // ---------------------------------------------------------------
    // Cấu hình (đọc mỗi lần gọi để app vẫn khởi động được khi chưa cấu hình)
    // ---------------------------------------------------------------

    get holdMinutes(): number {
        return this.positiveNumber('PAYMENT_HOLD_MINUTES', 15);
    }

    get sweepEnabled(): boolean {
        return this.config.get<string>('PAYMENT_SWEEP_ENABLED') !== 'false';
    }

    private get depositPercent(): number {
        const percent = this.positiveNumber('DEPOSIT_PERCENT', 30);
        if (percent > 100) {
            throw new InternalServerErrorException(
                'DEPOSIT_PERCENT phải nằm trong khoảng 1-100',
            );
        }
        return percent;
    }

    private positiveNumber(key: string, fallback: number): number {
        const raw = this.config.get<string>(key);
        if (raw === undefined || raw === '') {
            return fallback;
        }
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) {
            throw new InternalServerErrorException(`${key} không hợp lệ`);
        }
        return value;
    }

    private get bank() {
        const bankId = this.config.get<string>('PAYMENT_BANK_ID');
        const accountNumber = this.config.get<string>('PAYMENT_ACCOUNT_NUMBER');
        const accountName = this.config.get<string>('PAYMENT_ACCOUNT_NAME');

        if (!bankId || !accountNumber || !accountName) {
            throw new InternalServerErrorException(
                'Chưa cấu hình tài khoản nhận tiền (PAYMENT_BANK_ID, PAYMENT_ACCOUNT_NUMBER, PAYMENT_ACCOUNT_NAME)',
            );
        }

        return {
            bankId,
            bankName: this.config.get<string>('PAYMENT_BANK_NAME') ?? bankId,
            accountNumber,
            accountName,
            template: this.config.get<string>('PAYMENT_QR_TEMPLATE') ?? 'compact2',
        };
    }

    // ---------------------------------------------------------------
    // API cho khách hàng
    // ---------------------------------------------------------------

    /** Tạo (hoặc lấy lại) khoản thanh toán cọc của một đơn đang chờ thanh toán. */
    async createDeposit(bookingId: number, user: AuthUser) {
        const outcome = await this.database.transaction(async (connection) => {
            const booking = await this.lockBooking(connection, bookingId);
            this.assertCanAccess(booking, user);

            const existing = await this.findDepositPayment(connection, bookingId);

            if (existing?.status === 'Successful') {
                throw new ConflictException('Đơn đã được thanh toán cọc');
            }

            if (booking.status === 'Cancelled') {
                return { expired: true as const };
            }

            if (booking.status !== 'Pending') {
                throw new ConflictException(
                    'Đơn này không ở trạng thái chờ thanh toán cọc',
                );
            }

            if (Number(booking.hold_seconds_left) <= 0) {
                await this.cancelExpired(connection, bookingId, null);
                return { expired: true as const };
            }

            const invoice = await this.ensureInvoice(connection, booking);
            const total = Number(invoice.total_amount);
            const amount = calculateDeposit(total, this.depositPercent);

            if (amount <= 0) {
                throw new BadRequestException('Đơn có tổng tiền bằng 0, không cần đặt cọc');
            }

            let payment: PaymentRow;

            if (existing) {
                // Dùng lại khoản Pending (hoặc mở lại khoản Failed), cập nhật số tiền
                await connection.execute(
                    `UPDATE payments SET amount = ?, status = 'Pending' WHERE payment_id = ?`,
                    [amount, existing.payment_id],
                );
                payment = { ...existing, amount, status: 'Pending' };
            } else {
                const code = buildTransferContent(bookingId);
                const [result] = await connection.execute(
                    `
                    INSERT INTO payments (invoice_id, payment_method, transaction_code, amount, status)
                    VALUES (?, 'Banking', ?, ?, 'Pending')
                    `,
                    [invoice.invoice_id, code, amount],
                );
                payment = {
                    payment_id: (result as { insertId: number }).insertId,
                    invoice_id: invoice.invoice_id,
                    amount,
                    status: 'Pending',
                    transaction_code: code,
                };
            }

            return {
                expired: false as const,
                view: this.buildView(booking, invoice, payment),
            };
        });

        if (outcome.expired) {
            throw new GoneException('Đơn đã hết thời gian giữ chỗ hoặc đã bị hủy');
        }

        return outcome.view;
    }

    /** Xem trạng thái thanh toán cọc (frontend gọi lặp lại để biết đã nhận tiền chưa). */
    async getDeposit(bookingId: number, user: AuthUser) {
        const [booking] = await this.database.query<BookingRow[]>(
            this.bookingSql(false),
            [bookingId],
        );

        if (!booking) {
            throw new NotFoundException('Không tìm thấy đơn đặt sân');
        }
        this.assertCanAccess(booking, user);

        const [invoice] = await this.database.query<InvoiceRow[]>(
            `SELECT invoice_id, total_amount, status FROM invoices WHERE booking_id = ? LIMIT 1`,
            [bookingId],
        );
        const payment = invoice
            ? await this.findDepositPaymentPool(bookingId)
            : undefined;

        if (!invoice || !payment) {
            throw new NotFoundException(
                'Đơn chưa có khoản thanh toán cọc. Hãy gọi POST /payments/deposit trước',
            );
        }

        return this.buildView(booking, invoice, payment);
    }

    // ---------------------------------------------------------------
    // Xác nhận đã nhận tiền (webhook ngân hàng hoặc nhân viên)
    // ---------------------------------------------------------------

    /** Webhook chỉ được tin khi gửi đúng secret đã cấu hình (không cấu hình = đóng). */
    verifyWebhookSecret(provided: string | undefined): void {
        const expected = this.config.get<string>('PAYMENT_WEBHOOK_SECRET');

        if (!expected) {
            throw new ServiceUnavailableException(
                'Chưa cấu hình PAYMENT_WEBHOOK_SECRET',
            );
        }

        // So sánh hash để hai chuỗi luôn cùng độ dài và không lộ thời gian so sánh
        const hash = (value: string) => createHash('sha256').update(value).digest();
        const ok = timingSafeEqual(hash(provided ?? ''), hash(expected));

        if (!ok) {
            throw new UnauthorizedException('Secret webhook không hợp lệ');
        }
    }

    /** Ngân hàng báo có tiền vào: tìm đơn theo nội dung chuyển khoản. */
    async handleBankWebhook(dto: BankWebhookDto): Promise<ConfirmResult> {
        const bookingId = extractBookingId(dto.content);

        if (bookingId === null) {
            this.logger.warn(`Webhook không có mã đơn trong nội dung: "${dto.content}"`);
            return { handled: false, reason: 'no_booking_code' };
        }

        const result = await this.database.transaction((connection) =>
            this.confirmDeposit(connection, bookingId, dto.transfer_amount, null),
        );

        if (!result.handled) {
            // Có tiền vào nhưng không xác nhận được (đơn đã hủy, thiếu tiền...):
            // cần nhân viên xử lý/hoàn tiền thủ công.
            this.logger.warn(
                `Webhook DS${bookingId} (${dto.transfer_amount}đ, ref ${dto.reference_code ?? '-'}) không được xác nhận: ${result.reason}`,
            );
        }

        return result;
    }

    /** Nhân viên/Admin xác nhận thủ công đã nhận tiền cọc. */
    async confirmByStaff(paymentId: number, staff: AuthUser): Promise<ConfirmResult> {
        const result = await this.database.transaction(async (connection) => {
            const [row] = (await this.exec<
                { booking_id: number; amount: string | number }[]
            >(
                connection,
                `
                SELECT i.booking_id, p.amount
                FROM payments p
                JOIN invoices i ON i.invoice_id = p.invoice_id
                WHERE p.payment_id = ?
                `,
                [paymentId],
            ));

            if (!row) {
                throw new NotFoundException('Không tìm thấy khoản thanh toán');
            }

            return this.confirmDeposit(
                connection,
                row.booking_id,
                Number(row.amount),
                staff.sub,
            );
        });

        if (!result.handled) {
            throw new ConflictException(
                `Không thể xác nhận thanh toán (${result.reason})`,
            );
        }

        return result;
    }

    /**
     * Lõi xác nhận. Gọi trong transaction. Khóa dòng booking trước rồi mới tới
     * payment/invoice (cùng thứ tự với phần dọn đơn hết hạn) để tránh deadlock.
     */
    private async confirmDeposit(
        connection: PoolConnection,
        bookingId: number,
        paidAmount: number,
        actorId: number | null,
    ): Promise<ConfirmResult> {
        const [booking] = await this.exec<BookingRow[]>(
            connection,
            this.bookingSql(true),
            [bookingId],
        );

        if (!booking) {
            return { handled: false, reason: 'booking_not_found', booking_id: bookingId };
        }

        const payment = await this.findDepositPayment(connection, bookingId);

        if (!payment) {
            return { handled: false, reason: 'no_deposit_payment', booking_id: bookingId };
        }

        if (payment.status === 'Successful') {
            return {
                handled: true,
                already_paid: true,
                payment_id: payment.payment_id,
                booking_id: bookingId,
            };
        }

        if (booking.status !== 'Pending') {
            return {
                handled: false,
                reason: 'booking_not_pending',
                payment_id: payment.payment_id,
                booking_id: bookingId,
            };
        }

        if (paidAmount < Number(payment.amount)) {
            return {
                handled: false,
                reason: 'amount_too_small',
                payment_id: payment.payment_id,
                booking_id: bookingId,
            };
        }

        return this.withActor(connection, actorId, async () => {
            await connection.execute(
                `
                UPDATE payments
                SET status = 'Successful', amount = ?, paid_at = NOW()
                WHERE payment_id = ?
                `,
                [paidAmount, payment.payment_id],
            );

            await this.refreshInvoiceStatus(connection, payment.invoice_id);

            await connection.execute(
                `UPDATE bookings SET status = 'Confirmed' WHERE booking_id = ? AND status = 'Pending'`,
                [bookingId],
            );

            return {
                handled: true,
                payment_id: payment.payment_id,
                booking_id: bookingId,
            };
        });
    }

    // ---------------------------------------------------------------
    // Hủy đơn hết hạn giữ chỗ
    // ---------------------------------------------------------------

    /** Hủy các đơn Pending quá hạn giữ chỗ để nhả sân. Trả về số đơn đã hủy. */
    async expireUnpaidBookings(): Promise<number> {
        const holdSeconds = Math.floor(this.holdMinutes * 60);

        const candidates = await this.database.query<{ booking_id: number }[]>(
            `
            SELECT booking_id
            FROM bookings
            WHERE status = 'Pending'
              AND created_at < NOW() - INTERVAL ${holdSeconds} SECOND
            ORDER BY booking_id ASC
            LIMIT ${SWEEP_BATCH}
            `,
        );

        let cancelled = 0;

        for (const { booking_id } of candidates) {
            const done = await this.database.transaction(async (connection) => {
                // Khóa lại và kiểm tra lần nữa: có thể vừa được thanh toán
                const [booking] = await this.exec<BookingRow[]>(
                    connection,
                    this.bookingSql(true),
                    [booking_id],
                );

                if (
                    !booking ||
                    booking.status !== 'Pending' ||
                    Number(booking.hold_seconds_left) > 0
                ) {
                    return false;
                }

                await this.cancelExpired(connection, booking_id, null);
                return true;
            });

            if (done) {
                cancelled += 1;
            }
        }

        if (cancelled > 0) {
            this.logger.log(`Đã hủy ${cancelled} đơn hết hạn giữ chỗ`);
        }

        return cancelled;
    }

    private async cancelExpired(
        connection: PoolConnection,
        bookingId: number,
        actorId: number | null,
    ): Promise<void> {
        await this.withActor(connection, actorId, async () => {
            await connection.execute(
                `UPDATE bookings SET status = 'Cancelled' WHERE booking_id = ? AND status = 'Pending'`,
                [bookingId],
            );

            await connection.execute(
                `
                UPDATE payments p
                JOIN invoices i ON i.invoice_id = p.invoice_id
                SET p.status = 'Failed'
                WHERE i.booking_id = ? AND p.status = 'Pending'
                `,
                [bookingId],
            );
        });
    }

    // ---------------------------------------------------------------
    // Hỗ trợ
    // ---------------------------------------------------------------

    private bookingSql(forUpdate: boolean): string {
        const holdSeconds = Math.floor(this.holdMinutes * 60);

        // Tính thời gian còn lại ngay trong DB để cùng múi giờ với created_at
        return `
            SELECT
                b.booking_id,
                b.customer_id,
                b.status,
                b.total_pitch_price,
                GREATEST(0, ${holdSeconds} - TIMESTAMPDIFF(SECOND, b.created_at, NOW())) AS hold_seconds_left
            FROM bookings b
            WHERE b.booking_id = ?
            ${forUpdate ? 'FOR UPDATE' : ''}
        `;
    }

    private async lockBooking(
        connection: PoolConnection,
        bookingId: number,
    ): Promise<BookingRow> {
        const [booking] = await this.exec<BookingRow[]>(
            connection,
            this.bookingSql(true),
            [bookingId],
        );

        if (!booking) {
            throw new NotFoundException('Không tìm thấy đơn đặt sân');
        }

        return booking;
    }

    // Người lạ không được biết đơn tồn tại -> trả 404 thay vì 403
    private assertCanAccess(booking: BookingRow, user: AuthUser): void {
        const isOwner = booking.customer_id === user.sub;
        const isStaff = user.roles?.some((role) => STAFF_ROLES.includes(role));

        if (!isOwner && !isStaff) {
            throw new NotFoundException('Không tìm thấy đơn đặt sân');
        }
    }

    private async findDepositPayment(
        connection: PoolConnection,
        bookingId: number,
    ): Promise<PaymentRow | undefined> {
        const [payment] = await this.exec<PaymentRow[]>(
            connection,
            `
            SELECT p.payment_id, p.invoice_id, p.amount, p.status, p.transaction_code
            FROM payments p
            JOIN invoices i ON i.invoice_id = p.invoice_id
            WHERE i.booking_id = ? AND p.transaction_code = ?
            FOR UPDATE
            `,
            [bookingId, buildTransferContent(bookingId)],
        );
        return payment;
    }

    private async findDepositPaymentPool(
        bookingId: number,
    ): Promise<PaymentRow | undefined> {
        const [payment] = await this.database.query<PaymentRow[]>(
            `
            SELECT p.payment_id, p.invoice_id, p.amount, p.status, p.transaction_code
            FROM payments p
            JOIN invoices i ON i.invoice_id = p.invoice_id
            WHERE i.booking_id = ? AND p.transaction_code = ?
            `,
            [bookingId, buildTransferContent(bookingId)],
        );
        return payment;
    }

    /** Lấy hóa đơn của đơn; chưa có thì tạo từ tiền sân + dịch vụ đã chọn. */
    private async ensureInvoice(
        connection: PoolConnection,
        booking: BookingRow,
    ): Promise<InvoiceRow> {
        const [existing] = await this.exec<InvoiceRow[]>(
            connection,
            `SELECT invoice_id, total_amount, status FROM invoices WHERE booking_id = ? FOR UPDATE`,
            [booking.booking_id],
        );

        if (existing) {
            return existing;
        }

        const services = await this.exec<ServiceLineRow[]>(
            connection,
            `
            SELECT bs.service_id, s.service_name, bs.quantity, bs.unit_price
            FROM booking_services bs
            JOIN services s ON s.service_id = bs.service_id
            WHERE bs.booking_id = ?
            `,
            [booking.booking_id],
        );

        const pitchPrice = Number(booking.total_pitch_price);
        const total =
            pitchPrice +
            services.reduce(
                (sum, line) => sum + Number(line.quantity) * Number(line.unit_price),
                0,
            );

        const [result] = await connection.execute(
            `INSERT INTO invoices (booking_id, total_amount, status) VALUES (?, ?, 'Unpaid')`,
            [booking.booking_id, total],
        );
        const invoiceId = (result as { insertId: number }).insertId;

        await connection.execute(
            `
            INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, line_total)
            VALUES (?, 'Pitch', ?, 1, ?, ?)
            `,
            [invoiceId, `Tiền thuê sân (đơn ${buildTransferContent(booking.booking_id)})`, pitchPrice, pitchPrice],
        );

        for (const line of services) {
            const lineTotal = Number(line.quantity) * Number(line.unit_price);
            await connection.execute(
                `
                INSERT INTO invoice_items
                    (invoice_id, item_type, description, service_id, quantity, unit_price, line_total)
                VALUES (?, 'Service', ?, ?, ?, ?, ?)
                `,
                [invoiceId, line.service_name, line.service_id, line.quantity, line.unit_price, lineTotal],
            );
        }

        return { invoice_id: invoiceId, total_amount: total, status: 'Unpaid' };
    }

    private async refreshInvoiceStatus(
        connection: PoolConnection,
        invoiceId: number,
    ): Promise<void> {
        await connection.execute(
            `
            UPDATE invoices i
            SET i.status = CASE
                WHEN (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
                      WHERE p.invoice_id = i.invoice_id AND p.status = 'Successful') >= i.total_amount
                THEN 'Paid'
                ELSE 'PartiallyPaid'
            END
            WHERE i.invoice_id = ?
            `,
            [invoiceId],
        );
    }

    private buildView(booking: BookingRow, invoice: InvoiceRow, payment: PaymentRow) {
        const bank = this.bank;
        const amount = Number(payment.amount);
        const content = buildTransferContent(booking.booking_id);
        const secondsLeft = Number(booking.hold_seconds_left);
        const isPending = booking.status === 'Pending';

        return {
            payment_id: payment.payment_id,
            booking_id: booking.booking_id,
            booking_status: booking.status,
            payment_status: payment.status,
            deposit_percent: this.depositPercent,
            invoice_total: Number(invoice.total_amount),
            amount,
            transfer_content: content,
            bank: {
                bank_id: bank.bankId,
                bank_name: bank.bankName,
                account_number: bank.accountNumber,
                account_name: bank.accountName,
            },
            qr_url: buildVietQrUrl({
                bankId: bank.bankId,
                accountNumber: bank.accountNumber,
                accountName: bank.accountName,
                template: bank.template,
                amount,
                content,
            }),
            // Chỉ còn đếm ngược khi đơn đang chờ thanh toán
            seconds_remaining: isPending ? secondsLeft : 0,
            expires_at: isPending
                ? new Date(Date.now() + secondsLeft * 1000).toISOString()
                : null,
            is_expired: isPending && secondsLeft <= 0,
        };
    }

    // Biến session @app_user_id được trigger dùng để ghi lịch sử đổi trạng thái.
    // Connection nằm trong pool nên phải xóa giá trị trước khi trả lại.
    private async withActor<T>(
        connection: PoolConnection,
        actorId: number | null,
        work: () => Promise<T>,
    ): Promise<T> {
        await connection.query('SET @app_user_id = ?', [actorId]);
        try {
            return await work();
        } finally {
            await connection.query('SET @app_user_id = NULL').catch(() => undefined);
        }
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
