import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { CreateReviewDto } from './create-review.dto.js';
import { ReviewsQueryDto } from './reviews-query.dto.js';
import { UpdateReviewDto } from './update-review.dto.js';

// Dùng đúng cấu hình ValidationPipe như trong main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const run = <T>(metatype: new () => T, value: unknown, type: 'body' | 'query' = 'body') =>
    pipe.transform(value, { type, metatype });

async function messagesOf<T>(metatype: new () => T, value: unknown, type: 'body' | 'query' = 'body') {
    try {
        await run(metatype, value, type);
        return [];
    } catch (error) {
        const response = (error as BadRequestException).getResponse() as { message: string[] };
        return response.message;
    }
}

describe('CreateReviewDto', () => {
    it('chấp nhận đánh giá hợp lệ, số gửi dạng chuỗi vẫn được và nhận xét được cắt khoảng trắng', async () => {
        const dto = (await run(CreateReviewDto, {
            booking_id: '5',
            rating: '4',
            comment: '  Ổn  ',
        })) as CreateReviewDto;

        expect(dto.booking_id).toBe(5);
        expect(dto.rating).toBe(4);
        expect(dto.comment).toBe('Ổn');
    });

    it('từ chối số sao ngoài 1-5 hoặc không phải số nguyên', async () => {
        for (const rating of [0, 6, -1, 3.5, 'abc']) {
            const messages = await messagesOf(CreateReviewDto, { booking_id: 1, rating });
            expect(messages.length).toBeGreaterThan(0);
        }
    });

    it('từ chối nhận xét quá 1000 ký tự', async () => {
        const messages = await messagesOf(CreateReviewDto, {
            booking_id: 1,
            rating: 5,
            comment: 'a'.repeat(1001),
        });

        expect(messages.join(' ')).toContain('1000');
    });

    it('bắt buộc có booking_id và rating', async () => {
        expect((await messagesOf(CreateReviewDto, { rating: 5 })).length).toBeGreaterThan(0);
        expect((await messagesOf(CreateReviewDto, { booking_id: 1 })).length).toBeGreaterThan(0);
    });

    it('bỏ qua field lạ (không cho khách tự gửi customer_id)', async () => {
        const dto = (await run(CreateReviewDto, {
            booking_id: 1,
            rating: 5,
            customer_id: 999,
        })) as Record<string, unknown>;

        expect(dto).not.toHaveProperty('customer_id');
    });
});

describe('UpdateReviewDto', () => {
    it('bắt buộc rating, nhận xét tùy chọn', async () => {
        expect((await messagesOf(UpdateReviewDto, {})).length).toBeGreaterThan(0);
        expect(await messagesOf(UpdateReviewDto, { rating: 2 })).toEqual([]);
    });
});

describe('ReviewsQueryDto', () => {
    it('bắt buộc pitch_id, rating lọc phải từ 1 đến 5', async () => {
        expect((await messagesOf(ReviewsQueryDto, {}, 'query')).length).toBeGreaterThan(0);
        expect((await messagesOf(ReviewsQueryDto, { pitch_id: '2', rating: '9' }, 'query')).length).toBeGreaterThan(0);
        expect(await messagesOf(ReviewsQueryDto, { pitch_id: '2', rating: '5', page: '2' }, 'query')).toEqual([]);
    });
});
