import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import {
  addDays,
  DashboardService,
  round2,
  startOfWeek,
  vietnamDayStartEpoch,
} from './dashboard.service.js';

interface Data {
  total?: number;
  pending?: number;
  bookedHours?: number | null;
  capacityHours?: number | null;
  revenue?: number | null;
  collected?: number | null;
  buckets?: { bucket: string | number; bookings: number; revenue: number }[];
  list?: Record<string, unknown>[];
}

function createService(data: Data = {}) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('GROUP BY status')) return [{ status: 'Confirmed', total: 3 }];
    if (sql.includes('AS collected') || sql.includes('AS amount'))
      return [{ amount: data.collected ?? 0 }];
    if (sql.includes('FROM pitches p'))
      return [{ hours: data.capacityHours === undefined ? 16 : data.capacityHours }];
    if (sql.includes('/ 3600 AS hours'))
      return [{ hours: data.bookedHours === undefined ? 11 : data.bookedHours }];
    if (sql.includes("status = 'Pending'")) return [{ total: data.pending ?? 3 }];
    if (sql.includes('AS revenue') && sql.includes('GROUP BY'))
      return data.buckets ?? [];
    if (sql.includes('AS revenue'))
      return [{ revenue: data.revenue === undefined ? 3410000 : data.revenue }];
    if (sql.includes('JOIN users u')) return data.list ?? [];
    if (sql.includes('COUNT(*) AS total')) return [{ total: data.total ?? 15 }];
    return [];
  });

  const service = new DashboardService({ query } as unknown as DatabaseService);
  return { service, query };
}

describe('helpers', () => {
  it('startOfWeek trả về thứ Hai', () => {
    expect(startOfWeek('2026-10-07')).toBe('2026-10-05'); // thứ Tư
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05'); // Chủ nhật
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
  });

  it('addDays qua tháng/năm', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(round2(68.7499999)).toBe(68.75);
  });
});

describe('vietnamDayStartEpoch', () => {
  it('00:00 giờ VN = 17:00 UTC hôm trước', () => {
    expect(vietnamDayStartEpoch('2026-10-08')).toBe(
      Date.parse('2026-10-07T17:00:00Z') / 1000,
    );
  });

  it('truy vấn tiền thu không dùng CONVERT_TZ và nhận đúng mốc ngày', async () => {
    const { service, query } = createService({ collected: 500000 });
    const res = await service.getOverview('2026-10-08');
    const call = query.mock.calls.find(([sql]) => String(sql).includes('AS amount'));
    expect(String(call?.[0])).not.toContain('CONVERT_TZ');
    expect(call?.[1]).toEqual([
      vietnamDayStartEpoch('2026-10-08'),
      vietnamDayStartEpoch('2026-10-09'),
      vietnamDayStartEpoch('2026-10-08'),
      vietnamDayStartEpoch('2026-10-09'),
    ]);
    expect(res.kpis.collected_amount).toBe(500000);
  });
});

describe('sức chứa theo bộ giá của ngày', () => {
  it('truy vấn sức chứa lọc khung giá theo loại ngày', async () => {
    const { service, query } = createService();
    await service.getOverview('2026-10-10'); // thứ Bảy
    const call = query.mock.calls.find(([sql]) => String(sql).includes('FROM pitches p'));
    expect(String(call?.[0])).toContain("dx.day_type = 'Weekend'");
    expect(String(call?.[0])).toContain("hd.holiday_date = '2026-10-10'");
  });
});

describe('DashboardService.getOverview', () => {
  it('tính KPI: 11/16 giờ = 68,75%', async () => {
    const { service } = createService();

    const res = await service.getOverview('2026-10-07');

    expect(res.date).toBe('2026-10-07');
    expect(res.kpis).toMatchObject({
      total_bookings: 15,
      pending_deposit_bookings: 3,
      occupancy_rate: 68.75,
      estimated_revenue: 3410000,
    });
    expect(res.status_counts).toEqual({ Confirmed: 3 });
  });

  it('chưa có sân/bảng giá → mức lấp đầy 0, không chia cho 0', async () => {
    const { service } = createService({ capacityHours: null, bookedHours: null });
    const res = await service.getOverview('2026-10-07');
    expect(res.kpis.occupancy_rate).toBe(0);
  });

  it('mức lấp đầy tối đa 100%', async () => {
    const { service } = createService({ bookedHours: 40, capacityHours: 16 });
    const res = await service.getOverview('2026-10-07');
    expect(res.kpis.occupancy_rate).toBe(100);
  });

  it('biểu đồ ngày: đủ 16 mốc giờ 06:00-21:00, giờ trống = 0', async () => {
    const { service } = createService({
      buckets: [{ bucket: 18, bookings: 4, revenue: 1000000 }],
    });

    const res = await service.getOverview('2026-10-07', 'day');

    expect(res.chart.points).toHaveLength(16);
    expect(res.chart.points[0].label).toBe('06:00');
    expect(res.chart.points.find((p) => p.label === '18:00')).toMatchObject({
      bookings: 4,
      revenue: 1000000,
    });
    expect(res.chart.points.find((p) => p.label === '07:00')?.bookings).toBe(0);
  });

  it('biểu đồ tuần: 7 ngày T2-CN, đánh dấu ngày đang chọn', async () => {
    const { service } = createService({
      buckets: [{ bucket: '2026-10-07', bookings: 15, revenue: 3410000 }],
    });

    const res = await service.getOverview('2026-10-07', 'week');

    expect(res.chart.from).toBe('2026-10-05');
    expect(res.chart.to).toBe('2026-10-11');
    expect(res.chart.points.map((p) => p.label)).toEqual([
      'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN',
    ]);
    const wed = res.chart.points[2] as { bookings: number; is_selected: boolean };
    expect(wed.bookings).toBe(15);
    expect(wed.is_selected).toBe(true);
  });

  it('danh sách đơn: có mã DS<id> và số tiền còn lại', async () => {
    const { service } = createService({
      list: [
        {
          booking_id: 1048,
          booking_date: '2026-10-07',
          start_time: '18:00',
          end_time: '19:00',
          status: 'Confirmed',
          customer_name: 'Nguyễn Văn A',
          pitch_name: 'Sân 5 - Số 1',
          total_amount: '250000.00',
          paid_amount: '75000.00',
          created_at: '2026-10-06 10:00:00',
        },
      ],
    });

    const res = await service.getOverview('2026-10-07');

    expect(res.latest_bookings[0]).toMatchObject({
      booking_code: 'DS1048',
      total_amount: 250000,
      paid_amount: 75000,
      remaining_amount: 175000,
    });
  });

  it('xem ngày khác hôm nay → không lọc giờ kết thúc', async () => {
    const { service, query } = createService();
    await service.getOverview('2030-01-01');
    const upcoming = query.mock.calls.find(
      ([sql]) => String(sql).includes('JOIN users u') && String(sql).includes('start_time ASC'),
    );
    expect(String(upcoming![0])).not.toContain('b.end_time > ?');
  });

  it('ngày không tồn tại → 400', async () => {
    const { service } = createService();
    await expect(service.getOverview('2026-02-31')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
