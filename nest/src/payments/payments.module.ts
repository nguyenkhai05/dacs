import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { PaymentExpiryService } from './payment-expiry.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [PaymentsController],
    providers: [PaymentsService, PaymentExpiryService],
    exports: [PaymentsService],
})
export class PaymentsModule { }
