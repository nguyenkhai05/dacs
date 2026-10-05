
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { PitchesController } from './pitches.controller.js';
import { PitchesService } from './pitches.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [PitchesController],
  providers: [PitchesService],
})
export class PitchesModule { }