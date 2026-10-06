import { Transform } from 'class-transformer';
import {
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    Matches,
    MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

// Chỉ gửi những trường muốn đổi; trường nào bỏ trống (undefined) sẽ giữ nguyên.
export class UpdateProfileDto {
    @IsOptional()
    @Transform(trim)
    @IsString({ message: 'Họ và tên phải là chuỗi' })
    @IsNotEmpty({ message: 'Họ và tên không được để trống' })
    @MaxLength(100, { message: 'Họ và tên tối đa 100 ký tự' })
    fullName?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(/^[0-9]{10,11}$/, {
        message: 'Số điện thoại phải có 10-11 chữ số',
    })
    phoneNumber?: string;

    @IsOptional()
    @Transform(trim)
    @IsEmail({}, { message: 'Email không hợp lệ' })
    @MaxLength(254, { message: 'Email tối đa 254 ký tự' })
    email?: string;

    // Chuỗi rỗng = xóa địa chỉ
    @IsOptional()
    @Transform(trim)
    @IsString({ message: 'Địa chỉ phải là chuỗi' })
    @MaxLength(255, { message: 'Địa chỉ tối đa 255 ký tự' })
    address?: string;

    // Đường dẫn ảnh đại diện (http/https). Gửi null để xóa ảnh.
    @IsOptional()
    @Transform(trim)
    @IsUrl(
        { protocols: ['http', 'https'], require_protocol: true },
        { message: 'Ảnh đại diện phải là đường dẫn http/https hợp lệ' },
    )
    @MaxLength(500, { message: 'Đường dẫn ảnh tối đa 500 ký tự' })
    avatarUrl?: string | null;
}
