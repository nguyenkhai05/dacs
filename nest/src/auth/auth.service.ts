import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { DatabaseService } from '../database/database.service.js';
import { LoginDto } from './dto/login.dto.js';

interface UserRow {
    user_id: number;
    full_name: string;
    email: string;
    password_hash: string;
    is_active: number | boolean;
}

interface RoleRow {
    role_name: string;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly database: DatabaseService,
        private readonly jwtService: JwtService,
    ) { }

    async login(loginDto: LoginDto) {
        const { email, password } = loginDto;

        // 1. Tìm tài khoản theo email
        const users = await this.database.query<UserRow[]>(
            `
        SELECT
          user_id,
          full_name,
          email,
          password_hash,
          is_active
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
            [email],
        );

        const user = users[0];

        // 2. Kiểm tra tài khoản
        if (!user || !user.is_active) {
            throw new UnauthorizedException(
                'Email hoặc mật khẩu không chính xác',
            );
        }

        // 3. Kiểm tra mật khẩu
        const isPasswordValid = await bcrypt.compare(
            password,
            user.password_hash,
        );

        if (!isPasswordValid) {
            throw new UnauthorizedException(
                'Email hoặc mật khẩu không chính xác',
            );
        }

        // 4. Lấy vai trò của tài khoản
        const roles = await this.database.query<RoleRow[]>(
            `
        SELECT r.role_name
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = ?
      `,
            [user.user_id],
        );

        const roleNames = roles.map((role) => role.role_name);

        // 5. Tạo nội dung JWT
        const payload = {
            sub: user.user_id,
            email: user.email,
            roles: roleNames,
        };

        // 6. Ký token
        const accessToken =
            await this.jwtService.signAsync(payload);

        // 7. Trả kết quả
        return {
            access_token: accessToken,
            user: {
                user_id: user.user_id,
                full_name: user.full_name,
                email: user.email,
                roles: roleNames,
            },
        };
    }
}