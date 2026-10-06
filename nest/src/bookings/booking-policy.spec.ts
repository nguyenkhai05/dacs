import { describe, expect, it } from 'vitest';

import {
  calculateRefund,
  hoursUntilStart,
  parseDepositPercent,
  parseHoldMinutes,
  parseRefundPolicy,
  refundPercentFor,
} from './booking-policy.js';

const policy = { full_hours: 24, partial_hours: 12, partial_percent: 50 };

describe('refundPercentFor', () => {
  it('hủy sớm từ 24h trở lên → hoàn 100%', () => {
    expect(refundPercentFor(24, policy)).toBe(100);
    expect(refundPercentFor(72, policy)).toBe(100);
  });

  it('hủy trong khoảng 12h–24h → hoàn một phần', () => {
    expect(refundPercentFor(23.99, policy)).toBe(50);
    expect(refundPercentFor(12, policy)).toBe(50);
  });

  it('hủy trong vòng 12h trước giờ đá → mất cọc', () => {
    expect(refundPercentFor(11.99, policy)).toBe(0);
    expect(refundPercentFor(0.5, policy)).toBe(0);
  });
});

describe('calculateRefund', () => {
  it('làm tròn tới đồng', () => {
    expect(calculateRefund(222000, 100)).toBe(222000);
    expect(calculateRefund(222000, 50)).toBe(111000);
    expect(calculateRefund(100001, 50)).toBe(50001);
    expect(calculateRefund(222000, 0)).toBe(0);
  });
});

describe('hoursUntilStart', () => {
  it('tính theo giờ Việt Nam (UTC+7), không phụ thuộc máy chủ', () => {
    // 18:00 giờ VN ngày 10 = 11:00 UTC; "bây giờ" là 11:00 UTC ngày 9 → còn 24h
    const now = new Date('2026-10-09T11:00:00Z');

    expect(hoursUntilStart('2026-10-10', '18:00', now)).toBeCloseTo(24);
    expect(hoursUntilStart('2026-10-10', '18:00:00', now)).toBeCloseTo(24);
  });

  it('âm khi giờ đá đã qua', () => {
    const now = new Date('2026-10-10T12:00:00Z'); // 19:00 giờ VN
    expect(hoursUntilStart('2026-10-10', '18:00', now)).toBeCloseTo(-1);
  });
});

describe('parseRefundPolicy', () => {
  it('có giá trị mặc định 24h / 12h / 50%', () => {
    expect(parseRefundPolicy(() => undefined)).toEqual(policy);
  });

  it('đọc cấu hình từ .env', () => {
    const env: Record<string, string> = {
      REFUND_FULL_HOURS: '48',
      REFUND_PARTIAL_HOURS: '6',
      REFUND_PARTIAL_PERCENT: '30',
    };

    expect(parseRefundPolicy((key) => env[key])).toEqual({
      full_hours: 48,
      partial_hours: 6,
      partial_percent: 30,
    });
  });

  it('báo lỗi khi cấu hình sai', () => {
    expect(() =>
      parseRefundPolicy((k) => (k === 'REFUND_PARTIAL_HOURS' ? '30' : undefined)),
    ).toThrow(RangeError);
    expect(() =>
      parseRefundPolicy((k) => (k === 'REFUND_PARTIAL_PERCENT' ? '150' : undefined)),
    ).toThrow(RangeError);
    expect(() =>
      parseRefundPolicy((k) => (k === 'REFUND_FULL_HOURS' ? 'abc' : undefined)),
    ).toThrow(RangeError);
  });
});

describe('parseDepositPercent / parseHoldMinutes', () => {
  it('mặc định 30% và 15 phút', () => {
    expect(parseDepositPercent(undefined)).toBe(30);
    expect(parseHoldMinutes('')).toBe(15);
  });

  it('từ chối giá trị không hợp lệ', () => {
    expect(() => parseDepositPercent('0')).toThrow(RangeError);
    expect(() => parseDepositPercent('101')).toThrow(RangeError);
    expect(() => parseHoldMinutes('-5')).toThrow(RangeError);
  });
});
