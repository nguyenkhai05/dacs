import { Controller, Get, Query, StreamableFile, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { DashboardService } from './dashboard.service.js';
import { OverviewQueryDto } from './dto/overview-query.dto.js';
import { ReportQueryDto, RevenueTrendQueryDto } from './dto/report-query.dto.js';
import { ReportService } from './report.service.js';

// Màn 13 - chỉ dành cho nhân viên và quản trị viên
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Staff')
export class DashboardController {
    constructor(
        private readonly dashboardService: DashboardService,
        private readonly reportService: ReportService,
    ) { }

    // KPI + biểu đồ + đơn mới nhất + lượt sân sắp diễn ra
    @Get('overview')
    getOverview(@Query() query: OverviewQueryDto) {
        return this.dashboardService.getOverview(query.date, query.view);
    }

    // Doanh thu thuần 7 ngày (thu − hoàn theo ngày giao dịch) + tách thu/hoàn từng ngày
    @Get('revenue')
    getRevenueTrend(@Query() query: RevenueTrendQueryDto) {
        return this.reportService.getRevenueTrend(query.date);
    }

    // Tab "Báo cáo": bảng theo sân/loại sân, giờ cao điểm, tỷ lệ hủy / không đến
    @Get('report')
    getReport(@Query() query: ReportQueryDto) {
        return this.reportService.getReport(query.period, query.date, query.group_by);
    }

    // Nút "Xuất CSV" (cùng bộ lọc với tab Báo cáo)
    @Get('report/export')
    async exportReport(@Query() query: ReportQueryDto) {
        const { filename, csv } = await this.reportService.exportReport(
            query.period,
            query.date,
            query.group_by,
        );

        return new StreamableFile(Buffer.from(csv, 'utf8'), {
            type: 'text/csv; charset=utf-8',
            disposition: `attachment; filename="${filename}"`,
        });
    }
}
