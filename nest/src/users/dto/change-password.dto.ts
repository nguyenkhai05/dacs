import {
    IsNotEmpty,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class ChangePasswordDto {
    @IsString()
    @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu hiện tại' })
    @MaxLength(128)
    currentPassword: string;

    @IsString()
    @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
    @MaxLength(72, { message: 'Mật khẩu mới tối đa 72 ký tự' })
    newPassword: string;

    @IsString()
    @IsNotEmpty({ message: 'Vui lòng xác nhận mật khẩu mới' })
    confirmNewPassword: string;
}
