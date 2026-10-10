import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PaymentAdminController } from './payment-admin.controller.js';
import { PaymentAdminService } from './payment-admin.service.js';

@Module({
    imports: [DatabaseModule, AuthModule, PaymentsModule],
    controllers: [PaymentAdminController],
    providers: [PaymentAdminService],
})
export class PaymentAdminModule { }
