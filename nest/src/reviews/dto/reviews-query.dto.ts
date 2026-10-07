import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ReviewsQueryDto {
    @Type(() => Number)
    @IsInt({ message: 'pitch_id phải là số nguyên' })
    @Min(1, { message: 'pitch_id không hợp lệ' })
    pitch_id: number;

    // Lọc theo số sao (tùy chọn)
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'rating phải là số nguyên từ 1 đến 5' })
    @Min(1, { message: 'rating phải từ 1 đến 5' })
    @Max(5, { message: 'rating phải từ 1 đến 5' })
    rating?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;
}
