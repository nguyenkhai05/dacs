
import {
    Injectable,
    UnauthorizedException,
    ForbiddenException,
    ConflictException,
    BadRequestException,
    HttpException,
    HttpStatus,
    InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { mapDbError } from '../common/db-error.util.js';
import { DatabaseService } from '../database/database.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginRateLimiter } from './login-rate-limiter.js';

/** Vai trò được vào trang quản trị. Muốn CHỈ Admin: đổi thành ['Admin']. */
export const ADMIN_PORTAL_ROLES = ['Admin', 'Staff'];

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

interface IdRow {
    user_id: number;
}

interface PhoneRow {
    user_id: number;
    email: string | null;
    is_active: number | boolean;
    is_employee: number | boolean;
}

@Injectable()
export class AuthService {
    private readonly loginLimiter = new LoginRateLimiter();

    constructor(
        private readonly database: DatabaseService,
        private readonly jwtService: JwtService,
    ) { }

    // ĐĂNG NHẬP (email hoặc số điện thoại)
    /**
     * Đăng nhập trang quản trị: dùng đúng quy trình của login() (kiểm tra mật khẩu, khóa tạm khi sai nhiều lần,
     * tài khoản bị khóa...) rồi CHỈ cho qua nếu có vai trò Admin/Staff.
     * Tài khoản khách hàng nhập đúng mật khẩu vẫn bị từ chối (403).
     */
    async adminLogin(loginDto: LoginDto) {
        const result = await this.login(loginDto);

        const allowed = result.user.roles.some((role) =>
            ADMIN_PORTAL_ROLES.includes(role),
        );

        if (!allowed) {
            throw new ForbiddenException(
                'Tài khoản này không có quyền truy cập trang quản trị',
            );
        }

        return result;
    }

    async login(loginDto: LoginDto) {
        const { password } = loginDto;
        const identifier = (
            loginDto.identifier ??
            loginDto.email ??
            ''
        ).trim();

        if (!identifier) {
            throw new BadRequestException(
                'Vui lòng nhập email hoặc số điện thoại',
            );
        }

        // 0. Chặn dò mật khẩu: sai quá nhiều lần thì tạm khóa
        const limitKey = identifier.toLowerCase();
        const retryAfter = this.loginLimiter.retryAfterSeconds(limitKey);

        if (retryAfter > 0) {
            throw new HttpException(
                `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(retryAfter / 60)} phút`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        // 1. Tìm tài khoản theo email hoặc số điện thoại
        const isEmail = identifier.includes('@');
        const users = await this.database.query<UserRow[]>(
            `
            SELECT
                user_id,
                full_name,
                email,
                password_hash,
                is_active
            FROM users
            WHERE ${isEmail ? 'email' : 'phone_number'} = ?
            LIMIT 1
            `,
            [identifier],
        );

        const user = users[0];

        // 2. Kiểm tra tài khoản
        if (!user || !user.is_active) {
            this.loginLimiter.recordFailure(limitKey);
            throw new UnauthorizedException(
                'Email/số điện thoại hoặc mật khẩu không chính xác',
            );
        }

        // 3. Kiểm tra mật khẩu
        const isPasswordValid = await bcrypt.compare(
            password,
            user.password_hash,
        );

        if (!isPasswordValid) {
            this.loginLimiter.recordFailure(limitKey);
            throw new UnauthorizedException(
                'Email/số điện thoại hoặc mật khẩu không chính xác',
            );
        }

        this.loginLimiter.reset(limitKey);

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

    // ĐĂNG KÝ
    async register(registerDto: RegisterDto) {
        const {
            fullName,
            phoneNumber,
            email,
            password,
            confirmPassword,
            acceptedTerms,
        } = registerDto;

        // 1. Kiểm tra xác nhận mật khẩu
        if (password !== confirmPassword) {
            throw new BadRequestException(
                'Mật khẩu xác nhận không khớp',
            );
        }

        // 2. Kiểm tra đồng ý điều khoản
        if (acceptedTerms !== true) {
            throw new BadRequestException(
                'Bạn phải đồng ý với điều khoản sử dụng',
            );
        }

        // 3. Kiểm tra email đã tồn tại
        const existingEmail = await this.database.query<IdRow[]>(
            `
            SELECT user_id
            FROM users
            WHERE email = ?
            LIMIT 1
            `,
            [email],
        );

        if (existingEmail.length > 0) {
            throw new ConflictException(
                'Email đã được sử dụng',
            );
        }

        // 4. Kiểm tra số điện thoại đã tồn tại.
        //    Khách vãng lai do lễ tân tạo tại quầy có email = NULL và không phải nhân viên:
        //    họ được phép "nhận lại" tài khoản bằng cách đăng ký với đúng SĐT đó
        //    (nếu không, họ sẽ không bao giờ đăng ký / đặt lại mật khẩu được).
        const existingPhone = await this.database.query<PhoneRow[]>(
            `
            SELECT
                u.user_id,
                u.email,
                u.is_active,
                EXISTS (
                    SELECT 1 FROM employees e WHERE e.user_id = u.user_id
                ) AS is_employee
            FROM users u
            WHERE u.phone_number = ?
            LIMIT 1
            `,
            [phoneNumber],
        );

        const phoneOwner = existingPhone[0];
        const claimable =
            phoneOwner !== undefined &&
            phoneOwner.email === null &&
            !Number(phoneOwner.is_employee ?? 0) &&
            Number(phoneOwner.is_active ?? 1) !== 0;

        if (phoneOwner && !claimable) {
            throw new ConflictException(
                'Số điện thoại đã được sử dụng',
            );
        }

        // 5. Mã hóa mật khẩu
        const passwordHash = await bcrypt.hash(password, 10);

        // 5b. Nhận lại tài khoản khách vãng lai đã có (giữ nguyên lịch sử đặt sân)
        if (claimable && phoneOwner) {
            return this.claimGuestAccount(
                phoneOwner.user_id,
                fullName,
                phoneNumber,
                email,
                passwordHash,
            );
        }

        // 6. Tạo tài khoản, hồ sơ khách hàng và gán vai trò
        try {
            return await this.database.transaction(async (connection) => {
            // Tìm vai trò Customer
            const [roleRows] = await connection.execute(
                `
                SELECT role_id
                FROM roles
                WHERE role_name = ?
                LIMIT 1
                `,
                ['Customer'],
            );

            const roles = roleRows as { role_id: number }[];

            if (roles.length === 0) {
                throw new InternalServerErrorException(
                    'Không tìm thấy vai trò Customer',
                );
            }

            const customerRoleId = roles[0].role_id;

            // Tạo tài khoản trong bảng users
            const [userResult] = await connection.execute(
                `
                INSERT INTO users (
                    full_name,
                    phone_number,
                    email,
                    password_hash
                )
                VALUES (?, ?, ?, ?)
                `,
                [
                    fullName,
                    phoneNumber,
                    email,
                    passwordHash,
                ],
            );

            const userId = (userResult as { insertId: number }).insertId;

            // Tạo hồ sơ khách hàng
            await connection.execute(
                `
                INSERT INTO customers (user_id)
                VALUES (?)
                `,
                [userId],
            );

            // Gán vai trò Customer
            await connection.execute(
                `
                INSERT INTO user_roles (user_id, role_id)
                VALUES (?, ?)
                `,
                [userId, customerRoleId],
            );

            // Trả kết quả đăng ký
            return {
                message: 'Đăng ký tài khoản thành công',
                user: {
                    user_id: userId,
                    full_name: fullName,
                    phone_number: phoneNumber,
                    email,
                    role: 'Customer',
                },
            };
            });
        } catch (error) {
            // Hai request đăng ký trùng nhau cùng lúc: UNIQUE của MySQL chặn, trả 409 thay vì 500.
            const mapped = mapDbError(error);
            if (mapped?.status === 409) {
                throw new ConflictException(mapped.message);
            }
            throw error;
        }
    }

    private async claimGuestAccount(
        userId: number,
        fullName: string,
        phoneNumber: string,
        email: string,
        passwordHash: string,
    ) {
        try {
            await this.database.transaction(async (connection) => {
                const [result] = await connection.execute(
                    `
                    UPDATE users
                    SET full_name = ?, email = ?, password_hash = ?
                    WHERE user_id = ? AND email IS NULL
                    `,
                    [fullName, email, passwordHash, userId],
                );

                if ((result as { affectedRows: number }).affectedRows !== 1) {
                    throw new ConflictException('Số điện thoại đã được sử dụng');
                }
            });
        } catch (error) {
            const mapped = mapDbError(error);
            if (mapped?.status === 409) {
                throw new ConflictException(mapped.message);
            }
            throw error;
        }

        return {
            message: 'Đăng ký tài khoản thành công',
            user: {
                user_id: userId,
                full_name: fullName,
                phone_number: phoneNumber,
                email,
                role: 'Customer',
            },
        };
    }
}