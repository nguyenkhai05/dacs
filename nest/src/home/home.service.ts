import { BadRequestException, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

const FEATURED_LIMIT = 3;
const SEARCH_LIMIT = 50;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

// Các trạng thái booking đang chiếm sân (khớp với trigger trong DB)
const ACTIVE_BOOKING_STATUSES = `'Pending','Confirmed','CheckedIn','Playing'`;

export interface PitchCategory {
    category_id: number;
    category_name: string;
    description: string | null;
}

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
            this.findPitchCards(day, undefined, FEATURED_LIMIT),
        ]);

        return {
            date: day,
            categories,
            featured_pitches: featured,
        };
    }

    async searchPitches(date?: string, categoryId?: number) {
        const day = this.resolveDate(date);
        const pitches = await this.findPitchCards(
            day,
            categoryId,
            SEARCH_LIMIT,
        );

        return {
            date: day,
            category_id: categoryId ?? null,
            total: pitches.length,
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
        categoryId: number | undefined,
        limit: number,
    ): Promise<PitchCard[]> {
        const now = this.getVietnamNow();
        const cutoffTime = date === now.date ? now.time : '00:00:00';
        const safeLimit = Math.max(1, Math.floor(limit)); // chèn thẳng vào SQL nên phải ép số

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
      WHERE p.status = 'Available'
        AND (? IS NULL OR p.category_id = ?)
      ORDER BY free_slots > 0 DESC, p.pitch_id ASC
      LIMIT ${safeLimit}
    `,
            [cutoffTime, date, categoryId ?? null, categoryId ?? null],
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
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(new Date());

        const get = (type: Intl.DateTimeFormatPartTypes) =>
            parts.find((part) => part.type === type)?.value ?? '00';

        return {
            date: `${get('year')}-${get('month')}-${get('day')}`,
            time: `${get('hour')}:${get('minute')}:${get('second')}`,
        };
    }
}
