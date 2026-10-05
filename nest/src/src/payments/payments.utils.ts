// Các hàm thuần (không đụng DB) cho thanh toán cọc, dễ viết unit test.

const BOOKING_CODE_PREFIX = 'DS';

/** Nội dung chuyển khoản của một đơn: booking 1048 -> "DS1048" */
export function buildTransferContent(bookingId: number): string {
    return `${BOOKING_CODE_PREFIX}${bookingId}`;
}

/**
 * Tìm mã đơn trong nội dung chuyển khoản do ngân hàng gửi về.
 * Chấp nhận "DS1048", "ds 1048", "MBVCB.123.DS1048.CT tu A"...
 */
export function extractBookingId(content: string): number | null {
    const match = /(?:^|[^A-Za-z0-9])DS\s?(\d{1,10})(?![0-9])/i.exec(content);

    if (!match) {
        return null;
    }

    const id = Number(match[1]);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Số tiền cọc = tổng hóa đơn * phần trăm, làm tròn tới đồng. */
export function calculateDeposit(total: number, percent: number): number {
    return Math.round((total * percent) / 100);
}

export interface QrParams {
    bankId: string;
    accountNumber: string;
    accountName: string;
    template: string;
    amount: number;
    content: string;
}

/** Link ảnh VietQR (img.vietqr.io) đã gắn sẵn số tiền + nội dung. */
export function buildVietQrUrl(params: QrParams): string {
    const base = `https://img.vietqr.io/image/${encodeURIComponent(
        params.bankId,
    )}-${encodeURIComponent(params.accountNumber)}-${encodeURIComponent(
        params.template,
    )}.png`;

    const query = new URLSearchParams({
        amount: String(params.amount),
        addInfo: params.content,
        accountName: params.accountName,
    });

    return `${base}?${query.toString()}`;
}
