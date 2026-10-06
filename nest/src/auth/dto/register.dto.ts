import {
    IsBoolean,
    IsEmail,
    IsNotEmpty,
    IsString,
    MaxLength,
    MinLength,
    Matches,
} from 'class-validator';

export class RegisterDto {
    @IsString()
    @IsNotEmpty({ message: 'Họ và tên không được để trống' })
    fullName: string;

    @IsString()
    @Matches(/^[0-9]{10,11}$/, {
        message: 'Số điện thoại phải có 10-11 chữ số',
    })
    phoneNumber: string;

    @IsEmail({}, { message: 'Email không hợp lệ' })
    email: string;

    @IsString()
    @MinLength(8, {
        message: 'Mật khẩu phải có ít nhất 8 ký tự',
    })
    @MaxLength(72, {
        message: 'Mật khẩu tối đa 72 ký tự',
    })
    password: string;

    @IsString()
    @IsNotEmpty({ message: 'Vui lòng xác nhận mật khẩu' })
    confirmPassword: string;

    @IsBoolean({ message: 'Giá trị đồng ý điều khoản không hợp lệ' })
    acceptedTerms: boolean;
}