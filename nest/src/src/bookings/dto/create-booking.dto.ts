
import { Type } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateBookingDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    pitch_id: number;

    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    booking_date: string;

    @IsString()
    @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
    start_time: string;

    @IsString()
    @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
    end_time: string;

    @IsOptional()
    @IsString()
    @MaxLength(5000)
    customer_note?: string;
}