
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface ServiceItem {
    service_id: number;
    service_name: string;
    unit: string;
    price: string | number;
    stock_quantity: number;
    is_active: number;
}

@Injectable()
export class ServicesService {
    constructor(
        private readonly databaseService: DatabaseService,
    ) { }

    async findAllActive(): Promise<ServiceItem[]> {
        const sql = `
            SELECT
                service_id,
                service_name,
                unit,
                price,
                stock_quantity,
                is_active
            FROM services
            WHERE is_active = 1
            ORDER BY service_id ASC
        `;

        return this.databaseService.query<ServiceItem[]>(sql);
    }
}