import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

/** Thông tin sân hiển thị CÔNG KHAI (không có ghi chú nội bộ, không có sân đã ngưng hoạt động). */
export interface Pitch {
  pitch_id: number;
  pitch_name: string;
  category_name: string | null;
  status: string;
  image_url: string | null;
  surface_type: string | null;
  district: string | null;
}

export interface PitchDetail extends Pitch {
  category_id: number | null;
  address: string | null;
  amenities: string[] | null;
  rating_avg: number | null;
  review_count: number;
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
                p.status,
                p.image_url,
                p.surface_type,
                p.district
            FROM pitches p
            LEFT JOIN pitch_categories pc
                ON p.category_id = pc.category_id
            WHERE p.status <> 'Inactive'
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
                p.image_url,
                p.surface_type,
                p.address,
                p.district,
                p.amenities,
                (
                    SELECT ROUND(AVG(r.rating), 1)
                    FROM reviews r
                    WHERE r.pitch_id = p.pitch_id
                ) AS rating_avg,
                (
                    SELECT COUNT(*)
                    FROM reviews r
                    WHERE r.pitch_id = p.pitch_id
                ) AS review_count
            FROM pitches p
            LEFT JOIN pitch_categories pc
                ON p.category_id = pc.category_id
            WHERE p.pitch_id = ?
              AND p.status <> 'Inactive'
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

    return {
      ...pitch,
      rating_avg: pitch.rating_avg == null ? null : Number(pitch.rating_avg),
      review_count: Number(pitch.review_count ?? 0),
    };
  }
}
