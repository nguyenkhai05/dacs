import { describe, expect, it, vi } from 'vitest';

import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

const user = { sub: 9, email: 'a@b.c', roles: ['Customer'] };

describe('UsersController', () => {
  it('luôn dùng id trong JWT, không nhận id từ client', async () => {
    const getProfile = vi.fn().mockResolvedValue('x');
    const updateProfile = vi.fn().mockResolvedValue('x');
    const changePassword = vi.fn().mockResolvedValue('x');
    const controller = new UsersController({
      getProfile,
      updateProfile,
      changePassword,
    } as unknown as UsersService);

    await controller.getProfile(user);
    await controller.updateProfile(user, { fullName: 'A B' });
    await controller.changePassword(user, {
      currentPassword: 'a',
      newPassword: 'b',
      confirmNewPassword: 'b',
    });

    expect(getProfile).toHaveBeenCalledWith(9);
    expect(updateProfile).toHaveBeenCalledWith(9, { fullName: 'A B' });
    expect(changePassword).toHaveBeenCalledWith(9, {
      currentPassword: 'a',
      newPassword: 'b',
      confirmNewPassword: 'b',
    });
  });
});
