import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { DashboardService } from './dashboard.service.js';
import { OverviewQueryDto } from './dto/overview-query.dto.js';

// Màn 13 - chỉ dành cho nhân viên và quản trị viên
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Staff')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    // KPI + biểu đồ + đơn mới nhất + lượt sân sắp diễn ra
    @Get('overview')
    getOverview(@Query() query: OverviewQueryDto) {
        return this.dashboardService.getOverview(query.date, query.view);
    }
}
