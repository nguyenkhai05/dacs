import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { getVietnamNow } from '../common/time.util.js';
import { DatabaseService } from '../database/database.service.js';
import type {
    CreateCategoryDto,
    CreatePitchDto,
    CreatePriceSlotDto,
    ListAdminPitchesQueryDto,
    PitchStatus,
    UpdateCategoryDto,
    UpdatePitchDto,
    UpdatePriceSlotDto,
} from './dto/pitch-admin.dto.js';
import {
    ACTIVE_BOOKING_STATUSES,
    findPriceGaps,
    isDuplicateEntry,
    isRowReferenced,
    isTriggerSignal,
    normalizeTime,
    parseAmenities,
    rangesOverlap,
    toHHmm,
    toMinutes,
} from './pitch-admin.utils.js';

const HISTORY_LIMIT = 10;
const PRICE_HISTORY_LIMIT = 20;

interface PitchRow extends RowDataPacket {
    pitch_id: number;
    pitch_name: string;
    category_id: number | null;
    category_name: string | null;
    status: PitchStatus;
    notes: string | null;
    image_url: string | null;
    surface_type: string;
    address: string | null;
    district: string | null;
    amenities: unknown;
    min_price: string | number | null;
    max_price: string | number | null;
    upcoming_bookings: string | number;
}

interface SlotRow extends RowDataPacket {
    price_slot_id: number;
    category_id: number;
    start_time: string;
    end_time: string;
    price_per_hour: string | number;
}

interface CategoryRow extends RowDataPacket {
    category_id: number;
    category_name: string;
    description: string | null;
    is_active: number;
    pitch_count?: string | number;
}

@Injectable()
export class PitchAdminService {
    constructor(private readonly database: DatabaseService) { }

    // ------------------------------------------------------------------
    // Sân
    // ------------------------------------------------------------------

    async listPitches(query: ListAdminPitchesQueryDto) {
        const now = getVietnamNow();
        const clauses: string[] = [];
        const params: (string | number)[] = [now.date, now.date, now.time];

        if (query.status) {
            clauses.push('p.status = ?');
            params.push(query.status);
        }

        if (query.category_id) {
            clauses.push('p.category_id = ?');
            params.push(query.category_id);
        }

        if (query.q) {
            clauses.push('p.pitch_name LIKE ?');
            params.push(`%${query.q.replace(/[\\%_]/g, '\\$&')}%`);
        }

        const [rows, summaryRows] = await Promise.all([
            this.database.query<PitchRow[]>(
                `${this.pitchSelect()}
                 ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
                 ORDER BY p.pitch_id ASC`,
                params,
            ),
            this.database.query<{ status: string; total: string | number }[]>(
                `SELECT status, COUNT(*) AS total FROM pitches GROUP BY status`,
            ),
        ]);

        const counts = Object.fromEntries(
            summaryRows.map((row) => [row.status, Number(row.total)]),
        );

        return {
            summary: {
                total: summaryRows.reduce((sum, row) => sum + Number(row.total), 0),
                available: counts.Available ?? 0,
                maintenance: counts.Maintenance ?? 0,
                inactive: counts.Inactive ?? 0,
            },
            pitches: rows.map((row) => this.toPitchItem(row)),
        };
    }

    async getPitch(id: number) {
        const now = getVietnamNow();
        const rows = await this.database.query<PitchRow[]>(
            `${this.pitchSelect()} WHERE p.pitch_id = ? LIMIT 1`,
            [now.date, now.date, now.time, id],
        );

        const pitch = rows[0];

        if (!pitch) {
            throw new NotFoundException(`Không tìm thấy sân có ID ${id}`);
        }

        const [slots, history] = await Promise.all([
            pitch.category_id === null
                ? Promise.resolve([] as SlotRow[])
                : this.fetchSlots(pitch.category_id),
            this.database.query<RowDataPacket[]>(
                `SELECT h.history_id, h.old_pitch_name, h.new_pitch_name,
                        h.old_category_id, h.new_category_id,
                        h.old_status, h.new_status,
                        u.full_name AS changed_by_name, h.changed_at
                 FROM pitch_history h
                 LEFT JOIN users u ON u.user_id = h.changed_by
                 WHERE h.pitch_id = ?
                 ORDER BY h.changed_at DESC, h.history_id DESC
                 LIMIT ${HISTORY_LIMIT}`,
                [id],
            ),
        ]);

        return {
            ...this.toPitchItem(pitch),
            price_slots: slots.map((slot) => this.toSlotItem(slot)),
            price_gaps: findPriceGaps(slots),
            history,
        };
    }

    async createPitch(userId: number, dto: CreatePitchDto) {
        const id = await this.audited(userId, async (connection) => {
            await this.assertCategoryUsable(connection, dto.category_id);

            try {
                const [result] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO pitches
                        (pitch_name, category_id, status, notes, image_url,
                         surface_type, address, district, amenities)
                     VALUES (?, ?, ?, ?, ?, COALESCE(?, 'Cỏ nhân tạo'), ?, ?, ?)`,
                    [
                        dto.pitch_name,
                        dto.category_id,
                        dto.status ?? 'Available',
                        dto.notes ?? null,
                        dto.image_url ?? null,
                        dto.surface_type ?? null,
                        dto.address ?? null,
                        dto.district ?? null,
                        dto.amenities ? JSON.stringify(dto.amenities) : null,
                    ],
                );

                return result.insertId;
            } catch (error) {
                if (isDuplicateEntry(error)) {
                    throw new ConflictException('Tên sân đã tồn tại.');
                }

                throw error;
            }
        });

        return this.getPitch(id);
    }

    async updatePitch(userId: number, id: number, dto: UpdatePitchDto) {
        const fields: Record<string, string | number | null> = {};

        if (dto.pitch_name !== undefined) fields.pitch_name = dto.pitch_name;
        if (dto.category_id !== undefined) fields.category_id = dto.category_id;
        if (dto.status !== undefined) fields.status = dto.status;
        if (dto.notes !== undefined) fields.notes = dto.notes;
        if (dto.image_url !== undefined) fields.image_url = dto.image_url;
        if (dto.surface_type !== undefined) fields.surface_type = dto.surface_type;
        if (dto.address !== undefined) fields.address = dto.address;
        if (dto.district !== undefined) fields.district = dto.district;
        if (dto.amenities !== undefined) {
            fields.amenities = JSON.stringify(dto.amenities);
        }

        if (Object.keys(fields).length === 0) {
            throw new BadRequestException('Không có thông tin nào để cập nhật.');
        }

        await this.audited(userId, async (connection) => {
            const current = await this.lockPitch(connection, id);

            if (dto.category_id !== undefined && dto.category_id !== current.category_id) {
                await this.assertCategoryUsable(connection, dto.category_id);
            }

            if (dto.status !== undefined && dto.status !== 'Available') {
                await this.assertNoUpcomingBookings(connection, id, dto.status);
            }

            try {
                await connection.execute(
                    `UPDATE pitches SET ${Object.keys(fields)
                        .map((column) => `${column} = ?`)
                        .join(', ')} WHERE pitch_id = ?`,
                    [...Object.values(fields), id],
                );
            } catch (error) {
                if (isDuplicateEntry(error)) {
                    throw new ConflictException('Tên sân đã tồn tại.');
                }

                throw error;
            }
        });

        return this.getPitch(id);
    }

    async changePitchStatus(userId: number, id: number, status: PitchStatus) {
        await this.audited(userId, async (connection) => {
            await this.lockPitch(connection, id);

            if (status !== 'Available') {
                await this.assertNoUpcomingBookings(connection, id, status);
            }

            await connection.execute(
                'UPDATE pitches SET status = ? WHERE pitch_id = ?',
                [status, id],
            );
        });

        return this.getPitch(id);
    }

    // ------------------------------------------------------------------
    // Loại sân
    // ------------------------------------------------------------------

    async listCategories() {
        const [categories, slots] = await Promise.all([
            this.database.query<CategoryRow[]>(
                `SELECT pc.category_id, pc.category_name, pc.description, pc.is_active,
                        (SELECT COUNT(*) FROM pitches p
                         WHERE p.category_id = pc.category_id) AS pitch_count
                 FROM pitch_categories pc
                 ORDER BY pc.category_id ASC`,
            ),
            this.database.query<SlotRow[]>(
                `SELECT price_slot_id, category_id,
                        TIME_FORMAT(start_time, '%H:%i') AS start_time,
                        TIME_FORMAT(end_time, '%H:%i') AS end_time,
                        price_per_hour
                 FROM price_slots
                 ORDER BY category_id ASC, start_time ASC`,
            ),
        ]);

        return categories.map((category) => {
            const own = slots.filter((slot) => slot.category_id === category.category_id);

            return {
                category_id: category.category_id,
                category_name: category.category_name,
                description: category.description,
                is_active: Boolean(category.is_active),
                pitch_count: Number(category.pitch_count ?? 0),
                price_slots: own.map((slot) => this.toSlotItem(slot)),
                price_gaps: findPriceGaps(own),
            };
        });
    }

    async createCategory(dto: CreateCategoryDto) {
        try {
            const result = await this.database.query<ResultSetHeader>(
                `INSERT INTO pitch_categories (category_name, description) VALUES (?, ?)`,
                [dto.category_name, dto.description ?? null],
            );

            return this.getCategory(result.insertId);
        } catch (error) {
            if (isDuplicateEntry(error)) {
                throw new ConflictException('Tên loại sân đã tồn tại.');
            }

            throw error;
        }
    }

    async updateCategory(id: number, dto: UpdateCategoryDto) {
        const fields: Record<string, string | number | null> = {};

        if (dto.category_name !== undefined) fields.category_name = dto.category_name;
        if (dto.description !== undefined) fields.description = dto.description;
        if (dto.is_active !== undefined) fields.is_active = dto.is_active ? 1 : 0;

        if (Object.keys(fields).length === 0) {
            throw new BadRequestException('Không có thông tin nào để cập nhật.');
        }

        await this.getCategory(id); // 404 nếu không tồn tại

        try {
            await this.database.query(
                `UPDATE pitch_categories SET ${Object.keys(fields)
                    .map((column) => `${column} = ?`)
                    .join(', ')} WHERE category_id = ?`,
                [...Object.values(fields), id],
            );
        } catch (error) {
            if (isDuplicateEntry(error)) {
                throw new ConflictException('Tên loại sân đã tồn tại.');
            }

            throw error;
        }

        return this.getCategory(id);
    }

    // ------------------------------------------------------------------
    // Khung giá (giá theo loại sân + khung giờ trong ngày)
    // ------------------------------------------------------------------

    async listPriceSlots(categoryId: number) {
        const category = await this.getCategory(categoryId);
        const slots = await this.fetchSlots(categoryId);

        return {
            category,
            price_slots: slots.map((slot) => this.toSlotItem(slot)),
            price_gaps: findPriceGaps(slots),
        };
    }

    async createPriceSlot(userId: number, categoryId: number, dto: CreatePriceSlotDto) {
        const start = normalizeTime(dto.start_time);
        const end = normalizeTime(dto.end_time);
        this.assertValidRange(start, end);

        await this.audited(userId, async (connection) => {
            await this.lockCategory(connection, categoryId);
            await this.assertNoSlotOverlap(connection, categoryId, start, end);

            try {
                await connection.execute(
                    `INSERT INTO price_slots (category_id, start_time, end_time, price_per_hour)
                     VALUES (?, ?, ?, ?)`,
                    [categoryId, start, end, dto.price_per_hour],
                );
            } catch (error) {
                this.rethrowSlotError(error);
            }
        });

        return this.listPriceSlots(categoryId);
    }

    async updatePriceSlot(userId: number, slotId: number, dto: UpdatePriceSlotDto) {
        if (
            dto.start_time === undefined &&
            dto.end_time === undefined &&
            dto.price_per_hour === undefined
        ) {
            throw new BadRequestException('Không có thông tin nào để cập nhật.');
        }

        const categoryId = await this.audited(userId, async (connection) => {
            const [rows] = await connection.execute<SlotRow[]>(
                `SELECT price_slot_id, category_id, start_time, end_time, price_per_hour
                 FROM price_slots WHERE price_slot_id = ? FOR UPDATE`,
                [slotId],
            );

            const current = rows[0];

            if (!current) {
                throw new NotFoundException(`Không tìm thấy khung giá ${slotId}`);
            }

            const start = dto.start_time ? normalizeTime(dto.start_time) : current.start_time;
            const end = dto.end_time ? normalizeTime(dto.end_time) : current.end_time;
            const price = dto.price_per_hour ?? Number(current.price_per_hour);

            this.assertValidRange(start, end);
            await this.lockCategory(connection, current.category_id);
            await this.assertNoSlotOverlap(connection, current.category_id, start, end, slotId);

            try {
                await connection.execute(
                    `UPDATE price_slots
                     SET start_time = ?, end_time = ?, price_per_hour = ?
                     WHERE price_slot_id = ?`,
                    [start, end, price, slotId],
                );
            } catch (error) {
                this.rethrowSlotError(error);
            }

            return current.category_id;
        });

        return this.listPriceSlots(categoryId);
    }

    async deletePriceSlot(userId: number, slotId: number) {
        const categoryId = await this.audited(userId, async (connection) => {
            const [rows] = await connection.execute<SlotRow[]>(
                `SELECT category_id FROM price_slots WHERE price_slot_id = ? FOR UPDATE`,
                [slotId],
            );

            if (!rows[0]) {
                throw new NotFoundException(`Không tìm thấy khung giá ${slotId}`);
            }

            try {
                await connection.execute(
                    'DELETE FROM price_slots WHERE price_slot_id = ?',
                    [slotId],
                );
            } catch (error) {
                if (isRowReferenced(error)) {
                    throw new ConflictException(
                        'Khung giá này đã có lịch sử đổi giá nên không thể xóa. Hãy sửa giá hoặc khung giờ thay vì xóa.',
                    );
                }

                throw error;
            }

            return rows[0].category_id;
        });

        const slots = await this.fetchSlots(categoryId);

        return {
            deleted: true,
            price_slots: slots.map((slot) => this.toSlotItem(slot)),
            // Giờ rơi vào khoảng trống sẽ không còn giá → khách không đặt được
            price_gaps: findPriceGaps(slots),
        };
    }

    async getPriceHistory(categoryId: number) {
        await this.getCategory(categoryId);

        return this.database.query<RowDataPacket[]>(
            `SELECT h.history_id, h.price_slot_id,
                    TIME_FORMAT(ps.start_time, '%H:%i') AS start_time,
                    TIME_FORMAT(ps.end_time, '%H:%i') AS end_time,
                    h.old_price, h.new_price,
                    u.full_name AS changed_by_name, h.changed_at
             FROM price_slot_history h
             JOIN price_slots ps ON ps.price_slot_id = h.price_slot_id
             LEFT JOIN users u ON u.user_id = h.changed_by
             WHERE ps.category_id = ?
             ORDER BY h.changed_at DESC, h.history_id DESC
             LIMIT ${PRICE_HISTORY_LIMIT}`,
            [categoryId],
        );
    }

    // ------------------------------------------------------------------
    // Nội bộ
    // ------------------------------------------------------------------

    private pitchSelect(): string {
        // Tham số: [ngày hôm nay, ngày hôm nay, giờ hiện tại, ...điều kiện lọc]
        return `
            SELECT
                p.pitch_id, p.pitch_name, p.category_id, pc.category_name,
                p.status, p.notes, p.image_url, p.surface_type,
                p.address, p.district, p.amenities,
                (SELECT MIN(ps.price_per_hour) FROM price_slots ps
                 WHERE ps.category_id = p.category_id) AS min_price,
                (SELECT MAX(ps.price_per_hour) FROM price_slots ps
                 WHERE ps.category_id = p.category_id) AS max_price,
                (SELECT COUNT(*) FROM bookings b
                 WHERE b.pitch_id = p.pitch_id
                   AND b.status IN (${ACTIVE_BOOKING_STATUSES})
                   AND (b.booking_date > ?
                        OR (b.booking_date = ? AND b.end_time > ?))) AS upcoming_bookings
            FROM pitches p
            LEFT JOIN pitch_categories pc ON pc.category_id = p.category_id
        `;
    }

    private toPitchItem(row: PitchRow) {
        return {
            pitch_id: row.pitch_id,
            pitch_name: row.pitch_name,
            category_id: row.category_id,
            category_name: row.category_name,
            status: row.status,
            notes: row.notes,
            image_url: row.image_url,
            surface_type: row.surface_type,
            address: row.address,
            district: row.district,
            amenities: parseAmenities(row.amenities),
            min_price: row.min_price === null ? null : Number(row.min_price),
            max_price: row.max_price === null ? null : Number(row.max_price),
            // Chưa có khung giá nào → sân chưa thể nhận đặt
            has_pricing: row.min_price !== null,
            upcoming_bookings: Number(row.upcoming_bookings),
        };
    }

    private toSlotItem(slot: SlotRow) {
        return {
            price_slot_id: slot.price_slot_id,
            category_id: slot.category_id,
            start_time: toHHmm(slot.start_time),
            end_time: toHHmm(slot.end_time),
            price_per_hour: Number(slot.price_per_hour),
        };
    }

    private fetchSlots(categoryId: number): Promise<SlotRow[]> {
        return this.database.query<SlotRow[]>(
            `SELECT price_slot_id, category_id,
                    TIME_FORMAT(start_time, '%H:%i') AS start_time,
                    TIME_FORMAT(end_time, '%H:%i') AS end_time,
                    price_per_hour
             FROM price_slots
             WHERE category_id = ?
             ORDER BY start_time ASC`,
            [categoryId],
        );
    }

    private async getCategory(id: number) {
        const rows = await this.database.query<CategoryRow[]>(
            `SELECT category_id, category_name, description, is_active
             FROM pitch_categories WHERE category_id = ? LIMIT 1`,
            [id],
        );

        if (!rows[0]) {
            throw new NotFoundException(`Không tìm thấy loại sân có ID ${id}`);
        }

        return {
            category_id: rows[0].category_id,
            category_name: rows[0].category_name,
            description: rows[0].description,
            is_active: Boolean(rows[0].is_active),
        };
    }

    /** Chạy trong transaction và gắn @app_user_id để trigger ghi đúng người sửa. */
    private audited<T>(
        userId: number,
        callback: (connection: PoolConnection) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(async (connection) => {
            await connection.query('SET @app_user_id = ?', [userId]);

            try {
                return await callback(connection);
            } finally {
                await connection
                    .query('SET @app_user_id = NULL')
                    .catch(() => undefined);
            }
        });
    }

    private async lockPitch(connection: PoolConnection, id: number) {
        const [rows] = await connection.execute<PitchRow[]>(
            `SELECT pitch_id, category_id, status FROM pitches WHERE pitch_id = ? FOR UPDATE`,
            [id],
        );

        if (!rows[0]) {
            throw new NotFoundException(`Không tìm thấy sân có ID ${id}`);
        }

        return rows[0];
    }

    private async lockCategory(connection: PoolConnection, id: number) {
        const [rows] = await connection.execute<CategoryRow[]>(
            `SELECT category_id FROM pitch_categories WHERE category_id = ? FOR UPDATE`,
            [id],
        );

        if (!rows[0]) {
            throw new NotFoundException(`Không tìm thấy loại sân có ID ${id}`);
        }
    }

    private async assertCategoryUsable(connection: PoolConnection, id: number) {
        const [rows] = await connection.execute<CategoryRow[]>(
            `SELECT category_id, is_active FROM pitch_categories WHERE category_id = ?`,
            [id],
        );

        if (!rows[0]) {
            throw new BadRequestException('Loại sân không tồn tại.');
        }

        if (!rows[0].is_active) {
            throw new BadRequestException('Loại sân này đang bị ẩn, hãy bật lại trước khi gán sân.');
        }
    }

    // Không cho đưa sân vào bảo trì/ngưng khi còn lịch sắp tới - tránh khách đã cọc mà sân đóng
    private async assertNoUpcomingBookings(
        connection: PoolConnection,
        pitchId: number,
        target: PitchStatus,
    ) {
        const now = getVietnamNow();
        const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) AS total FROM bookings
             WHERE pitch_id = ?
               AND status IN (${ACTIVE_BOOKING_STATUSES})
               AND (booking_date > ? OR (booking_date = ? AND end_time > ?))`,
            [pitchId, now.date, now.date, now.time],
        );

        const total = Number(rows[0]?.total ?? 0);

        if (total > 0) {
            throw new ConflictException(
                `Sân còn ${total} lượt đặt sắp tới nên chưa thể chuyển sang "${target}". ` +
                `Hãy xử lý (hủy/đổi sân) các đơn này trước.`,
            );
        }
    }

    private assertValidRange(start: string, end: string) {
        if (toMinutes(end) <= toMinutes(start)) {
            throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu.');
        }
    }

    private async assertNoSlotOverlap(
        connection: PoolConnection,
        categoryId: number,
        start: string,
        end: string,
        excludeSlotId?: number,
    ) {
        const [rows] = await connection.execute<SlotRow[]>(
            `SELECT price_slot_id,
                    TIME_FORMAT(start_time, '%H:%i') AS start_time,
                    TIME_FORMAT(end_time, '%H:%i') AS end_time
             FROM price_slots WHERE category_id = ?`,
            [categoryId],
        );

        const clash = rows.find(
            (slot) =>
                slot.price_slot_id !== excludeSlotId &&
                rangesOverlap(
                    { start_time: start, end_time: end },
                    { start_time: slot.start_time, end_time: slot.end_time },
                ),
        );

        if (clash) {
            throw new ConflictException(
                `Khung giờ bị chồng lấn với khung ${clash.start_time} - ${clash.end_time}.`,
            );
        }
    }

    // Lưới an toàn: trigger/CHECK ở DB vẫn chặn nếu có ghi đồng thời
    private rethrowSlotError(error: unknown): never {
        if (isTriggerSignal(error)) {
            throw new ConflictException('Khung giờ bị chồng lấn với khung giá đã có.');
        }

        throw error;
    }
}
