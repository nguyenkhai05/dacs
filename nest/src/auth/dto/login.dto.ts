import {
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class LoginDto {
    // Email hoặc số điện thoại (đúng đặc tả màn 01).
    @IsOptional()
    @IsString({ message: 'Email/số điện thoại phải là chuỗi' })
    @MaxLength(254)
    identifier?: string;

    // Tên cũ, giữ lại để tương thích: coi như identifier.
    @IsOptional()
    @IsString({ message: 'Email phải là chuỗi' })
    @MaxLength(254)
    email?: string;

    @IsString({ message: 'Mật khẩu phải là chuỗi' })
    @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
    @MaxLength(128)
    password: string;
}
