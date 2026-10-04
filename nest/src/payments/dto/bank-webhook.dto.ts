import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class BankWebhookDto {
    @IsString()
    @IsNotEmpty({ message: 'content không được để trống' })
    content: string;

    @Type(() => Number)
    @IsNumber({}, { message: 'transfer_amount phải là số' })
    @Min(1, { message: 'transfer_amount phải lớn hơn 0' })
    transfer_amount: number;

    @IsOptional()
    @IsString()
    reference_code?: string;
}
