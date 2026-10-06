import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { MyBookingsService } from './my-bookings.service.js';

const FAR_FUTURE = '2099-06-10'; // luôn còn rất xa → hoàn 100%
const PAST = '2000-01-01';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Ngày/giờ (giờ Việt Nam) cách bây giờ `hours` giờ
function vnSlot(hours: number) {
  const t = new Date(Date.now() + hours * 3_600_000 + 7 * 3_600_000);
  return {
    date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`,
    time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:00`,
  };
}

const config = { get: () => undefined } as unknown as ConfigService;

// ---------- Hủy đơn ----------

interface CancelOptions {
  booking?: Record<string, unknown> | null;
  paid?: { payment_id: number; amount: string }[];
  updatedRows?: number;
}

function cancelService(options: CancelOptions = {}) {
  const {
    booking = {
      booking_id: 5,
      customer_id: 9,
      status: 'Confirmed',
      booking_date: FAR_FUTURE,
      start_time: '18:00:00',
    },
    paid = [{ payment_id: 40, amount: '222000.00' }],
    updatedRows = 1,
  } = options;

  const execute = vi.fn(async (sql: string) => {
    if (sql.includes('FROM bookings') && sql.includes('FOR UPDATE')) {
      return [booking ? [booking] : []];
    }
    if (sql.includes("py.status = 'Successful'")) return [paid];
    if (sql.includes("SET status = 'Cancelled'")) return [{ affectedRows: updatedRows }];
    return [{ affectedRows: 1 }];
  });
  const connection = { execute, query: vi.fn().mockResolvedValue([]) };
  const database = {
    transaction: vi.fn(async (cb: (c: typeof connection) => unknown) => cb(connection)),
  };

  const service = new MyBookingsService(
    database as unknown as DatabaseService,
    config,
  );
  return { service, execute, connection };
}

const sqlsOf = (execute: ReturnType<typeof vi.fn>) =>
  execute.mock.calls.map((call) => call[0] as string);

describe('MyBookingsService.cancel', () => {
  it('hủy sớm: hoàn 100% cọc, tạo yêu cầu hoàn ở trạng thái Pending, trả lại kho', async () => {
    const { service, execute, connection } = cancelService();

    const result = await service.cancel(9, 5, 'Bận việc');

    expect(result.status).toBe('Cancelled');
    expect(result.refund).toEqual({ percent: 100, amount: 222000, status: 'Pending' });

    const sqls = sqlsOf(execute);
    expect(sqls.some((s) => s.includes('INSERT INTO payment_refunds'))).toBe(true);
    // trả lại kho dịch vụ
    expect(sqls.some((s) => s.includes('UPDATE services s'))).toBe(true);
    // các khoản cọc đang chờ bị đóng
    expect(sqls.some((s) => s.includes("SET py.status = 'Failed'"))).toBe(true);

    const refundCall = execute.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO payment_refunds'),
    ) as unknown[];
    expect((refundCall[1] as unknown[])[0]).toBe(40);
    expect((refundCall[1] as unknown[])[1]).toBe(222000);

    // ghi người thực hiện cho trigger lịch sử, rồi xóa sau khi xong
    expect(connection.query).toHaveBeenCalledWith('SET @app_user_id = ?', [9]);
    expect(connection.query).toHaveBeenLastCalledWith('SET @app_user_id = NULL');

    // lý do được ghi vào lịch sử trạng thái
    const historyCall = execute.mock.calls.find((c) =>
      (c[0] as string).includes('UPDATE booking_status_history'),
    ) as unknown[];
    expect((historyCall[1] as unknown[])[0]).toContain('Bận việc');
  });

  it('hủy trong 12–24h: hoàn 50%', async () => {
    const slot = vnSlot(18);
    const { service } = cancelService({
      booking: {
        booking_id: 5,
        customer_id: 9,
        status: 'Confirmed',
        booking_date: slot.date,
        start_time: slot.time,
      },
    });

    const result = await service.cancel(9, 5);

    expect(result.refund).toEqual({ percent: 50, amount: 111000, status: 'Pending' });
  });

  it('hủy sát giờ (<12h): mất cọc, không tạo yêu cầu hoàn', async () => {
    const slot = vnSlot(3);
    const { service, execute } = cancelService({
      booking: {
        booking_id: 5,
        customer_id: 9,
        status: 'Confirmed',
        booking_date: slot.date,
        start_time: slot.time,
      },
    });

    const result = await service.cancel(9, 5);

    expect(result.refund).toEqual({ percent: 0, amount: 0, status: null });
    expect(result.message).toContain('không được hoàn cọc');
    expect(sqlsOf(execute).some((s) => s.includes('INSERT INTO payment_refunds'))).toBe(false);
  });

  it('đơn chưa trả cọc (Pending): hủy được, không hoàn gì', async () => {
    const { service, execute } = cancelService({
      booking: {
        booking_id: 5,
        customer_id: 9,
        status: 'Pending',
        booking_date: FAR_FUTURE,
        start_time: '18:00:00',
      },
      paid: [],
    });

    const result = await service.cancel(9, 5);

    expect(result.deposit_paid).toBe(0);
    expect(result.refund.amount).toBe(0);
    expect(sqlsOf(execute).some((s) => s.includes('INSERT INTO payment_refunds'))).toBe(false);
    expect(sqlsOf(execute).some((s) => s.includes('UPDATE services s'))).toBe(true);
  });

  it('người khác không hủy được đơn (404, không lộ đơn có tồn tại)', async () => {
    const { service } = cancelService();

    await expect(service.cancel(1234, 5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('đơn không tồn tại → 404', async () => {
    const { service } = cancelService({ booking: null });

    await expect(service.cancel(9, 5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('đơn đã hủy hoặc đã hoàn thành → 409', async () => {
    for (const status of ['Cancelled', 'Completed', 'Playing', 'NoShow']) {
      const { service } = cancelService({
        booking: {
          booking_id: 5,
          customer_id: 9,
          status,
          booking_date: FAR_FUTURE,
          start_time: '18:00:00',
        },
      });

      await expect(service.cancel(9, 5)).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('đơn đã xác nhận nhưng quá giờ bắt đầu → 409', async () => {
    const { service } = cancelService({
      booking: {
        booking_id: 5,
        customer_id: 9,
        status: 'Confirmed',
        booking_date: PAST,
        start_time: '18:00:00',
      },
    });

    await expect(service.cancel(9, 5)).rejects.toBeInstanceOf(ConflictException);
  });

  it('không trả kho / không hoàn tiền nếu cập nhật trạng thái thất bại (đơn vừa đổi)', async () => {
    const { service, execute } = cancelService({ updatedRows: 0 });

    await expect(service.cancel(9, 5)).rejects.toBeInstanceOf(ConflictException);
    expect(sqlsOf(execute).some((s) => s.includes('UPDATE services s'))).toBe(false);
    expect(sqlsOf(execute).some((s) => s.includes('INSERT INTO payment_refunds'))).toBe(false);
  });
});

// ---------- Danh sách & chi tiết ----------

describe('MyBookingsService.listMine', () => {
  function listService(rows: unknown[], counts: unknown, spent: unknown, next: unknown[]) {
    const query = vi
      .fn()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([counts])
      .mockResolvedValueOnce([spent])
      .mockResolvedValueOnce(next);
    const service = new MyBookingsService({ query } as unknown as DatabaseService, config);
    return { service, query };
  }

  const row = (overrides: Record<string, unknown> = {}) => ({
    booking_id: 7,
    pitch_id: 1,
    pitch_name: 'Sân 5 - Số 1',
    image_url: null,
    category_name: 'Sân 5 người',
    booking_date: FAR_FUTURE,
    start_time: '18:00:00',
    end_time: '19:00:00',
    status: 'Confirmed',
    total_pitch_price: '500000.00',
    services_total: '70000.00',
    paid_amount: '171000.00',
    refund_amount: '0',
    hold_seconds_left: '0',
    ...overrides,
  });

  it('gộp tiền sân + dịch vụ, tính số liệu tổng quan và phân trang', async () => {
    const { service } = listService(
      [row()],
      { all_count: '3', upcoming_count: '1', completed_count: '1', cancelled_count: '1' },
      { paid: '600000.00', refunded: '100000.00' },
      [{ booking_id: 7, pitch_name: 'Sân 5 - Số 1', booking_date: FAR_FUTURE, start_time: '18:00:00', end_time: '19:00:00' }],
    );

    const result = await service.listMine(9, { tab: 'upcoming', limit: 5 });

    expect(result.total).toBe(1); // theo tab đang chọn
    expect(result.total_pages).toBe(1);
    expect(result.summary.counts).toEqual({ all: 3, upcoming: 1, completed: 1, cancelled: 1 });
    expect(result.summary.total_spent).toBe(500000);
    expect(result.summary.next_booking?.booking_code).toBe('DS7');

    const item = result.bookings[0];
    expect(item.booking_code).toBe('DS7');
    expect(item.total_amount).toBe(570000);
    expect(item.deposit_paid).toBe(171000);
    expect(item.can_cancel).toBe(true);
    expect(item.hold_seconds_left).toBe(0);
  });

  it('đơn chờ cọc còn hạn có đếm ngược, đơn đã hủy thì không hủy được nữa', async () => {
    const { service } = listService(
      [
        row({ booking_id: 1, status: 'Pending', hold_seconds_left: '420' }),
        row({ booking_id: 2, status: 'Cancelled' }),
        row({ booking_id: 3, status: 'Confirmed', booking_date: PAST }),
      ],
      { all_count: 3, upcoming_count: 2, completed_count: 0, cancelled_count: 1 },
      { paid: 0, refunded: 0 },
      [],
    );

    const result = await service.listMine(9);

    const [pending, cancelled, started] = result.bookings;
    expect(pending.hold_seconds_left).toBe(420);
    expect(pending.can_cancel).toBe(true);
    expect(cancelled.can_cancel).toBe(false);
    expect(started.can_cancel).toBe(false); // đã qua giờ đá
    expect(result.summary.next_booking).toBeNull();
  });

  it('lọc theo tab và luôn ràng buộc customer_id của người đăng nhập', async () => {
    const { service, query } = listService([], {}, {}, []);

    await service.listMine(9, { tab: 'cancelled', page: 2, limit: 10 });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("b.status IN ('Cancelled','NoShow')");
    expect(sql).toContain('LIMIT 10 OFFSET 10');
    expect(params).toEqual([9]);
  });

  it('tab all không lọc trạng thái', async () => {
    const { service, query } = listService([], {}, {}, []);

    await service.listMine(9);

    expect(query.mock.calls[0][0]).not.toContain('b.status IN');
  });
});

describe('MyBookingsService.getDetail', () => {
  const detailRow = {
    booking_id: 5,
    customer_id: 9,
    pitch_id: 1,
    pitch_name: 'Sân 5 - Số 1',
    image_url: null,
    surface_type: 'Cỏ nhân tạo',
    category_name: 'Sân 5 người',
    booking_date: FAR_FUTURE,
    start_time: '18:00:00',
    end_time: '19:00:00',
    status: 'Confirmed',
    total_pitch_price: '500000.00',
    customer_note: null,
    created_at: '2026-10-05T10:00:00Z',
    hold_seconds_left: '0',
  };

  function detailService(booking: unknown) {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM bookings b')) return booking ? [booking] : [];
      if (sql.includes('FROM booking_services bs')) {
        return [
          { service_id: 1, service_name: 'Nước', unit: 'chai', quantity: 4, unit_price: '10000.00' },
        ];
      }
      if (sql.includes('FROM invoices')) {
        return [{ invoice_id: 3, status: 'PartiallyPaid', total_amount: '540000.00' }];
      }
      if (sql.includes('FROM payments py')) {
        return [
          { payment_id: 40, payment_method: 'Banking', transaction_code: 'DS5', amount: '162000.00', status: 'Successful', paid_at: null, created_at: null },
        ];
      }
      if (sql.includes('FROM payment_refunds')) return [];
      if (sql.includes('booking_status_history')) return [];
      return [];
    });
    return new MyBookingsService({ query } as unknown as DatabaseService, config);
  }

  it('trả đủ thông tin: dịch vụ, số tiền, còn lại phải trả và xem trước hủy', async () => {
    const service = detailService(detailRow);

    const result = await service.getDetail(9, ['Customer'], 5);

    expect(result.booking_code).toBe('DS5');
    expect(result.amounts).toMatchObject({
      pitch_total: 500000,
      services_total: 40000,
      total_amount: 540000,
      paid: 162000,
      remaining: 378000,
    });
    expect(result.cancellation).toMatchObject({
      can_cancel: true,
      refund_percent: 100,
      refund_amount: 162000,
    });
    expect(result.invoice?.invoice_id).toBe(3);
  });

  it('chủ đơn khác bị 404, nhân viên/admin xem được', async () => {
    const service = detailService(detailRow);

    await expect(service.getDetail(777, ['Customer'], 5)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getDetail(777, ['Staff'], 5)).resolves.toMatchObject({ booking_id: 5 });
  });

  it('đơn không tồn tại → 404', async () => {
    const service = detailService(null);

    await expect(service.getDetail(9, [], 5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('đơn đã hủy: không còn khoản phải trả và không cho hủy tiếp', async () => {
    const service = detailService({ ...detailRow, status: 'Cancelled' });

    const result = await service.getDetail(9, [], 5);

    expect(result.amounts.remaining).toBe(0);
    expect(result.cancellation.can_cancel).toBe(false);
    expect(result.cancellation.refund_amount).toBe(0);
  });
});
