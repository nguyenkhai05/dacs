import { describe, expect, it } from 'vitest';

import { getVietnamNow } from './time.util.js';

describe('getVietnamNow', () => {
  it('đổi từ UTC sang giờ Việt Nam (UTC+7)', () => {
    const result = getVietnamNow(new Date('2026-10-05T10:30:15Z'));

    expect(result.date).toBe('2026-10-05');
    expect(result.time).toBe('17:30:15');
    expect(result.minutes).toBe(17 * 60 + 30);
  });

  it('sang ngày mới theo giờ Việt Nam khi UTC vẫn là hôm trước', () => {
    // 20:00 UTC ngày 5 = 03:00 sáng ngày 6 ở Việt Nam
    const result = getVietnamNow(new Date('2026-10-05T20:00:00Z'));

    expect(result.date).toBe('2026-10-06');
    expect(result.time).toBe('03:00:00');
  });
});
