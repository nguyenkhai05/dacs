
import {
    Controller,
    Get,
    Param,
    ParseIntPipe,
} from '@nestjs/common';
import { PitchesService } from './pitches.service.js';

@Controller('pitches')
export class PitchesController {
    constructor(
        private readonly pitchesService: PitchesService,
    ) { }

    @Get()
    findAll() {
        return this.pitchesService.findAll();
    }

    @Get(':id')
    findOne(
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.pitchesService.findOne(id);
    }
}