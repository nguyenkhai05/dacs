import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { AuthUserVerifier } from './auth-user-verifier.js';

function create(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue(rows);
  return { verifier: new AuthUserVerifier({ query } as unknown as DatabaseService), query };
}

describe('AuthUserVerifier', () => {
  it('trả vai trò hiện tại và trạng thái hoạt động', async () => {
    const { verifier } = create([
      { is_active: 1, role_name: 'Staff' },
      { is_active: 1, role_name: 'Admin' },
    ]);

    await expect(verifier.load(3)).resolves.toEqual({ is_active: true, roles: ['Staff', 'Admin'] });
  });

  it('tài khoản bị khóa → is_active = false', async () => {
    const { verifier } = create([{ is_active: 0, role_name: 'Customer' }]);

    await expect(verifier.load(3)).resolves.toMatchObject({ is_active: false });
  });

  it('không tồn tại → null', async () => {
    const { verifier } = create([]);

    await expect(verifier.load(99)).resolves.toBeNull();
  });

  it('cache ngắn hạn, invalidate thì đọc lại', async () => {
    const { verifier, query } = create([{ is_active: 1, role_name: 'Customer' }]);

    await verifier.load(1);
    await verifier.load(1);
    expect(query).toHaveBeenCalledTimes(1);

    verifier.invalidate(1);
    await verifier.load(1);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
