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
import { BookingsService } from './bookings.service.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { MyBookingsQueryDto } from './dto/my-bookings-query.dto.js';
import { QuoteBookingDto } from './dto/quote-booking.dto.js';
import { MyBookingsService } from './my-bookings.service.js';

@Controller('bookings')
export class BookingsController {
    constructor(
        private readonly bookingsService: BookingsService,
        private readonly myBookingsService: MyBookingsService,
    ) { }

    // Màn 06: lịch trống theo ngày (công khai, không cần đăng nhập)
    @Get('availability')
    getAvailability(
        @Query('pitch_id') pitchId: string,
        @Query('date') date: string,
    ) {
        return this.bookingsService.getAvailability(pitchId, date);
    }

    // Màn 07: tính tiền thử (tiền sân + dịch vụ + tiền cọc), chưa giữ sân
    @Post('quote')
    @HttpCode(200)
    quote(@Body() dto: QuoteBookingDto) {
        return this.bookingsService.quote(dto);
    }

    // Màn 07: tạo đơn đặt sân kèm dịch vụ đi kèm (cần đăng nhập)
    @Post()
    @UseGuards(JwtAuthGuard)
    create(
        @CurrentUser() user: AuthUser,
        @Body() dto: CreateBookingDto,
    ) {
        return this.bookingsService.create(Number(user.sub), dto);
    }

    // Màn 09: lịch đặt của tôi (route cố định phải đứng trước :id)
    @Get('my')
    @UseGuards(JwtAuthGuard)
    listMine(
        @CurrentUser() user: AuthUser,
        @Query() query: MyBookingsQueryDto,
    ) {
        return this.myBookingsService.listMine(Number(user.sub), query);
    }

    // Màn 10: chi tiết một đơn
    @Get(':id')
    @UseGuards(JwtAuthGuard)
    getDetail(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.myBookingsService.getDetail(
            Number(user.sub),
            user.roles,
            id,
        );
    }

    // Màn 10: hủy đơn (áp chính sách hoàn cọc)
    @Post(':id/cancel')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard)
    cancel(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CancelBookingDto,
    ) {
        return this.myBookingsService.cancel(Number(user.sub), id, dto.reason);
    }
}
