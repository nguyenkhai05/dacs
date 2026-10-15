import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import {
  buildReportRows,
  computePeakWindow,
  percent,
  ReportService,
  resolveReportRange,
  round1,
} from './report.service.js';

describe('resolveReportRange', () => {
  it('tháng: từ ngày 1 tới ngày cuối tháng (kể cả tháng 2 năm nhuận)', () => {
    expect(resolveReportRange('month', '2026-09-17')).toMatchObject({
      from: '2026-09-01', to: '2026-09-30', days: 30, label: 'Tháng 09/2026',
    });
    expect(resolveReportRange('month', '2028-02-10')).toMatchObject({ to: '2028-02-29', days: 29 });
    expect(resolveReportRange('month', '2026-12-31')).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('tuần: T2-CN chứa ngày chọn', () => {
    expect(resolveReportRange('week', '2026-10-07')).toMatchObject({
      from: '2026-10-05', to: '2026-10-11', days: 7,
    });
  });

  it('ngày: đúng ngày chọn', () => {
    expect(resolveReportRange('day', '2026-10-05')).toMatchObject({
      from: '2026-10-05', to: '2026-10-05', days: 1,
    });
  });
});

describe('percent / round1', () => {
  it('làm tròn 1 số lẻ, mẫu số 0 → 0', () => {
    expect(percent(82, 1000)).toBe(8.2);
    expect(percent(31, 1000)).toBe(3.1);
    expect(percent(5, 0)).toBe(0);
    expect(round1(8.249)).toBe(8.2);
  });
});

describe('computePeakWindow', () => {
  it('chọn khung 2 giờ liên tiếp đông nhất và tính mức lấp đầy', () => {
    // 3 sân, 1 ngày: 19-21h có 3 lượt 2 giờ, 17-19h có 1 lượt
    const peak = computePeakWindow(
      [
        { start_time: '19:00', end_time: '21:00', total: 3 },
        { start_time: '17:00', end_time: '19:00', total: 1 },
      ],
      3,
      1,
    );

    expect(peak).toMatchObject({
      start_hour: 19, end_hour: 21, label: '19:00–21:00', booked_hours: 6, occupancy_rate: 100,
    });
  });

  it('lượt đá lệch giờ được chia theo phút trong từng giờ', () => {
    // 18:30-20:00 = 0,5h ở khung 18h và 1h ở khung 19h
    const peak = computePeakWindow([{ start_time: '18:30', end_time: '20:00', total: 1 }], 2, 1);
    expect(peak?.booked_hours).toBe(1.5);
    expect(peak?.start_hour).toBe(18);
    expect(peak?.occupancy_rate).toBe(37.5);
  });

  it('không có đơn → null; không có sân hoạt động → 0%', () => {
    expect(computePeakWindow([], 3, 30)).toBeNull();
    expect(computePeakWindow([{ start_time: '19:00', end_time: '20:00', total: 1 }], 0, 1)?.occupancy_rate).toBe(0);
  });
});

describe('buildReportRows', () => {
  const pitches = [
    { pitch_id: 1, pitch_name: 'Binh An 01', status: 'Available', category_id: 5, category_name: 'Sân 5 người', bookings: 10, hours: 20 },
    { pitch_id: 2, pitch_name: 'Binh An 02', status: 'Available', category_id: 5, category_name: 'Sân 5 người', bookings: 4, hours: 8 },
    { pitch_id: 3, pitch_name: 'Sân cũ', status: 'Inactive', category_id: 7, category_name: 'Sân 7 người', bookings: 0, hours: 0 },
  ] as never[];
  const money = [
    { pitch_id: 1, kind: 'gross', amount: 3000000 },
    { pitch_id: 1, kind: 'refund', amount: 200000 },
    { pitch_id: 2, kind: 'gross', amount: 1000000 },
  ] as never[];

  it('theo sân: thuần = thu − hoàn, bỏ sân ngừng hoạt động không phát sinh', () => {
    const rows = buildReportRows(pitches, money, 'pitch');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      label: 'Binh An 01 · Sân 5 người', booked_hours: 20, gross: 3000000, refunded: 200000, net_revenue: 2800000,
    });
  });

  it('theo loại sân: cộng dồn các sân cùng loại', () => {
    const rows = buildReportRows(pitches, money, 'category');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      label: 'Sân 5 người', bookings: 14, booked_hours: 28, gross: 4000000, net_revenue: 3800000,
    });
  });

  it('sân không có loại → "Chưa phân loại"', () => {
    const rows = buildReportRows(
      [{ pitch_id: 9, pitch_name: 'X', status: 'Available', category_id: null, category_name: null, bookings: 1, hours: 1 }] as never[],
      [],
      'category',
    );
    expect(rows[0].label).toBe('Chưa phân loại');
  });
});

function createService(options: { paid?: unknown[]; refunded?: unknown[] } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM payments\n') && sql.includes('day_no')) return options.paid ?? [];
    if (sql.includes('FROM payment_refunds\n') && sql.includes('day_no')) return options.refunded ?? [];
    if (sql.includes('FROM pitches p'))
      return [{ pitch_id: 1, pitch_name: 'Binh An 01', status: 'Available', category_id: 5, category_name: 'Sân 5 người', bookings: 2, hours: 4 }];
    if (sql.includes("'gross' AS kind"))
      return [{ pitch_id: 1, kind: 'gross', amount: 500000 }, { pitch_id: 1, kind: 'refund', amount: 100000 }];
    if (sql.includes('GROUP BY start_time, end_time'))
      return [{ start_time: '19:00', end_time: '21:00', total: 2 }];
    if (sql.includes("status = 'Available'")) return [{ total: 2 }];
    if (sql.includes("SUM(status = 'Cancelled')")) return [{ total: 20, cancelled: 2, no_show: 1 }];
    return [];
  });

  return { service: new ReportService({ query } as unknown as DatabaseService), query };
}

const dayNo = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

describe('ReportService.getRevenueTrend', () => {
  it('trả đúng 7 ngày kết thúc ở ngày chọn, thuần = thu − hoàn từng ngày', async () => {
    const { service } = createService({
      paid: [{ day_no: dayNo('2026-10-05'), amount: 5702000 }, { day_no: dayNo('2026-10-04'), amount: 4000000 }],
      refunded: [{ day_no: dayNo('2026-10-05'), amount: 222000 }],
    });

    const result = await service.getRevenueTrend('2026-10-05');

    expect(result.points).toHaveLength(7);
    expect(result.from).toBe('2026-09-29');
    expect(result.points[0].label).toBe('29/09');
    expect(result.points[6]).toMatchObject({
      key: '2026-10-05', gross: 5702000, refunded: 222000, net: 5480000, is_selected: true,
    });
    expect(result.points[5].net).toBe(4000000);
    expect(result.total_net).toBe(9480000);
  });

  it('ngày không hợp lệ → 400', async () => {
    await expect(createService().service.getRevenueTrend('2026-02-30')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ReportService.getReport / exportReport', () => {
  it('gom bảng, tổng, giờ cao điểm và tỷ lệ hủy / không đến', async () => {
    const report = await createService().service.getReport('month', '2026-09-15', 'pitch');

    expect(report).toMatchObject({ from: '2026-09-01', to: '2026-09-30', label: 'Tháng 09/2026' });
    expect(report.totals).toMatchObject({ booked_hours: 4, gross: 500000, refunded: 100000, net_revenue: 400000 });
    expect(report.peak).toMatchObject({ label: '19:00–21:00', booked_hours: 4 });
    expect(report.rates).toMatchObject({ total_bookings: 20, cancel_rate: 10, no_show_rate: 5 });
  });

  it('xuất CSV có BOM, dòng Tổng và tên file theo kỳ', async () => {
    const { filename, csv } = await createService().service.exportReport('month', '2026-09-15', 'pitch');

    expect(filename).toBe('bao-cao-2026-09-01_2026-09-30.csv');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Binh An 01 · Sân 5 người"');
    expect(csv).toContain('"Tổng"');
  });
});
