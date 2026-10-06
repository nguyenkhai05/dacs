import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';

export class BookingServiceItemDto {
    @Type(() => Number)
    @IsInt({ message: 'service_id phải là số nguyên' })
    @Min(1, { message: 'service_id không hợp lệ' })
    service_id: number;

    @Type(() => Number)
    @IsInt({ message: 'Số lượng phải là số nguyên' })
    @Min(1, { message: 'Số lượng tối thiểu là 1' })
    @Max(99, { message: 'Số lượng tối đa là 99' })
    quantity: number;
}

// Dữ liệu dùng chung cho "tính tiền thử" (màn 07) và "tạo đơn".
export class QuoteBookingDto {
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

    // Dịch vụ đi kèm (nước, thuê bóng, áo...). Bỏ trống = không chọn.
    @IsOptional()
    @IsArray({ message: 'services phải là danh sách' })
    @ArrayMaxSize(20, { message: 'Tối đa 20 dịch vụ trong một đơn' })
    @ValidateNested({ each: true })
    @Type(() => BookingServiceItemDto)
    services?: BookingServiceItemDto[];
}
