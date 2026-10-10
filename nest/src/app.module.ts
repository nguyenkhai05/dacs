import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdminBookingsModule } from './admin-bookings/admin-bookings.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HomeModule } from './home/home.module.js';
import { PaymentAdminModule } from './payment-admin/payment-admin.module.js';
import { PitchAdminModule } from './pitch-admin/pitch-admin.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { PitchesModule } from './pitches/pitches.module.js';
import { ServiceAdminModule } from './service-admin/service-admin.module.js';
import { ServicesModule } from './services/services.module.js';
import { SystemLogModule } from './system-log/system-log.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PitchesModule,
    AuthModule,
    HomeModule,
    ServicesModule,
    BookingsModule,
    PaymentsModule,
    UsersModule,
    ReviewsModule,
    DashboardModule,
    PitchAdminModule,
    ServiceAdminModule,
    SystemLogModule,
    AdminBookingsModule,
    PaymentAdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

