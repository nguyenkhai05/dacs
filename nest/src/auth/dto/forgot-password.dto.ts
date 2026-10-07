import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

// Màn 03 - bước 1: nhập Email hoặc Số điện thoại để nhận OTP.
export class ForgotPasswordDto {
    @Transform(trim)
    @IsString({ message: 'Email/số điện thoại phải là chuỗi' })
    @IsNotEmpty({ message: 'Vui lòng nhập email hoặc số điện thoại' })
    @MaxLength(254)
    identifier: string;
}
