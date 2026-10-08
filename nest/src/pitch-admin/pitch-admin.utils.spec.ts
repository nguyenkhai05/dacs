import { describe, expect, it } from 'vitest';

import {
    findPriceGaps,
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
