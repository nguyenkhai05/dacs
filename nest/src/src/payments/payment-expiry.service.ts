import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';

import { PaymentsService } from './payments.service.js';

const SWEEP_INTERVAL_MS = 60_000;

// Định kỳ hủy các đơn Pending quá hạn giữ chỗ để nhả sân cho người khác.
// Tắt bằng PAYMENT_SWEEP_ENABLED=false trong .env.
@Injectable()
export class PaymentExpiryService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PaymentExpiryService.name);
    private timer?: NodeJS.Timeout;
    private running = false;

    constructor(private readonly payments: PaymentsService) { }

    onModuleInit(): void {
        if (!this.payments.sweepEnabled) {
            this.logger.log('Tắt tự động hủy đơn hết hạn (PAYMENT_SWEEP_ENABLED=false)');
            return;
        }

        this.timer = setInterval(() => void this.run(), SWEEP_INTERVAL_MS);
        this.timer.unref();
    }

    onModuleDestroy(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    async run(): Promise<void> {
        if (this.running) {
            return;
        }

        this.running = true;
        try {
            await this.payments.expireUnpaidBookings();
        } catch (error) {
            this.logger.error('Lỗi khi hủy đơn hết hạn', error as Error);
        } finally {
            this.running = false;
        }
    }
}
