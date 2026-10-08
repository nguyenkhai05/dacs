import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { HomeService } from './home.service.js';

function createService(rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue(rows);
  const service = new HomeService({ query } as unknown as DatabaseService);
  return { service, query };
}

describe('HomeService', () => {
  it('chuyển DECIMAL/COUNT sang số và gán trạng thái trống/hết', async () => {
    const { service } = createService([
      {
        pitch_id: 1,
        pitch_name: 'Sân 5 - Số 1',
        image_url: null,
        surface_type: 'Cỏ nhân tạo',
        category_id: 1,
        category_name: 'Sân 5 người',
        price_from: '200000.00',
        free_slots: '2',
      },
      {
        pitch_id: 2,
        pitch_name: 'Sân 5 - Số 2',
        image_url: null,
        surface_type: 'Cỏ nhân tạo',
        category_id: 1,
        category_name: 'Sân 5 người',
        price_from: null,
        free_slots: 0,
      },
    ]);

    const result = await service.searchPitches({ category_id: 1 });

    expect(result.pitches[0].price_from).toBe(200000);
    expect(result.pitches[0].availability).toBe('Available');
    expect(result.pitches[1].price_from).toBeNull();
    expect(result.pitches[1].availability).toBe('Full');
    expect(result.category_id).toBe(1);
  });

  it('từ chối ngày không tồn tại', async () => {
    const { service, query } = createService();

    await expect(
      service.searchPitches({ date: '2099-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('từ chối ngày đã qua', async () => {
    const { service } = createService();

    await expect(
      service.searchPitches({ date: '2000-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lọc theo khoảng giá, từ khóa và tiện ích bằng tham số (không nối chuỗi)', async () => {
    const { service, query } = createService([]);

    await service.searchPitches({
      min_price: 100000,
      max_price: 300000,
      q: '50%_a',
      amenities: ['Wifi', 'Nước uống'],
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('JSON_CONTAINS(p.amenities');
    expect(sql).not.toContain('50%');
    expect(params).toContain(100000);
    expect(params).toContain(300000);
    expect(params).toContain('%50!%!_a%'); // ký tự đặc biệt của LIKE đã được escape
    expect(params).toContain('Wifi');
    expect(params).toContain('Nước uống');
  });

  it('không đụng tới cột district/amenities khi không lọc', async () => {
    const { service, query } = createService([]);

    await service.searchPitches({});

    const sql = query.mock.calls[0][0] as string;
    expect(sql).not.toContain('p.district');
    expect(sql).not.toContain('p.amenities');
  });

  it('từ chối min_price lớn hơn max_price', async () => {
    const { service, query } = createService();

    await expect(
      service.searchPitches({ min_price: 500, max_price: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('phân trang: trả page, limit, total, total_pages và áp OFFSET', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([]) // danh sách
      .mockResolvedValueOnce([{ total: '25' }]); // đếm tổng
    const service = new HomeService({ query } as unknown as DatabaseService);

    const result = await service.searchPitches({ page: 3, limit: 10 });

    expect(result).toMatchObject({
      page: 3,
      limit: 10,
      total: 25,
      total_pages: 3,
    });
    expect(query.mock.calls[0][0]).toContain('LIMIT 10 OFFSET 20');
  });

  it('sắp xếp theo giá tăng dần', async () => {
    const { service, query } = createService([]);

    await service.searchPitches({ sort: 'price_asc' });

    expect(query.mock.calls[0][0]).toContain('price_from ASC');
  });

  it('giá và ca trống tính theo bộ giá của ngày đang xem (thứ trong tuần / ngày lễ)', async () => {
    const { service, query } = createService([]);

    await service.searchPitches({ date: '2099-01-10', min_price: 100000 }); // thứ Bảy

    for (const [sql] of query.mock.calls as [string][]) {
      expect(sql).toContain("hd.holiday_date = '2099-01-10'");
      expect(sql).toContain("dx.day_type = 'Weekend'");
    }
    // cả danh sách lẫn đếm tổng đều lọc giá theo đúng bộ giá
    expect(query.mock.calls).toHaveLength(2);
  });
});

