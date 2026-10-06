import { Transform, Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    Max,
} from 'class-validator';

export const PITCH_SORTS = [
    'available',
    'price_asc',
    'price_desc',
] as const;
export type PitchSort = (typeof PITCH_SORTS)[number];

export class HomeQueryDto {
    // Ngày muốn xem, định dạng YYYY-MM-DD. Bỏ trống = hôm nay.
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'date phải có dạng YYYY-MM-DD',
    })
    date?: string;

    // Loại sân (pitch_categories.category_id). Bỏ trống = tất cả.
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'category_id phải là số nguyên' })
    @Min(1, { message: 'category_id không hợp lệ' })
    category_id?: number;

    // Từ khóa theo tên sân
    @IsOptional()
    @IsString()
    @MaxLength(100)
    q?: string;

    // Quận/huyện (cần chạy migration 003)
    @IsOptional()
    @IsString()
    @MaxLength(100)
    district?: string;

    // Khoảng giá theo giá/giờ thấp nhất của loại sân
    @IsOptional()
    @Type(() => Number)
    @IsNumber({}, { message: 'min_price phải là số' })
    @Min(0)
    min_price?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({}, { message: 'max_price phải là số' })
    @Min(0)
    max_price?: number;

    // Tiện ích: "Wifi,Nước uống" hoặc lặp tham số (cần chạy migration 003)
    @IsOptional()
    @Transform(({ value }) =>
        typeof value === 'string'
            ? value.split(',').map((item) => item.trim()).filter(Boolean)
            : value,
    )
    @IsArray()
    @IsString({ each: true })
    @MaxLength(50, { each: true })
    amenities?: string[];

    @IsOptional()
    @IsIn(PITCH_SORTS, {
        message: 'sort phải là available, price_asc hoặc price_desc',
    })
    sort?: PitchSort;

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
