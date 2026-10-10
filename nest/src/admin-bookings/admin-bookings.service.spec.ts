import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { BookingsService } from '../bookings/bookings.service.js';
import type { MyBookingsService } from '../bookings/my-bookings.service.js';
import type { DatabaseService } from '../database/database.service.js';
import { AdminBookingsService } from './admin-bookings.service.js';
import { vietnamToday } from './admin-bookings.utils.js';

const TODAY = vietnamToday();

interface Fixture {
    booking?: Record<string, unknown> | null;
    invoice?: Record<string, unknown> | null;
    payments?: { payment_id: number; amount: number }[];
    insertError?: Error;
}

// Giả lập DB theo nội dung câu SQL
function setup(fixture: Fixture = {}) {
    const {
        booking = {
            booking_id: 5,
            customer_id: 9,
            pitch_id: 1,
            status: 'Confirmed',
            booking_date: TODAY,
            start_time: '23:00:00',
            end_time: '23:30:00',
            total_pitch_price: 100000,
        },
        invoice = { invoice_id: 3, total_amount: 100000, status: 'PartiallyPaid' },
        payments = [{ payment_id: 1, amount: 30000 }],
        insertError,
    } = fixture;

    const execute = vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('FROM bookings') && sql.includes('FOR UPDATE')) {
            return [booking ? [booking] : []];
        }
        if (sql.includes('FROM invoices WHERE booking_id')) {
            return [invoice ? [invoice] : []];
        }
        if (sql.includes('FROM payments py')) return [payments];
        if (sql.includes('INSERT INTO payments') || sql.includes('INSERT INTO bookings')) {
            if (insertError) throw insertError;
            return [{ insertId: 11, affectedRows: 1 }];
        }
        return [{ insertId: 1, affectedRows: 1 }];
    });
    const connection = { execute, query: vi.fn(async () => [[]]) };
    const database = {
        transaction: vi.fn(async (work: (c: typeof connection) => unknown) => work(connection)),
        query: vi.fn(async (_sql?: string, _params?: unknown[]): Promise<unknown[]> => []),
    };
    const bookings = {
        prepare: vi.fn(),
        buildAmounts: vi.fn(),
    };
    const config = { get: vi.fn(() => undefined) };

    const service = new AdminBookingsService(
        database as unknown as DatabaseService,
        config as unknown as ConfigService,
        bookings as unknown as BookingsService,
        {} as unknown as MyBookingsService,
    );

    return { service, execute, database, bookings };
}

describe('AdminBookingsService.collectCash', () => {
    it('ghi nhận thu tiền mặt và đổi hóa đơn sang Paid khi thu đủ', async () => {
        const { service, execute } = setup();

        const result = await service.collectCash(2, 5, { amount: 70000 });

        expect(result.due_amount).toBe(0);
        expect(result.invoice_status).toBe('Paid');
        const insert = execute.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO payments'),
        );
        expect(insert?.[1]).toEqual([3, 70000]);
    });

    it('thu một phần thì hóa đơn vẫn PartiallyPaid', async () => {
        const result = await setup().service.collectCash(2, 5, { amount: 20000 });

        expect(result.due_amount).toBe(50000);
        expect(result.invoice_status).toBe('PartiallyPaid');
    });

    it('không cho thu vượt số còn phải thu', async () => {
        await expect(
            setup().service.collectCash(2, 5, { amount: 70001 }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('không thu tiền đơn chờ cọc hoặc đơn đã thu đủ', async () => {
        const pending = setup({
            booking: { booking_id: 5, customer_id: 9, pitch_id: 1, status: 'Pending', booking_date: TODAY, start_time: '23:00:00', end_time: '23:30:00', total_pitch_price: 1 },
        });
        await expect(pending.service.collectCash(2, 5, { amount: 1000 })).rejects.toBeInstanceOf(ConflictException);

        const paidUp = setup({ payments: [{ payment_id: 1, amount: 100000 }] });
        await expect(paidUp.service.collectCash(2, 5, { amount: 1000 })).rejects.toBeInstanceOf(ConflictException);
    });

    it('đơn không tồn tại -> 404', async () => {
        await expect(
            setup({ booking: null }).service.collectCash(2, 5, { amount: 1000 }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('AdminBookingsService.checkIn / complete', () => {
    it('check-in đơn đã xác nhận ngay trong ngày đá', async () => {
        const { service, execute } = setup();

        const result = await service.checkIn(2, 5);

        expect(result.status).toBe('CheckedIn');
        const update = execute.mock.calls.find(([sql]) => String(sql).includes('UPDATE bookings SET status'));
        expect(update?.[1]).toEqual(['CheckedIn', 5, 'Confirmed']);
    });

    it('check-in sai ngày -> 409', async () => {
        const { service } = setup({
            booking: { booking_id: 5, customer_id: 9, pitch_id: 1, status: 'Confirmed', booking_date: '2099-01-01', start_time: '10:00:00', end_time: '11:00:00', total_pitch_price: 1 },
        });

        await expect(service.checkIn(2, 5)).rejects.toBeInstanceOf(ConflictException);
    });

    it('hoàn thành khi còn nợ -> 409 (không đổi trạng thái)', async () => {
        const { service, execute } = setup({
            booking: { booking_id: 5, customer_id: 9, pitch_id: 1, status: 'CheckedIn', booking_date: '2020-01-01', start_time: '10:00:00', end_time: '11:00:00', total_pitch_price: 1 },
        });

        await expect(service.complete(2, 5)).rejects.toBeInstanceOf(ConflictException);
        expect(
            execute.mock.calls.some(([sql]) => String(sql).includes('UPDATE bookings SET status')),
        ).toBe(false);
    });

    it('hoàn thành khi đã thu đủ và trận đã kết thúc', async () => {
        const { service } = setup({
            booking: { booking_id: 5, customer_id: 9, pitch_id: 1, status: 'CheckedIn', booking_date: '2020-01-01', start_time: '10:00:00', end_time: '11:00:00', total_pitch_price: 1 },
            payments: [{ payment_id: 1, amount: 100000 }],
        });

        expect((await service.complete(2, 5)).status).toBe('Completed');
    });
});

describe('AdminBookingsService.cancel', () => {
    const future = {
        booking_id: 5, customer_id: 9, pitch_id: 1, status: 'Confirmed',
        booking_date: '2099-01-01', start_time: '10:00:00', end_time: '11:00:00', total_pitch_price: 1,
    };

    it('đơn đã đóng tiền bắt buộc có lý do', async () => {
        await expect(
            setup({ booking: future }).service.cancel(2, 5, {}),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('hủy sớm hoàn 100% đã thu; tạo yêu cầu hoàn tiền Pending', async () => {
        const { service, execute } = setup({ booking: future });

        const result = await service.cancel(2, 5, { reason: 'Khách báo bận' });

        expect(result.refund).toEqual({ percent: 100, amount: 30000, status: 'Pending' });
        const refund = execute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO payment_refunds'));
        expect(refund?.[1]?.[0]).toBe(1);
        expect(refund?.[1]?.[1]).toBe(30000);
    });

    it('đơn chưa trả tiền hủy được không cần lý do và không hoàn tiền', async () => {
        const { service, execute } = setup({
            booking: { ...future, status: 'Pending' },
            payments: [],
        });

        const result = await service.cancel(2, 5, {});

        expect(result.refund).toEqual({ percent: 0, amount: 0, status: null });
        expect(
            execute.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO payment_refunds')),
        ).toBe(false);
    });

    it('đơn đã quá giờ bắt đầu thì không hủy được', async () => {
        const { service } = setup({ booking: { ...future, booking_date: '2020-01-01' } });

        await expect(service.cancel(2, 5, { reason: 'x' })).rejects.toBeInstanceOf(ConflictException);
    });
});

describe('AdminBookingsService.createCounter', () => {
    const dto = {
        customer_name: 'Lê Hoàng Long',
        phone_number: '0916333555',
        pitch_id: 1,
        booking_date: '2099-01-01',
        start_time: '16:00',
        end_time: '18:00',
        payment_mode: 'full' as const,
    };

    it('từ chối ngày đã qua trước khi chạm DB', async () => {
        const { service, database } = setup();

        await expect(
            service.createCounter(2, { ...dto, booking_date: '2020-01-01' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(database.transaction).not.toHaveBeenCalled();
    });

    it('từ chối giờ kết thúc không sau giờ bắt đầu', async () => {
        await expect(
            setup().service.createCounter(2, { ...dto, end_time: '16:00' }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lỗi trigger chống trùng lịch của DB được đổi thành 409', async () => {
        const { service, bookings } = setup();
        bookings.prepare.mockRejectedValue(
            Object.assign(new Error('Lich dat bi trung'), { errno: 1644, sqlState: '45000' }),
        );

        await expect(service.createCounter(2, dto)).rejects.toBeInstanceOf(ConflictException);
    });
});

describe('AdminBookingsService.list', () => {
    it('từ chối ngày không có thật và giới hạn limit', async () => {
        const { service, database } = setup();

        await expect(service.list({ date: '2026-02-30' })).rejects.toBeInstanceOf(BadRequestException);

        database.query.mockResolvedValue([] as never);
        const result = await service.list({ date: '2026-10-05', limit: 9999, page: 0 });

        expect(result.limit).toBe(50);
        expect(result.page).toBe(1);
        const listSql = String(database.query.mock.calls[0][0]);
        expect(listSql).toContain('LIMIT 50 OFFSET 0');
    });
});
