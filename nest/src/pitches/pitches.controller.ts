
import { Controller, Get } from '@nestjs/common';
import { PitchesService } from './pitches.service.js';

@Controller('pitches')
export class PitchesController {
    constructor(private readonly pitchesService: PitchesService) { }

    @Get()
    findAll() {
        return this.pitchesService.findAll();
    }
}