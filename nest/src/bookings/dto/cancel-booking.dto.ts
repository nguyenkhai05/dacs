import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelBookingDto {
    @IsOptional()
    @IsString()
    @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
    reason?: string;
}
