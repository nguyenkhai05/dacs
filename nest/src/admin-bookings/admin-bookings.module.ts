import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AdminBookingsController } from './admin-bookings.controller.js';
import { AdminBookingsService } from './admin-bookings.service.js';

@Module({
    imports: [DatabaseModule, AuthModule, BookingsModule],
    controllers: [AdminBookingsController],
    providers: [AdminBookingsService],
})
export class AdminBookingsModule { }
