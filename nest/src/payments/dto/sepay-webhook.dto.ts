import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * Payload webhook kiểu SePay (dịch vụ trung gian báo biến động số dư ngân hàng).
 * LƯU Ý: tên trường lấy theo tài liệu công khai của SePay; trước khi chạy thật hãy đối chiếu
 * lại với tài liệu/ảnh chụp payload thực tế của nhà cung cấp bạn chọn (Casso, payOS... khác nhau).
 */
export class SepayWebhookDto {
    @IsOptional()
    @IsString()
    accountNumber?: string;

    @IsOptional()
    @IsString()
    content?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    code?: string;

    @IsOptional()
    @IsIn(['in', 'out'])
    transferType?: 'in' | 'out';

    @Type(() => Number)
    @IsNumber()
    transferAmount: number;

    @IsOptional()
    @IsString()
    referenceCode?: string;
}
