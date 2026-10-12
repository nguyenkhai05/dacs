import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import { ADMIN_PORTAL_ROLES } from './auth.service.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { PasswordResetService } from './password-reset.service.js';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly passwordResetService: PasswordResetService,
    ) { }

    @Post('login')
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    // Đăng nhập trang quản trị (chỉ Admin/Staff). Trả cùng định dạng với /auth/login.
    @Post('admin/login')
    adminLogin(@Body() loginDto: LoginDto) {
        return this.authService.adminLogin(loginDto);
    }

    // Kiểm tra token quản trị còn hợp lệ và đúng quyền (frontend gọi khi vào trang /admin)
    @Get('admin/me')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(...ADMIN_PORTAL_ROLES)
    adminMe(@CurrentUser() user: AuthUser) {
        return { user_id: user.sub, email: user.email, roles: user.roles };
    }

    @Post('register')
    register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Post('forgot-password')
    forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.passwordResetService.requestOtp(dto);
    }

    @Post('reset-password')
    resetPassword(@Body() dto: ResetPasswordDto) {
        return this.passwordResetService.resetPassword(dto);
    }
}