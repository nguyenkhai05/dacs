import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ChangePasswordDto } from './change-password.dto.js';
import { UpdateProfileDto } from './update-profile.dto.js';

// Dùng đúng cấu hình ValidationPipe như trong main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const run = <T>(metatype: new () => T, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

describe('UpdateProfileDto', () => {
  it('chấp nhận một phần trường và cắt khoảng trắng thừa', async () => {
    const dto = (await run(UpdateProfileDto, {
      fullName: '  Trần Văn B  ',
      email: ' b@example.com ',
    })) as UpdateProfileDto;

    expect(dto.fullName).toBe('Trần Văn B');
    expect(dto.email).toBe('b@example.com');
    expect(dto.phoneNumber).toBeUndefined();
  });

  it('bỏ các trường không được phép sửa (vai trò, trạng thái, mật khẩu...)', async () => {
    const dto = (await run(UpdateProfileDto, {
      fullName: 'A B',
      roles: ['Admin'],
      is_active: false,
      password_hash: 'x',
      user_id: 1,
    })) as Record<string, unknown>;

    expect(dto.roles).toBeUndefined();
    expect(dto.is_active).toBeUndefined();
    expect(dto.password_hash).toBeUndefined();
    expect(dto.user_id).toBeUndefined();
  });

  it('từ chối giá trị sai', async () => {
    const bad: Record<string, unknown>[] = [
      { fullName: '   ' },
      { fullName: 'a'.repeat(101) },
      { phoneNumber: '12345' },
      { phoneNumber: '09abc45678' },
      { email: 'khong-phai-email' },
      { email: '' },
      { address: 'a'.repeat(256) },
      { avatarUrl: 'javascript:alert(1)' },
      { avatarUrl: 'ftp://x.com/a.png' },
      { avatarUrl: 'khong-phai-url' },
    ];

    for (const body of bad) {
      await expect(run(UpdateProfileDto, body)).rejects.toBeDefined();
    }
  });

  it('cho phép address rỗng và avatarUrl null để xóa', async () => {
    const dto = (await run(UpdateProfileDto, {
      address: '',
      avatarUrl: null,
    })) as UpdateProfileDto;

    expect(dto.address).toBe('');
    expect(dto.avatarUrl).toBeNull();
  });

  it('chấp nhận ảnh đại diện https hợp lệ', async () => {
    await expect(
      run(UpdateProfileDto, { avatarUrl: 'https://cdn.example.com/a/b.png' }),
    ).resolves.toBeDefined();
  });
});

describe('ChangePasswordDto', () => {
  const ok = {
    currentPassword: 'matkhaucu',
    newPassword: 'matkhaumoi456',
    confirmNewPassword: 'matkhaumoi456',
  };

  it('chấp nhận dữ liệu hợp lệ', async () => {
    await expect(run(ChangePasswordDto, ok)).resolves.toBeDefined();
  });

  it('từ chối mật khẩu mới ngắn hơn 8 hoặc dài hơn 72 ký tự', async () => {
    await expect(
      run(ChangePasswordDto, { ...ok, newPassword: '1234567' }),
    ).rejects.toBeDefined();
    await expect(
      run(ChangePasswordDto, { ...ok, newPassword: 'a'.repeat(73) }),
    ).rejects.toBeDefined();
  });

  it('từ chối thiếu trường', async () => {
    await expect(run(ChangePasswordDto, { newPassword: 'matkhaumoi456' })).rejects.toBeDefined();
  });
});
