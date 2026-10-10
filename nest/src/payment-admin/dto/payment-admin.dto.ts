import { Transform, Type } from 'class-transformer';
import {
    IsIn,
    IsInt,
    IsISO8601,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const LEDGER_STATUSES = ['Successful', 'Pending', 'Failed'] as const;
export const LEDGER_METHODS = ['Banking', 'Cash', 'Momo', 'VNPay'] as const;
export const LEDGER_TYPES = ['Deposit', 'Balance', 'Refund', 'Unmatched'] as const;
export const REFUND_FILTERS = ['open', 'failed', 'done', 'all'] as const;
export const RECONCILE_ACTIONS = ['apply_to_booking', 'request_refund', 'dismiss'] as const;
export const RECONCILE_FILTERS = ['Open', 'Resolved', 'Dismissed'] as const;

export class PaymentOverviewQueryDto {
    // Ngày xem (YYYY-MM-DD, giờ Việt Nam). Bỏ trống = hôm nay.
    @IsOptional()
    @Matches(DATE_PATTERN, { message: 'date phải có dạng YYYY-MM-DD' })
    date?: string;
}

export class TransactionsQueryDto extends PaymentOverviewQueryDto {
    @IsOptional()
    @IsIn(LEDGER_STATUSES, { message: 'status phải là Successful, Pending hoặc Failed' })
    status?: (typeof LEDGER_STATUSES)[number];

    @IsOptional()
    @IsIn(LEDGER_METHODS, { message: 'method phải là Banking, Cash, Momo hoặc VNPay' })
    method?: (typeof LEDGER_METHODS)[number];

    @IsOptional()
    @IsIn(LEDGER_TYPES, { message: 'type phải là Deposit, Balance, Refund hoặc Unmatched' })
    type?: (typeof LEDGER_TYPES)[number];

    // Tìm theo mã booking (DS123), tên/SĐT khách hoặc mã giao dịch
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
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
    @Max(100)
    limit?: number;
}

export class ReconciliationQueryDto {
    @IsOptional()
    @IsIn(RECONCILE_FILTERS, { message: 'status phải là Open, Resolved hoặc Dismissed' })
    status?: (typeof RECONCILE_FILTERS)[number];

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class ResolveReconciliationDto {
    @IsIn(RECONCILE_ACTIONS, {
        message: 'action phải là apply_to_booking, request_refund hoặc dismiss',
    })
    action: (typeof RECONCILE_ACTIONS)[number];

    // Chỉ dùng cho apply_to_booking: số tiền khách chuyển bổ sung ngoài hệ thống
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'extra_amount phải là số nguyên' })
    @Min(0, { message: 'extra_amount không được âm' })
    @Max(99_999_999)
    extra_amount?: number;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
    note?: string;
}

export class RefundListQueryDto {
    // open = chờ hoàn + hoàn thất bại cần xử lý lại
    @IsOptional()
    @IsIn(REFUND_FILTERS, { message: 'status phải là open, failed, done hoặc all' })
    status?: (typeof REFUND_FILTERS)[number];

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

export class UpdateRefundAccountDto {
    @Transform(trim)
    @IsString()
    @MinLength(2, { message: 'Tên ngân hàng quá ngắn' })
    @MaxLength(100, { message: 'Tên ngân hàng tối đa 100 ký tự' })
    bank_name: string;

    // Bỏ khoảng trắng/dấu gạch: "8888 7766 55" -> "8888776655"
    @Transform(({ value }) =>
        typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
    )
    @Matches(/^\d{6,30}$/, { message: 'Số tài khoản phải gồm 6-30 chữ số' })
    bank_account_number: string;

    @Transform(trim)
    @IsString()
    @MinLength(2, { message: 'Tên chủ tài khoản quá ngắn' })
    @MaxLength(100, { message: 'Tên chủ tài khoản tối đa 100 ký tự' })
    bank_account_name: string;
}

export class ConfirmRefundDto {
    // Mã giao dịch ngân hàng sau khi nhân viên tự chuyển tiền
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Mã giao dịch không được để trống' })
    @Matches(/^[A-Za-z0-9._\-/]{4,100}$/, {
        message: 'Mã giao dịch gồm 4-100 ký tự chữ, số, . _ - /',
    })
    transaction_code: string;

    // Thời điểm chuyển tiền (ISO 8601). Bỏ trống = bây giờ.
    @IsOptional()
    @IsISO8601({ strict: true }, { message: 'transferred_at phải là thời gian ISO 8601' })
    transferred_at?: string;
}

export class FailRefundDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Hãy nhập lý do thất bại' })
    @MinLength(3, { message: 'Lý do quá ngắn' })
    @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
    reason: string;
}
