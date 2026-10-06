import {
    BadRequestException,
    ConflictException,
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { LoginRateLimiter } from '../auth/login-rate-limiter.js';
import { DatabaseService } from '../database/database.service.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

interface ProfileRow {
    user_id: number;
    full_name: string;
    phone_number: string;
    email: string | null;
    avatar_url: string | null;
    is_active: number;
    created_at: Date | string;
    // 1 nếu tài khoản có hồ sơ khách hàng (bảng customers)
    has_customer: number;
    address: string | null;
}

interface PasswordRow {
    password_hash: string;
    is_active: number;
}

// Tên trường trong DTO → cột trong bảng users (danh sách cố định, không lấy từ client)
const USER_COLUMNS = {
    fullName: 'full_name',
    phoneNumber: 'phone_number',
    email: 'email',
    avatarUrl: 'avatar_url',
} as const;

// bcrypt chỉ dùng 72 byte đầu của mật khẩu
const BCRYPT_MAX_BYTES = 72;

/** "Nguyễn Minh Anh" → "MA" (chữ cái đầu của hai từ cuối, dùng làm avatar mặc định) */
export function buildInitials(fullName: string): string {
    const words = fullName.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
        return '?';
    }

    return words
        .slice(-2)
        .map((word) => Array.from(word)[0].toLocaleUpperCase('vi'))
        .join('');
}

@Injectable()
export class UsersService {
    // Chặn dò "mật khẩu hiện tại" khi ai đó cầm được token của người khác
    private readonly passwordLimiter = new LoginRateLimiter();

    constructor(private readonly database: DatabaseService) { }

    // ---------------------------------------------------------------
    // Màn 11: xem hồ sơ
    // ---------------------------------------------------------------

    async getProfile(userId: number) {
        const row = await this.findProfileRow(userId);

        if (!row) {
            throw new NotFoundException('Không tìm thấy tài khoản');
        }

        const roles = await this.database.query<{ role_name: string }[]>(
            `
            SELECT r.role_name
            FROM user_roles ur
            JOIN roles r ON r.role_id = ur.role_id
            WHERE ur.user_id = ?
            ORDER BY r.role_name ASC
            `,
            [userId],
        );

        return {
            user_id: row.user_id,
            full_name: row.full_name,
            initials: buildInitials(row.full_name),
            phone_number: row.phone_number,
            email: row.email,
            avatar_url: row.avatar_url,
            // null nếu chưa nhập hoặc tài khoản không phải khách hàng
            address: row.address,
            roles: roles.map((role) => role.role_name),
            created_at: row.created_at,
        };
    }

    private async findProfileRow(userId: number): Promise<ProfileRow | undefined> {
        const [row] = await this.database.query<ProfileRow[]>(
            `
            SELECT
                u.user_id,
                u.full_name,
                u.phone_number,
                u.email,
                u.avatar_url,
                u.is_active,
                u.created_at,
                (c.user_id IS NOT NULL) AS has_customer,
                c.address
            FROM users u
            LEFT JOIN customers c ON c.user_id = u.user_id
            WHERE u.user_id = ?
            LIMIT 1
            `,
            [userId],
        );

        return row;
    }

    // ---------------------------------------------------------------
    // Màn 11: cập nhật hồ sơ (chỉ các trường được gửi lên)
    // ---------------------------------------------------------------

    async updateProfile(userId: number, dto: UpdateProfileDto) {
        const userChanges: [string, string | null][] = [];

        for (const [field, column] of Object.entries(USER_COLUMNS)) {
            const value = dto[field as keyof typeof USER_COLUMNS];

            if (value !== undefined) {
                userChanges.push([column, value]);
            }
        }

        const addressProvided = dto.address !== undefined;

        if (userChanges.length === 0 && !addressProvided) {
            throw new BadRequestException(
                'Không có thông tin nào để cập nhật',
            );
        }

        const current = await this.findProfileRow(userId);

        if (!current || !current.is_active) {
            throw new NotFoundException('Không tìm thấy tài khoản');
        }

        if (addressProvided && !current.has_customer) {
            throw new BadRequestException(
                'Tài khoản này không có hồ sơ khách hàng để lưu địa chỉ',
            );
        }

        await this.assertUnique('email', dto.email, userId, 'Email đã được sử dụng');
        await this.assertUnique(
            'phone_number',
            dto.phoneNumber,
            userId,
            'Số điện thoại đã được sử dụng',
        );

        try {
            await this.database.transaction(async (connection) => {
                if (userChanges.length > 0) {
                    const assignments = userChanges
                        .map(([column]) => `${column} = ?`)
                        .join(', ');

                    await connection.execute(
                        `UPDATE users SET ${assignments} WHERE user_id = ?`,
                        [...userChanges.map(([, value]) => value), userId],
                    );
                }

                if (addressProvided) {
                    const address = dto.address?.trim() ? dto.address.trim() : null;

                    await connection.execute(
                        `UPDATE customers SET address = ? WHERE user_id = ?`,
                        [address, userId],
                    );
                }
            });
        } catch (error) {
            // Hai người cùng đổi sang một email/SĐT ở cùng lúc
            if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
                throw new ConflictException(
                    'Email hoặc số điện thoại đã được sử dụng',
                );
            }

            throw error;
        }

        return {
            message: 'Cập nhật thông tin thành công',
            profile: await this.getProfile(userId),
        };
    }

    // `column` luôn là hằng số trong code, không bao giờ lấy từ client
    private async assertUnique(
        column: 'email' | 'phone_number',
        value: string | null | undefined,
        userId: number,
        message: string,
    ): Promise<void> {
        if (value === undefined || value === null) {
            return;
        }

        const rows = await this.database.query<{ user_id: number }[]>(
            `SELECT user_id FROM users WHERE ${column} = ? AND user_id <> ? LIMIT 1`,
            [value, userId],
        );

        if (rows.length > 0) {
            throw new ConflictException(message);
        }
    }

    // ---------------------------------------------------------------
    // Màn 11: đổi mật khẩu
    // ---------------------------------------------------------------

    async changePassword(userId: number, dto: ChangePasswordDto) {
        const { currentPassword, newPassword, confirmNewPassword } = dto;

        if (newPassword !== confirmNewPassword) {
            throw new BadRequestException('Mật khẩu xác nhận không khớp');
        }

        if (Buffer.byteLength(newPassword, 'utf8') > BCRYPT_MAX_BYTES) {
            throw new BadRequestException(
                'Mật khẩu mới quá dài (tối đa 72 byte, ký tự có dấu chiếm nhiều byte hơn)',
            );
        }

        const limitKey = `change-password:${userId}`;
        const retryAfter = this.passwordLimiter.retryAfterSeconds(limitKey);

        if (retryAfter > 0) {
            throw new HttpException(
                `Nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(retryAfter / 60)} phút`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const [row] = await this.database.query<PasswordRow[]>(
            `SELECT password_hash, is_active FROM users WHERE user_id = ? LIMIT 1`,
            [userId],
        );

        if (!row || !row.is_active) {
            throw new NotFoundException('Không tìm thấy tài khoản');
        }

        const matches = await bcrypt.compare(currentPassword, row.password_hash);

        if (!matches) {
            this.passwordLimiter.recordFailure(limitKey);
            // 400 (không phải 401) để frontend không nhầm là phiên đăng nhập hết hạn
            throw new BadRequestException('Mật khẩu hiện tại không đúng');
        }

        if (await bcrypt.compare(newPassword, row.password_hash)) {
            throw new BadRequestException(
                'Mật khẩu mới phải khác mật khẩu hiện tại',
            );
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        await this.database.query(
            `UPDATE users SET password_hash = ? WHERE user_id = ?`,
            [passwordHash, userId],
        );

        this.passwordLimiter.reset(limitKey);

        return { message: 'Đổi mật khẩu thành công' };
    }
}
