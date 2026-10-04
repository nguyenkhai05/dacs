
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ServicesController } from './services.controller.js';
import { ServicesService } from './services.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule { }