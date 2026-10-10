import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { MailService } from './mail.service.js';

@Module({
  imports: [
    DatabaseModule,

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');

        if (!secret) {
          throw new Error('Thiếu JWT_SECRET trong file .env');
        }

        // JWT_EXPIRES_IN: số giây (vd 3600) hoặc chuỗi như 1h, 7d. Mặc định 1h.
        const raw = configService.get<string>('JWT_EXPIRES_IN')?.trim() || '1h';
        const expiresIn = /^\d+$/.test(raw) ? Number(raw) : raw;

        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as number,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService, MailService],
  exports: [JwtModule, MailService],
})
export class AuthModule { }