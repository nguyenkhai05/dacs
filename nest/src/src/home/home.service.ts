import { BadRequestException, Injectable } from '@nestjs/common';

import { getVietnamNow } from '../common/time.util.js';
import { DatabaseService } from '../database/database.service.js';
import type { PitchSort } from './dto/home-query.dto.js';

const FEATURED_LIMIT = 3;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

// Các trạng thái booking đang chiếm sân (khớp với trigger trong DB)
const ACTIVE_BOOKING_STATUSES = `'Pending','Confirmed','CheckedIn','Playing'`;

export interface PitchCategory {
    category_id: number;
    category_name: string;
    description: string | null;
}

export interface PitchSearchFilters {
    date?: string;
    category_id?: number;
    q?: string;
    district?: string;
    min_price?: number;
    max_price?: number;
    amenities?: string[];
    sort?: PitchSort;
    page?: number;
    limit?: number;
}

const ORDER_BY: Record<PitchSort, string> = {
    available: 'free_slots > 0 DESC, p.pitch_id ASC',
    price_asc: 'price_from IS NULL, price_from ASC, p.pitch_id ASC',
    price_desc: 'price_from IS NULL, price_from DESC, p.pitch_id ASC',
};

export interface PitchCard {
    pitch_id: number;
    pitch_name: string;
    image_url: string | null;
    surface_type: string;
    category_id: number;
    category_name: string;
    price_from: number | null; // giá/giờ thấp nhất của loại sân
    free_slots: number; // số khung giờ còn trống trong ngày
    availability: 'Available' | 'Full';
}

interface PitchCardRow {
    pitch_id: number;
    pitch_name: string;
    image_url: string | null;
    surface_type: string;
    category_id: number;
    category_name: string;
    price_from: string | number | null; // DECIMAL của mysql2 trả về string
    free_slots: string | number;
}

@Injectable()
export class HomeService {
    constructor(private readonly database: DatabaseService) { }

    async getHome(date?: string) {
        const day = this.resolveDate(date);

        const [categories, featured] = await Promise.all([
            this.findCategories(),
            this.findPitchCards(day, {}, FEATURED_LIMIT, 0),
        ]);

        return {
            date: day,
            categories,
            featured_pitches: featured,
        };
    }

    async searchPitches(filters: PitchSearchFilters = {}) {
        const day = this.resolveDate(filters.date);

        if (
            filters.min_price !== undefined &&
            filters.max_price !== undefined &&
            filters.min_price > filters.max_price
        ) {
            throw new BadRequestException(
                'min_price không được lớn hơn max_price',
            );
        }

        const limit = Math.min(
            Math.max(1, Math.floor(filters.limit ?? DEFAULT_PAGE_SIZE)),
            MAX_PAGE_SIZE,
        );
        const page = Math.max(1, Math.floor(filters.page ?? 1));

        const [pitches, total] = await Promise.all([
            this.findPitchCards(day, filters, limit, (page - 1) * limit),
            this.countPitches(filters),
        ]);

        return {
            date: day,
            category_id: filters.category_id ?? null,
            page,
            limit,
            total,
            total_pages: Math.max(1, Math.ceil(total / limit)),
            pitches,
        };
    }

    private findCategories(): Promise<PitchCategory[]> {
        return this.database.query<PitchCategory[]>(
            `
      SELECT category_id, category_name, description
      FROM pitch_categories
      WHERE is_active = TRUE
      ORDER BY category_id ASC
    `,
        );
    }

    /**
     * Một khung giá (price_slots) được coi là một "ca".
     * Ca còn trống = chưa kết thúc (nếu là hôm nay) và không có booking
     * đang hoạt động nào chồng lấn với ca đó.
     */
    private async findPitchCards(
        date: string,
        filters: PitchSearchFilters,
        limit: number,
        offset: number,
    ): Promise<PitchCard[]> {
        const now = this.getVietnamNow();
        const cutoffTime = date === now.date ? now.time : '00:00:00';
        const safeLimit = Math.max(1, Math.floor(limit)); // chèn thẳng vào SQL nên phải ép số
        const safeOffset = Math.max(0, Math.floor(offset));
        const where = this.buildWhere(filters);
        const orderBy = ORDER_BY[filters.sort ?? 'available'];

        const rows = await this.database.query<PitchCardRow[]>(
            `
      SELECT
        p.pitch_id,
        p.pitch_name,
        p.image_url,
        p.surface_type,
        pc.category_id,
        pc.category_name,
        (
          SELECT MIN(ps.price_per_hour)
          FROM price_slots ps
          WHERE ps.category_id = p.category_id
        ) AS price_from,
        (
          SELECT COUNT(*)
          FROM price_slots ps
          WHERE ps.category_id = p.category_id
            AND ps.end_time > ?
            AND NOT EXISTS (
              SELECT 1
              FROM bookings b
              WHERE b.pitch_id = p.pitch_id
                AND b.booking_date = ?
                AND b.status IN (${ACTIVE_BOOKING_STATUSES})
                AND b.start_time < ps.end_time
                AND b.end_time > ps.start_time
            )
        ) AS free_slots
      FROM pitches p
      JOIN pitch_categories pc
        ON pc.category_id = p.category_id
       AND pc.is_active = TRUE
      WHERE ${where.sql}
      ORDER BY ${orderBy}
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `,
            [cutoffTime, date, ...where.params],
        );

        return rows.map((row) => {
            const freeSlots = Number(row.free_slots);

            return {
                pitch_id: row.pitch_id,
                pitch_name: row.pitch_name,
                image_url: row.image_url,
                surface_type: row.surface_type,
                category_id: row.category_id,
                category_name: row.category_name,
                price_from:
                    row.price_from === null ? null : Number(row.price_from),
                free_slots: freeSlots,
                availability: freeSlots > 0 ? 'Available' : 'Full',
            };
        });
    }

    private async countPitches(
        filters: PitchSearchFilters,
    ): Promise<number> {
        const where = this.buildWhere(filters);
        const rows = await this.database.query<{ total: string | number }[]>(
            `
      SELECT COUNT(*) AS total
      FROM pitches p
      JOIN pitch_categories pc
        ON pc.category_id = p.category_id
       AND pc.is_active = TRUE
      WHERE ${where.sql}
    `,
            where.params,
        );

        return Number(rows[0]?.total ?? 0);
    }

    // Điều kiện lọc dùng chung cho danh sách và đếm tổng.
    // Cột district/amenities chỉ được đụng tới khi người dùng thật sự lọc,
    // nên chưa chạy migration 003 thì các bộ lọc còn lại vẫn hoạt động.
    private buildWhere(filters: PitchSearchFilters): {
        sql: string;
        params: (string | number)[];
    } {
        const clauses: string[] = [`p.status = 'Available'`];
        const params: (string | number)[] = [];

        if (filters.category_id !== undefined) {
            clauses.push('p.category_id = ?');
            params.push(filters.category_id);
        }

        if (filters.q) {
            clauses.push(`p.pitch_name LIKE ? ESCAPE '!'`);
            params.push(`%${escapeLike(filters.q.trim())}%`);
        }

        if (filters.district) {
            clauses.push('p.district = ?');
            params.push(filters.district.trim());
        }

        const priceSql = `(
          SELECT MIN(ps.price_per_hour)
          FROM price_slots ps
          WHERE ps.category_id = p.category_id
        )`;

        if (filters.min_price !== undefined) {
            clauses.push(`${priceSql} >= ?`);
            params.push(filters.min_price);
        }

        if (filters.max_price !== undefined) {
            clauses.push(`${priceSql} <= ?`);
            params.push(filters.max_price);
        }

        for (const amenity of filters.amenities ?? []) {
            clauses.push('JSON_CONTAINS(p.amenities, JSON_QUOTE(?))');
            params.push(amenity);
        }

        return { sql: clauses.join('\n        AND '), params };
    }

    // Chuẩn hóa ngày: mặc định hôm nay (giờ Việt Nam), không cho ngày quá khứ
    private resolveDate(date?: string): string {
        const today = this.getVietnamNow().date;

        if (!date) {
            return today;
        }

        const parsed = new Date(`${date}T00:00:00Z`);
        const isRealDate =
            !Number.isNaN(parsed.getTime()) &&
            parsed.toISOString().slice(0, 10) === date;

        if (!isRealDate) {
            throw new BadRequestException('Ngày không hợp lệ');
        }

        if (date < today) {
            throw new BadRequestException(
                'Không thể tìm sân ở ngày đã qua',
            );
        }

        return date;
    }

    private getVietnamNow(): { date: string; time: string } {
        return getVietnamNow();
    }
}

function escapeLike(value: string): string {
    return value.replace(/[!%_]/g, (char) => `!${char}`);
}
