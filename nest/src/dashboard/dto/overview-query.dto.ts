import { IsIn, IsOptional, Matches } from 'class-validator';

export const CHART_VIEWS = ['day', 'week'] as const;
export type ChartView = (typeof CHART_VIEWS)[number];

export class OverviewQueryDto {
    // Ngày muốn xem, YYYY-MM-DD. Bỏ trống = hôm nay (giờ Việt Nam).
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'date phải có dạng YYYY-MM-DD',
    })
    date?: string;

    // day: biểu đồ theo khung giờ trong ngày; week: theo 7 ngày (T2-CN) chứa `date`
    @IsOptional()
    @IsIn(CHART_VIEWS, { message: 'view chỉ nhận day hoặc week' })
    view?: ChartView;
}
