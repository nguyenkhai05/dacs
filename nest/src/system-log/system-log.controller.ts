import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { SystemLogQueryDto } from './dto/system-log-query.dto.js';
import { SystemLogService } from './system-log.service.js';

// Issue #22 — Nhật ký hệ thống (chỉ đọc).
// Hợp nhất lịch sử booking / sân / bảng giá. Admin + Staff được xem.
@Controller('admin/system-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Staff')
export class SystemLogController {
    constructor(private readonly systemLogService: SystemLogService) {}

    /** Danh sách nhật ký có filter + phân trang. */
    @Get()
    list(@Query() query: SystemLogQueryDto) {
        return this.systemLogService.list(query);
    }

    /** Danh sách người đã từng thao tác — dùng cho dropdown filter. */
    @Get('actors')
    listActors() {
        return this.systemLogService.listActors();
    }
}
