import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// Dùng cùng JwtAuthGuard: @Roles('Admin', 'Staff')
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
