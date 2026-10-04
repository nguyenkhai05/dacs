
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface Pitch {
  pitch_id: number;
  pitch_name: string;
  category_name: string | null;
  status: string;
}

export interface PitchDetail extends Pitch {
  category_id: number | null;
  notes: string | null;
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

  async findOne(id: number): Promise<PitchDetail> {
    const sql = `
            SELECT
                p.pitch_id,
                p.pitch_name,
                p.category_id,
                pc.category_name,
                p.status,
                p.notes
            FROM pitches p
            LEFT JOIN pitch_categories pc
                ON p.category_id = pc.category_id
            WHERE p.pitch_id = ?
            LIMIT 1
        `;

    const pitches = await this.database.query<PitchDetail[]>(
      sql,
      [id],
    );

    const pitch = pitches[0];

    if (!pitch) {
      throw new NotFoundException(
        `Không tìm thấy sân có ID ${id}`,
      );
    }

    return pitch;
  }
}