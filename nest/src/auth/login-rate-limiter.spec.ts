import { describe, expect, it } from 'vitest';

import { LoginRateLimiter } from './login-rate-limiter.js';

describe('LoginRateLimiter', () => {
  it('khóa sau số lần sai tối đa và tự mở khi hết thời gian', () => {
    const limiter = new LoginRateLimiter(3, 60_000);
    const t0 = 1_000_000;

    limiter.recordFailure('a', t0);
    limiter.recordFailure('a', t0 + 1000);
    expect(limiter.retryAfterSeconds('a', t0 + 2000)).toBe(0);

    limiter.recordFailure('a', t0 + 2000);
    expect(limiter.retryAfterSeconds('a', t0 + 3000)).toBeGreaterThan(0);

    expect(limiter.retryAfterSeconds('a', t0 + 60_001)).toBe(0);
  });

  it('reset xóa bộ đếm và không ảnh hưởng khóa khác', () => {
    const limiter = new LoginRateLimiter(1, 60_000);

    limiter.recordFailure('a');
    limiter.recordFailure('b');
    limiter.reset('a');

    expect(limiter.retryAfterSeconds('a')).toBe(0);
    expect(limiter.retryAfterSeconds('b')).toBeGreaterThan(0);
  });
});
