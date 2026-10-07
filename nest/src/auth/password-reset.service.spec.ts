import { BadRequestException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { MailService } from './mail.service.js';
import { PasswordResetService } from './password-reset.service.js';

const SECRET = 'test-secret';
const hash = (userId: number, otp: string) =>
  createHmac('sha256', SECRET).update(`${userId}:${otp}`).digest('hex');

interface Options {
  user?: Record<string, unknown> | null;
  recent?: { last_sec: number | null; in_hour: number };
  otpRow?: Record<string, unknown> | null;
  mailFails?: boolean;
}

function createService(options: Options = {}) {
  const user =
    options.user === undefined
      ? { user_id: 7, email: 'a@example.com', is_active: 1 }
      : options.user;

  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM users')) return user ? [user] : [];
    if (sql.includes('COUNT(*)'))
      return [options.recent ?? { last_sec: null, in_hour: 0 }];
    return [];
  });

  const execute = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes('FROM password_reset_otps'))
      return [options.otpRow ? [options.otpRow] : []];
    if (sql.startsWith('INSERT')) return [{ insertId: 11 }];
    return [{}];
  });

  const transaction = vi.fn(async (cb: (c: unknown) => unknown) =>
    cb({ execute }),
  );

  const sendPasswordResetOtp = vi.fn(async () => {
    if (options.mailFails) throw new Error('smtp down');
  });

  const service = new PasswordResetService(
    { query, transaction } as unknown as DatabaseService,
    { sendPasswordResetOtp } as unknown as MailService,
    { get: () => SECRET } as unknown as ConfigService,
  );

  return { service, query, execute, sendPasswordResetOtp };
}

describe('PasswordResetService.requestOtp', () => {
  it('gửi OTP 6 số qua email và chỉ lưu bản băm', async () => {
    const { service, execute, sendPasswordResetOtp } = createService();

    await service.requestOtp({ identifier: 'a@example.com' });

    expect(sendPasswordResetOtp).toHaveBeenCalledTimes(1);
    const [to, otp] = sendPasswordResetOtp.mock.calls[0] as unknown as [string, string];
    expect(to).toBe('a@example.com');
    expect(otp).toMatch(/^[0-9]{6}$/);

    const insert = execute.mock.calls.find(([s]) => String(s).startsWith('INSERT'));
    expect((insert![1] as unknown[])[1]).toBe(hash(7, otp));
  });

  it('tài khoản không tồn tại → vẫn trả thông điệp chung, không gửi mail', async () => {
    const { service, sendPasswordResetOtp } = createService({ user: null });

    const res = await service.requestOtp({ identifier: 'x@example.com' });

    expect(res.message).toContain('Nếu tài khoản tồn tại');
    expect(sendPasswordResetOtp).not.toHaveBeenCalled();
  });

  it('tài khoản không có email → không gửi', async () => {
    const { service, sendPasswordResetOtp } = createService({
      user: { user_id: 7, email: null, is_active: 1 },
    });

    await service.requestOtp({ identifier: '0901234567' });
    expect(sendPasswordResetOtp).not.toHaveBeenCalled();
  });

  it('yêu cầu lại trong 60 giây → im lặng, không gửi thêm', async () => {
    const { service, sendPasswordResetOtp } = createService({
      recent: { last_sec: 20, in_hour: 1 },
    });

    await service.requestOtp({ identifier: 'a@example.com' });
    expect(sendPasswordResetOtp).not.toHaveBeenCalled();
  });

  it('gửi mail lỗi → thu hồi mã nhưng không báo lỗi ra ngoài', async () => {
    const { service, query } = createService({ mailFails: true });

    await expect(
      service.requestOtp({ identifier: 'a@example.com' }),
    ).resolves.toBeDefined();
    expect(
      query.mock.calls.some(([s]) => String(s).includes('SET used_at = NOW() WHERE otp_id')),
    ).toBe(true);
  });

  it('quá 5 lần/15 phút cho cùng định danh → 429', async () => {
    const { service } = createService({ user: null });
    for (let i = 0; i < 5; i++) {
      await service.requestOtp({ identifier: 'spam@example.com' });
    }
    await expect(
      service.requestOtp({ identifier: 'spam@example.com' }),
    ).rejects.toBeInstanceOf(HttpException);
  });
});

describe('PasswordResetService.resetPassword', () => {
  const base = {
    identifier: 'a@example.com',
    otp: '123456',
    newPassword: 'matkhaumoi1',
    confirmPassword: 'matkhaumoi1',
  };

  it('mật khẩu xác nhận không khớp → 400', async () => {
    const { service } = createService();
    await expect(
      service.resetPassword({ ...base, confirmPassword: 'khac' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('OTP đúng → đổi mật khẩu và vô hiệu mọi mã', async () => {
    const { service, execute } = createService({
      otpRow: { otp_id: 11, otp_hash: hash(7, '123456'), attempts: 0 },
    });

    const res = await service.resetPassword(base);

    expect(res.message).toContain('thành công');
    const sqls = execute.mock.calls.map(([s]) => String(s));
    expect(sqls.some((s) => s.includes('UPDATE users SET password_hash'))).toBe(true);
  });

  it('OTP sai → tăng số lần thử, không đổi mật khẩu', async () => {
    const { service, execute } = createService({
      otpRow: { otp_id: 11, otp_hash: hash(7, '999999'), attempts: 1 },
    });

    await expect(service.resetPassword(base)).rejects.toBeInstanceOf(BadRequestException);

    const sqls = execute.mock.calls.map(([s]) => String(s));
    expect(sqls.some((s) => s.includes('attempts = attempts + 1'))).toBe(true);
    expect(sqls.some((s) => s.includes('UPDATE users'))).toBe(false);
  });

  it('OTP hết hạn / không có → 400', async () => {
    const { service } = createService({ otpRow: null });
    await expect(service.resetPassword(base)).rejects.toThrow('không hợp lệ hoặc đã hết hạn');
  });

  it('đã sai tối đa số lần → từ chối kể cả khi OTP đúng', async () => {
    const { service, execute } = createService({
      otpRow: { otp_id: 11, otp_hash: hash(7, '123456'), attempts: 5 },
    });

    await expect(service.resetPassword(base)).rejects.toBeInstanceOf(BadRequestException);
    expect(
      execute.mock.calls.some(([s]) => String(s).includes('UPDATE users')),
    ).toBe(false);
  });

  it('tài khoản không tồn tại → cùng thông điệp lỗi', async () => {
    const { service } = createService({ user: null });
    await expect(service.resetPassword(base)).rejects.toThrow('không hợp lệ hoặc đã hết hạn');
  });
});
