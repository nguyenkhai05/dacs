import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CreateDepositDto {
    @Type(() => Number)
    @IsInt({ message: 'booking_id phải là số nguyên' })
    @Min(1, { message: 'booking_id không hợp lệ' })
    booking_id: number;
}
