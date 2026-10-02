
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PitchesModule } from './pitches/pitches.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'dacs',
    }),

    ConfigModule.forRoot({
      isGlobal: true,
    }),

    PitchesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }