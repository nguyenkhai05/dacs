import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { buildInitials, UsersService } from './users.service.js';

const profileRow = {
  user_id: 9,
  full_name: 'Nguyễn Minh Anh',
  phone_number: '0901234567',
  email: 'anh@example.com',
  avatar_url: null,
  is_active: 1,
  created_at: '2026-01-01T00:00:00Z',
  has_customer: 1,
  address: '12 Trần Thái Tông',
};

interface Options {
  profile?: Record<string, unknown> | null;
  duplicate?: 'email' | 'phone_number' | null;
  txError?: unknown;
}

function createService(options: Options = {}) {
  const { profile = profileRow, duplicate = null, txError } = options;

  const execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
  const connection = { execute };

  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM user_roles')) return [{ role_name: 'Customer' }];
    if (sql.includes('LEFT JOIN customers')) return profile ? [profile] : [];
    if (sql.includes('AND user_id <> ?')) {
      return duplicate && sql.includes(duplicate) ? [{ user_id: 77 }] : [];
    }
    return [];
  });
  const database = {
    query,
    transaction: vi.fn(async (cb: (c: typeof connection) => unknown) => {
      if (txError) throw txError;
      return cb(connection);
    }),
  };

  const service = new UsersService(database as unknown as DatabaseService);
  return { service, query, execute };
}

describe('buildInitials', () => {
  it('lấy chữ cái đầu của hai từ cuối', () => {
    expect(buildInitials('Nguyễn Minh Anh')).toBe('MA');
    expect(buildInitials('  Đỗ  Văn  Đạt ')).toBe('VĐ');
    expect(buildInitials('An')).toBe('A');
    expect(buildInitials('   ')).toBe('?');
  });
});

describe('UsersService.getProfile', () => {
  it('trả hồ sơ, vai trò và không bao giờ lộ mật khẩu', async () => {
    const { service } = createService();

    const result = await service.getProfile(9);

    expect(result).toMatchObject({
      user_id: 9,
      full_name: 'Nguyễn Minh Anh',
      initials: 'MA',
      email: 'anh@example.com',
      address: '12 Trần Thái Tông',
      roles: ['Customer'],
    });
    expect(JSON.stringify(result)).not.toContain('password');
    expect(result).not.toHaveProperty('has_customer');
  });

  it('tài khoản không tồn tại → 404', async () => {
    const { service } = createService({ profile: null });

    await expect(service.getProfile(9)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService.updateProfile', () => {
  it('chỉ cập nhật những cột được gửi lên', async () => {
    const { service, execute } = createService();

    const result = await service.updateProfile(9, {
      fullName: 'Trần Văn B',
      phoneNumber: '0912345678',
    });

    expect(result.message).toContain('thành công');
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe('UPDATE users SET full_name = ?, phone_number = ? WHERE user_id = ?');
    expect(params).toEqual(['Trần Văn B', '0912345678', 9]);
    // không động tới bảng customers khi không gửi address
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('cập nhật địa chỉ vào bảng customers, chuỗi rỗng = xóa địa chỉ', async () => {
    const { service, execute } = createService();

    await service.updateProfile(9, { address: '  45 Láng Hạ  ' });
    expect(execute.mock.calls[0]).toEqual([
      'UPDATE customers SET address = ? WHERE user_id = ?',
      ['45 Láng Hạ', 9],
    ]);

    execute.mockClear();
    await service.updateProfile(9, { address: '' });
    expect((execute.mock.calls[0][1] as unknown[])[0]).toBeNull();
  });

  it('cho phép xóa ảnh đại diện bằng null', async () => {
    const { service, execute } = createService();

    await service.updateProfile(9, { avatarUrl: null });

    const [sql, params] = execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('avatar_url = ?');
    expect(params).toEqual([null, 9]);
  });

  it('không có trường nào → 400 và không truy vấn DB', async () => {
    const { service, query } = createService();

    await expect(service.updateProfile(9, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('email hoặc SĐT đã thuộc người khác → 409', async () => {
    const email = createService({ duplicate: 'email' });
    await expect(
      email.service.updateProfile(9, { email: 'khac@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(email.execute).not.toHaveBeenCalled();

    const phone = createService({ duplicate: 'phone_number' });
    await expect(
      phone.service.updateProfile(9, { phoneNumber: '0999999999' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('kiểm tra trùng luôn loại trừ chính tài khoản đang sửa', async () => {
    const { service, query } = createService();

    await service.updateProfile(9, { email: 'anh@example.com' });

    const call = query.mock.calls.find((c) =>
      (c[0] as string).includes('AND user_id <> ?'),
    ) as unknown[];
    expect(call[1]).toEqual(['anh@example.com', 9]);
  });

  it('race điều kiện: DB báo trùng khóa duy nhất → 409', async () => {
    const { service } = createService({
      txError: Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }),
    });

    await expect(
      service.updateProfile(9, { email: 'moi@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lỗi DB khác được ném lại nguyên vẹn', async () => {
    const boom = new Error('mất kết nối');
    const { service } = createService({ txError: boom });

    await expect(service.updateProfile(9, { fullName: 'A B' })).rejects.toBe(boom);
  });

  it('tài khoản không có hồ sơ khách hàng không lưu được địa chỉ', async () => {
    const { service } = createService({ profile: { ...profileRow, has_customer: 0 } });

    await expect(
      service.updateProfile(9, { address: 'Hà Nội' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tài khoản bị khóa hoặc đã xóa → 404', async () => {
    const locked = createService({ profile: { ...profileRow, is_active: 0 } });
    await expect(
      locked.service.updateProfile(9, { fullName: 'A B' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const missing = createService({ profile: null });
    await expect(
      missing.service.updateProfile(9, { fullName: 'A B' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService.changePassword', () => {
  let hash: string;

  beforeAll(async () => {
    hash = await bcrypt.hash('matkhaucu123', 4);
  });

  function passwordService(row: Record<string, unknown> | null = null) {
    const stored = row === null ? { password_hash: hash, is_active: 1 } : row;
    const query = vi.fn(async (sql: string, _values?: unknown[]) => {
      if (sql.includes('SELECT password_hash')) return stored ? [stored] : [];
      return [{ affectedRows: 1 }];
    });
    const service = new UsersService({ query } as unknown as DatabaseService);
    return { service, query };
  }

  const dto = {
    currentPassword: 'matkhaucu123',
    newPassword: 'matkhaumoi456',
    confirmNewPassword: 'matkhaumoi456',
  };

  it('đổi thành công và lưu mật khẩu mới đã băm', async () => {
    const { service, query } = passwordService();

    const result = await service.changePassword(9, dto);

    expect(result.message).toContain('thành công');
    const update = query.mock.calls.find((c) =>
      (c[0] as string).startsWith('UPDATE users SET password_hash'),
    ) as [string, string[]];
    const saved = update[1][0];
    expect(saved).not.toBe('matkhaumoi456');
    await expect(bcrypt.compare('matkhaumoi456', saved)).resolves.toBe(true);
  });

  it('sai mật khẩu hiện tại → 400, không cập nhật', async () => {
    const { service, query } = passwordService();

    await expect(
      service.changePassword(9, { ...dto, currentPassword: 'sai-roi' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query.mock.calls.some((c) => (c[0] as string).startsWith('UPDATE'))).toBe(false);
  });

  it('mật khẩu xác nhận không khớp → 400 trước khi đụng DB', async () => {
    const { service, query } = passwordService();

    await expect(
      service.changePassword(9, { ...dto, confirmNewPassword: 'khac-nhau' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('mật khẩu mới trùng mật khẩu cũ → 400', async () => {
    const { service } = passwordService();

    await expect(
      service.changePassword(9, {
        currentPassword: 'matkhaucu123',
        newPassword: 'matkhaucu123',
        confirmNewPassword: 'matkhaucu123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mật khẩu mới vượt 72 byte (ký tự có dấu) → 400', async () => {
    const { service } = passwordService();
    const long = 'ắ'.repeat(30); // 30 ký tự nhưng 90 byte

    await expect(
      service.changePassword(9, { ...dto, newPassword: long, confirmNewPassword: long }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('nhập sai 5 lần thì bị khóa tạm (429), kể cả khi lần sau nhập đúng', async () => {
    const { service } = passwordService();

    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.changePassword(9, { ...dto, currentPassword: 'sai' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    await expect(service.changePassword(9, dto)).rejects.toMatchObject({ status: 429 });
    // người dùng khác không bị ảnh hưởng
    await expect(service.changePassword(10, dto)).resolves.toBeDefined();
  });

  it('tài khoản không tồn tại hoặc bị khóa → 404', async () => {
    await expect(
      passwordService({ password_hash: hash, is_active: 0 }).service.changePassword(9, dto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
