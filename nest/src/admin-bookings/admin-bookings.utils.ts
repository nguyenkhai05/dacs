// Các hàm thuần (không đụng DB) cho màn "Đơn đặt & lịch sân" của quản trị.
// Tách riêng để dễ viết unit test.

export const BOOKING_STATUSES = [
    'Pending',
    'Confirmed',
    'CheckedIn',
    'Playing',
    'Completed',
    'Cancelled',
    'NoShow',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// Đơn đang giữ sân (khớp với trigger trong DB)
export const ACTIVE_STATUSES: string[] = [
    'Pending',
    'Confirmed',
    'CheckedIn',
    'Playing',
];

// ---------------------------------------------------------------
// Số điện thoại / tìm kiếm
// ---------------------------------------------------------------

/**
 * Chuẩn hóa SĐT về dạng 0xxxxxxxxx (10-11 số) giống lúc đăng ký.
 * "0916 333 555", "+84 916.333.555", "84916333555" -> "0916333555".
 * Trả về null nếu không giống SĐT Việt Nam.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
    if (!raw) {
        return null;
    }

    let value = raw.trim().replace(/[\s.\-()]/g, '');

    if (value.startsWith('+84')) {
        value = `0${value.slice(3)}`;
    } else if (value.startsWith('84') && value.length >= 11) {
        value = `0${value.slice(2)}`;
    }

    return /^0\d{9,10}$/.test(value) ? value : null;
}

/** Thoát ký tự đặc biệt của LIKE để "%" hay "_" gõ vào ô tìm kiếm không thành ký tự thay thế. */
export function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type SearchTerm =
    | { kind: 'code'; bookingId: number }
    | { kind: 'phone'; digits: string }
    | { kind: 'name'; text: string };

/** Ô "Tên / số điện thoại": nhận mã đơn (DS123), SĐT (cả một phần) hoặc tên. */
export function parseSearch(raw: string | null | undefined): SearchTerm | null {
    const text = raw?.trim();

    if (!text) {
        return null;
    }

    const code = /^DS\s?(\d{1,10})$/i.exec(text);
    if (code) {
        return { kind: 'code', bookingId: Number(code[1]) };
    }

    if (/^[\d\s.+\-()]+$/.test(text)) {
        const digits = text.replace(/\D/g, '');
        if (digits.length >= 3) {
            return { kind: 'phone', digits };
        }
    }

    return { kind: 'name', text };
}

// ---------------------------------------------------------------
// Thời gian (theo giờ Việt Nam, UTC+7)
// ---------------------------------------------------------------

/** "17:00" hoặc "17:00:00" -> 1020 (phút kể từ 00:00). */
export function toMinutes(time: string): number {
    // Chấp nhận cả "24:00" (khung giá kết thúc đúng nửa đêm)
    const match =
        /^((?:[01]\d|2[0-3]):[0-5]\d|24:00)(?::[0-5]\d)?$/.exec(time);

    if (!match) {
        throw new RangeError(`Giờ không hợp lệ: ${time}`);
    }

    const [hours, mins] = match[1].split(':').map(Number);

    return hours * 60 + mins;
}

/** 1020 -> "17:00". */
export function formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** Số phút từ bây giờ tới lúc (ngày, giờ) đó; âm nếu đã qua. */
export function minutesUntil(
    date: string,
    time: string,
    now: Date = new Date(),
): number {
    const clock = time.length === 5 ? `${time}:00` : time;
    const target = new Date(`${date}T${clock}+07:00`).getTime();

    return (target - now.getTime()) / 60_000;
}

/** Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD). */
export function vietnamToday(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

// ---------------------------------------------------------------
// Tiền / trạng thái thanh toán
// ---------------------------------------------------------------

export function round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type PaymentSummary =
    | 'Unpaid'
    | 'PartiallyPaid'
    | 'Paid'
    | 'PartiallyRefunded'
    | 'Refunded';

/** Nhãn thanh toán hiển thị cạnh trạng thái đơn ("Thanh toán một phần"...). */
export function derivePaymentSummary(
    total: number,
    paid: number,
    refunded: number,
): PaymentSummary {
    if (paid > 0 && refunded >= paid) {
        return 'Refunded';
    }

    if (refunded > 0) {
        return 'PartiallyRefunded';
    }

    if (paid <= 0) {
        return 'Unpaid';
    }

    return paid >= total ? 'Paid' : 'PartiallyPaid';
}

// ---------------------------------------------------------------
// Thao tác được phép trên một đơn
// ---------------------------------------------------------------

export type ActionKey =
    | 'check_in'
    | 'collect_cash'
    | 'complete'
    | 'no_show'
    | 'cancel';

export interface ActionState {
    allowed: boolean;
    reason: string | null;
}

export interface ActionInput {
    status: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    /** Số tiền còn phải thu tại sân */
    due: number;
    /** false = cho phép bấm "Hoàn thành" trước khi trận kết thúc (demo) */
    requireMatchEnd?: boolean;
    now?: Date;
}

const STATUS_LABEL: Record<string, string> = {
    Pending: 'chờ cọc',
    Confirmed: 'đã xác nhận',
    CheckedIn: 'đã check-in',
    Playing: 'đang đá',
    Completed: 'đã hoàn thành',
    Cancelled: 'đã hủy',
    NoShow: 'không đến',
};

const allow = (): ActionState => ({ allowed: true, reason: null });
const deny = (reason: string): ActionState => ({ allowed: false, reason });

const formatMoney = (value: number): string =>
    `${Math.round(value).toLocaleString('vi-VN')} đ`;

/**
 * Quy tắc theo màn hình thiết kế:
 *  - Check-in chỉ khi đã đủ cọc (Confirmed) và đúng ngày đá.
 *  - Thu tiền mặt khi đã đủ cọc và còn tiền phải thu.
 *  - Hoàn thành chỉ khi đã check-in, đã thu đủ và trận đã kết thúc.
 *  - Không đến chỉ khi đã tới giờ đá.
 *  - Hủy được khi chưa đá (Pending / Confirmed).
 */
export function evaluateActions(
    input: ActionInput,
): Record<ActionKey, ActionState> {
    const now = input.now ?? new Date();
    const requireMatchEnd = input.requireMatchEnd ?? true;
    const label = STATUS_LABEL[input.status] ?? input.status;

    const untilStart = minutesUntil(input.bookingDate, input.startTime, now);
    const untilEnd = minutesUntil(input.bookingDate, input.endTime, now);
    const today = vietnamToday(now);

    // ----- Check-in
    let checkIn: ActionState;
    if (input.status === 'Pending') {
        checkIn = deny('Đơn chưa đủ cọc, chưa thể check-in');
    } else if (input.status !== 'Confirmed') {
        checkIn = deny(`Đơn ${label} nên không thể check-in`);
    } else if (input.bookingDate > today) {
        checkIn = deny('Chỉ check-in trong ngày đá');
    } else if (input.bookingDate < today) {
        checkIn = deny('Đơn đã quá ngày đá, hãy đánh dấu không đến');
    } else {
        checkIn = allow();
    }

    // ----- Thu tiền mặt
    let collectCash: ActionState;
    if (input.status === 'Pending') {
        collectCash = deny('Đơn chưa đủ cọc');
    } else if (!['Confirmed', 'CheckedIn', 'Playing'].includes(input.status)) {
        collectCash = deny(`Đơn ${label} nên không thu thêm tiền`);
    } else if (input.due <= 0) {
        collectCash = deny('Đơn đã thu đủ tiền');
    } else {
        collectCash = allow();
    }

    // ----- Hoàn thành
    let complete: ActionState;
    if (!['CheckedIn', 'Playing'].includes(input.status)) {
        complete = deny(
            input.status === 'Confirmed'
                ? 'Đơn chưa check-in'
                : `Đơn ${label} nên không thể hoàn thành`,
        );
    } else if (input.due > 0) {
        complete = deny(`Còn ${formatMoney(input.due)} chưa thu`);
    } else if (requireMatchEnd && untilEnd > 0) {
        complete = deny('Trận chưa kết thúc');
    } else {
        complete = allow();
    }

    // ----- Không đến
    let noShow: ActionState;
    if (input.status !== 'Confirmed') {
        noShow = deny(
            input.status === 'Pending'
                ? 'Đơn chưa đủ cọc, hãy hủy đơn'
                : `Đơn ${label} nên không thể đánh dấu không đến`,
        );
    } else if (untilStart > 0) {
        noShow = deny('Chưa tới giờ đá');
    } else {
        noShow = allow();
    }

    // ----- Hủy
    let cancel: ActionState;
    if (!['Pending', 'Confirmed'].includes(input.status)) {
        cancel = deny(`Đơn ${label} nên không thể hủy`);
    } else if (input.status === 'Confirmed' && untilStart <= 0) {
        cancel = deny('Đã quá giờ bắt đầu, không thể hủy');
    } else {
        cancel = allow();
    }

    return {
        check_in: checkIn,
        collect_cash: collectCash,
        complete,
        no_show: noShow,
        cancel,
    };
}

// ---------------------------------------------------------------
// Lưới lịch (chế độ "Lịch")
// ---------------------------------------------------------------

export interface TimeRange {
    start: number; // phút
    end: number;
}

export interface ScheduleBooking {
    booking_id: number;
    status: string;
    start: number; // phút
    end: number;
    [key: string]: unknown;
}

export type CellState =
    | 'free' // trống, bấm để đặt tại quầy
    | 'past' // trống nhưng đã qua giờ
    | 'closed' // ngoài khung giá (chưa mở bán)
    | 'unavailable' // sân đang bảo trì / ngưng
    | 'booked'; // có booking (xem booking.status)

export interface ScheduleCell {
    start_time: string;
    end_time: string;
    state: CellState;
    booking: ScheduleBooking | null;
    extra_bookings: number;
}

// Đơn đang chiếm ô nên ưu tiên hiển thị hơn đơn đã xong
const BOOKING_PRIORITY: Record<string, number> = {
    Playing: 0,
    CheckedIn: 1,
    Confirmed: 2,
    Pending: 3,
    Completed: 4,
    NoShow: 5,
};

export interface BuildCellsInput {
    windowStart: number; // phút, nên là bội của 60
    windowEnd: number;
    /** Các khung giá của loại sân: ô nào không nằm trọn trong đó là "closed" */
    coverage: TimeRange[];
    bookings: ScheduleBooking[];
    pitchAvailable: boolean;
    isToday: boolean;
    nowMinutes: number;
}

function isCovered(coverage: TimeRange[], start: number, end: number): boolean {
    // Ô được phủ nếu các khung giá nối liền nhau bao trọn [start, end)
    const sorted = [...coverage].sort((a, b) => a.start - b.start);
    let cursor = start;

    for (const range of sorted) {
        if (range.end <= cursor) continue;
        if (range.start > cursor) break;
        cursor = range.end;
        if (cursor >= end) return true;
    }

    return cursor >= end;
}

/** Chia khung giờ thành các ô 1 tiếng và gán trạng thái từng ô. */
export function buildScheduleCells(input: BuildCellsInput): ScheduleCell[] {
    const cells: ScheduleCell[] = [];

    for (
        let start = input.windowStart;
        start + 60 <= input.windowEnd;
        start += 60
    ) {
        const end = start + 60;

        const overlapping = input.bookings
            .filter(
                (booking) =>
                    booking.status in BOOKING_PRIORITY &&
                    booking.start < end &&
                    booking.end > start,
            )
            .sort(
                (a, b) =>
                    BOOKING_PRIORITY[a.status] - BOOKING_PRIORITY[b.status] ||
                    a.start - b.start,
            );

        let state: CellState;
        if (!input.pitchAvailable) {
            state = 'unavailable';
        } else if (overlapping.length > 0) {
            state = 'booked';
        } else if (!isCovered(input.coverage, start, end)) {
            state = 'closed';
        } else if (input.isToday && end <= input.nowMinutes) {
            state = 'past';
        } else {
            state = 'free';
        }

        cells.push({
            start_time: formatMinutes(start),
            end_time: formatMinutes(end),
            state,
            booking: state === 'booked' ? overlapping[0] : null,
            extra_bookings:
                state === 'booked' ? Math.max(0, overlapping.length - 1) : 0,
        });
    }

    return cells;
}
