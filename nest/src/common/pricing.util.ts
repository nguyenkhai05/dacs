// Chọn bộ khung giá theo loại ngày (thứ trong tuần / ngày lễ).
// Quy tắc (theo từng loại sân) - loại ngày nào có bộ khung giá riêng thì dùng riêng cả bộ đó:
//   ngày lễ     : Holiday -> (Weekend | Weekday theo thứ thật) -> All
//   ngày thường : (Weekend | Weekday) -> All

export const DAY_TYPES = ['All', 'Weekday', 'Weekend', 'Holiday'] as const;
export type DayType = (typeof DAY_TYPES)[number];

export const DAY_TYPE_LABELS: Record<DayType, string> = {
    All: 'mọi ngày',
    Weekday: 'Thứ 2 - Thứ 6',
    Weekend: 'Thứ 7 - Chủ nhật',
    Holiday: 'ngày lễ',
};

const DATE_LITERAL = /^\d{4}-\d{2}-\d{2}$/;

/** Thứ 7/CN → Weekend, còn lại Weekday. Tính thuần theo lịch, không phụ thuộc múi giờ máy. */
export function baseDayType(date: string): 'Weekday' | 'Weekend' {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = CN, 6 = T7
    return weekday === 0 || weekday === 6 ? 'Weekend' : 'Weekday';
}

/** Thứ tự ưu tiên các loại ngày cho một ngày cụ thể. Luôn kết thúc bằng 'All'. */
export function dayTypeCandidates(date: string, isHoliday: boolean): DayType[] {
    const base = baseDayType(date);
    return isHoliday ? ['Holiday', base, 'All'] : [base, 'All'];
}

/** Lấy bộ khung giá của loại ngày ưu tiên cao nhất mà có khung giá. */
export function selectEffectiveSlots<T extends { day_type: string }>(
    slots: T[],
    candidates: DayType[],
): T[] {
    for (const candidate of candidates) {
        const set = slots.filter((slot) => slot.day_type === candidate);

        if (set.length > 0) {
            return set;
        }
    }

    return [];
}

/**
 * Điều kiện SQL "khung giá `alias` thuộc bộ khung giá có hiệu lực của ngày `date`",
 * dùng trong truy vấn tổng hợp (trang chủ, dashboard) để khỏi phải chạy thêm truy vấn.
 * `alias` phải là bí danh bảng price_slots trong truy vấn gọi tới.
 *
 * `date` và `alias` được kiểm tra định dạng nghiêm ngặt vì được chèn thẳng vào SQL.
 */
export function effectiveSlotPredicate(alias: string, date: string): string {
    if (!DATE_LITERAL.test(date)) {
        throw new Error(`Ngày không hợp lệ: ${date}`);
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
        throw new Error(`Bí danh bảng không hợp lệ: ${alias}`);
    }

    const base = baseDayType(date);
    const hasType = (type: string) =>
        `EXISTS (SELECT 1 FROM price_slots dx
                 WHERE dx.category_id = ${alias}.category_id AND dx.day_type = '${type}')`;

    return `${alias}.day_type = CASE
        WHEN EXISTS (SELECT 1 FROM holidays hd WHERE hd.holiday_date = '${date}')
             AND ${hasType('Holiday')} THEN 'Holiday'
        WHEN ${hasType(base)} THEN '${base}'
        ELSE 'All'
    END`;
}
