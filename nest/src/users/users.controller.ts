import {
    Body,
    Controller,
    Get,
    HttpCode,
    Patch,
    UseGuards,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';

// Màn 11: Tài khoản của tôi. Luôn thao tác trên tài khoản trong JWT,
// không nhận user_id từ client nên không thể sửa hồ sơ người khác.
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    getProfile(@CurrentUser() user: AuthUser) {
        return this.usersService.getProfile(Number(user.sub));
    }

    @Patch()
    updateProfile(
        @CurrentUser() user: AuthUser,
        @Body() dto: UpdateProfileDto,
    ) {
        return this.usersService.updateProfile(Number(user.sub), dto);
    }

    @Patch('password')
    @HttpCode(200)
    changePassword(
        @CurrentUser() user: AuthUser,
        @Body() dto: ChangePasswordDto,
    ) {
        return this.usersService.changePassword(Number(user.sub), dto);
    }
}
