import { Transform, Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

import { TIME_PATTERN } from '../pitch-admin.utils.js';

export const PITCH_STATUSES = ['Available', 'Maintenance', 'Inactive'] as const;
export type PitchStatus = (typeof PITCH_STATUSES)[number];

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

// ---------- Sân ----------

export class ListAdminPitchesQueryDto {
    @IsOptional()
    @IsIn(PITCH_STATUSES, { message: 'status phải là Available, Maintenance hoặc Inactive' })
    status?: PitchStatus;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'category_id phải là số nguyên' })
    @Min(1)
    category_id?: number;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    q?: string;
}

export class CreatePitchDto {
    @Transform(trim)
    @IsString({ message: 'Tên sân phải là chữ' })
    @IsNotEmpty({ message: 'Tên sân không được để trống' })
    @MaxLength(100, { message: 'Tên sân tối đa 100 ký tự' })
    pitch_name: string;

    @Type(() => Number)
    @IsInt({ message: 'category_id phải là số nguyên' })
    @Min(1, { message: 'category_id không hợp lệ' })
    category_id: number;

    @IsOptional()
    @IsIn(PITCH_STATUSES, { message: 'status phải là Available, Maintenance hoặc Inactive' })
    status?: PitchStatus;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2000)
    notes?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    image_url?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Loại mặt sân không được để trống' })
    @MaxLength(50)
    surface_type?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(255)
    address?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    district?: string;

    @IsOptional()
    @IsArray({ message: 'amenities phải là danh sách' })
    @ArrayMaxSize(20, { message: 'Tối đa 20 tiện ích' })
    @IsString({ each: true })
    @MaxLength(50, { each: true, message: 'Mỗi tiện ích tối đa 50 ký tự' })
    amenities?: string[];
}

// Sửa một phần: chỉ các trường gửi lên mới được cập nhật
export class UpdatePitchDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Tên sân không được để trống' })
    @MaxLength(100, { message: 'Tên sân tối đa 100 ký tự' })
    pitch_name?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'category_id phải là số nguyên' })
    @Min(1, { message: 'category_id không hợp lệ' })
    category_id?: number;

    @IsOptional()
    @IsIn(PITCH_STATUSES, { message: 'status phải là Available, Maintenance hoặc Inactive' })
    status?: PitchStatus;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2000)
    notes?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    image_url?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Loại mặt sân không được để trống' })
    @MaxLength(50)
    surface_type?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(255)
    address?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    district?: string;

    @IsOptional()
    @IsArray({ message: 'amenities phải là danh sách' })
    @ArrayMaxSize(20, { message: 'Tối đa 20 tiện ích' })
    @IsString({ each: true })
    @MaxLength(50, { each: true, message: 'Mỗi tiện ích tối đa 50 ký tự' })
    amenities?: string[];
}

export class UpdatePitchStatusDto {
    @IsIn(PITCH_STATUSES, { message: 'status phải là Available, Maintenance hoặc Inactive' })
    status: PitchStatus;
}

// ---------- Loại sân ----------

export class CreateCategoryDto {
    @Transform(trim)
    @IsString({ message: 'Tên loại sân phải là chữ' })
    @IsNotEmpty({ message: 'Tên loại sân không được để trống' })
    @MaxLength(100, { message: 'Tên loại sân tối đa 100 ký tự' })
    category_name: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    description?: string;
}

export class UpdateCategoryDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Tên loại sân không được để trống' })
    @MaxLength(100, { message: 'Tên loại sân tối đa 100 ký tự' })
    category_name?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    description?: string;

    @IsOptional()
    @IsBoolean({ message: 'is_active phải là true hoặc false' })
    is_active?: boolean;
}

// ---------- Khung giá ----------

export const MAX_PRICE_PER_HOUR = 99_999_999;

export class CreatePriceSlotDto {
    @Matches(TIME_PATTERN, { message: 'start_time phải có dạng HH:mm (00:00 - 23:59)' })
    start_time: string;

    @Matches(TIME_PATTERN, { message: 'end_time phải có dạng HH:mm (00:00 - 23:59)' })
    end_time: string;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'price_per_hour phải là số' })
    @Min(0, { message: 'Giá không được âm' })
    @Max(MAX_PRICE_PER_HOUR, { message: 'Giá vượt mức cho phép' })
    price_per_hour: number;
}

export class UpdatePriceSlotDto {
    @IsOptional()
    @Matches(TIME_PATTERN, { message: 'start_time phải có dạng HH:mm (00:00 - 23:59)' })
    start_time?: string;

    @IsOptional()
    @Matches(TIME_PATTERN, { message: 'end_time phải có dạng HH:mm (00:00 - 23:59)' })
    end_time?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'price_per_hour phải là số' })
    @Min(0, { message: 'Giá không được âm' })
    @Max(MAX_PRICE_PER_HOUR, { message: 'Giá vượt mức cho phép' })
    price_per_hour?: number;
}
