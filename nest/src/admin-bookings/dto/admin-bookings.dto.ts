import { Transform, Type } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

import { QuoteBookingDto } from '../../bookings/dto/quote-booking.dto.js';
import {
    BOOKING_STATUSES,
    normalizePhone,
} from '../admin-bookings.utils.js';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

// "0916 333 555" / "+84916333555" -> "0916333555" trước khi kiểm tra
const phoneTransform = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? (normalizePhone(value) ?? value.trim()) : value;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

// ----- Bảng danh sách
export class ListAdminBookingsQueryDto {
    // Ngày đá (YYYY-MM-DD). Bỏ trống = hôm nay.
    @IsOptional()
    @Matches(DATE_PATTERN, { message: 'date phải có dạng YYYY-MM-DD' })
    date?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'pitch_id phải là số nguyên' })
    @Min(1, { message: 'pitch_id không hợp lệ' })
    pitch_id?: number;

    @IsOptional()
    @IsIn([...BOOKING_STATUSES], { message: 'status không hợp lệ' })
    status?: string;

    // Tên khách, số điện thoại (cả một phần) hoặc mã đơn (DS123)
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100, { message: 'Từ khóa tìm kiếm tối đa 100 ký tự' })
    q?: string;

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

// ----- Chế độ Lịch
export class ScheduleQueryDto {
    @IsOptional()
    @Matches(DATE_PATTERN, { message: 'date phải có dạng YYYY-MM-DD' })
    date?: string;

    // Cửa sổ giờ hiển thị (HH:mm). Bỏ trống = theo bảng giá của các sân.
    @IsOptional()
    @Matches(TIME_PATTERN, { message: 'from phải có dạng HH:mm' })
    from?: string;

    @IsOptional()
    @Matches(TIME_PATTERN, { message: 'to phải có dạng HH:mm' })
    to?: string;
}

// ----- Thu tiền mặt
export class CollectCashDto {
    @Type(() => Number)
    @IsNumber(
        { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
        { message: 'Số tiền không hợp lệ' },
    )
    @Min(1, { message: 'Số tiền phải lớn hơn 0' })
    @Max(99_999_999, { message: 'Số tiền quá lớn' })
    amount: number;
}

// ----- Hủy / không đến
export class StaffCancelDto {
    // Bắt buộc khi đơn đã có tiền (kiểm tra ở service)
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
    reason?: string;

    // true = lỗi từ phía sân (bảo trì...), hoàn 100% số đã thu
    @IsOptional()
    @IsBoolean({ message: 'full_refund phải là true hoặc false' })
    full_refund?: boolean;
}

export class NoShowDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
    reason?: string;
}

// ----- Đặt tại quầy
export class CounterQuoteDto extends QuoteBookingDto {
    // Nếu có, trả về khách đã có tài khoản khớp số điện thoại
    @IsOptional()
    @Transform(phoneTransform)
    @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại không hợp lệ' })
    phone_number?: string;
}

export const PAYMENT_MODES = ['full', 'deposit'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export class CreateCounterBookingDto extends QuoteBookingDto {
    @Transform(trim)
    @IsString({ message: 'Tên khách là bắt buộc' })
    @MinLength(2, { message: 'Tên khách tối thiểu 2 ký tự' })
    @MaxLength(100, { message: 'Tên khách tối đa 100 ký tự' })
    customer_name: string;

    @Transform(phoneTransform)
    @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại không hợp lệ' })
    phone_number: string;

    // full = thu toàn bộ tiền mặt, deposit = chỉ thu phần cọc (còn lại thu tại sân)
    @IsIn([...PAYMENT_MODES], {
        message: 'payment_mode phải là full hoặc deposit',
    })
    payment_mode: PaymentMode;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(5000)
    customer_note?: string;
}
