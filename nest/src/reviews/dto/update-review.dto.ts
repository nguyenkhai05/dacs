import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { MAX_COMMENT_LENGTH } from '../reviews.utils.js';

export class UpdateReviewDto {
    @Type(() => Number)
    @IsInt({ message: 'rating phải là số nguyên từ 1 đến 5' })
    @Min(1, { message: 'rating tối thiểu là 1 sao' })
    @Max(5, { message: 'rating tối đa là 5 sao' })
    rating: number;

    // Bỏ trống hoặc gửi "" để xóa nhận xét
    @IsOptional()
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString({ message: 'Nhận xét phải là chữ' })
    @MaxLength(MAX_COMMENT_LENGTH, {
        message: `Nhận xét tối đa ${MAX_COMMENT_LENGTH} ký tự`,
    })
    comment?: string;
}
