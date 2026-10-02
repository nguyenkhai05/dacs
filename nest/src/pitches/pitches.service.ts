
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface Pitch {
    pitch_id: number;
    pitch_name: string;
    category_name: string | null;
    status: string;
}

@Injectable()
export class PitchesService {
    constructor(private readonly database: DatabaseService) { }

    async findAll(): Promise<Pitch[]> {
        const sql = `
      SELECT
        p.pitch_id,
        p.pitch_name,
        pc.category_name,
        p.status
      FROM pitches p
      LEFT JOIN pitch_categories pc
        ON p.category_id = pc.category_id
      ORDER BY p.pitch_id ASC
    `;

        return this.database.query<Pitch[]>(sql);
    }
}