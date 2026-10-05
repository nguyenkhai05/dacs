import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { HomeController } from './home.controller.js';
import { HomeService } from './home.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule { }
