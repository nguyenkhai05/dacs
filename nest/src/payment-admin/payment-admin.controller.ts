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
    StreamableFile,
    UseGuards,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
    ConfirmRefundDto,
    FailRefundDto,
    PaymentOverviewQueryDto,
    ReconciliationQueryDto,
    RefundListQueryDto,
    ResolveReconciliationDto,
    TransactionsQueryDto,
    UpdateRefundAccountDto,
} from './dto/payment-admin.dto.js';
import { PaymentAdminService } from './payment-admin.service.js';

// Màn Admin > Thanh toán & hoàn cọc - chỉ dành cho nhân viên và quản trị viên
@Controller('admin/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Staff')
export class PaymentAdminController {
    constructor(private readonly paymentAdminService: PaymentAdminService) { }

    // 3 thẻ đầu trang: thu thành công / hoàn thành công / doanh thu thuần của ngày
    @Get('overview')
    getOverview(@Query() query: PaymentOverviewQueryDto) {
        return this.paymentAdminService.getOverview(query.date);
    }

    // Sổ giao dịch (thu + hoàn + chuyển khoản chưa khớp), có lọc và phân trang
    @Get('transactions')
    listTransactions(@Query() query: TransactionsQueryDto) {
        return this.paymentAdminService.listTransactions(query);
    }

    // Nút "Xuất CSV" (cùng bộ lọc với sổ giao dịch)
    @Get('transactions/export')
    async exportTransactions(@Query() query: TransactionsQueryDto) {
        const { filename, csv } = await this.paymentAdminService.exportTransactions(query);

        return new StreamableFile(Buffer.from(csv, 'utf8'), {
            type: 'text/csv; charset=utf-8',
            disposition: `attachment; filename="${filename}"`,
        });
    }

    // Hàng đợi đối soát thủ công
    @Get('reconciliations')
    listReconciliations(@Query() query: ReconciliationQueryDto) {
        return this.paymentAdminService.listReconciliations(query);
    }

    @Post('reconciliations/:id/resolve')
    @HttpCode(200)
    resolveReconciliation(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ResolveReconciliationDto,
        @CurrentUser() staff: AuthUser,
    ) {
        return this.paymentAdminService.resolveReconciliation(id, dto, staff);
    }

    // Danh sách yêu cầu hoàn cọc (mặc định: đang chờ + thất bại cần chuyển lại)
    @Get('refunds')
    listRefunds(@Query() query: RefundListQueryDto) {
        return this.paymentAdminService.listRefunds(query);
    }

    // Khung "Hoàn cọc đang chờ" + "Hóa đơn & kết quả hoàn"
    @Get('refunds/:id')
    getRefund(@Param('id', ParseIntPipe) id: number) {
        return this.paymentAdminService.getRefund(id);
    }

    @Patch('refunds/:id/account')
    updateRefundAccount(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateRefundAccountDto,
        @CurrentUser() staff: AuthUser,
    ) {
        return this.paymentAdminService.updateRefundAccount(id, dto, staff);
    }

    // Nút "Xác nhận đã hoàn thành công"
    @Post('refunds/:id/confirm')
    @HttpCode(200)
    confirmRefund(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ConfirmRefundDto,
        @CurrentUser() staff: AuthUser,
    ) {
        return this.paymentAdminService.confirmRefund(id, dto, staff);
    }

    // Nút "Ghi nhận Thất bại"
    @Post('refunds/:id/fail')
    @HttpCode(200)
    failRefund(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: FailRefundDto,
        @CurrentUser() staff: AuthUser,
    ) {
        return this.paymentAdminService.failRefund(id, dto, staff);
    }
}
