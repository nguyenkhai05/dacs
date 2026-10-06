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
