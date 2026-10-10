import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AdminBookingsService } from './admin-bookings.service.js';
import {
    CollectCashDto,
    CounterQuoteDto,
    CreateCounterBookingDto,
    ListAdminBookingsQueryDto,
    NoShowDto,
    ScheduleQueryDto,
    StaffCancelDto,
} from './dto/admin-bookings.dto.js';

// Màn 14 - Đơn đặt & lịch sân: Admin và Staff đều dùng được.
@Controller('admin/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Staff')
export class AdminBookingsController {
    constructor(private readonly service: AdminBookingsService) { }

    // ----- Bảng đơn theo ngày / sân / trạng thái / từ khóa
    @Get()
    list(@Query() query: ListAdminBookingsQueryDto) {
        return this.service.list(query);
    }

    // ----- Chế độ Lịch: lưới sân x giờ
    @Get('schedule')
    schedule(@Query() query: ScheduleQueryDto) {
        return this.service.schedule(query);
    }

    // ----- Đặt tại quầy: kiểm tra trùng giờ + tính tiền (không giữ sân)
    @Post('counter/quote')
    @HttpCode(200)
    counterQuote(@Body() dto: CounterQuoteDto) {
        return this.service.counterQuote(dto);
    }

    // ----- Đặt tại quầy: tạo đơn đã thu tiền mặt
    @Post()
    createCounter(
        @CurrentUser() user: AuthUser,
        @Body() dto: CreateCounterBookingDto,
    ) {
        return this.service.createCounter(Number(user.sub), dto);
    }

    // ----- Chi tiết đang chọn
    @Get(':id')
    detail(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.getDetail(user, id);
    }

    @Post(':id/check-in')
    @HttpCode(200)
    checkIn(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.checkIn(Number(user.sub), id);
    }

    @Post(':id/collect-cash')
    @HttpCode(200)
    collectCash(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CollectCashDto,
    ) {
        return this.service.collectCash(Number(user.sub), id, dto);
    }

    @Post(':id/complete')
    @HttpCode(200)
    complete(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.complete(Number(user.sub), id);
    }

    @Post(':id/no-show')
    @HttpCode(200)
    noShow(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: NoShowDto,
    ) {
        return this.service.noShow(Number(user.sub), id, dto);
    }

    @Post(':id/cancel')
    @HttpCode(200)
    cancel(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: StaffCancelDto,
    ) {
        return this.service.cancel(Number(user.sub), id, dto);
    }
}
