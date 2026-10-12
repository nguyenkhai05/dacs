import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { AuthUser } from './auth-user.js';
import { AuthUserVerifier } from './auth-user-verifier.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly verifier: AuthUserVerifier,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const header: string | undefined = request.headers?.authorization;

        const [type, token] = header?.split(' ') ?? [];

        if (type !== 'Bearer' || !token) {
            throw new UnauthorizedException('Bạn cần đăng nhập');
        }

        let payload: AuthUser;
        try {
            payload = await this.jwtService.verifyAsync<AuthUser>(token);
        } catch {
            throw new UnauthorizedException(
                'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
            );
        }

        // Dùng vai trò / trạng thái mới nhất trong CSDL thay vì tin hoàn toàn vào JWT cũ.
        const fresh = await this.verifier.load(payload.sub);
        if (!fresh || !fresh.is_active) {
            throw new UnauthorizedException(
                'Tài khoản đã bị khóa hoặc không còn tồn tại',
            );
        }

        request.user = { ...payload, roles: fresh.roles };
        return true;
    }
}
