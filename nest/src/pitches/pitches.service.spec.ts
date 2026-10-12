import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { PitchesService } from './pitches.service.js';

function createService(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue(rows);
  return {
    service: new PitchesService({ query } as unknown as DatabaseService),
    query,
  };
}

describe('PitchesService', () => {
  it('findAll trả danh sách sân', async () => {
    const { service } = createService([{ pitch_id: 1 }, { pitch_id: 2 }]);

    await expect(service.findAll()).resolves.toHaveLength(2);
  });

  it('findOne trả sân đầu tiên tìm thấy', async () => {
    const { service, query } = createService([{ pitch_id: 4 }]);

    await expect(service.findOne(4)).resolves.toEqual({
      pitch_id: 4,
      rating_avg: null,
      review_count: 0,
    });
    expect(query.mock.calls[0][1]).toEqual([4]);
  });

  it('không trả sân đã ngưng hoạt động và không lộ ghi chú nội bộ', async () => {
    const { service, query } = createService([{ pitch_id: 4 }]);

    await service.findAll();
    await service.findOne(4);

    for (const call of query.mock.calls) {
      expect(call[0]).toContain("p.status <> 'Inactive'");
      expect(call[0]).not.toContain('p.notes');
    }
  });

  it('findOne chuyển điểm trung bình sang số', async () => {
    const { service } = createService([
      { pitch_id: 4, rating_avg: '4.5', review_count: '12' },
    ]);

    await expect(service.findOne(4)).resolves.toMatchObject({
      rating_avg: 4.5,
      review_count: 12,
    });
  });

  it('findOne báo 404 khi không có sân', async () => {
    const { service } = createService([]);

    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
