import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
    CollectCashDto,
    CounterQuoteDto,
    CreateCounterBookingDto,
    ListAdminBookingsQueryDto,
    ScheduleQueryDto,
    StaffCancelDto,
} from './admin-bookings.dto.js';

// Dùng đúng cấu hình ValidationPipe như trong main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const run = <T>(metatype: new () => T, value: unknown, type: 'body' | 'query' = 'body') =>
    pipe.transform(value, { type, metatype });

async function messagesOf<T>(metatype: new () => T, value: unknown, type: 'body' | 'query' = 'body') {
    try {
        await run(metatype, value, type);
        return [];
    } catch (error) {
        return ((error as BadRequestException).getResponse() as { message: string[] }).message;
    }
}

const validCounter = {
    customer_name: '  Lê Hoàng Long ',
    phone_number: '0916 333 555',
    pitch_id: 1,
    booking_date: '2026-10-05',
    start_time: '16:00',
    end_time: '18:00',
    payment_mode: 'full',
};

describe('CreateCounterBookingDto', () => {
    it('chuẩn hóa SĐT và cắt khoảng trắng tên khách', async () => {
        const dto = (await run(CreateCounterBookingDto, validCounter)) as CreateCounterBookingDto;

        expect(dto.phone_number).toBe('0916333555');
        expect(dto.customer_name).toBe('Lê Hoàng Long');
    });

    it('chấp nhận SĐT dạng +84', async () => {
        const dto = (await run(CreateCounterBookingDto, { ...validCounter, phone_number: '+84 916 333 555' })) as CreateCounterBookingDto;

        expect(dto.phone_number).toBe('0916333555');
    });

    it('từ chối SĐT sai, tên quá ngắn, payment_mode lạ', async () => {
        for (const patch of [{ phone_number: '123' }, { customer_name: 'A' }, { payment_mode: 'none' }, { payment_mode: undefined }]) {
            expect((await messagesOf(CreateCounterBookingDto, { ...validCounter, ...patch })).length).toBeGreaterThan(0);
        }
    });

    it('bỏ qua field lạ (không cho gửi status hay customer_id)', async () => {
        const dto = (await run(CreateCounterBookingDto, { ...validCounter, status: 'Completed', customer_id: 1 })) as Record<string, unknown>;

        expect(dto).not.toHaveProperty('status');
        expect(dto).not.toHaveProperty('customer_id');
    });
});

describe('CounterQuoteDto', () => {
    it('SĐT là tùy chọn nhưng phải đúng định dạng nếu có', async () => {
        const base = { pitch_id: 1, booking_date: '2026-10-05', start_time: '16:00', end_time: '18:00' };

        expect(await messagesOf(CounterQuoteDto, base)).toEqual([]);
        expect(await messagesOf(CounterQuoteDto, { ...base, phone_number: '0916 333 555' })).toEqual([]);
        expect((await messagesOf(CounterQuoteDto, { ...base, phone_number: 'abc' })).length).toBeGreaterThan(0);
    });
});

describe('CollectCashDto', () => {
    it('chỉ nhận số tiền dương, tối đa 2 chữ số thập phân', async () => {
        expect(await messagesOf(CollectCashDto, { amount: '210000' })).toEqual([]);
        for (const amount of [0, -1, 'abc', 10.123, 1e12]) {
            expect((await messagesOf(CollectCashDto, { amount })).length).toBeGreaterThan(0);
        }
    });
});

describe('ListAdminBookingsQueryDto / ScheduleQueryDto / StaffCancelDto', () => {
    it('kiểm tra bộ lọc danh sách', async () => {
        expect(await messagesOf(ListAdminBookingsQueryDto, { date: '2026-10-05', status: 'Confirmed', pitch_id: '2', page: '1', limit: '10', q: ' Huy ' }, 'query')).toEqual([]);
        expect((await messagesOf(ListAdminBookingsQueryDto, { status: 'Abc' }, 'query')).length).toBeGreaterThan(0);
        expect((await messagesOf(ListAdminBookingsQueryDto, { date: '05/10/2026' }, 'query')).length).toBeGreaterThan(0);
        expect((await messagesOf(ListAdminBookingsQueryDto, { limit: '999' }, 'query')).length).toBeGreaterThan(0);
    });

    it('kiểm tra tham số lịch', async () => {
        expect(await messagesOf(ScheduleQueryDto, { date: '2026-10-05', from: '14:00', to: '22:00' }, 'query')).toEqual([]);
        expect((await messagesOf(ScheduleQueryDto, { from: '25:00' }, 'query')).length).toBeGreaterThan(0);
    });

    it('lý do hủy tối đa 500 ký tự, full_refund phải là boolean', async () => {
        expect(await messagesOf(StaffCancelDto, { reason: 'Khách báo bận', full_refund: true })).toEqual([]);
        expect((await messagesOf(StaffCancelDto, { reason: 'a'.repeat(501) })).length).toBeGreaterThan(0);
        expect((await messagesOf(StaffCancelDto, { full_refund: 'yes' })).length).toBeGreaterThan(0);
    });
});
