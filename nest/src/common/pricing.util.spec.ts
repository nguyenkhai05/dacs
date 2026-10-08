import { describe, expect, it } from 'vitest';

import {
    baseDayType,
    dayTypeCandidates,
    effectiveSlotPredicate,
    selectEffectiveSlots,
} from './pricing.util.js';

describe('baseDayType', () => {
    it('T7/CN là Weekend, còn lại Weekday', () => {
        expect(baseDayType('2026-10-09')).toBe('Weekday'); // thứ Sáu
        expect(baseDayType('2026-10-10')).toBe('Weekend'); // thứ Bảy
        expect(baseDayType('2026-10-11')).toBe('Weekend'); // Chủ nhật
        expect(baseDayType('2026-10-12')).toBe('Weekday'); // thứ Hai
    });
});

describe('dayTypeCandidates', () => {
    it('ngày thường', () => {
        expect(dayTypeCandidates('2026-10-09', false)).toEqual(['Weekday', 'All']);
        expect(dayTypeCandidates('2026-10-10', false)).toEqual(['Weekend', 'All']);
    });

    it('ngày lễ rơi vào T7 vẫn có phương án Weekend', () => {
        expect(dayTypeCandidates('2026-10-10', true)).toEqual(['Holiday', 'Weekend', 'All']);
    });
});

describe('selectEffectiveSlots', () => {
    const all = { day_type: 'All', price_per_hour: 200 };
    const weekend = { day_type: 'Weekend', price_per_hour: 300 };
    const holiday = { day_type: 'Holiday', price_per_hour: 500 };

    it('chọn bộ riêng nếu có, nếu không thì rơi về All', () => {
        expect(selectEffectiveSlots([all, weekend], ['Weekend', 'All'])).toEqual([weekend]);
        expect(selectEffectiveSlots([all, weekend], ['Weekday', 'All'])).toEqual([all]);
    });

    it('ngày lễ ưu tiên Holiday, thiếu thì dùng bộ thường', () => {
        expect(selectEffectiveSlots([all, weekend, holiday], ['Holiday', 'Weekend', 'All'])).toEqual([holiday]);
        expect(selectEffectiveSlots([all, weekend], ['Holiday', 'Weekend', 'All'])).toEqual([weekend]);
    });

    it('không có khung nào → rỗng', () => {
        expect(selectEffectiveSlots([weekend], ['Weekday', 'All'])).toEqual([]);
    });
});

describe('effectiveSlotPredicate', () => {
    it('chèn đúng ngày và loại ngày cơ sở', () => {
        const sql = effectiveSlotPredicate('ps', '2026-10-10');
        expect(sql).toContain("hd.holiday_date = '2026-10-10'");
        expect(sql).toContain("dx.day_type = 'Weekend'");
        expect(sql).toContain('ps.category_id');
        expect(sql.startsWith('ps.day_type = CASE')).toBe(true);
    });

    it('từ chối ngày/bí danh có thể gây SQL injection', () => {
        expect(() => effectiveSlotPredicate('ps', "2026-10-10' OR '1'='1")).toThrow();
        expect(() => effectiveSlotPredicate('ps; DROP', '2026-10-10')).toThrow();
    });
});
