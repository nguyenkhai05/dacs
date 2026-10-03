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

    const result = await service.searchPitches(undefined, 1);

    expect(result.pitches[0].price_from).toBe(200000);
    expect(result.pitches[0].availability).toBe('Available');
    expect(result.pitches[1].price_from).toBeNull();
    expect(result.pitches[1].availability).toBe('Full');
    expect(result.category_id).toBe(1);
  });

  it('từ chối ngày không tồn tại', async () => {
    const { service, query } = createService();

    await expect(
      service.searchPitches('2099-02-30'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('từ chối ngày đã qua', async () => {
    const { service } = createService();

    await expect(
      service.searchPitches('2000-01-01'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
