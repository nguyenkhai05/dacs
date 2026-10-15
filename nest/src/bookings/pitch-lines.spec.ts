import { describe, expect, it } from 'vitest';

import { splitPitchPrice } from './pitch-lines.js';

const slots = [
    { start_time: '06:00:00', end_time: '18:00:00', price_per_hour: '300000.00' },
    { start_time: '18:00:00', end_time: '19:00:00', price_per_hour: '300000.00' },
    { start_time: '19:00:00', end_time: '22:00:00', price_per_hour: '350000.00' },
];

describe('splitPitchPrice', () => {
    it('tách theo khung giá khi hai giờ có giá khác nhau', () => {
        const lines = splitPitchPrice(slots, '18:00:00', '20:00:00', 650000);

        expect(lines).toEqual([
            { start_time: '18:00', end_time: '19:00', hours: 1, price_per_hour: 300000, amount: 300000 },
            { start_time: '19:00', end_time: '20:00', hours: 1, price_per_hour: 350000, amount: 350000 },
        ]);
    });

    it('gộp các khung liền nhau cùng giá thành một dòng', () => {
        const lines = splitPitchPrice(slots, '17:00:00', '19:00:00', 600000);

        expect(lines).toEqual([
            { start_time: '17:00', end_time: '19:00', hours: 2, price_per_hour: 300000, amount: 600000 },
        ]);
    });

    it('tính đúng khoảng không tròn giờ', () => {
        const lines = splitPitchPrice(slots, '19:00:00', '20:30:00', 525000);

        expect(lines?.[0]).toMatchObject({ hours: 1.5, amount: 525000 });
    });

    it('trả null khi giá hiện tại không còn khớp số tiền đã lưu', () => {
        expect(splitPitchPrice(slots, '18:00:00', '20:00:00', 700000)).toBeNull();
    });

    it('trả null khi bảng giá có khoảng hở hoặc thiếu', () => {
        const gap = [
            { start_time: '06:00:00', end_time: '12:00:00', price_per_hour: 300000 },
            { start_time: '14:00:00', end_time: '22:00:00', price_per_hour: 300000 },
        ];

        expect(splitPitchPrice(gap, '11:00:00', '15:00:00', 1200000)).toBeNull();
        expect(splitPitchPrice([], '18:00:00', '19:00:00', 300000)).toBeNull();
    });

    it('trả null khi giờ kết thúc không sau giờ bắt đầu', () => {
        expect(splitPitchPrice(slots, '19:00:00', '19:00:00', 0)).toBeNull();
    });
});
