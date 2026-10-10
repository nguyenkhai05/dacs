import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service.js';
import type { PaymentsService } from '../payments/payments.service.js';
import { PaymentAdminService } from './payment-admin.service.js';

const staff = { sub: 3, email: 'admin@x.vn', roles: ['Admin'] };

interface Options {
    refund?: Record<string, unknown> | null;
    transfer?: Record<string, unknown> | null;
    bookingStatus?: string | null;
    depositPayment?: boolean;
    othersRefunded?: number;
    updateError?: unknown;
    confirmResult?: Record<string, unknown>;
}

function setup(options: Options = {}) {
    const refund =
        options.refund === undefined
            ? {
                refund_id: 7,
                payment_id: 11,
                amount: '222000.00',
                status: 'Pending',
                created_epoch: Math.floor(Date.now() / 1000) - 3600,
                invoice_id: 5,
                booking_id: 261009,
                payment_amount: '222000.00',
            }
            : options.refund;

    const transfer =
        options.transfer === undefined
            ? {
                transfer_id: 4,
                booking_id: 261009,
                payment_id: 11,
                content: 'DS261009',
                reference_code: 'FT123',
                received_amount: '90000.00',
                expected_amount: null,
                issue: 'BookingNotPending',
                status: 'Open',
                created_epoch: 1760000000,
            }
            : options.transfer;

    const execute = vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('FROM payment_refunds r') && sql.includes('FOR UPDATE')) {
            return [refund ? [refund] : [], []];
        }
        if (sql.includes('FROM bank_transfer_logs t') && sql.includes('FOR UPDATE')) {
            return [transfer ? [transfer] : [], []];
        }
        if (sql.includes('SELECT status FROM bookings')) {
            return [options.bookingStatus === null ? [] : [{ status: options.bookingStatus ?? 'Cancelled' }], []];
        }
        if (sql.includes('p.transaction_code = ?')) {
            return [options.depositPayment === false ? [] : [{ payment_id: 11 }], []];
        }
        if (sql.includes('SELECT booking_id FROM bookings')) return [[{ booking_id: 261009 }], []];
        if (sql.includes('FROM invoices WHERE booking_id')) {
            return [[{ invoice_id: 5, total_amount: '740000.00', status: 'Paid' }], []];
        }
        if (sql.includes('SELECT COALESCE(SUM(amount), 0) AS total')) {
            return [[{ total: options.othersRefunded ?? 0 }], []];
        }
        if (sql.includes('SELECT i.total_amount')) {
            return [[{ total_amount: '740000.00', paid: '222000.00', refunded: '222000.00' }], []];
        }
        if (sql.startsWith('INSERT INTO payments')) return [{ insertId: 90, affectedRows: 1 }, []];
        if (sql.startsWith('INSERT INTO payment_refunds')) return [{ insertId: 91, affectedRows: 1 }, []];
        if (sql.includes("SET status = 'Successful'") && options.updateError) {
            throw options.updateError;
        }
        return [{ affectedRows: 1 }, []];
    });

    const confirmDeposit = vi.fn(
        async () => options.confirmResult ?? { handled: true, payment_id: 11, booking_id: 261009 },
    );

    const query = vi.fn(async (..._args: unknown[]): Promise<unknown[]> => [{ total: 0, amount: 0 }]);
    const database = {
        query,
        transaction: vi.fn(async (cb: (c: unknown) => unknown) => cb({ execute })),
    } as unknown as DatabaseService;
    const payments = { confirmDeposit } as unknown as PaymentsService;

    return {
        service: new PaymentAdminService(database, payments),
        execute,
        query,
        confirmDeposit,
        sqls: () => execute.mock.calls.map((call) => call[0] as string),
    };
}

describe('PaymentAdminService.getOverview', () => {
    it('doanh thu thuần = thu thành công - hoàn thành công của ngày', async () => {
        const { service, query } = setup();
        query
            .mockResolvedValueOnce([{ amount: '5702000.00', total: 12 }])
            .mockResolvedValueOnce([{ amount: '222000.00', total: 1 }])
            .mockResolvedValueOnce([{ amount: '222000.00', total: 1 }])
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([{ total: 3 }]);

        const result = await service.getOverview('2026-10-05');

        expect(result.kpis).toMatchObject({
            collected_amount: 5702000,
            refunded_amount: 222000,
            net_revenue: 5480000,
        });
        expect(result.backlog.reconciliation_open_count).toBe(3);
    });

    it('báo 400 khi ngày không có thật', async () => {
        const { service } = setup();
        await expect(service.getOverview('2026-02-31')).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('PaymentAdminService.listTransactions', () => {
    it('gắn mã, nhãn tiếng Việt và tính tổng toàn bộ kết quả lọc', async () => {
        const { service, query } = setup();
        query
            .mockResolvedValueOnce([
                {
                    kind: 'refund', ref_id: 7, event_epoch: 1760000000, booking_id: 261006,
                    type: 'Refund', amount: '-222000.00', method: 'Banking', status: 'Successful',
                    reference: 'ACB123', customer_name: 'Trần Quốc Huy',
                },
            ])
            .mockResolvedValueOnce([{ total: 27, collected: '5702000.00', refunded: '222000.00' }]);

        const result = await service.listTransactions({ date: '2026-10-05', limit: 4 });

        expect(result.total).toBe(27);
        expect(result.totals.net).toBe(5480000);
        expect(result.items[0]).toMatchObject({
            code: 'HT0007',
            booking_code: 'DS261006',
            type_label: 'Hoàn cọc',
            amount: -222000,
            method_label: 'Chuyển khoản thủ công',
            status_label: 'Thành công',
            counts_in_revenue: true,
        });
    });

    it('xuất CSV có BOM và tên file theo ngày', async () => {
        const { service, query } = setup();
        query.mockResolvedValueOnce([]);

        const { filename, csv } = await service.exportTransactions({ date: '2026-10-05' });

        expect(filename).toBe('giao-dich-2026-10-05.csv');
        expect(csv.startsWith('\uFEFF')).toBe(true);
    });
});

describe('PaymentAdminService.confirmRefund', () => {
    it('ghi nhận đã hoàn: cập nhật khoản hoàn, lịch sử và trạng thái hóa đơn', async () => {
        const { service, sqls } = setup();

        const result = await service.confirmRefund(7, { transaction_code: 'ACB20261005' }, staff);

        expect(result).toMatchObject({
            status: 'Successful',
            amount: 222000,
            invoice_status: 'Refunded',
            revenue_effect: { refunded_change: 222000, net_revenue_change: -222000 },
        });
        expect(sqls().some((s) => s.includes("SET status = 'Successful'"))).toBe(true);
        expect(sqls().some((s) => s.startsWith('INSERT INTO payment_refund_history'))).toBe(true);
        expect(sqls().some((s) => s.startsWith('UPDATE invoices SET status'))).toBe(true);
    });

    it('báo 404 khi không có yêu cầu hoàn', async () => {
        const { service } = setup({ refund: null });
        await expect(
            service.confirmRefund(7, { transaction_code: 'ACB20261005' }, staff),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('báo 409 khi đã xác nhận trước đó', async () => {
        const { service } = setup({
            refund: { refund_id: 7, payment_id: 11, amount: '1', status: 'Successful', created_epoch: 1, invoice_id: 5, booking_id: 1, payment_amount: '1' },
        });
        await expect(
            service.confirmRefund(7, { transaction_code: 'ACB20261005' }, staff),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('không cho ghi nhận thời gian chuyển ở tương lai', async () => {
        const { service } = setup();
        const future = new Date(Date.now() + 3_600_000).toISOString();
        await expect(
            service.confirmRefund(7, { transaction_code: 'ACB20261005', transferred_at: future }, staff),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('không cho hoàn vượt số tiền đã thu', async () => {
        const { service } = setup({ othersRefunded: 100000 });
        await expect(
            service.confirmRefund(7, { transaction_code: 'ACB20261005' }, staff),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('báo 409 khi trùng mã giao dịch', async () => {
        const { service } = setup({ updateError: { errno: 1062, code: 'ER_DUP_ENTRY' } });
        await expect(
            service.confirmRefund(7, { transaction_code: 'ACB20261005' }, staff),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe('PaymentAdminService.failRefund / updateRefundAccount', () => {
    it('ghi nhận thất bại với lý do, chưa đụng tới hóa đơn', async () => {
        const { service, sqls } = setup();

        const result = await service.failRefund(7, { reason: 'Sai thông tin tài khoản nhận' }, staff);

        expect(result.status).toBe('Failed');
        expect(sqls().some((s) => s.includes("SET status = 'Failed', failure_reason"))).toBe(true);
        expect(sqls().some((s) => s.startsWith('UPDATE invoices'))).toBe(false);
    });

    it('không ghi thất bại lần hai', async () => {
        const { service } = setup({
            refund: { refund_id: 7, payment_id: 11, amount: '1', status: 'Failed', created_epoch: 1, invoice_id: 5, booking_id: 1, payment_amount: '1' },
        });
        await expect(
            service.failRefund(7, { reason: 'Sai số tài khoản' }, staff),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('sửa thông tin nhận hoàn của khoản thất bại sẽ mở lại thành Pending', async () => {
        const { service } = setup({
            refund: { refund_id: 7, payment_id: 11, amount: '1', status: 'Failed', created_epoch: 1, invoice_id: 5, booking_id: 1, payment_amount: '1' },
        });

        const result = await service.updateRefundAccount(
            7,
            { bank_name: 'ACB', bank_account_number: '888877665', bank_account_name: 'TRAN QUOC HUY' },
            staff,
        );

        expect(result.status).toBe('Pending');
        expect(result.message).toContain('mở lại');
    });
});

describe('PaymentAdminService.resolveReconciliation', () => {
    it('bỏ qua bắt buộc phải có ghi chú', async () => {
        const { service } = setup();
        await expect(
            service.resolveReconciliation(4, { action: 'dismiss' }, staff),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tiền về đơn đã hủy: tạo khoản thu + yêu cầu hoàn Pending', async () => {
        const { service, sqls } = setup();

        const result = await service.resolveReconciliation(4, { action: 'request_refund' }, staff);

        expect(result).toMatchObject({ payment_id: 90, refund_id: 91 });
        expect(sqls().some((s) => s.startsWith('INSERT INTO payments'))).toBe(true);
        expect(sqls().some((s) => s.startsWith('INSERT INTO payment_refunds'))).toBe(true);
        expect(sqls().some((s) => s.includes('UPDATE bank_transfer_logs'))).toBe(true);
    });

    it('không cho ghi nhận bổ sung vào đơn đã hủy', async () => {
        const { service, confirmDeposit } = setup();
        await expect(
            service.resolveReconciliation(4, { action: 'apply_to_booking' }, staff),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(confirmDeposit).not.toHaveBeenCalled();
    });

    it('thiếu cọc + khách bổ sung: cộng thêm extra_amount rồi xác nhận cọc', async () => {
        const { service, confirmDeposit } = setup({
            bookingStatus: 'Pending',
            transfer: {
                transfer_id: 4, booking_id: 261009, payment_id: 11, content: 'DS261009',
                reference_code: null, received_amount: '50000.00', expected_amount: '105000.00',
                issue: 'AmountTooSmall', status: 'Open', created_epoch: 1760000000,
            },
        });

        await service.resolveReconciliation(4, { action: 'apply_to_booking', extra_amount: 55000 }, staff);

        expect(confirmDeposit).toHaveBeenCalledWith(expect.anything(), 261009, 105000, 3);
    });

    it('báo 409 khi khoản đã được xử lý', async () => {
        const { service } = setup({
            transfer: { transfer_id: 4, booking_id: null, status: 'Resolved', issue: 'NoBookingCode', received_amount: '1', created_epoch: 1 },
        });
        await expect(
            service.resolveReconciliation(4, { action: 'dismiss', note: 'ok' }, staff),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});
