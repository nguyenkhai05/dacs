import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateHolidayDto, ListHolidaysQueryDto } from './dto/pitch-admin.dto.js';
import { HolidaysService } from './holidays.service.js';

// Màn 15 - ngày lễ / Tết (dùng để chọn bộ giá Holiday). Xem: Admin + Staff, sửa: Admin.
@Controller('admin/holidays')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Staff')
export class HolidaysController {
    constructor(private readonly service: HolidaysService) { }

    @Get()
    list(@Query() query: ListHolidaysQueryDto) {
        return this.service.list(query);
    }

    @Post()
    @Roles('Admin')
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateHolidayDto) {
        return this.service.create(Number(user.sub), dto);
    }

    @Delete(':date')
    @Roles('Admin')
    remove(@Param('date') date: string) {
        return this.service.remove(date);
    }
}
