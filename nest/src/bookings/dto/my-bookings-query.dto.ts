import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

// Các tab ở màn 09: Tất cả / Đã đặt (chờ đá) / Đã hoàn thành / Đã hủy
export const BOOKING_TABS = [
    'all',
    'upcoming',
    'completed',
    'cancelled',
] as const;
export type BookingTab = (typeof BOOKING_TABS)[number];

export class MyBookingsQueryDto {
    @IsOptional()
    @IsIn(BOOKING_TABS, {
        message: 'tab phải là all, upcoming, completed hoặc cancelled',
    })
    tab?: BookingTab;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;
}
