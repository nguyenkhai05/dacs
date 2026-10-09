import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
    CreateServiceDto,
    ListAdminServicesQueryDto,
    UpdateServiceDto,
    UpdateServiceStatusDto,
} from './dto/service-admin.dto.js';
import { ServiceAdminService } from './service-admin.service.js';

// Màn Dịch vụ đi kèm (Admin). Admin + Staff được xem, thao tác ghi cần Admin.
// Cố ý KHÔNG có DELETE: dịch vụ đã dùng chỉ được chuyển sang Ngừng hoạt động.
@Controller('admin/services')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Staff')
export class ServiceAdminController {
    constructor(private readonly service: ServiceAdminService) { }

    @Get()
    list(@Query() query: ListAdminServicesQueryDto) {
        return this.service.list(query);
    }

    @Get(':id')
    get(@Param('id', ParseIntPipe) id: number) {
        return this.service.get(id);
    }

    @Get(':id/history')
    history(@Param('id', ParseIntPipe) id: number) {
        return this.service.history(id);
    }

    @Post()
    @Roles('Admin')
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceDto) {
        return this.service.create(Number(user.sub), dto);
    }

    @Patch(':id')
    @Roles('Admin')
    update(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateServiceDto,
    ) {
        return this.service.update(Number(user.sub), id, dto);
    }

    @Patch(':id/status')
    @Roles('Admin')
    changeStatus(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateServiceStatusDto,
    ) {
        return this.service.changeStatus(Number(user.sub), id, dto.is_active);
    }
}
