import { IsIn, IsOptional, Matches } from 'class-validator';

export const REPORT_PERIODS = ['day', 'week', 'month'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_GROUPS = ['pitch', 'category'] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
    // day = đúng ngày `date`; week = T2-CN chứa `date`; month = cả tháng chứa `date`
    @IsOptional()
    @IsIn(REPORT_PERIODS, { message: 'period chỉ nhận day, week hoặc month' })
    period?: ReportPeriod;

    // Ngày làm mốc, YYYY-MM-DD. Bỏ trống = hôm nay (giờ Việt Nam).
    @IsOptional()
    @Matches(DATE_PATTERN, { message: 'date phải có dạng YYYY-MM-DD' })
    date?: string;

    @IsOptional()
    @IsIn(REPORT_GROUPS, { message: 'group_by chỉ nhận pitch hoặc category' })
    group_by?: ReportGroup;
}

export class RevenueTrendQueryDto {
    // Ngày cuối của khoảng 7 ngày, YYYY-MM-DD. Bỏ trống = hôm nay (giờ Việt Nam).
    @IsOptional()
    @Matches(DATE_PATTERN, { message: 'date phải có dạng YYYY-MM-DD' })
    date?: string;
}
