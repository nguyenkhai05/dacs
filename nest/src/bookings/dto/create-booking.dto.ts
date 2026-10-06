import { IsOptional, IsString, MaxLength } from 'class-validator';

import { QuoteBookingDto } from './quote-booking.dto.js';

export class CreateBookingDto extends QuoteBookingDto {
    @IsOptional()
    @IsString()
    @MaxLength(5000)
    customer_note?: string;
}
