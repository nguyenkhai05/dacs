import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service.js';
import { MyBookingsService } from './my-bookings.service.js';

const dto = {
    bank_name: 'ACB',
    bank_account_number: '1234567890',
    bank_account_name: 'NGUYEN MINH ANH',
};

interface Fixture {
    booking?: Record<string, unknown> | null;
    refunds?: { refund_id: number; status: string }[];
}

function setup(fixture: Fixture = {}) {
    const {
        booking = { booking_id: 7, customer_id: 9, status: 'Cancelled' },
        refunds = [{ refund_id: 3, status: 'Pending' }],
    } = fixture;

    const execute = vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('FROM bookings')) return [booking ? [booking] : []];
        if (sql.includes('FROM payment_refunds r')) return [refunds];
        return [{ affectedRows: 1 }];
    });
    const connection = { execute };
    const database = {
        transaction: vi.fn(async (work: (c: typeof connection) => unknown) => work(connection)),
    };
    const service = new MyBookingsService(
        database as unknown as DatabaseService,
        { get: vi.fn(() => undefined) } as unknown as ConfigService,
    );

    return { service, execute };
}

describe('MyBookingsService.updateRefundAccount', () => {
    it('lưu tài khoản vào khoản hoàn đang chờ và ghi lịch sử', async () => {
        const { service, execute } = setup();

        const result = await service.updateRefundAccount(9, 7, dto);

        expect(result.updated_refunds).toBe(1);
        const update = execute.mock.calls.find(([sql]) => String(sql).includes('UPDATE payment_refunds'));
        expect(update?.[1]).toEqual(['ACB', '1234567890', 'NGUYEN MINH ANH', 3]);
        const history = execute.mock.calls.find(([sql]) => String(sql).includes('payment_refund_history'));
        expect(history?.[1]).toEqual([3, 'Pending', 'Khách cập nhật tài khoản nhận hoàn', 9]);
    });

    it('khoản hoàn bị lỗi được mở lại để chuyển lại', async () => {
        const { service, execute } = setup({ refunds: [{ refund_id: 3, status: 'Failed' }] });

        await service.updateRefundAccount(9, 7, dto);

        const update = execute.mock.calls.find(([sql]) => String(sql).includes('UPDATE payment_refunds'));
        expect(String(update?.[0])).toContain("status = 'Pending'");
        expect(String(update?.[0])).toContain('failure_reason = NULL');
        const history = execute.mock.calls.find(([sql]) => String(sql).includes('payment_refund_history'));
        expect(history?.[1]?.[1]).toBe('Failed');
        expect(String(history?.[1]?.[2])).toContain('mở lại');
    });

    it('khoản đã chuyển xong thì không sửa được -> 409', async () => {
        await expect(
            setup({ refunds: [{ refund_id: 3, status: 'Successful' }] }).service.updateRefundAccount(9, 7, dto),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('chỉ cập nhật các khoản chưa xong khi đơn có nhiều khoản hoàn', async () => {
        const { service, execute } = setup({
            refunds: [
                { refund_id: 3, status: 'Successful' },
                { refund_id: 4, status: 'Pending' },
            ],
        });

        const result = await service.updateRefundAccount(9, 7, dto);

        expect(result.updated_refunds).toBe(1);
        const updates = execute.mock.calls.filter(([sql]) => String(sql).includes('UPDATE payment_refunds'));
        expect(updates).toHaveLength(1);
        expect(updates[0][1]?.[3]).toBe(4);
    });

    it('đơn của người khác hoặc không tồn tại -> 404', async () => {
        await expect(setup().service.updateRefundAccount(123, 7, dto)).rejects.toBeInstanceOf(NotFoundException);
        await expect(setup({ booking: null }).service.updateRefundAccount(9, 7, dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('đơn không có khoản hoàn nào -> 404', async () => {
        await expect(
            setup({ refunds: [] }).service.updateRefundAccount(9, 7, dto),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
