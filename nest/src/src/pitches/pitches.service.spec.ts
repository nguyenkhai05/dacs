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

    await expect(service.findOne(4)).resolves.toEqual({ pitch_id: 4 });
    expect(query.mock.calls[0][1]).toEqual([4]);
  });

  it('findOne báo 404 khi không có sân', async () => {
    const { service } = createService([]);

    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
