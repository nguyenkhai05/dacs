
import { Controller, Get } from '@nestjs/common';
import { ServicesService } from './services.service.js';

@Controller('services')
export class ServicesController {
    constructor(
        private readonly servicesService: ServicesService,
    ) { }

    @Get()
    async findAll() {
        return this.servicesService.findAllActive();
    }
}