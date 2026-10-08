import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { addDays } from '../common/date.util.js';
import { getVietnamNow } from '../common/time.util.js';
import { DatabaseService } from '../database/database.service.js';
import type { CreateHolidayDto, ListHolidaysQueryDto } from './dto/pitch-admin.dto.js';

// Một lần thêm tối đa 31 ngày (đủ cho kỳ nghỉ Tết dài), tránh nhập nhầm cả năm
export const MAX_HOLIDAY_RANGE_DAYS = 31;
const DEFAULT_LIST_DAYS = 400;

export function assertRealDate(date: string, field: string): void {
    const parsed = new Date(`${date}T00:00:00Z`);

    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        throw new BadRequestException(`${field} không phải ngày hợp lệ.`);
    }
}

/** Liệt kê các ngày từ `from` đến `to` (gồm cả hai đầu). */
export function enumerateDates(from: string, to: string): string[] {
    const dates: string[] = [];

    for (let day = from; day <= to; day = addDays(day, 1)) {
        dates.push(day);
    }

    return dates;
}

@Injectable()
export class HolidaysService {
    constructor(private readonly database: DatabaseService) { }

    async list(query: ListHolidaysQueryDto) {
        const from = query.from ?? getVietnamNow().date;
        const to = query.to ?? addDays(from, DEFAULT_LIST_DAYS);

        assertRealDate(from, 'from');
        assertRealDate(to, 'to');

        if (to < from) {
            throw new BadRequestException('to không được trước from.');
        }

        return this.database.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(h.holiday_date, '%Y-%m-%d') AS holiday_date,
                    h.holiday_name, u.full_name AS created_by_name, h.created_at
             FROM holidays h
             LEFT JOIN users u ON u.user_id = h.created_by
             WHERE h.holiday_date BETWEEN ? AND ?
             ORDER BY h.holiday_date ASC`,
            [from, to],
        );
    }

    /** Thêm một ngày hoặc cả khoảng ngày. Ngày đã tồn tại thì cập nhật lại tên. */
    async create(userId: number, dto: CreateHolidayDto) {
        const end = dto.end_date ?? dto.date;

        assertRealDate(dto.date, 'date');
        assertRealDate(end, 'end_date');

        if (end < dto.date) {
            throw new BadRequestException('end_date không được trước date.');
        }

        const dates = enumerateDates(dto.date, end);

        if (dates.length > MAX_HOLIDAY_RANGE_DAYS) {
            throw new BadRequestException(
                `Một lần chỉ thêm tối đa ${MAX_HOLIDAY_RANGE_DAYS} ngày.`,
            );
        }

        await this.database.query(
            `INSERT INTO holidays (holiday_date, holiday_name, created_by)
             VALUES ${dates.map(() => '(?, ?, ?)').join(', ')}
             ON DUPLICATE KEY UPDATE holiday_name = VALUES(holiday_name)`,
            dates.flatMap((date) => [date, dto.name, userId]),
        );

        return {
            name: dto.name,
            dates,
            note: 'Đơn đã đặt trước đó giữ nguyên giá; ngày lễ chỉ áp dụng cho đơn tạo sau.',
        };
    }

    async remove(date: string) {
        assertRealDate(date, 'date');

        const result = await this.database.query<ResultSetHeader>(
            'DELETE FROM holidays WHERE holiday_date = ?',
            [date],
        );

        if (result.affectedRows === 0) {
            throw new NotFoundException(`Ngày ${date} không nằm trong danh sách ngày lễ.`);
        }

        return { deleted: true, date };
    }
}
