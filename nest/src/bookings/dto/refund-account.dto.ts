import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

// Tài khoản ngân hàng khách nhập để nhận lại tiền cọc khi hủy đơn
export class RefundAccountDto {
    @Transform(trim)
    @IsString()
    @MinLength(2, { message: 'Tên ngân hàng quá ngắn' })
    @MaxLength(100, { message: 'Tên ngân hàng tối đa 100 ký tự' })
    bank_name: string;

    // Bỏ khoảng trắng/dấu gạch: "8888 7766 55" -> "8888776655"
    @Transform(({ value }) =>
        typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
    )
    @Matches(/^\d{6,30}$/, { message: 'Số tài khoản phải gồm 6-30 chữ số' })
    bank_account_number: string;

    @Transform(trim)
    @IsString()
    @MinLength(2, { message: 'Tên chủ tài khoản quá ngắn' })
    @MaxLength(100, { message: 'Tên chủ tài khoản tối đa 100 ký tự' })
    bank_account_name: string;
}
