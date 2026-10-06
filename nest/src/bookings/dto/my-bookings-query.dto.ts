import { Type } from 'class-transformer';
import {
    IsIn,
    IsInt,
    IsOptional,
    Max,
    Min,
} from 'class-validator';

export const BOOKING_STATUSES = [
    'Pending',
    'Confirmed',
    'CheckedIn',
    'Playing',
    'Completed',
    'Cancelled',
    'NoShow',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export class MyBookingsQueryDto {
    @IsOptional()
    @IsIn(BOOKING_STATUSES)
    status?: BookingStatus;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit = 10;
}
