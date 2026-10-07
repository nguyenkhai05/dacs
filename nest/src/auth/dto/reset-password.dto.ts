import { Transform } from 'class-transformer';
import {
    IsNotEmpty,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

// Màn 03 - bước 2: OTP + mật khẩu mới + xác nhận mật khẩu.
export class ResetPasswordDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Vui lòng nhập email hoặc số điện thoại' })
    @MaxLength(254)
    identifier: string;

    @Transform(trim)
    @IsString()
    @Matches(/^[0-9]{6}$/, { message: 'Mã OTP gồm 6 chữ số' })
    otp: string;

    @IsString()
    @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
    @MaxLength(72, { message: 'Mật khẩu mới tối đa 72 ký tự' })
    newPassword: string;

    @IsString()
    @IsNotEmpty({ message: 'Vui lòng xác nhận mật khẩu mới' })
    confirmPassword: string;
}
