import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthUser } from './auth-user.js';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<string[]>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!required || required.length === 0) {
            return true;
        }

        const user: AuthUser | undefined = context
            .switchToHttp()
            .getRequest().user;

        if (!user?.roles?.some((role) => required.includes(role))) {
            throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
        }

        return true;
    }
}
