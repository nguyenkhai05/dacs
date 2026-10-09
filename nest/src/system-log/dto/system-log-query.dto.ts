import { Type } from 'class-transformer';
import {
    IsIn,
    IsInt,
    IsOptional,
    Matches,
    Max,
    Min,
} from 'class-validator';

export const CHANGE_TYPES = ['booking', 'pitch', 'price'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export class SystemLogQueryDto {
    /** Lọc theo người thực hiện (user_id). Bỏ trống = tất cả. */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'actor_id phải là số nguyên' })
    @Min(1)
    actor_id?: number;

    /** booking | pitch | price. Bỏ trống = tất cả. */
    @IsOptional()
    @IsIn(CHANGE_TYPES, {
        message: 'change_type chỉ nhận booking, pitch hoặc price',
    })
    change_type?: ChangeType;

    /** Ngày bắt đầu (YYYY-MM-DD), inclusive, theo giờ VN. */
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'from phải có dạng YYYY-MM-DD',
    })
    from?: string;

    /** Ngày kết thúc (YYYY-MM-DD), inclusive, theo giờ VN. */
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'to phải có dạng YYYY-MM-DD',
    })
    to?: string;

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
