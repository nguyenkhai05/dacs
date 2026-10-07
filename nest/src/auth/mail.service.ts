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
}
