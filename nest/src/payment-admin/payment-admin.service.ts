import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { PoolConnection } from 'mysql2/promise';

import { hoursUntilStart } from '../bookings/booking-policy.js';
import { addDays } from '../common/date.util.js';
import { getVietnamNow } from '../common/time.util.js';
import { vietnamDayStartEpoch } from '../dashboard/dashboard.service.js';
import type { AuthUser } from '../auth/auth-user.js';
import { DatabaseService } from '../database/database.service.js';
import { isDuplicateEntry } from '../pitch-admin/pitch-admin.utils.js';
import { PaymentsService } from '../payments/payments.service.js';
import { buildTransferContent } from '../payments/payments.utils.js';
import type {
    ConfirmRefundDto,
    FailRefundDto,
    ReconciliationQueryDto,
    RefundListQueryDto,
    ResolveReconciliationDto,
    TransactionsQueryDto,
    UpdateRefundAccountDto,
} from './dto/payment-admin.dto.js';
import {
    ACTION_LABELS,
    allowedActions,
    buildCsv,
    computeInvoiceStatus,
    csvNumber,
    csvText,
    epochToIso,
    issueLabel,
    ledgerCode,
    ledgerStatusLabel,
    ledgerTypeLabel,
    methodLabel,
    round2,
    type InvoiceStatus,
    type LedgerKind,
    type LedgerType,
    type TransferIssue,
} from './payment-admin.utils.js';

const DEFAULT_LIMIT = 20;
const EXPORT_LIMIT = 5000;
const HISTORY_LIMIT = 20;
// Cho phép lệch đồng hồ giữa máy nhân viên và máy chủ khi nhập giờ chuyển tiền
const CLOCK_SKEW_SECONDS = 300;

const REASON_TEXT: Record<string, string> = {
    booking_not_found: 'không tìm thấy đơn',
    no_deposit_payment: 'đơn chưa có khoản cọc',
    booking_not_pending: 'đơn không còn ở trạng thái chờ cọc',
    amount_too_small: 'số tiền chưa đủ cọc',
};

interface LedgerRow {
    kind: LedgerKind;
    ref_id: number;
    event_epoch: string | number;
    booking_id: number | null;
    type: LedgerType;
    amount: string | number;
    method: string;
    status: string;
    reference: string | null;
    customer_name: string | null;
}

interface TransferRow {
    transfer_id: number;
    booking_id: number | null;
    payment_id: number | null;
    content: string;
    reference_code: string | null;
    received_amount: string | number;
    expected_amount: string | number | null;
    issue: TransferIssue;
    status: 'Open' | 'Resolved' | 'Dismissed';
    resolution_action: string | null;
    resolution_note: string | null;
    created_epoch: string | number;
    resolved_epoch?: string | number | null;
    booking_status: string | null;
    customer_name: string | null;
    phone_number: string | null;
    deposit_payment_id: number | null;
}

interface RefundListRow {
    refund_id: number;
    payment_id: number;
    amount: string | number;
    reason: string | null;
    status: 'Pending' | 'Successful' | 'Failed';
    bank_name: string | null;
    bank_account_number: string | null;
    bank_account_name: string | null;
    failure_reason: string | null;
    transaction_code: string | null;
    created_epoch: string | number;
    processed_epoch: string | number | null;
    booking_id: number;
    booking_status: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    pitch_name: string;
    customer_name: string;
    phone_number: string;
}

interface InvoiceInfoRow {
    invoice_id: number;
    total_amount: string | number;
    status: InvoiceStatus;
}

@Injectable()
export class PaymentAdminService {
    constructor(
        private readonly database: DatabaseService,
        private readonly payments: PaymentsService,
    ) { }

    // ---------------------------------------------------------------
    // Thẻ thống kê của ngày
    // ---------------------------------------------------------------

    async getOverview(dateInput?: string) {
        const date = this.resolveDate(dateInput);
        const [from, to] = this.dayRange(date);

        const [collected, refunded, openRefunds, failedRefunds, openTransfers] =
            await Promise.all([
                this.database.query<{ amount: string | number; total: number }[]>(
                    `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS total
                     FROM payments
                     WHERE status = 'Successful'
                       AND UNIX_TIMESTAMP(paid_at) >= ? AND UNIX_TIMESTAMP(paid_at) < ?`,
                    [from, to],
                ),
                this.database.query<{ amount: string | number; total: number }[]>(
                    `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS total
                     FROM payment_refunds
                     WHERE status = 'Successful'
                       AND UNIX_TIMESTAMP(processed_at) >= ? AND UNIX_TIMESTAMP(processed_at) < ?`,
                    [from, to],
                ),
                this.database.query<{ amount: string | number; total: number }[]>(
                    `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS total
                     FROM payment_refunds WHERE status = 'Pending'`,
                ),
                this.database.query<{ total: number }[]>(
                    `SELECT COUNT(*) AS total FROM payment_refunds WHERE status = 'Failed'`,
                ),
                this.database.query<{ total: number }[]>(
                    `SELECT COUNT(*) AS total FROM bank_transfer_logs WHERE status = 'Open'`,
                ),
            ]);

        const collectedAmount = round2(Number(collected[0]?.amount ?? 0));
        const refundedAmount = round2(Number(refunded[0]?.amount ?? 0));

        return {
            date,
            kpis: {
                collected_amount: collectedAmount,
                collected_count: Number(collected[0]?.total ?? 0),
                refunded_amount: refundedAmount,
                refunded_count: Number(refunded[0]?.total ?? 0),
                net_revenue: round2(collectedAmount - refundedAmount),
            },
            // Việc tồn đọng (không phụ thuộc ngày đang xem)
            backlog: {
                pending_refund_count: Number(openRefunds[0]?.total ?? 0),
                pending_refund_amount: round2(Number(openRefunds[0]?.amount ?? 0)),
                failed_refund_count: Number(failedRefunds[0]?.total ?? 0),
                reconciliation_open_count: Number(openTransfers[0]?.total ?? 0),
            },
        };
    }

    // ---------------------------------------------------------------
    // Sổ giao dịch
    // ---------------------------------------------------------------

    async listTransactions(query: TransactionsQueryDto) {
        const date = this.resolveDate(query.date);
        const page = query.page ?? 1;
        const limit = query.limit ?? DEFAULT_LIMIT;
        const { where, params } = this.ledgerFilter(date, query);

        const [rows, totals] = await Promise.all([
            this.database.query<LedgerRow[]>(
                `${this.ledgerSelect()}
                 WHERE ${where}
                 ORDER BY l.event_epoch DESC, l.kind ASC, l.ref_id DESC
                 LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
                params,
            ),
            this.database.query<
                { total: number; collected: string | number; refunded: string | number }[]
            >(
                `SELECT COUNT(*) AS total,
                        COALESCE(SUM(CASE WHEN l.status = 'Successful' AND l.amount > 0 THEN l.amount END), 0) AS collected,
                        COALESCE(SUM(CASE WHEN l.status = 'Successful' AND l.amount < 0 THEN -l.amount END), 0) AS refunded
                 ${this.ledgerFrom()}
                 WHERE ${where}`,
                params,
            ),
        ]);

        const collected = round2(Number(totals[0]?.collected ?? 0));
        const refunded = round2(Number(totals[0]?.refunded ?? 0));

        return {
            date,
            page,
            limit,
            total: Number(totals[0]?.total ?? 0),
            // Tổng của TOÀN BỘ kết quả lọc (không chỉ trang hiện tại); chỉ tính giao dịch thành công
            totals: { collected, refunded, net: round2(collected - refunded) },
            items: rows.map((row) => this.toLedgerItem(row)),
        };
    }

    /** Xuất CSV theo cùng bộ lọc với sổ giao dịch (tối đa 5.000 dòng). */
    async exportTransactions(query: TransactionsQueryDto) {
        const date = this.resolveDate(query.date);
        const { where, params } = this.ledgerFilter(date, query);

        const rows = await this.database.query<LedgerRow[]>(
            `${this.ledgerSelect()}
             WHERE ${where}
             ORDER BY l.event_epoch DESC, l.kind ASC, l.ref_id DESC
             LIMIT ${EXPORT_LIMIT}`,
            params,
        );

        const csv = buildCsv(
            ['Mã giao dịch', 'Thời gian', 'Booking', 'Khách hàng', 'Loại', 'Số tiền', 'Phương thức', 'Kết quả', 'Mã tham chiếu'],
            rows.map((row) => {
                const item = this.toLedgerItem(row);
                return [
                    csvText(item.code),
                    csvText(item.occurred_at),
                    csvText(item.booking_code),
                    csvText(item.customer_name),
                    csvText(item.type_label),
                    csvNumber(item.amount),
                    csvText(item.method_label),
                    csvText(item.status_label),
                    csvText(item.reference),
                ];
            }),
        );

        return { filename: `giao-dich-${date}.csv`, csv };
    }

    // ---------------------------------------------------------------
    // Hàng đợi đối soát thủ công
    // ---------------------------------------------------------------

    async listReconciliations(query: ReconciliationQueryDto) {
        const status = query.status ?? 'Open';
        const page = query.page ?? 1;
        const limit = query.limit ?? DEFAULT_LIMIT;

        const [rows, count] = await Promise.all([
            this.database.query<TransferRow[]>(
                `${this.transferSelect()}
                 WHERE t.status = ?
                 ORDER BY t.transfer_id DESC
                 LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
                [status],
            ),
            this.database.query<{ total: number }[]>(
                `SELECT COUNT(*) AS total FROM bank_transfer_logs WHERE status = ?`,
                [status],
            ),
        ]);

        return {
            status,
            page,
            limit,
            total: Number(count[0]?.total ?? 0),
            items: rows.map((row) => this.toTransferItem(row)),
        };
    }

    async resolveReconciliation(
        id: number,
        dto: ResolveReconciliationDto,
        staff: AuthUser,
    ) {
        const note = dto.note?.trim() || null;

        if (dto.action === 'dismiss' && !note) {
            throw new BadRequestException('Hãy ghi chú cách đã xử lý khoản này.');
        }

        return this.database.transaction(async (connection) => {
            const [log] = await this.exec<TransferRow[]>(
                connection,
                `SELECT t.*, UNIX_TIMESTAMP(t.created_at) AS created_epoch
                 FROM bank_transfer_logs t
                 WHERE t.transfer_id = ?
                 FOR UPDATE`,
                [id],
            );

            if (!log) {
                throw new NotFoundException('Không tìm thấy khoản đối soát.');
            }

            if (log.status !== 'Open') {
                throw new ConflictException('Khoản này đã được xử lý trước đó.');
            }

            const bookingStatus = log.booking_id
                ? (
                    await this.exec<{ status: string }[]>(
                        connection,
                        `SELECT status FROM bookings WHERE booking_id = ?`,
                        [log.booking_id],
                    )
                )[0]?.status ?? null
                : null;

            const depositPayment = log.booking_id
                ? (
                    await this.exec<{ payment_id: number }[]>(
                        connection,
                        `SELECT p.payment_id
                         FROM payments p
                         JOIN invoices i ON i.invoice_id = p.invoice_id
                         WHERE i.booking_id = ? AND p.transaction_code = ?`,
                        [log.booking_id, buildTransferContent(log.booking_id)],
                    )
                )[0]
                : undefined;

            const allowed = allowedActions(log.issue, Boolean(depositPayment), bookingStatus);

            if (!allowed.includes(dto.action)) {
                throw new BadRequestException(
                    'Cách xử lý này không áp dụng được cho khoản đối soát này.',
                );
            }

            let appliedPaymentId: number | null = null;
            let refundId: number | null = null;

            if (dto.action === 'apply_to_booking') {
                const total = round2(Number(log.received_amount) + (dto.extra_amount ?? 0));
                const result = await this.payments.confirmDeposit(
                    connection,
                    log.booking_id as number,
                    total,
                    staff.sub,
                );

                if (!result.handled) {
                    throw new ConflictException(
                        `Không thể ghi nhận vào đơn (${REASON_TEXT[result.reason ?? ''] ?? result.reason}).`,
                    );
                }

                if (result.already_paid) {
                    throw new ConflictException(
                        'Đơn đã được thanh toán cọc. Hãy chọn hoàn tiền hoặc bỏ qua khoản này.',
                    );
                }

                appliedPaymentId = result.payment_id ?? null;
            }

            if (dto.action === 'request_refund') {
                const created = await this.createRefundForTransfer(connection, log, staff);
                appliedPaymentId = created.paymentId;
                refundId = created.refundId;
            }

            await connection.execute(
                `UPDATE bank_transfer_logs
                 SET status = ?, resolution_action = ?, resolution_note = ?,
                     resolved_by = ?, resolved_at = NOW()
                 WHERE transfer_id = ?`,
                [
                    dto.action === 'dismiss' ? 'Dismissed' : 'Resolved',
                    dto.action,
                    note,
                    staff.sub,
                    id,
                ],
            );

            return {
                message: `Đã xử lý khoản đối soát ${ledgerCode('transfer', id)}: ${ACTION_LABELS[dto.action]}.`,
                transfer_id: id,
                action: dto.action,
                payment_id: appliedPaymentId,
                refund_id: refundId,
            };
        });
    }

    /**
     * Tiền chuyển nhầm/chuyển cho đơn đã hủy: ghi nhận khoản thu rồi tạo yêu cầu hoàn
     * (Pending) để đi chung luồng hoàn cọc, doanh thu thuần vẫn đúng sau khi hoàn xong.
     */
    private async createRefundForTransfer(
        connection: PoolConnection,
        log: TransferRow,
        staff: AuthUser,
    ): Promise<{ paymentId: number; refundId: number }> {
        // Khóa booking trước (cùng thứ tự với các luồng thanh toán khác) để tránh deadlock
        await this.exec(
            connection,
            `SELECT booking_id FROM bookings WHERE booking_id = ? FOR UPDATE`,
            [log.booking_id],
        );

        const [invoice] = await this.exec<InvoiceInfoRow[]>(
            connection,
            `SELECT invoice_id, total_amount, status FROM invoices WHERE booking_id = ? FOR UPDATE`,
            [log.booking_id],
        );

        if (!invoice) {
            throw new ConflictException('Đơn chưa có hóa đơn nên không thể tạo yêu cầu hoàn.');
        }

        const amount = Number(log.received_amount);
        const code = `${buildTransferContent(log.booking_id as number)}-T${log.transfer_id}`;

        const [paymentResult] = await connection.execute(
            `INSERT INTO payments (invoice_id, payment_method, transaction_code, amount, status, paid_at)
             VALUES (?, 'Banking', ?, ?, 'Successful', FROM_UNIXTIME(?))`,
            [invoice.invoice_id, code, amount, Number(log.created_epoch)],
        );
        const paymentId = (paymentResult as { insertId: number }).insertId;

        const [refundResult] = await connection.execute(
            `INSERT INTO payment_refunds (payment_id, amount, reason, status)
             VALUES (?, ?, ?, 'Pending')`,
            [
                paymentId,
                amount,
                `Hoàn khoản chuyển không khớp ${ledgerCode('transfer', log.transfer_id)} (${buildTransferContent(log.booking_id as number)})`,
            ],
        );
        const refundId = (refundResult as { insertId: number }).insertId;

        await this.writeRefundHistory(connection, refundId, null, 'Pending', 'Tạo từ hàng đợi đối soát', staff.sub);
        await this.refreshInvoiceStatus(connection, invoice.invoice_id);

        return { paymentId, refundId };
    }

    // ---------------------------------------------------------------
    // Hoàn cọc
    // ---------------------------------------------------------------

    async listRefunds(query: RefundListQueryDto) {
        const filter = query.status ?? 'open';
        const page = query.page ?? 1;
        const limit = query.limit ?? DEFAULT_LIMIT;

        const where =
            filter === 'open'
                ? `WHERE r.status IN ('Pending', 'Failed')`
                : filter === 'failed'
                    ? `WHERE r.status = 'Failed'`
                    : filter === 'done'
                        ? `WHERE r.status = 'Successful'`
                        : '';

        const [rows, count, summary] = await Promise.all([
            this.database.query<RefundListRow[]>(
                `${this.refundSelect()}
                 ${where}
                 ORDER BY (r.status = 'Successful') ASC, r.refund_id DESC
                 LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
            ),
            this.database.query<{ total: number }[]>(
                `SELECT COUNT(*) AS total FROM payment_refunds r ${where}`,
            ),
            this.database.query<{ status: string; total: number; amount: string | number }[]>(
                `SELECT status, COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount
                 FROM payment_refunds GROUP BY status`,
            ),
        ]);

        const by = (status: string) => summary.find((row) => row.status === status);

        return {
            filter,
            page,
            limit,
            total: Number(count[0]?.total ?? 0),
            summary: {
                pending_count: Number(by('Pending')?.total ?? 0),
                pending_amount: round2(Number(by('Pending')?.amount ?? 0)),
                failed_count: Number(by('Failed')?.total ?? 0),
                done_count: Number(by('Successful')?.total ?? 0),
            },
            items: rows.map((row) => this.toRefundItem(row)),
        };
    }

    async getRefund(id: number) {
        const [row] = await this.database.query<RefundListRow[]>(
            `${this.refundSelect()} WHERE r.refund_id = ? LIMIT 1`,
            [id],
        );

        if (!row) {
            throw new NotFoundException('Không tìm thấy yêu cầu hoàn cọc.');
        }

        const [invoiceRows, sums, cancelRows, history, processor] = await Promise.all([
            this.database.query<InvoiceInfoRow[]>(
                `SELECT i.invoice_id, i.total_amount, i.status
                 FROM invoices i WHERE i.booking_id = ? LIMIT 1`,
                [row.booking_id],
            ),
            this.database.query<{ paid: string | number; refunded: string | number }[]>(
                `SELECT
                    COALESCE((SELECT SUM(p.amount) FROM payments p
                              JOIN invoices i ON i.invoice_id = p.invoice_id
                              WHERE i.booking_id = ? AND p.status = 'Successful'), 0) AS paid,
                    COALESCE((SELECT SUM(r.amount) FROM payment_refunds r
                              JOIN payments p ON p.payment_id = r.payment_id
                              JOIN invoices i ON i.invoice_id = p.invoice_id
                              WHERE i.booking_id = ? AND r.status = 'Successful'), 0) AS refunded`,
                [row.booking_id, row.booking_id],
            ),
            this.database.query<{ cancelled_epoch: string | number; reason: string | null }[]>(
                `SELECT UNIX_TIMESTAMP(changed_at) AS cancelled_epoch, reason
                 FROM booking_status_history
                 WHERE booking_id = ? AND new_status = 'Cancelled'
                 ORDER BY history_id DESC LIMIT 1`,
                [row.booking_id],
            ),
            this.database.query<
                {
                    history_id: number;
                    old_status: string | null;
                    new_status: string;
                    note: string | null;
                    changed_by_name: string | null;
                    changed_epoch: string | number;
                }[]
            >(
                `SELECT h.history_id, h.old_status, h.new_status, h.note,
                        u.full_name AS changed_by_name,
                        UNIX_TIMESTAMP(h.changed_at) AS changed_epoch
                 FROM payment_refund_history h
                 LEFT JOIN users u ON u.user_id = h.changed_by
                 WHERE h.refund_id = ?
                 ORDER BY h.history_id DESC
                 LIMIT ${HISTORY_LIMIT}`,
                [id],
            ),
            this.database.query<{ full_name: string | null }[]>(
                `SELECT u.full_name
                 FROM payment_refunds r
                 LEFT JOIN users u ON u.user_id = r.processed_by
                 WHERE r.refund_id = ?`,
                [id],
            ),
        ]);

        const invoice = invoiceRows[0];
        const paid = round2(Number(sums[0]?.paid ?? 0));
        const refunded = round2(Number(sums[0]?.refunded ?? 0));
        const amount = Number(row.amount);
        const actionable = row.status !== 'Successful';

        const cancel = cancelRows[0];
        const hoursBefore = cancel
            ? round2(
                hoursUntilStart(
                    row.booking_date,
                    row.start_time,
                    new Date(Number(cancel.cancelled_epoch) * 1000),
                ),
            )
            : null;

        const item = this.toRefundItem(row);
        const refundedAfter = round2(refunded + (actionable ? amount : 0));

        return {
            refund: {
                ...item,
                processed_by_name: processor[0]?.full_name ?? null,
            },
            booking: {
                booking_id: row.booking_id,
                booking_code: buildTransferContent(row.booking_id),
                status: row.booking_status,
                pitch_name: row.pitch_name,
                booking_date: row.booking_date,
                start_time: row.start_time,
                end_time: row.end_time,
                cancelled_at: cancel ? epochToIso(cancel.cancelled_epoch) : null,
                cancel_reason: cancel?.reason ?? null,
                hours_before_start: hoursBefore,
                refund_percent: paid > 0 ? Math.round((amount / paid) * 100) : 0,
            },
            customer: { name: row.customer_name, phone: row.phone_number },
            account: item.account,
            invoice: invoice
                ? {
                    invoice_id: invoice.invoice_id,
                    total_amount: Number(invoice.total_amount),
                    status: invoice.status,
                    paid_amount: paid,
                    refunded_amount: refunded,
                    // Hóa đơn sẽ thành gì nếu xác nhận hoàn khoản này
                    after_confirm: actionable
                        ? {
                            status: computeInvoiceStatus(
                                Number(invoice.total_amount),
                                paid,
                                refundedAfter,
                            ),
                            refunded_amount: refundedAfter,
                            net_revenue_change: -amount,
                        }
                        : null,
                }
                : null,
            can: {
                confirm: actionable,
                fail: row.status === 'Pending',
                update_account: actionable,
            },
            history: history.map((h) => ({
                history_id: h.history_id,
                old_status: h.old_status,
                new_status: h.new_status,
                note: h.note,
                changed_by_name: h.changed_by_name,
                changed_at: epochToIso(h.changed_epoch),
            })),
        };
    }

    /** Nhập/sửa tài khoản nhận hoàn. Yêu cầu đang Failed sẽ được mở lại để chuyển lại. */
    async updateRefundAccount(id: number, dto: UpdateRefundAccountDto, staff: AuthUser) {
        return this.database.transaction(async (connection) => {
            const refund = await this.lockRefund(connection, id);

            if (refund.status === 'Successful') {
                throw new ConflictException('Khoản hoàn đã hoàn tất, không thể sửa thông tin nhận hoàn.');
            }

            const reopen = refund.status === 'Failed';

            await connection.execute(
                `UPDATE payment_refunds
                 SET bank_name = ?, bank_account_number = ?, bank_account_name = ?,
                     status = 'Pending', failure_reason = NULL
                 WHERE refund_id = ?`,
                [dto.bank_name, dto.bank_account_number, dto.bank_account_name, id],
            );

            await this.writeRefundHistory(
                connection,
                id,
                refund.status,
                'Pending',
                reopen
                    ? 'Cập nhật thông tin nhận hoàn, mở lại để chuyển lại'
                    : 'Cập nhật thông tin nhận hoàn',
                staff.sub,
            );

            return {
                message: reopen
                    ? 'Đã cập nhật thông tin và mở lại yêu cầu hoàn.'
                    : 'Đã cập nhật thông tin nhận hoàn.',
                refund_id: id,
                status: 'Pending' as const,
            };
        });
    }

    /** Nhân viên đã tự chuyển tiền qua ngân hàng: chỉ ghi nhận, không thực chi tiền. */
    async confirmRefund(id: number, dto: ConfirmRefundDto, staff: AuthUser) {
        const nowEpoch = Math.floor(Date.now() / 1000);
        const transferEpoch = dto.transferred_at
            ? Math.floor(new Date(dto.transferred_at).getTime() / 1000)
            : nowEpoch;

        if (!Number.isFinite(transferEpoch)) {
            throw new BadRequestException('Thời gian chuyển tiền không hợp lệ.');
        }

        if (transferEpoch > nowEpoch + CLOCK_SKEW_SECONDS) {
            throw new BadRequestException('Thời gian chuyển tiền không được ở tương lai.');
        }

        return this.database.transaction(async (connection) => {
            const refund = await this.lockRefund(connection, id);

            if (refund.status === 'Successful') {
                throw new ConflictException('Khoản hoàn này đã được xác nhận trước đó.');
            }

            if (transferEpoch < Number(refund.created_epoch) - CLOCK_SKEW_SECONDS) {
                throw new BadRequestException(
                    'Thời gian chuyển tiền không được trước thời điểm tạo yêu cầu hoàn.',
                );
            }

            // Không hoàn vượt số tiền đã thu của khoản thanh toán gốc
            const [others] = await this.exec<{ total: string | number }[]>(
                connection,
                `SELECT COALESCE(SUM(amount), 0) AS total
                 FROM payment_refunds
                 WHERE payment_id = ? AND status = 'Successful' AND refund_id <> ?`,
                [refund.payment_id, id],
            );

            if (Number(others?.total ?? 0) + Number(refund.amount) > Number(refund.payment_amount)) {
                throw new ConflictException('Tổng tiền hoàn vượt quá số tiền đã thu của khoản thanh toán.');
            }

            try {
                await connection.execute(
                    `UPDATE payment_refunds
                     SET status = 'Successful',
                         transaction_code = ?,
                         failure_reason = NULL,
                         processed_by = (SELECT user_id FROM employees WHERE user_id = ?),
                         processed_at = FROM_UNIXTIME(?)
                     WHERE refund_id = ? AND status IN ('Pending', 'Failed')`,
                    [dto.transaction_code, staff.sub, transferEpoch, id],
                );
            } catch (error) {
                if (isDuplicateEntry(error)) {
                    throw new ConflictException('Mã giao dịch này đã được dùng cho một khoản khác.');
                }
                throw error;
            }

            await this.writeRefundHistory(
                connection,
                id,
                refund.status,
                'Successful',
                `Đã chuyển hoàn, mã giao dịch ${dto.transaction_code}`,
                staff.sub,
            );

            const invoiceStatus = await this.refreshInvoiceStatus(connection, refund.invoice_id);
            const amount = Number(refund.amount);

            return {
                message: `Đã ghi nhận hoàn cọc ${buildTransferContent(refund.booking_id)} thành công.`,
                refund_id: id,
                status: 'Successful' as const,
                amount,
                transaction_code: dto.transaction_code,
                processed_at: new Date(transferEpoch * 1000).toISOString(),
                invoice_status: invoiceStatus,
                // Doanh thu ngày chuyển hoàn giảm đúng số tiền hoàn
                revenue_effect: {
                    date: getVietnamNow(new Date(transferEpoch * 1000)).date,
                    refunded_change: amount,
                    net_revenue_change: -amount,
                },
            };
        });
    }

    /** Chuyển hoàn thất bại: giữ khoản hoàn để sửa thông tin và chuyển lại, chưa trừ doanh thu. */
    async failRefund(id: number, dto: FailRefundDto, staff: AuthUser) {
        return this.database.transaction(async (connection) => {
            const refund = await this.lockRefund(connection, id);

            if (refund.status !== 'Pending') {
                throw new ConflictException(
                    refund.status === 'Failed'
                        ? 'Khoản hoàn này đã được ghi nhận thất bại.'
                        : 'Khoản hoàn đã hoàn tất, không thể ghi nhận thất bại.',
                );
            }

            await connection.execute(
                `UPDATE payment_refunds SET status = 'Failed', failure_reason = ? WHERE refund_id = ?`,
                [dto.reason, id],
            );

            await this.writeRefundHistory(
                connection,
                id,
                'Pending',
                'Failed',
                `Chuyển hoàn thất bại: ${dto.reason}`,
                staff.sub,
            );

            return {
                message: 'Đã ghi nhận chuyển hoàn thất bại. Hãy sửa thông tin nhận hoàn rồi chuyển lại.',
                refund_id: id,
                status: 'Failed' as const,
                failure_reason: dto.reason,
            };
        });
    }

    // ---------------------------------------------------------------
    // SQL dùng chung
    // ---------------------------------------------------------------

    /** Gộp 3 nguồn: khoản thu, khoản hoàn, chuyển khoản chưa khớp (đang chờ đối soát). */
    private ledgerUnion(): string {
        return `
            SELECT 'payment' AS kind,
                   p.payment_id AS ref_id,
                   UNIX_TIMESTAMP(COALESCE(p.paid_at, p.created_at)) AS event_epoch,
                   i.booking_id AS booking_id,
                   CASE WHEN p.transaction_code = CONCAT('DS', i.booking_id)
                          OR p.transaction_code LIKE CONCAT('DS', i.booking_id, '-%')
                        THEN 'Deposit' ELSE 'Balance' END AS type,
                   p.amount AS amount,
                   p.payment_method AS method,
                   p.status AS status,
                   p.transaction_code AS reference
            FROM payments p
            JOIN invoices i ON i.invoice_id = p.invoice_id
            UNION ALL
            SELECT 'refund',
                   r.refund_id,
                   UNIX_TIMESTAMP(COALESCE(r.processed_at, r.created_at)),
                   i.booking_id,
                   'Refund',
                   -r.amount,
                   'Banking',
                   r.status,
                   r.transaction_code
            FROM payment_refunds r
            JOIN payments p ON p.payment_id = r.payment_id
            JOIN invoices i ON i.invoice_id = p.invoice_id
            UNION ALL
            SELECT 'transfer',
                   t.transfer_id,
                   UNIX_TIMESTAMP(t.created_at),
                   t.booking_id,
                   'Unmatched',
                   t.received_amount,
                   'Banking',
                   'Pending',
                   t.reference_code
            FROM bank_transfer_logs t
            WHERE t.status = 'Open'`;
    }

    private ledgerFrom(): string {
        return `FROM (${this.ledgerUnion()}) l
                LEFT JOIN bookings b ON b.booking_id = l.booking_id
                LEFT JOIN users u ON u.user_id = b.customer_id`;
    }

    private ledgerSelect(): string {
        return `SELECT l.kind, l.ref_id, l.event_epoch, l.booking_id, l.type, l.amount,
                       l.method, l.status, l.reference, u.full_name AS customer_name
                ${this.ledgerFrom()}`;
    }

    private ledgerFilter(date: string, query: TransactionsQueryDto) {
        const [from, to] = this.dayRange(date);
        const clauses = ['l.event_epoch >= ?', 'l.event_epoch < ?'];
        const params: (string | number)[] = [from, to];

        if (query.status) {
            clauses.push('l.status = ?');
            params.push(query.status);
        }

        if (query.method) {
            clauses.push('l.method = ?');
            params.push(query.method);
        }

        if (query.type) {
            clauses.push('l.type = ?');
            params.push(query.type);
        }

        if (query.q) {
            const like = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
            clauses.push(
                `(CONCAT('DS', l.booking_id) LIKE ? OR u.full_name LIKE ? OR u.phone_number LIKE ? OR l.reference LIKE ?)`,
            );
            params.push(like, like, like, like);
        }

        return { where: clauses.join(' AND '), params };
    }

    private transferSelect(): string {
        return `SELECT t.transfer_id, t.booking_id, t.payment_id, t.content, t.reference_code,
                       t.received_amount, t.expected_amount, t.issue, t.status,
                       t.resolution_action, t.resolution_note,
                       UNIX_TIMESTAMP(t.created_at) AS created_epoch,
                       UNIX_TIMESTAMP(t.resolved_at) AS resolved_epoch,
                       b.status AS booking_status,
                       u.full_name AS customer_name,
                       u.phone_number AS phone_number,
                       (SELECT p.payment_id
                        FROM payments p
                        JOIN invoices i ON i.invoice_id = p.invoice_id
                        WHERE i.booking_id = t.booking_id
                          AND p.transaction_code = CONCAT('DS', t.booking_id)
                        LIMIT 1) AS deposit_payment_id
                FROM bank_transfer_logs t
                LEFT JOIN bookings b ON b.booking_id = t.booking_id
                LEFT JOIN users u ON u.user_id = b.customer_id`;
    }

    private refundSelect(): string {
        return `SELECT r.refund_id, r.payment_id, r.amount, r.reason, r.status,
                       r.bank_name, r.bank_account_number, r.bank_account_name,
                       r.failure_reason, r.transaction_code,
                       UNIX_TIMESTAMP(r.created_at) AS created_epoch,
                       UNIX_TIMESTAMP(r.processed_at) AS processed_epoch,
                       i.booking_id,
                       b.status AS booking_status,
                       DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
                       TIME_FORMAT(b.start_time, '%H:%i') AS start_time,
                       TIME_FORMAT(b.end_time, '%H:%i') AS end_time,
                       pt.pitch_name,
                       u.full_name AS customer_name,
                       u.phone_number AS phone_number
                FROM payment_refunds r
                JOIN payments p ON p.payment_id = r.payment_id
                JOIN invoices i ON i.invoice_id = p.invoice_id
                JOIN bookings b ON b.booking_id = i.booking_id
                JOIN pitches pt ON pt.pitch_id = b.pitch_id
                JOIN users u ON u.user_id = b.customer_id`;
    }

    // ---------------------------------------------------------------
    // Chuyển dữ liệu DB -> JSON trả về
    // ---------------------------------------------------------------

    private toLedgerItem(row: LedgerRow) {
        const id = Number(row.ref_id);

        return {
            kind: row.kind,
            id,
            code: ledgerCode(row.kind, id),
            occurred_at: epochToIso(row.event_epoch),
            booking_id: row.booking_id,
            booking_code: row.booking_id ? buildTransferContent(row.booking_id) : null,
            customer_name: row.customer_name,
            type: row.type,
            type_label: ledgerTypeLabel(row.type),
            // Dương = tiền vào, âm = tiền hoàn ra
            amount: round2(Number(row.amount)),
            method: row.method,
            method_label: methodLabel(row.kind, row.method, row.type),
            status: row.status,
            status_label: ledgerStatusLabel(row.kind, row.status),
            // Chỉ giao dịch thành công mới ảnh hưởng doanh thu
            counts_in_revenue: row.status === 'Successful',
            reference: row.reference,
        };
    }

    private toTransferItem(row: TransferRow) {
        const received = round2(Number(row.received_amount));
        const expected = row.expected_amount === null ? null : round2(Number(row.expected_amount));
        const difference = expected === null ? null : round2(received - expected);
        const actions = allowedActions(
            row.issue,
            Boolean(row.deposit_payment_id),
            row.booking_status,
        );

        return {
            transfer_id: Number(row.transfer_id),
            code: ledgerCode('transfer', Number(row.transfer_id)),
            booking_id: row.booking_id,
            booking_code: row.booking_id ? buildTransferContent(row.booking_id) : null,
            booking_status: row.booking_status,
            customer_name: row.customer_name,
            customer_phone: row.phone_number,
            content: row.content,
            reference_code: row.reference_code,
            received_amount: received,
            expected_amount: expected,
            difference,
            issue: row.issue,
            issue_label: issueLabel(row.issue, row.booking_status, difference),
            status: row.status,
            received_at: epochToIso(row.created_epoch),
            resolution_action: row.resolution_action,
            resolution_note: row.resolution_note,
            resolved_at: epochToIso(row.resolved_epoch),
            actions: row.status === 'Open'
                ? actions.map((action) => ({ action, label: ACTION_LABELS[action] }))
                : [],
        };
    }

    private toRefundItem(row: RefundListRow) {
        const complete = Boolean(
            row.bank_name && row.bank_account_number && row.bank_account_name,
        );

        return {
            refund_id: Number(row.refund_id),
            code: ledgerCode('refund', Number(row.refund_id)),
            status: row.status,
            status_label: ledgerStatusLabel('refund', row.status),
            amount: round2(Number(row.amount)),
            reason: row.reason,
            failure_reason: row.failure_reason,
            transaction_code: row.transaction_code,
            requested_at: epochToIso(row.created_epoch),
            processed_at: epochToIso(row.processed_epoch),
            booking_id: row.booking_id,
            booking_code: buildTransferContent(row.booking_id),
            booking_status: row.booking_status,
            booking_date: row.booking_date,
            start_time: row.start_time,
            end_time: row.end_time,
            pitch_name: row.pitch_name,
            customer_name: row.customer_name,
            customer_phone: row.phone_number,
            account: {
                bank_name: row.bank_name,
                account_number: row.bank_account_number,
                account_name: row.bank_account_name,
                is_complete: complete,
            },
        };
    }

    // ---------------------------------------------------------------
    // Hỗ trợ
    // ---------------------------------------------------------------

    private async lockRefund(connection: PoolConnection, id: number) {
        const [refund] = await this.exec<
            {
                refund_id: number;
                payment_id: number;
                amount: string | number;
                status: 'Pending' | 'Successful' | 'Failed';
                created_epoch: string | number;
                invoice_id: number;
                booking_id: number;
                payment_amount: string | number;
            }[]
        >(
            connection,
            `SELECT r.refund_id, r.payment_id, r.amount, r.status,
                    UNIX_TIMESTAMP(r.created_at) AS created_epoch,
                    p.invoice_id, p.amount AS payment_amount, i.booking_id
             FROM payment_refunds r
             JOIN payments p ON p.payment_id = r.payment_id
             JOIN invoices i ON i.invoice_id = p.invoice_id
             WHERE r.refund_id = ?
             FOR UPDATE`,
            [id],
        );

        if (!refund) {
            throw new NotFoundException('Không tìm thấy yêu cầu hoàn cọc.');
        }

        return refund;
    }

    private async writeRefundHistory(
        connection: PoolConnection,
        refundId: number,
        oldStatus: string | null,
        newStatus: string,
        note: string,
        userId: number,
    ): Promise<void> {
        await connection.execute(
            `INSERT INTO payment_refund_history (refund_id, old_status, new_status, note, changed_by)
             VALUES (?, ?, ?, ?, ?)`,
            [refundId, oldStatus, newStatus, note.slice(0, 500), userId],
        );
    }

    /** Tính lại trạng thái hóa đơn từ các khoản thu/hoàn đã thành công. */
    private async refreshInvoiceStatus(
        connection: PoolConnection,
        invoiceId: number,
    ): Promise<InvoiceStatus> {
        const [row] = await this.exec<
            { total_amount: string | number; paid: string | number; refunded: string | number }[]
        >(
            connection,
            `SELECT i.total_amount,
                    COALESCE((SELECT SUM(p.amount) FROM payments p
                              WHERE p.invoice_id = i.invoice_id AND p.status = 'Successful'), 0) AS paid,
                    COALESCE((SELECT SUM(r.amount) FROM payment_refunds r
                              JOIN payments p ON p.payment_id = r.payment_id
                              WHERE p.invoice_id = i.invoice_id AND r.status = 'Successful'), 0) AS refunded
             FROM invoices i
             WHERE i.invoice_id = ?`,
            [invoiceId],
        );

        const status = computeInvoiceStatus(
            Number(row?.total_amount ?? 0),
            Number(row?.paid ?? 0),
            Number(row?.refunded ?? 0),
        );

        await connection.execute(`UPDATE invoices SET status = ? WHERE invoice_id = ?`, [
            status,
            invoiceId,
        ]);

        return status;
    }

    private resolveDate(input?: string): string {
        if (!input) {
            return getVietnamNow().date;
        }

        const parsed = new Date(`${input}T00:00:00Z`);

        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) {
            throw new BadRequestException('Ngày không hợp lệ.');
        }

        return input;
    }

    /** [00:00 hôm đó, 00:00 hôm sau) theo giờ Việt Nam, đơn vị epoch giây. */
    private dayRange(date: string): [number, number] {
        return [vietnamDayStartEpoch(date), vietnamDayStartEpoch(addDays(date, 1))];
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
