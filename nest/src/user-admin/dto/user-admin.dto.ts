import { Transform, Type } from 'class-transformer';
import {
    IsBoolean,
    IsEmail,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export const CUSTOMER_STATUSES = ['active', 'locked'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const STAFF_ROLES = ['Admin', 'Staff'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

// Chuỗi rỗng → undefined để các trường tùy chọn không bị validate như đã nhập
const trimOrUndefined = ({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const text = value.trim();
    return text === '' ? undefined : text;
};

export class ListCustomersQueryDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    q?: string;

    @IsOptional()
    @IsIn(CUSTOMER_STATUSES, { message: 'status phải là active hoặc locked' })
    status?: CustomerStatus;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(MAX_PAGE_SIZE)
    limit?: number;
}

export class UpdateCustomerNoteDto {
    // Cho phép chuỗi rỗng để xóa ghi chú
    @Transform(trim)
    @IsString({ message: 'Ghi chú phải là chữ' })
    @MaxLength(2000, { message: 'Ghi chú tối đa 2000 ký tự' })
    note: string;
}

export class UpdateCustomerStatusDto {
    @IsBoolean({ message: 'is_active phải là true hoặc false' })
    is_active: boolean;

    // Bắt buộc khi khóa (kiểm tra ở service); mở khóa có thể bỏ trống
    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString()
    @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
    reason?: string;
}

export class CreateStaffDto {
    @Transform(trim)
    @IsString({ message: 'Họ tên phải là chữ' })
    @IsNotEmpty({ message: 'Họ tên không được để trống' })
    @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
    full_name: string;

    // Bỏ trống thì hệ thống tự sinh NV001, NV002...
    @IsOptional()
    @Transform(trimOrUndefined)
    @Matches(/^[A-Za-z0-9_-]{2,20}$/, {
        message: 'Mã nhân viên gồm 2-20 ký tự chữ, số, gạch ngang hoặc gạch dưới',
    })
    employee_code?: string;

    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString()
    @MaxLength(100, { message: 'Vị trí tối đa 100 ký tự' })
    position?: string;

    @Transform(trim)
    @IsEmail({}, { message: 'Email đăng nhập không hợp lệ' })
    @MaxLength(254)
    email: string;

    // Form không có ô SĐT; nếu bỏ trống, hệ thống dùng mã nhân viên làm giá trị tạm
    // vì cột users.phone_number là NOT NULL UNIQUE.
    @IsOptional()
    @Transform(trimOrUndefined)
    @Matches(/^[0-9]{10,11}$/, { message: 'Số điện thoại phải có 10-11 chữ số' })
    phone_number?: string;

    @IsIn(STAFF_ROLES, { message: 'Vai trò phải là Admin hoặc Staff' })
    role: StaffRole;
}

export class UpdateStaffRoleDto {
    @IsIn(STAFF_ROLES, { message: 'Vai trò phải là Admin hoặc Staff' })
    role: StaffRole;
}

