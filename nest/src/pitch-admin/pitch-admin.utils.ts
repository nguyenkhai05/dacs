// Tiện ích thuần cho màn 15 (Sân & bảng giá) - không đụng DB nên dễ test.

import { selectEffectiveSlots, type DayType } from '../common/pricing.util.js';

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/;

// Sân đang giữ lịch: đơn ở các trạng thái này chặn việc đưa sân vào bảo trì/ngưng
export const ACTIVE_BOOKING_STATUSES = `'Pending','Confirmed','CheckedIn','Playing'`;

export interface TimeRange {
    start_time: string;
    end_time: string;
}

/** "6:00" không hợp lệ; nhận "06:00" hoặc "06:00:00" và trả về "06:00:00". */
export function normalizeTime(value: string): string {
    return value.length === 5 ? `${value}:00` : value;
}

/** "HH:mm" hoặc "HH:mm:ss" → số phút kể từ 00:00. */
export function toMinutes(value: string): number {
    const [hours, minutes] = value.split(':');
    return Number(hours) * 60 + Number(minutes);
}

export function toHHmm(value: string): string {
    return value.slice(0, 5);
}

/** Hai khoảng [start, end) có chồng lấn không (chạm đầu mút thì không tính). */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
    return (
        toMinutes(a.start_time) < toMinutes(b.end_time) &&
        toMinutes(a.end_time) > toMinutes(b.start_time)
    );
}

/**
 * Các khoảng trống nằm GIỮA các khung giá (từ khung sớm nhất tới khung muộn nhất).
 * Giờ nằm trong khoảng trống không có giá nên khách không đặt được → cần cảnh báo.
 */
export function findPriceGaps(slots: TimeRange[]): TimeRange[] {
    const sorted = [...slots].sort(
        (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time),
    );
    const gaps: TimeRange[] = [];
    let cursor: string | null = null;

    for (const slot of sorted) {
        if (cursor !== null && toMinutes(slot.start_time) > toMinutes(cursor)) {
            gaps.push({ start_time: toHHmm(cursor), end_time: toHHmm(slot.start_time) });
        }

        if (cursor === null || toMinutes(slot.end_time) > toMinutes(cursor)) {
            cursor = slot.end_time;
        }
    }

    return gaps;
}

const toClock = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Các khoảng trong [spanStart, spanEnd) (số phút) mà `slots` không phủ tới. */
export function findUncovered(
    slots: TimeRange[],
    spanStart: number,
    spanEnd: number,
): TimeRange[] {
    const sorted = [...slots].sort(
        (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time),
    );
    const gaps: TimeRange[] = [];
    let cursor = spanStart;

    for (const slot of sorted) {
        const start = toMinutes(slot.start_time);

        if (start > cursor) {
            gaps.push({ start_time: toClock(cursor), end_time: toClock(Math.min(start, spanEnd)) });
        }

        cursor = Math.max(cursor, toMinutes(slot.end_time));

        if (cursor >= spanEnd) {
            return gaps;
        }
    }

    if (cursor < spanEnd) {
        gaps.push({ start_time: toClock(cursor), end_time: toClock(spanEnd) });
    }

    return gaps;
}

export type GapsByDayType = Partial<Record<'Weekday' | 'Weekend' | 'Holiday', TimeRange[]>>;

/**
 * Giờ nào nằm trong khung hoạt động của loại sân (từ khung sớm nhất tới muộn nhất, mọi loại ngày)
 * mà bộ khung giá có hiệu lực của Thứ 2-6 / Thứ 7-CN / Ngày lễ không phủ tới thì khách không đặt được.
 * Ngày lễ chỉ được báo khi đã cấu hình khung giá Holiday (nếu không, ngày lễ dùng giá thường).
 */
export function computeGapsByDayType(
    slots: (TimeRange & { day_type: string })[],
): GapsByDayType {
    if (slots.length === 0) {
        return {};
    }

    const spanStart = Math.min(...slots.map((slot) => toMinutes(slot.start_time)));
    const spanEnd = Math.max(...slots.map((slot) => toMinutes(slot.end_time)));
    const gapsOf = (candidates: DayType[]) =>
        findUncovered(selectEffectiveSlots(slots, candidates), spanStart, spanEnd);

    const result: GapsByDayType = {
        Weekday: gapsOf(['Weekday', 'All']),
        Weekend: gapsOf(['Weekend', 'All']),
    };

    if (slots.some((slot) => slot.day_type === 'Holiday')) {
        result.Holiday = gapsOf(['Holiday']);
    }

    return result;
}

/** Nhận JSON từ mysql2 (đã parse sẵn hoặc còn là chuỗi) → mảng tiện ích. */
export function parseAmenities(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(String);
    }

    if (typeof value === 'string') {
        try {
            const parsed: unknown = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
            return [];
        }
    }

    return [];
}

interface MysqlLikeError {
    errno?: number;
    code?: string;
    sqlState?: string;
}

const asMysql = (error: unknown): MysqlLikeError =>
    (error ?? {}) as MysqlLikeError;

export const isDuplicateEntry = (error: unknown): boolean =>
    asMysql(error).errno === 1062 || asMysql(error).code === 'ER_DUP_ENTRY';

// Trigger SIGNAL SQLSTATE '45000' (vd: khung giá chồng lấn)
export const isTriggerSignal = (error: unknown): boolean =>
    asMysql(error).errno === 1644 || asMysql(error).sqlState === '45000';

export const isRowReferenced = (error: unknown): boolean =>
    asMysql(error).errno === 1451 || asMysql(error).code === 'ER_ROW_IS_REFERENCED_2';
