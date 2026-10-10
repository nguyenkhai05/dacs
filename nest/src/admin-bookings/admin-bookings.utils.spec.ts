import { describe, expect, it } from 'vitest';

import {
    buildScheduleCells,
    derivePaymentSummary,
    escapeLike,
    evaluateActions,
    formatMinutes,
    minutesUntil,
    normalizePhone,
    parseSearch,
    toMinutes,
    vietnamToday,
    type ActionInput,
} from './admin-bookings.utils.js';

// 05/10/2026 15:30 giờ Việt Nam (= 08:30 UTC)
const NOW = new Date('2026-10-05T08:30:00Z');

const base: ActionInput = {
    status: 'Confirmed',
    bookingDate: '2026-10-05',
    startTime: '17:00:00',
    endTime: '18:00:00',
    due: 210000,
    now: NOW,
};

describe('normalizePhone', () => {
    it('đưa về dạng 0xxxxxxxxx', () => {
        expect(normalizePhone('0916 333 555')).toBe('0916333555');
        expect(normalizePhone('+84 916.333.555')).toBe('0916333555');
        expect(normalizePhone('84916333555')).toBe('0916333555');
        expect(normalizePhone('(0916)-333-555')).toBe('0916333555');
    });

    it('từ chối chuỗi không phải SĐT', () => {
        expect(normalizePhone('abc')).toBeNull();
        expect(normalizePhone('12345')).toBeNull();
        expect(normalizePhone('')).toBeNull();
        expect(normalizePhone(null)).toBeNull();
    });
});

describe('parseSearch / escapeLike', () => {
    it('nhận mã đơn, SĐT và tên', () => {
        expect(parseSearch('DS1048')).toEqual({ kind: 'code', bookingId: 1048 });
        expect(parseSearch('ds 7')).toEqual({ kind: 'code', bookingId: 7 });
        expect(parseSearch('0901 123')).toEqual({ kind: 'phone', digits: '0901123' });
        expect(parseSearch('Quốc Huy')).toEqual({ kind: 'name', text: 'Quốc Huy' });
    });

    it('rỗng hoặc quá ngắn thì không tìm', () => {
        expect(parseSearch('   ')).toBeNull();
        expect(parseSearch(undefined)).toBeNull();
        expect(parseSearch('09')).toEqual({ kind: 'name', text: '09' });
    });

    it('thoát ký tự đặc biệt của LIKE', () => {
        expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    });
});

describe('thời gian', () => {
    it('đổi qua lại giữa HH:mm và số phút', () => {
        expect(toMinutes('17:00')).toBe(1020);
        expect(toMinutes('17:00:00')).toBe(1020);
        expect(formatMinutes(1020)).toBe('17:00');
        expect(() => toMinutes('25:00')).toThrow();
    });

    it('tính theo giờ Việt Nam, không theo UTC', () => {
        expect(vietnamToday(NOW)).toBe('2026-10-05');
        // 20h00 Việt Nam ngày 05 = 13h UTC; 17h UTC đã sang ngày 06 giờ VN
        expect(vietnamToday(new Date('2026-10-05T17:30:00Z'))).toBe('2026-10-06');
        expect(minutesUntil('2026-10-05', '17:00:00', NOW)).toBe(90);
        expect(minutesUntil('2026-10-05', '15:00', NOW)).toBe(-30);
    });
});

describe('derivePaymentSummary', () => {
    it('phân loại theo số đã thu và đã hoàn', () => {
        expect(derivePaymentSummary(300000, 0, 0)).toBe('Unpaid');
        expect(derivePaymentSummary(300000, 90000, 0)).toBe('PartiallyPaid');
        expect(derivePaymentSummary(300000, 300000, 0)).toBe('Paid');
        expect(derivePaymentSummary(300000, 90000, 45000)).toBe('PartiallyRefunded');
        expect(derivePaymentSummary(300000, 90000, 90000)).toBe('Refunded');
    });
});

describe('evaluateActions', () => {
    it('đơn đã xác nhận, trước giờ đá: check-in, thu tiền, hủy được', () => {
        const a = evaluateActions(base);

        expect(a.check_in.allowed).toBe(true);
        expect(a.collect_cash.allowed).toBe(true);
        expect(a.cancel.allowed).toBe(true);
        expect(a.complete.allowed).toBe(false);
        expect(a.complete.reason).toBe('Đơn chưa check-in');
        expect(a.no_show.reason).toBe('Chưa tới giờ đá');
    });

    it('đơn chờ cọc: chỉ được hủy', () => {
        const a = evaluateActions({ ...base, status: 'Pending', due: 300000 });

        expect(a.check_in.reason).toBe('Đơn chưa đủ cọc, chưa thể check-in');
        expect(a.collect_cash.allowed).toBe(false);
        expect(a.cancel.allowed).toBe(true);
    });

    it('check-in chỉ trong ngày đá', () => {
        const future = evaluateActions({ ...base, bookingDate: '2026-10-06' });
        const past = evaluateActions({ ...base, bookingDate: '2026-10-04' });

        expect(future.check_in.reason).toBe('Chỉ check-in trong ngày đá');
        expect(past.check_in.allowed).toBe(false);
    });

    it('hoàn thành cần: đã check-in, thu đủ, trận đã kết thúc', () => {
        const checkedIn = { ...base, status: 'CheckedIn' };

        expect(evaluateActions(checkedIn).complete.reason).toContain('chưa thu');
        expect(
            evaluateActions({ ...checkedIn, due: 0 }).complete.reason,
        ).toBe('Trận chưa kết thúc');
        expect(
            evaluateActions({ ...checkedIn, due: 0, endTime: '15:00:00', startTime: '14:00:00' })
                .complete.allowed,
        ).toBe(true);
        // tắt yêu cầu "trận phải kết thúc" (demo)
        expect(
            evaluateActions({ ...checkedIn, due: 0, requireMatchEnd: false }).complete.allowed,
        ).toBe(true);
    });

    it('không đến: chỉ khi đơn đã xác nhận và tới giờ đá', () => {
        const started = { ...base, startTime: '15:00:00', endTime: '16:00:00' };

        expect(evaluateActions(started).no_show.allowed).toBe(true);
        expect(evaluateActions({ ...started, status: 'CheckedIn' }).no_show.allowed).toBe(false);
    });

    it('đã quá giờ bắt đầu thì không hủy được đơn đã xác nhận', () => {
        const a = evaluateActions({ ...base, startTime: '15:00:00', endTime: '16:00:00' });

        expect(a.cancel.allowed).toBe(false);
        expect(a.cancel.reason).toBe('Đã quá giờ bắt đầu, không thể hủy');
    });

    it('đơn đã đóng không còn thao tác nào', () => {
        for (const status of ['Completed', 'Cancelled', 'NoShow']) {
            const a = evaluateActions({ ...base, status, due: 0 });

            expect(Object.values(a).every((state) => !state.allowed)).toBe(true);
        }
    });
});

describe('buildScheduleCells', () => {
    const coverage = [{ start: 360, end: 960 }, { start: 960, end: 1320 }]; // 06-16, 16-22 nối liền

    const run = (overrides: Record<string, unknown> = {}) =>
        buildScheduleCells({
            windowStart: 840, // 14:00
            windowEnd: 1080, // 18:00
            coverage,
            bookings: [],
            pitchAvailable: true,
            isToday: false,
            nowMinutes: 0,
            ...overrides,
        });

    it('chia ô 1 tiếng, ô trống là free', () => {
        const cells = run();

        expect(cells.map((c) => c.start_time)).toEqual(['14:00', '15:00', '16:00', '17:00']);
        expect(cells.every((c) => c.state === 'free')).toBe(true);
    });

    it('đơn 2 tiếng phủ 2 ô, ô còn lại vẫn trống', () => {
        const cells = run({
            bookings: [{ booking_id: 5, status: 'Confirmed', start: 900, end: 1020 }],
        });

        expect(cells.map((c) => c.state)).toEqual(['free', 'booked', 'booked', 'free']);
        expect(cells[1].booking?.booking_id).toBe(5);
        expect(cells[2].booking?.booking_id).toBe(5);
    });

    it('đơn đã hủy không chiếm ô', () => {
        const cells = run({
            bookings: [{ booking_id: 5, status: 'Cancelled', start: 900, end: 960 }],
        });

        expect(cells[1].state).toBe('free');
    });

    it('ưu tiên đơn đang chiếm hơn đơn đã xong khi hai đơn cùng ô', () => {
        const cells = run({
            bookings: [
                { booking_id: 1, status: 'Completed', start: 900, end: 930 },
                { booking_id: 2, status: 'CheckedIn', start: 930, end: 960 },
            ],
        });

        expect(cells[1].booking?.booking_id).toBe(2);
        expect(cells[1].extra_bookings).toBe(1);
    });

    it('ô qua giờ hôm nay là past, ô đang diễn ra vẫn đặt được', () => {
        const cells = run({ isToday: true, nowMinutes: 930 }); // 15:30

        expect(cells.map((c) => c.state)).toEqual(['past', 'free', 'free', 'free']);
    });

    it('ô ngoài khung giá là closed, sân bảo trì là unavailable', () => {
        const closed = run({ windowStart: 1260, windowEnd: 1440, coverage }); // 21:00-24:00
        expect(closed.map((c) => c.state)).toEqual(['free', 'closed', 'closed']);

        const maintenance = run({ pitchAvailable: false });
        expect(maintenance.every((c) => c.state === 'unavailable')).toBe(true);
    });
});
