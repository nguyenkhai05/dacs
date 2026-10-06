import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    Post,
    Query,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { MyBookingsQueryDto } from './dto/my-bookings-query.dto.js';

@Controller('bookings')
export class BookingsController {
    constructor(
        private readonly bookingsService: BookingsService,
        private readonly jwtService: JwtService,
    ) { }

    @Get('my')
    async getMyBookings(
        @Headers('authorization') authorization: string | undefined,
        @Query() query: MyBookingsQueryDto,
    ) {
        const customerId = await this.getCustomerId(authorization);
        return this.bookingsService.getMyBookings(customerId, query);
    }

    @Get('availability')
    async getAvailability(
        @Query('pitch_id') pitchId: string,
        @Query('date') date: string,
    ) {
        return this.bookingsService.getAvailability(pitchId, date);
    }

    @Post()
    async create(
        @Headers('authorization') authorization: string | undefined,
        @Body() dto: CreateBookingDto,
    ) {
        const customerId = await this.getCustomerId(authorization);
        return this.bookingsService.create(customerId, dto);
    }
    private async getCustomerId(
        authorization: string | undefined,
    ): Promise<number> {
        if (!authorization?.startsWith('Bearer ')) {
            throw new UnauthorizedException(
                'Vui lòng đăng nhập để thực hiện thao tác này.',
            );
        }

        const token = authorization.slice(7).trim();
        if (!token) {
            throw new UnauthorizedException('Token không hợp lệ.');
        }

        let payload: { sub?: unknown };
        try {
            payload = await this.jwtService.verifyAsync<{ sub?: unknown }>(
                token,
            );
        } catch {
            throw new UnauthorizedException(
                'Token không hợp lệ hoặc đã hết hạn.',
            );
        }

        const customerId = Number(payload.sub);
        if (!Number.isSafeInteger(customerId) || customerId <= 0) {
            throw new BadRequestException(
                'Thông tin người dùng trong token không hợp lệ.',
            );
        }

        return customerId;
    }

}