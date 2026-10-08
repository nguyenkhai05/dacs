import { describe, expect, it } from 'vitest';

import {
    computeGapsByDayType,
    findPriceGaps,
    findUncovered,
    isDuplicateEntry,
    isRowReferenced,
    isTriggerSignal,
    normalizeTime,
    parseAmenities,
    rangesOverlap,
    toMinutes,
} from './pitch-admin.utils.js';

describe('thời gian', () => {
    it('normalizeTime thêm giây', () => {
        expect(normalizeTime('06:00')).toBe('06:00:00');
        expect(normalizeTime('06:00:00')).toBe('06:00:00');
    });

    it('toMinutes', () => {
        expect(toMinutes('06:30')).toBe(390);
        expect(toMinutes('22:00:00')).toBe(1320);
    });

    it('rangesOverlap: chạm đầu mút không tính là chồng', () => {
        const a = { start_time: '06:00', end_time: '16:00' };
        expect(rangesOverlap(a, { start_time: '16:00', end_time: '22:00' })).toBe(false);
        expect(rangesOverlap(a, { start_time: '15:00', end_time: '22:00' })).toBe(true);
        expect(rangesOverlap(a, { start_time: '07:00', end_time: '08:00' })).toBe(true);
    });
});

describe('findPriceGaps', () => {
    it('liền kề → không có khoảng trống', () => {
        expect(
            findPriceGaps([
                { start_time: '16:00:00', end_time: '22:00:00' },
                { start_time: '06:00:00', end_time: '16:00:00' },
            ]),
        ).toEqual([]);
    });

    it('phát hiện khoảng trống giữa các khung', () => {
        expect(
            findPriceGaps([
                { start_time: '06:00', end_time: '12:00' },
                { start_time: '14:00', end_time: '22:00' },
            ]),
        ).toEqual([{ start_time: '12:00', end_time: '14:00' }]);
    });

    it('không có khung hoặc một khung → rỗng', () => {
        expect(findPriceGaps([])).toEqual([]);
        expect(findPriceGaps([{ start_time: '06:00', end_time: '22:00' }])).toEqual([]);
    });
});

describe('parseAmenities', () => {
    it('nhận mảng, chuỗi JSON, null', () => {
        expect(parseAmenities(['Wifi'])).toEqual(['Wifi']);
        expect(parseAmenities('["Wifi","Đèn"]')).toEqual(['Wifi', 'Đèn']);
        expect(parseAmenities(null)).toEqual([]);
        expect(parseAmenities('không phải json')).toEqual([]);
    });
});

describe('nhận diện lỗi MySQL', () => {
    it('duplicate / trigger / FK', () => {
        expect(isDuplicateEntry({ errno: 1062 })).toBe(true);
        expect(isTriggerSignal({ sqlState: '45000' })).toBe(true);
        expect(isRowReferenced({ code: 'ER_ROW_IS_REFERENCED_2' })).toBe(true);
        expect(isDuplicateEntry(new Error('x'))).toBe(false);
        expect(isTriggerSignal(null)).toBe(false);
    });
});

describe('findUncovered', () => {
    it('báo cả khoảng trống đầu và cuối so với khung hoạt động', () => {
        expect(
            findUncovered([{ start_time: '08:00', end_time: '12:00' }], 6 * 60, 22 * 60),
        ).toEqual([
            { start_time: '06:00', end_time: '08:00' },
            { start_time: '12:00', end_time: '22:00' },
        ]);
    });

    it('phủ kín thì không có khoảng trống', () => {
        expect(
            findUncovered([{ start_time: '06:00', end_time: '22:00' }], 6 * 60, 22 * 60),
        ).toEqual([]);
    });
});

describe('computeGapsByDayType', () => {
    const slot = (day_type: string, start_time: string, end_time: string) => ({
        day_type,
        start_time,
        end_time,
    });

    it('chỉ có bộ All phủ kín → không có khoảng trống', () => {
        expect(computeGapsByDayType([slot('All', '06:00', '22:00')])).toEqual({
            Weekday: [],
            Weekend: [],
        });
    });

    it('bộ Weekend riêng thiếu giờ sáng → cảnh báo cho Weekend, Weekday vẫn dùng All', () => {
        expect(
            computeGapsByDayType([
                slot('All', '06:00', '22:00'),
                slot('Weekend', '16:00', '22:00'),
            ]),
        ).toEqual({
            Weekday: [],
            Weekend: [{ start_time: '06:00', end_time: '16:00' }],
        });
    });

    it('chỉ cấu hình Weekend → ngày thường không có giá (cảnh báo cả khung)', () => {
        expect(computeGapsByDayType([slot('Weekend', '06:00', '22:00')])).toEqual({
            Weekday: [{ start_time: '06:00', end_time: '22:00' }],
            Weekend: [],
        });
    });

    it('chỉ báo Holiday khi đã có khung Holiday', () => {
        const result = computeGapsByDayType([
            slot('All', '06:00', '22:00'),
            slot('Holiday', '06:00', '12:00'),
        ]);
        expect(result.Holiday).toEqual([{ start_time: '12:00', end_time: '22:00' }]);
        expect(computeGapsByDayType([slot('All', '06:00', '22:00')]).Holiday).toBeUndefined();
    });

    it('không có khung nào → rỗng', () => {
        expect(computeGapsByDayType([])).toEqual({});
    });
});
