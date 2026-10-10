import {
    Body,
    Controller,
    Get,
    HttpCode,
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
    CreateStaffDto,
    ListCustomersQueryDto,
    UpdateCustomerNoteDto,
    UpdateCustomerStatusDto,
    UpdateStaffRoleDto,
} from './dto/user-admin.dto.js';
import { UserAdminService } from './user-admin.service.js';

// Màn 18 - Người dùng. CHỈ Admin được truy cập (nhân viên không thấy menu này).
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class UserAdminController {
    constructor(private readonly service: UserAdminService) { }

    // ---- Tab "Khách hàng" ------------------------------------------

    @Get('customers')
    listCustomers(@Query() query: ListCustomersQueryDto) {
        return this.service.listCustomers(query);
    }

    @Get('customers/:id')
    getCustomer(@Param('id', ParseIntPipe) id: number) {
        return this.service.getCustomer(id);
    }

    @Patch('customers/:id/note')
    updateNote(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCustomerNoteDto,
    ) {
        return this.service.updateCustomerNote(Number(user.sub), id, dto.note);
    }

    @Patch('customers/:id/status')
    changeStatus(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCustomerStatusDto,
    ) {
        return this.service.changeCustomerStatus(Number(user.sub), id, dto.is_active, dto.reason);
    }

    // ---- Tab "Nhân viên & vai trò" ---------------------------------

    @Get('staff')
    listStaff() {
        return this.service.listStaff();
    }

    @Post('staff')
    createStaff(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
        return this.service.createStaff(Number(user.sub), dto);
    }

    @Patch('staff/:id/role')
    changeRole(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateStaffRoleDto,
    ) {
        return this.service.changeStaffRole(Number(user.sub), id, dto.role);
    }

    @Post('staff/:id/resend-invite')
    @HttpCode(200)
    resendInvite(@Param('id', ParseIntPipe) id: number) {
        return this.service.resendInvite(id);
    }
}
