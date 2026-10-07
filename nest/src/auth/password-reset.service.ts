import {
    BadRequestException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { DatabaseService } from '../database/database.service.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { MailService } from './mail.service.js';

export const OTP_TTL_MINUTES = 10;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_HOUR = 5;
const BCRYPT_MAX_BYTES = 72;

const GENERIC_SEND_MESSAGE =
    'Nếu tài khoản tồn tại và có email, mã OTP đã được gửi. Vui lòng kiểm tra hộp thư.';
const INVALID_OTP_MESSAGE = 'Mã OTP không hợp lệ hoặc đã hết hạn';

interface ResetUserRow {
    user_id: number;
    email: string | null;
    is_active: number | boolean;
}

interface OtpRow {
    otp_id: number;
    otp_hash: string;
    attempts: number;
}

type ResetOutcome = 'ok' | 'invalid';

@Injectable()
export class PasswordResetService {
    private readonly logger = new Logger(PasswordResetService.name);
    // Chặn spam yêu cầu OTP / dò OTP theo định danh (in-memory, 1 instance)
    private readonly requestLimiter = new LoginRateLimiter(5, 15 * 60 * 1000);
    private readonly verifyLimiter = new LoginRateLimiter(10, 15 * 60 * 1000);

    constructor(
        private readonly database: DatabaseService,
        private readonly mail: MailService,
        private readonly config: ConfigService,
    ) { }

    // Bước 1: yêu cầu gửi OTP. Luôn trả cùng một thông điệp để không lộ
    // việc email/SĐT có tồn tại trong hệ thống hay không.
    async requestOtp(dto: ForgotPasswordDto) {
        const identifier = dto.identifier.trim();
        const limitKey = `forgot:${identifier.toLowerCase()}`;

        const retryAfter = this.requestLimiter.retryAfterSeconds(limitKey);

        if (retryAfter > 0) {
            throw new HttpException(
                `Bạn yêu cầu mã quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(retryAfter / 60)} phút`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        this.requestLimiter.recordFailure(limitKey);

        const response = {
            message: GENERIC_SEND_MESSAGE,
            expires_in_seconds: OTP_TTL_MINUTES * 60,
            resend_after_seconds: OTP_RESEND_SECONDS,
        };

        const user = await this.findUser(identifier);

        if (!user || !user.is_active || !user.email) {
            return response;
        }

        // Giới hạn theo tài khoản: cách nhau 60s và tối đa 5 mã/giờ (im lặng)
        const [recent] = await this.database.query<
            { last_sec: number | null; in_hour: number }[]
        >(
            `
            SELECT
                MIN(TIMESTAMPDIFF(SECOND, created_at, NOW())) AS last_sec,
                COUNT(*) AS in_hour
            FROM password_reset_otps
            WHERE user_id = ?
              AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
            `,
            [user.user_id],
        );

        if (
            recent &&
            ((recent.last_sec !== null && Number(recent.last_sec) < OTP_RESEND_SECONDS) ||
                Number(recent.in_hour) >= OTP_MAX_PER_HOUR)
        ) {
            return response;
        }

        const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');

        // Mã mới thay thế mọi mã cũ còn hiệu lực
        const otpId = await this.database.transaction(async (connection) => {
            await connection.execute(
                `UPDATE password_reset_otps
                 SET used_at = NOW()
                 WHERE user_id = ? AND used_at IS NULL`,
                [user.user_id],
            );

            const [result] = await connection.execute(
                `INSERT INTO password_reset_otps (user_id, otp_hash, expires_at)
                 VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
                [user.user_id, this.hashOtp(user.user_id, otp), OTP_TTL_MINUTES],
            );

            return (result as { insertId: number }).insertId;
        });

        try {
            await this.mail.sendPasswordResetOtp(user.email, otp, OTP_TTL_MINUTES);
        } catch (error) {
            this.logger.error(
                `Gửi OTP thất bại cho user ${user.user_id}: ${(error as Error).message}`,
            );
            // Thu hồi mã chưa gửi được
            await this.database.query(
                `UPDATE password_reset_otps SET used_at = NOW() WHERE otp_id = ?`,
                [otpId],
            );
        }

        return response;
    }

    // Bước 2: xác minh OTP và đặt mật khẩu mới
    async resetPassword(dto: ResetPasswordDto) {
        const { otp, newPassword, confirmPassword } = dto;
        const identifier = dto.identifier.trim();

        if (newPassword !== confirmPassword) {
            throw new BadRequestException('Mật khẩu xác nhận không khớp');
        }

        if (Buffer.byteLength(newPassword, 'utf8') > BCRYPT_MAX_BYTES) {
            throw new BadRequestException(
                'Mật khẩu mới quá dài (tối đa 72 byte, ký tự có dấu chiếm nhiều byte hơn)',
            );
        }

        const limitKey = `reset:${identifier.toLowerCase()}`;
        const retryAfter = this.verifyLimiter.retryAfterSeconds(limitKey);

        if (retryAfter > 0) {
            throw new HttpException(
                `Nhập sai mã quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(retryAfter / 60)} phút`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const user = await this.findUser(identifier);

        if (!user || !user.is_active) {
            this.verifyLimiter.recordFailure(limitKey);
            throw new BadRequestException(INVALID_OTP_MESSAGE);
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        const outcome = await this.database.transaction<ResetOutcome>(
            async (connection) => {
                const [rows] = await connection.execute(
                    `
                    SELECT otp_id, otp_hash, attempts
                    FROM password_reset_otps
                    WHERE user_id = ?
                      AND used_at IS NULL
                      AND expires_at > NOW()
                    ORDER BY otp_id DESC
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [user.user_id],
                );

                const record = (rows as OtpRow[])[0];

                if (!record) {
                    return 'invalid';
                }

                if (record.attempts >= OTP_MAX_ATTEMPTS) {
                    await connection.execute(
                        `UPDATE password_reset_otps SET used_at = NOW() WHERE otp_id = ?`,
                        [record.otp_id],
                    );
                    return 'invalid';
                }

                if (!this.matches(record.otp_hash, user.user_id, otp)) {
                    const exhausted = record.attempts + 1 >= OTP_MAX_ATTEMPTS;

                    await connection.execute(
                        `UPDATE password_reset_otps
                         SET attempts = attempts + 1,
                             used_at = IF(?, NOW(), used_at)
                         WHERE otp_id = ?`,
                        [exhausted ? 1 : 0, record.otp_id],
                    );
                    return 'invalid';
                }

                await connection.execute(
                    `UPDATE users SET password_hash = ? WHERE user_id = ?`,
                    [passwordHash, user.user_id],
                );
                await connection.execute(
                    `UPDATE password_reset_otps
                     SET used_at = NOW()
                     WHERE user_id = ? AND used_at IS NULL`,
                    [user.user_id],
                );

                return 'ok';
            },
        );

        if (outcome !== 'ok') {
            this.verifyLimiter.recordFailure(limitKey);
            throw new BadRequestException(INVALID_OTP_MESSAGE);
        }

        this.verifyLimiter.reset(limitKey);
        this.requestLimiter.reset(`forgot:${identifier.toLowerCase()}`);

        return {
            message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
        };
    }

    private async findUser(identifier: string): Promise<ResetUserRow | undefined> {
        const column = identifier.includes('@') ? 'email' : 'phone_number';

        const rows = await this.database.query<ResetUserRow[]>(
            `SELECT user_id, email, is_active FROM users WHERE ${column} = ? LIMIT 1`,
            [identifier],
        );

        return rows[0];
    }

    // HMAC theo JWT_SECRET + user_id: DB bị lộ cũng không dò ngược được OTP
    private hashOtp(userId: number, otp: string): string {
        const secret = this.config.get<string>('JWT_SECRET') ?? '';
        return createHmac('sha256', secret).update(`${userId}:${otp}`).digest('hex');
    }

    private matches(storedHash: string, userId: number, otp: string): boolean {
        const expected = Buffer.from(this.hashOtp(userId, otp), 'hex');
        const actual = Buffer.from(storedHash, 'hex');

        return expected.length === actual.length && timingSafeEqual(expected, actual);
    }
}
