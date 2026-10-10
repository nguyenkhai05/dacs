// Các hàm thuần (không đụng DB) cho màn Admin > Thanh toán & hoàn cọc.

export type LedgerKind = 'payment' | 'refund' | 'transfer';
export type LedgerType = 'Deposit' | 'Balance' | 'Refund' | 'Unmatched';
export type TransferIssue =
    | 'NoBookingCode'
    | 'BookingNotFound'
    | 'NoDepositPayment'
    | 'BookingNotPending'
    | 'AmountTooSmall';
export type ReconcileAction = 'apply_to_booking' | 'request_refund' | 'dismiss';
export type InvoiceStatus =
    | 'Unpaid'
    | 'PartiallyPaid'
    | 'Paid'
    | 'PartiallyRefunded'
    | 'Refunded';

export const round2 = (value: number): number =>
    Math.round((value + Number.EPSILON) * 100) / 100;

/** Mã hiển thị: payment 501 -> TT0501, refund 7 -> HT0007, chuyển khoản chưa khớp 3 -> CK0003 */
export function ledgerCode(kind: LedgerKind, id: number): string {
    const prefix = kind === 'payment' ? 'TT' : kind === 'refund' ? 'HT' : 'CK';
    return `${prefix}${String(id).padStart(4, '0')}`;
}

export function ledgerTypeLabel(type: LedgerType): string {
    switch (type) {
        case 'Deposit':
            return 'Thu cọc';
        case 'Balance':
            return 'Thu còn lại';
        case 'Refund':
            return 'Hoàn cọc';
        default:
            return 'Chuyển khoản chưa khớp';
    }
}

export function methodLabel(
    kind: LedgerKind,
    method: string,
    type: LedgerType,
): string {
    if (kind === 'refund') return 'Chuyển khoản thủ công';
    if (kind === 'transfer') return 'VietQR';
    if (method === 'Cash') return 'Tiền mặt';
    if (method === 'Banking') return type === 'Deposit' ? 'VietQR' : 'Chuyển khoản';
    return method;
}

export function ledgerStatusLabel(kind: LedgerKind, status: string): string {
    if (status === 'Successful') return 'Thành công';
    if (status === 'Failed') return 'Thất bại';
    if (kind === 'refund') return 'Chờ hoàn';
    if (kind === 'transfer') return 'Chờ đối soát';
    return 'Chờ thanh toán';
}

export function issueLabel(
    issue: TransferIssue,
    bookingStatus: string | null,
    difference: number | null,
): string {
    switch (issue) {
        case 'AmountTooSmall':
            return `Thiếu ${formatVnd(Math.abs(difference ?? 0))}`;
        case 'BookingNotPending':
            return bookingStatus === 'Cancelled'
                ? 'Chuyển khoản đơn đã hủy'
                : 'Chuyển khoản cho đơn không còn chờ cọc';
        case 'NoBookingCode':
            return 'Nội dung không có mã đơn';
        case 'BookingNotFound':
            return 'Mã đơn không tồn tại';
        default:
            return 'Đơn chưa có khoản cọc';
    }
}

export function formatVnd(amount: number): string {
    return `${Math.round(amount).toLocaleString('vi-VN')} đ`;
}

export const ISSUE_BY_REASON: Record<string, TransferIssue> = {
    no_booking_code: 'NoBookingCode',
    booking_not_found: 'BookingNotFound',
    no_deposit_payment: 'NoDepositPayment',
    booking_not_pending: 'BookingNotPending',
    amount_too_small: 'AmountTooSmall',
};

/**
 * Những cách xử lý hợp lệ cho một sự cố đối soát.
 * - Thiếu cọc nhưng đơn còn chờ cọc: ghi nhận bổ sung / xác nhận cọc.
 * - Tiền về đơn đã hủy / không còn chờ cọc (hoặc thiếu cọc nhưng đơn đã mất): hoàn tiền.
 * - Còn lại (không tìm ra đơn): chỉ có thể đánh dấu đã xử lý ngoài hệ thống.
 */
export function allowedActions(
    issue: TransferIssue,
    hasDepositPayment: boolean,
    bookingStatus: string | null,
): ReconcileAction[] {
    if (!hasDepositPayment) return ['dismiss'];

    if (issue === 'AmountTooSmall' && bookingStatus === 'Pending') {
        return ['apply_to_booking', 'dismiss'];
    }
    if (issue === 'AmountTooSmall' || issue === 'BookingNotPending') {
        return ['request_refund', 'dismiss'];
    }
    return ['dismiss'];
}

export const ACTION_LABELS: Record<ReconcileAction, string> = {
    apply_to_booking: 'Ghi nhận bổ sung / xác nhận cọc',
    request_refund: 'Khởi tạo hoàn tiền',
    dismiss: 'Bỏ qua (đã xử lý ngoài hệ thống)',
};

/**
 * Trạng thái hóa đơn sau khi có thay đổi thu/hoàn.
 * paid/refunded chỉ gồm khoản đã thành công; khoản hoàn đang chờ chưa tính.
 */
export function computeInvoiceStatus(
    total: number,
    paid: number,
    refunded: number,
): InvoiceStatus {
    if (refunded > 0) {
        return paid - refunded <= 0 ? 'Refunded' : 'PartiallyRefunded';
    }
    if (paid <= 0) return 'Unpaid';
    return paid >= total ? 'Paid' : 'PartiallyPaid';
}

/** Epoch giây (từ UNIX_TIMESTAMP) -> chuỗi ISO; null nếu không có. */
export function epochToIso(epoch: string | number | null | undefined): string | null {
    if (epoch === null || epoch === undefined) return null;
    const seconds = Number(epoch);
    return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

// ---------------------------------------------------------------
// CSV
// ---------------------------------------------------------------

/** Chặn CSV injection (ô bắt đầu bằng = + - @ sẽ bị Excel hiểu là công thức) rồi bọc nháy kép. */
export function csvText(value: string | number | null | undefined): string {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) {
        text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
}

/** Số giữ nguyên (kể cả số âm) để Excel còn cộng được. */
export const csvNumber = (value: number): string => String(value);

export function buildCsv(header: string[], rows: string[][]): string {
    const lines = [header.map((h) => csvText(h)).join(','), ...rows.map((r) => r.join(','))];
    // BOM để Excel mở đúng tiếng Việt
    return `\uFEFF${lines.join('\r\n')}\r\n`;
}
