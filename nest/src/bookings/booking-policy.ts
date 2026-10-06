// Các hàm thuần (không đụng DB) cho chính sách đặt sân: tiền cọc, thời gian giữ
// chỗ, chính sách hủy/hoàn cọc. Tách riêng để dễ viết unit test.

export type ConfigGetter = (key: string) => string | undefined;

/** % tiền cọc (DEPOSIT_PERCENT, mặc định 30). Ném RangeError nếu cấu hình sai. */
export function parseDepositPercent(raw: string | undefined): number {
    if (raw === undefined || raw.trim() === '') {
        return 30;
    }

    const value = Number(raw);

    if (!Number.isFinite(value) || value <= 0 || value > 100) {
        throw new RangeError('DEPOSIT_PERCENT phải nằm trong khoảng 1-100');
    }

    return value;
}

/** Thời gian giữ chỗ chờ cọc, tính bằng phút (PAYMENT_HOLD_MINUTES, mặc định 15). */
export function parseHoldMinutes(raw: string | undefined): number {
    if (raw === undefined || raw.trim() === '') {
        return 15;
    }

    const value = Number(raw);

    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError('PAYMENT_HOLD_MINUTES không hợp lệ');
    }

    return value;
}

export interface RefundPolicy {
    /** Hủy sớm hơn mốc này (giờ trước giờ đá) → hoàn 100% cọc */
    full_hours: number;
    /** Hủy trong khoảng [partial_hours, full_hours) → hoàn partial_percent % */
    partial_hours: number;
    partial_percent: number;
}

/**
 * Chính sách hoàn cọc, đọc từ .env:
 *  - REFUND_FULL_HOURS (mặc định 24)
 *  - REFUND_PARTIAL_HOURS (mặc định 12)
 *  - REFUND_PARTIAL_PERCENT (mặc định 50)
 * Hủy muộn hơn REFUND_PARTIAL_HOURS thì mất cọc.
 */
export function parseRefundPolicy(get: ConfigGetter): RefundPolicy {
    const read = (key: string, fallback: number): number => {
        const raw = get(key);

        if (raw === undefined || raw.trim() === '') {
            return fallback;
        }

        const value = Number(raw);

        if (!Number.isFinite(value) || value < 0) {
            throw new RangeError(`${key} không hợp lệ`);
        }

        return value;
    };

    const policy: RefundPolicy = {
        full_hours: read('REFUND_FULL_HOURS', 24),
        partial_hours: read('REFUND_PARTIAL_HOURS', 12),
        partial_percent: read('REFUND_PARTIAL_PERCENT', 50),
    };

    if (policy.partial_hours > policy.full_hours) {
        throw new RangeError(
            'REFUND_PARTIAL_HOURS không được lớn hơn REFUND_FULL_HOURS',
        );
    }

    if (policy.partial_percent > 100) {
        throw new RangeError('REFUND_PARTIAL_PERCENT phải trong khoảng 0-100');
    }

    return policy;
}

/** Số giờ còn lại tới giờ bắt đầu (âm nếu đã qua). Ngày/giờ theo giờ Việt Nam (UTC+7). */
export function hoursUntilStart(
    bookingDate: string,
    startTime: string,
    now: Date = new Date(),
): number {
    const time = startTime.length === 5 ? `${startTime}:00` : startTime;
    const start = new Date(`${bookingDate}T${time}+07:00`).getTime();

    return (start - now.getTime()) / 3_600_000;
}

/** Phần trăm cọc được hoàn theo thời điểm hủy. */
export function refundPercentFor(
    hoursBeforeStart: number,
    policy: RefundPolicy,
): number {
    if (hoursBeforeStart >= policy.full_hours) {
        return 100;
    }

    if (hoursBeforeStart >= policy.partial_hours) {
        return policy.partial_percent;
    }

    return 0;
}

/** Số tiền hoàn = số tiền đã thanh toán * phần trăm, làm tròn tới đồng. */
export function calculateRefund(paidAmount: number, percent: number): number {
    return Math.round((paidAmount * percent) / 100);
}

export function round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
