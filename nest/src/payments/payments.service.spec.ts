import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { PaymentsService } from './payments.service.js';

function createService(affectedRows: number) {
  const execute = vi.fn(async (sql: string) => {
    if (sql.includes('FROM bookings b')) {
      // đơn Pending đã hết hạn giữ chỗ
      return [[{ booking_id: 8, customer_id: 9, status: 'Pending', total_pitch_price: '500000', hold_seconds_left: 0 }]];
    }
    if (sql.includes("SET status = 'Cancelled'")) return [{ affectedRows }];
    return [{ affectedRows: 1 }];
  });
  const connection = { execute, query: vi.fn().mockResolvedValue([]) };
  const database = {
    query: vi.fn().mockResolvedValue([{ booking_id: 8 }]),
    transaction: vi.fn(async (cb: (c: typeof connection) => unknown) => cb(connection)),
  };
  const config = { get: () => undefined } as unknown as ConfigService;
  const service = new PaymentsService(database as unknown as DatabaseService, config);
  return { service, execute };
}

describe('PaymentsService.expireUnpaidBookings', () => {
  it('hủy đơn hết hạn và trả lại tồn kho dịch vụ đi kèm', async () => {
    const { service, execute } = createService(1);

    await expect(service.expireUnpaidBookings()).resolves.toBe(1);

    const sqls = execute.mock.calls.map((call) => call[0] as string);
    expect(sqls.some((s) => s.includes('UPDATE services s'))).toBe(true);
  });

  it('không cộng kho lần hai nếu đơn đã bị hủy bởi luồng khác', async () => {
    const { service, execute } = createService(0);

    await service.expireUnpaidBookings();

    const sqls = execute.mock.calls.map((call) => call[0] as string);
    expect(sqls.some((s) => s.includes('UPDATE services s'))).toBe(false);
  });
});

describe('PaymentsService.handleBankWebhook - hàng đợi đối soát', () => {
  function webhookService(options: { paymentStatus?: string; insertError?: unknown } = {}) {
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes('FROM bookings b')) {
        return [[{ booking_id: 8, customer_id: 9, status: 'Pending', total_pitch_price: '500000', hold_seconds_left: 600 }]];
      }
      if (sql.includes('FROM payments p')) {
        return [[{ payment_id: 4, invoice_id: 2, amount: '150000', status: options.paymentStatus ?? 'Pending', transaction_code: 'DS8' }]];
      }
      return [{ affectedRows: 1 }];
    });
    const connection = { execute, query: vi.fn().mockResolvedValue([]) };
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.startsWith('INSERT INTO bank_transfer_logs') && options.insertError) {
        throw options.insertError;
      }
      return sql.includes('SELECT amount FROM payments') ? [{ amount: '150000' }] : [];
    });
    const database = {
      query,
      transaction: vi.fn(async (cb: (c: typeof connection) => unknown) => cb(connection)),
    };
    const config = { get: () => undefined } as unknown as ConfigService;
    return { service: new PaymentsService(database as unknown as DatabaseService, config), query };
  }

  it('chuyển thiếu tiền cọc: không xác nhận, lưu vào hàng đợi với số tiền cần nhận', async () => {
    const { service, query } = webhookService();

    const result = await service.handleBankWebhook({ content: 'DS8', transfer_amount: 50000, reference_code: 'FT1' });

    expect(result).toMatchObject({ handled: false, reason: 'amount_too_small' });
    const insert = query.mock.calls.find((call) => (call[0] as string).startsWith('INSERT INTO bank_transfer_logs'));
    expect(insert?.[1]).toEqual([8, 4, 'DS8', 'FT1', 50000, 150000, 'AmountTooSmall']);
  });

  it('nội dung không có mã đơn: vẫn lưu để nhân viên đối soát', async () => {
    const { service, query } = webhookService();

    const result = await service.handleBankWebhook({ content: 'chuyen tien san', transfer_amount: 90000 });

    expect(result).toMatchObject({ handled: false, reason: 'no_booking_code' });
    const insert = query.mock.calls.find((call) => (call[0] as string).startsWith('INSERT INTO bank_transfer_logs'));
    expect(insert?.[1]?.[6]).toBe('NoBookingCode');
  });

  it('lỗi khi lưu hàng đợi không làm hỏng phản hồi webhook', async () => {
    const { service } = webhookService({ insertError: new Error("Table doesn't exist") });

    await expect(
      service.handleBankWebhook({ content: 'DS8', transfer_amount: 50000 }),
    ).resolves.toMatchObject({ handled: false });
  });
});
