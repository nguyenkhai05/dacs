import {
    Body,
    Controller,
    Get,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';

@Controller('bookings')
export class BookingsController {
    constructor(
        private readonly bookingsService: BookingsService,
    ) { }

    // Màn 06: lịch trống theo ngày (công khai, không cần đăng nhập)
    @Get('availability')
    getAvailability(
        @Query('pitch_id') pitchId: string,
        @Query('date') date: string,
    ) {
        return this.bookingsService.getAvailability(pitchId, date);
    }

    // Màn 07: tạo đơn đặt sân (cần đăng nhập)
    @Post()
    @UseGuards(JwtAuthGuard)
    create(
        @CurrentUser() user: AuthUser,
        @Body() dto: CreateBookingDto,
    ) {
        return this.bookingsService.create(Number(user.sub), dto);
    }
}
