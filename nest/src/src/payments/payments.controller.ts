import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
    UseGuards,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { BankWebhookDto } from './dto/bank-webhook.dto.js';
import { CreateDepositDto } from './dto/create-deposit.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    // Màn "Thanh toán cọc": tạo/lấy lại QR + thông tin chuyển khoản
    @Post('deposit')
    @UseGuards(JwtAuthGuard)
    createDeposit(
        @Body() dto: CreateDepositDto,
        @CurrentUser() user: AuthUser,
    ) {
        return this.paymentsService.createDeposit(dto.booking_id, user);
    }

    // Frontend gọi lặp lại (vd 3 giây/lần) sau khi bấm "Tôi đã chuyển khoản"
    @Get('deposit/:bookingId')
    @UseGuards(JwtAuthGuard)
    getDeposit(
        @Param('bookingId', ParseIntPipe) bookingId: number,
        @CurrentUser() user: AuthUser,
    ) {
        return this.paymentsService.getDeposit(bookingId, user);
    }

    // Ngân hàng/nhà cung cấp gọi vào khi có tiền về (xác thực bằng secret)
    @Post('webhook/bank')
    @HttpCode(200)
    async bankWebhook(
        @Headers('x-webhook-secret') secret: string | undefined,
        @Body() dto: BankWebhookDto,
    ) {
        this.paymentsService.verifyWebhookSecret(secret);
        const result = await this.paymentsService.handleBankWebhook(dto);
        // Luôn trả 200 để nhà cung cấp không gửi lại vô hạn; chi tiết nằm trong body
        return { success: true, ...result };
    }

    // Nhân viên/Admin xác nhận thủ công khi đã thấy tiền về tài khoản
    @Post(':paymentId/confirm')
    @HttpCode(200)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('Admin', 'Staff')
    confirm(
        @Param('paymentId', ParseIntPipe) paymentId: number,
        @CurrentUser() staff: AuthUser,
    ) {
        return this.paymentsService.confirmByStaff(paymentId, staff);
    }
}
