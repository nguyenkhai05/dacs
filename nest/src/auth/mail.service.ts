import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

// Gửi email qua SMTP. Nếu chưa cấu hình SMTP_HOST:
//  - môi trường dev: in OTP ra console để test
//  - production: chỉ ghi lỗi (không bao giờ in OTP)
@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private readonly transporter: Transporter | null;
    private readonly from: string;

    constructor(private readonly config: ConfigService) {
        const host = this.config.get<string>('SMTP_HOST')?.trim();
        this.from =
            this.config.get<string>('MAIL_FROM')?.trim() ||
            'Đặt Sân Nhanh <no-reply@datsannhanh.local>';

        if (!host) {
            this.transporter = null;
            return;
        }

        const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
        const user = this.config.get<string>('SMTP_USER')?.trim();
        const pass = this.config.get<string>('SMTP_PASS') ?? '';

        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: user ? { user, pass } : undefined,
        });
    }

    async sendPasswordResetOtp(
        to: string,
        otp: string,
        ttlMinutes: number,
    ): Promise<void> {
        if (!this.transporter) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('Chưa cấu hình SMTP_HOST để gửi email');
            }
            this.logger.warn(
                `[DEV] Chưa cấu hình SMTP. OTP đặt lại mật khẩu cho ${to}: ${otp}`,
            );
            return;
        }

        await this.transporter.sendMail({
            from: this.from,
            to,
            subject: 'Mã xác thực đặt lại mật khẩu - Đặt Sân Nhanh',
            text:
                `Mã OTP của bạn là: ${otp}\n` +
                `Mã có hiệu lực trong ${ttlMinutes} phút. ` +
                `Tuyệt đối không chia sẻ mã này cho bất kỳ ai.\n` +
                `Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
        });
    }

    // Email báo tài khoản nhân viên mới. Không kèm mật khẩu hay OTP: nhân viên
    // tự đặt mật khẩu qua luồng "Quên mật khẩu" (màn 03) bằng chính email này.
    async sendStaffInvite(
        to: string,
        fullName: string,
        roleLabel: string,
    ): Promise<void> {
        if (!this.transporter) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('Chưa cấu hình SMTP_HOST để gửi email');
            }
            this.logger.warn(
                `[DEV] Chưa cấu hình SMTP. Bỏ qua email mời nhân viên ${to} (${roleLabel}).`,
            );
            return;
        }

        const appUrl = this.config.get<string>('FRONTEND_URL')?.trim();

        await this.transporter.sendMail({
            from: this.from,
            to,
            subject: 'Tài khoản nhân viên - Đặt Sân Nhanh',
            text:
                `Xin chào ${fullName},\n\n` +
                `Bạn vừa được cấp tài khoản ${roleLabel} trên hệ thống Đặt Sân Nhanh.\n` +
                `Để đặt mật khẩu, mở trang Đăng nhập${appUrl ? ` (${appUrl})` : ''}, ` +
                `chọn "Quên mật khẩu", nhập email này và làm theo hướng dẫn xác thực OTP.\n\n` +
                `Nếu bạn không biết về tài khoản này, hãy bỏ qua email.`,
        });
    }
}
