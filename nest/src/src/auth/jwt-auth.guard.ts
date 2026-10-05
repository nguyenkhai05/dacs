import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { AuthUser } from './auth-user.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const header: string | undefined = request.headers?.authorization;

        const [type, token] = header?.split(' ') ?? [];

        if (type !== 'Bearer' || !token) {
            throw new UnauthorizedException('Bạn cần đăng nhập');
        }

        try {
            const payload = await this.jwtService.verifyAsync<AuthUser>(token);
            request.user = payload;
            return true;
        } catch {
            throw new UnauthorizedException(
                'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
            );
        }
    }
}
