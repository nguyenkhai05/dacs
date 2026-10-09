import { Transform, Type } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export const SERVICE_STATUSES = ['active', 'inactive'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

// services.price là DECIMAL(10,2) => tối đa 99.999.999 đ
export const MAX_PRICE = 99_999_999;
export const MAX_STOCK = 1_000_000;
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

export class ListAdminServicesQueryDto {
    @IsOptional()
    @IsIn(SERVICE_STATUSES, { message: 'status phải là active hoặc inactive' })
    status?: ServiceStatus;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    q?: string;
}

export class CreateServiceDto {
    @Transform(trim)
    @IsString({ message: 'Tên dịch vụ phải là chữ' })
    @IsNotEmpty({ message: 'Tên dịch vụ không được để trống' })
    @MaxLength(100, { message: 'Tên dịch vụ tối đa 100 ký tự' })
    service_name: string;

    @Transform(trim)
    @IsString({ message: 'Đơn vị phải là chữ' })
    @IsNotEmpty({ message: 'Đơn vị không được để trống' })
    @MaxLength(20, { message: 'Đơn vị tối đa 20 ký tự' })
    unit: string;

    @Type(() => Number)
    @IsInt({ message: 'Giá bán phải là số nguyên' })
    @Min(0, { message: 'Giá bán không được âm' })
    @Max(MAX_PRICE, { message: `Giá bán tối đa ${MAX_PRICE.toLocaleString('vi-VN')} đ` })
    price: number;

    @Type(() => Number)
    @IsInt({ message: 'Số lượng tồn kho phải là số nguyên' })
    @Min(0, { message: 'Số lượng tồn kho không được âm' })
    @Max(MAX_STOCK, { message: `Số lượng tồn kho tối đa ${MAX_STOCK}` })
    stock_quantity: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Ngưỡng cảnh báo phải là số nguyên' })
    @Min(0, { message: 'Ngưỡng cảnh báo không được âm' })
    @Max(MAX_STOCK)
    low_stock_threshold?: number;

    @IsOptional()
    @IsBoolean({ message: 'is_active phải là true hoặc false' })
    is_active?: boolean;
}

export class UpdateServiceDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Tên dịch vụ không được để trống' })
    @MaxLength(100, { message: 'Tên dịch vụ tối đa 100 ký tự' })
    service_name?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Đơn vị không được để trống' })
    @MaxLength(20, { message: 'Đơn vị tối đa 20 ký tự' })
    unit?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Giá bán phải là số nguyên' })
    @Min(0, { message: 'Giá bán không được âm' })
    @Max(MAX_PRICE, { message: `Giá bán tối đa ${MAX_PRICE.toLocaleString('vi-VN')} đ` })
    price?: number;

    // Số lượng thực tế đang có (ghi đè), không phải số cộng thêm
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Số lượng tồn kho phải là số nguyên' })
    @Min(0, { message: 'Số lượng tồn kho không được âm' })
    @Max(MAX_STOCK, { message: `Số lượng tồn kho tối đa ${MAX_STOCK}` })
    stock_quantity?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Ngưỡng cảnh báo phải là số nguyên' })
    @Min(0, { message: 'Ngưỡng cảnh báo không được âm' })
    @Max(MAX_STOCK)
    low_stock_threshold?: number;

    @IsOptional()
    @IsBoolean({ message: 'is_active phải là true hoặc false' })
    is_active?: boolean;
}

export class UpdateServiceStatusDto {
    @IsBoolean({ message: 'is_active phải là true hoặc false' })
    is_active: boolean;
}
