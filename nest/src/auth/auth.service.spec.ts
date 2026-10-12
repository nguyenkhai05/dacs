import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { AuthService } from './auth.service.js';

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash('matkhau123', 4);
});

function createService(queryImpl: (sql: string, values?: unknown[]) => unknown) {
  const query = vi.fn(async (sql: string, values?: unknown[]) =>
    queryImpl(sql, values),
  );
  const signAsync = vi.fn().mockResolvedValue('jwt-token');
  const service = new AuthService(
    { query } as unknown as DatabaseService,
    { signAsync } as unknown as JwtService,
  );
  return { service, query, signAsync };
}

const userRow = {
  user_id: 5,
  full_name: 'Nguyễn Văn A',
  email: 'a@example.com',
  password_hash: '',
  is_active: 1,
};

describe('AuthService.login', () => {
  const impl = (sql: string) => {
    if (sql.includes('FROM users')) {
      return [{ ...userRow, password_hash: passwordHash }];
    }
    return [{ role_name: 'Customer' }];
  };

  it('đăng nhập bằng email và trả token + vai trò', async () => {
    const { service, query, signAsync } = createService(impl);

    const result = await service.login({
      identifier: 'a@example.com',
      password: 'matkhau123',
    });

    expect(query.mock.calls[0][0]).toContain('email = ?');
    expect(signAsync).toHaveBeenCalledWith({
      sub: 5,
      email: 'a@example.com',
      roles: ['Customer'],
    });
    expect(result.access_token).toBe('jwt-token');
    expect(result.user.roles).toEqual(['Customer']);
  });

  it('đăng nhập bằng số điện thoại', async () => {
    const { service, query } = createService(impl);

    await service.login({ identifier: '0901234567', password: 'matkhau123' });

    expect(query.mock.calls[0][0]).toContain('phone_number = ?');
  });

  it('vẫn nhận trường email cũ', async () => {
    const { service, query } = createService(impl);

    await service.login({ email: 'a@example.com', password: 'matkhau123' });

    expect(query.mock.calls[0][1]).toEqual(['a@example.com']);
  });

  it('sai mật khẩu → 401, không lộ tài khoản có tồn tại hay không', async () => {
    const { service } = createService(impl);

    await expect(
      service.login({ identifier: 'a@example.com', password: 'sai-mat-khau' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const missing = createService(() => []);
    await expect(
      missing.service.login({ identifier: 'x@example.com', password: 'abc' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('tài khoản bị khóa không đăng nhập được', async () => {
    const { service } = createService((sql) =>
      sql.includes('FROM users')
        ? [{ ...userRow, password_hash: passwordHash, is_active: 0 }]
        : [],
    );

    await expect(
      service.login({ identifier: 'a@example.com', password: 'matkhau123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sai 5 lần liên tiếp thì bị khóa tạm (429)', async () => {
    const { service } = createService(impl);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.login({ identifier: 'a@example.com', password: 'sai' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    const blocked = service.login({
      identifier: 'a@example.com',
      password: 'matkhau123', // đúng mật khẩu nhưng đang bị khóa
    });
    await expect(blocked).rejects.toBeInstanceOf(HttpException);
    await expect(blocked).rejects.toMatchObject({ status: 429 });
  });

  it('thiếu cả email lẫn số điện thoại → 400', async () => {
    const { service } = createService(impl);

    await expect(
      service.login({ password: 'matkhau123' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AuthService.register', () => {
  const dto = {
    fullName: 'Nguyễn Văn B',
    phoneNumber: '0912345678',
    email: 'b@example.com',
    password: 'matkhau123',
    confirmPassword: 'matkhau123',
    acceptedTerms: true,
  };

  it('mật khẩu xác nhận không khớp → 400', async () => {
    const { service, query } = createService(() => []);

    await expect(
      service.register({ ...dto, confirmPassword: 'khac' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('chưa đồng ý điều khoản → 400', async () => {
    const { service } = createService(() => []);

    await expect(
      service.register({ ...dto, acceptedTerms: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('email đã tồn tại → 409', async () => {
    const { service } = createService((sql) =>
      sql.includes('email = ?') ? [{ user_id: 1 }] : [],
    );

    await expect(service.register(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('số điện thoại đã tồn tại → 409', async () => {
    const { service } = createService((sql) =>
      sql.includes('phone_number = ?') ? [{ user_id: 1 }] : [],
    );

    await expect(service.register(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('khách vãng lai (email NULL) đăng ký cùng SĐT → nhận lại tài khoản, không báo trùng', async () => {
    const execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    const query = vi.fn().mockImplementation(async (sql: string) =>
      sql.includes('phone_number = ?')
        ? [{ user_id: 7, email: null, is_active: 1, is_employee: 0 }]
        : [],
    );
    const transaction = vi.fn().mockImplementation(async (cb: (c: unknown) => unknown) => cb({ execute }));
    const service = new AuthService(
      { query, transaction } as unknown as DatabaseService,
      { signAsync: vi.fn() } as unknown as JwtService,
    );

    const result = await service.register(dto);

    expect(result.user.user_id).toBe(7);
    expect(execute.mock.calls[0][0]).toContain('UPDATE users');
    expect(execute.mock.calls[0][0]).toContain('email IS NULL');
  });

  it('SĐT của nhân viên (email NULL) không được nhận lại → 409', async () => {
    const { service } = createService((sql) =>
      sql.includes('phone_number = ?')
        ? [{ user_id: 7, email: null, is_active: 1, is_employee: 1 }]
        : [],
    );

    await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('ER_DUP_ENTRY khi tạo mới (đăng ký đồng thời) → 409 thay vì 500', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const transaction = vi.fn().mockRejectedValue({
      code: 'ER_DUP_ENTRY',
      sqlMessage: "Duplicate entry 'x' for key 'users.email'",
    });
    const service = new AuthService(
      { query, transaction } as unknown as DatabaseService,
      { signAsync: vi.fn() } as unknown as JwtService,
    );

    await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  describe('adminLogin', () => {
    const withRoles = (...roles: string[]) => (sql: string) =>
      sql.includes('FROM users')
        ? [{ ...userRow, password_hash: passwordHash }]
        : roles.map((role_name) => ({ role_name }));

    it('Admin đăng nhập được và nhận token', async () => {
      const { service } = createService(withRoles('Admin', 'Staff'));

      const result = await service.adminLogin({ identifier: 'a@example.com', password: 'matkhau123' });

      expect(result.access_token).toBe('jwt-token');
      expect(result.user.roles).toContain('Admin');
    });

    it('Staff cũng được vào trang quản trị', async () => {
      const { service } = createService(withRoles('Staff'));

      await expect(
        service.adminLogin({ identifier: 'a@example.com', password: 'matkhau123' }),
      ).resolves.toMatchObject({ access_token: 'jwt-token' });
    });

    it('khách hàng đúng mật khẩu vẫn bị từ chối 403', async () => {
      const { service } = createService(withRoles('Customer'));

      await expect(
        service.adminLogin({ identifier: 'a@example.com', password: 'matkhau123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sai mật khẩu → 401 như đăng nhập thường', async () => {
      const { service } = createService(withRoles('Admin'));

      await expect(
        service.adminLogin({ identifier: 'a@example.com', password: 'sai' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});

