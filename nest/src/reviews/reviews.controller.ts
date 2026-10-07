import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { ReviewsQueryDto } from './dto/reviews-query.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { ReviewsService } from './reviews.service.js';

@Controller('reviews')
export class ReviewsController {
    constructor(private readonly reviewsService: ReviewsService) { }

    // Màn 12: danh sách đánh giá của một sân (công khai)
    @Get()
    listByPitch(@Query() query: ReviewsQueryDto) {
        return this.reviewsService.listByPitch(query);
    }

    // Màn 12: gửi đánh giá sau trận (chủ đơn, đơn đã hoàn thành)
    @Post()
    @UseGuards(JwtAuthGuard)
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
        return this.reviewsService.create(Number(user.sub), dto);
    }

    // Đơn này đã đánh giá chưa / có được đánh giá không (route cố định
    // phải đứng trước ':id')
    @Get('booking/:bookingId')
    @UseGuards(JwtAuthGuard)
    getForBooking(
        @CurrentUser() user: AuthUser,
        @Param('bookingId', ParseIntPipe) bookingId: number,
    ) {
        return this.reviewsService.getForBooking(Number(user.sub), bookingId);
    }

    // Sửa đánh giá của chính mình
    @Put(':id')
    @UseGuards(JwtAuthGuard)
    update(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateReviewDto,
    ) {
        return this.reviewsService.update(Number(user.sub), id, dto);
    }
}
