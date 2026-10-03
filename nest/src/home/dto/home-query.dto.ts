import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

export class HomeQueryDto {
    // Ngày muốn xem, định dạng YYYY-MM-DD. Bỏ trống = hôm nay.
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'date phải có dạng YYYY-MM-DD',
    })
    date?: string;

    // Loại sân (pitch_categories.category_id). Bỏ trống = tất cả.
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'category_id phải là số nguyên' })
    @Min(1, { message: 'category_id không hợp lệ' })
    category_id?: number;
}
