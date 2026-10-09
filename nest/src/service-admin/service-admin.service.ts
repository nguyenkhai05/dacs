import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { DatabaseService } from '../database/database.service.js';
import { isDuplicateEntry } from '../pitch-admin/pitch-admin.utils.js';
import {
    DEFAULT_LOW_STOCK_THRESHOLD,
    type CreateServiceDto,
    type ListAdminServicesQueryDto,
    type UpdateServiceDto,
} from './dto/service-admin.dto.js';

const HISTORY_LIMIT = 20;

interface ServiceRow extends RowDataPacket {
    service_id: number;
    service_name: string;
    unit: string;
    price: string | number;
    stock_quantity: number;
    low_stock_threshold: number;
    is_active: number;
}

interface HistoryRow extends RowDataPacket {
    history_id: number;
    old_service_name: string | null;
    new_service_name: string | null;
    old_price: string | number | null;
    new_price: string | number | null;
    old_stock_quantity: number | null;
    new_stock_quantity: number | null;
    old_is_active: number | null;
    new_is_active: number | null;
    changed_by: number | null;
    changed_by_email: string | null;
    changed_at: string | Date;
}

// Dịch vụ đang bán và tồn kho thấp hơn ngưỡng cảnh báo của chính nó
export const isLowStock = (row: {
    is_active: number | boolean;
    stock_quantity: number;
    low_stock_threshold: number;
}): boolean =>
    Boolean(row.is_active) && Number(row.stock_quantity) < Number(row.low_stock_threshold);

@Injectable()
export class ServiceAdminService {
    constructor(private readonly database: DatabaseService) { }

    // Màn Dịch vụ đi kèm: danh sách + 3 thẻ thống kê + cảnh báo sắp hết
    async list(query: ListAdminServicesQueryDto) {
        const clauses: string[] = [];
        const params: (string | number)[] = [];

        if (query.status) {
            clauses.push('is_active = ?');
            params.push(query.status === 'active' ? 1 : 0);
        }

        if (query.q) {
            clauses.push('service_name LIKE ?');
            params.push(`%${query.q.replace(/[\\%_]/g, '\\$&')}%`);
        }

        const [rows, all] = await Promise.all([
            this.database.query<ServiceRow[]>(
                `${this.select()}
                 ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
                 ORDER BY service_id ASC`,
                params,
            ),
            // Thẻ thống kê luôn tính trên toàn bộ dịch vụ, không phụ thuộc bộ lọc
            this.database.query<ServiceRow[]>(`${this.select()} ORDER BY service_id ASC`),
        ]);

        const low = all.filter(isLowStock);

        return {
            summary: {
                total: all.length,
                active: all.filter((row) => Boolean(row.is_active)).length,
                inactive: all.filter((row) => !row.is_active).length,
                low_stock: low.length,
                low_stock_items: low.map((row) => this.toItem(row)),
            },
            services: rows.map((row) => this.toItem(row)),
        };
    }

    async get(id: number) {
        const rows = await this.database.query<ServiceRow[]>(
            `${this.select()} WHERE service_id = ? LIMIT 1`,
            [id],
        );

        if (!rows[0]) {
            throw new NotFoundException('Không tìm thấy dịch vụ.');
        }

        return this.toItem(rows[0]);
    }

    async create(userId: number, dto: CreateServiceDto) {
        const threshold = dto.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
        const isActive = dto.is_active ?? true;

        const id = await this.database.transaction(async (connection) => {
            try {
                const [result] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO services
                        (service_name, unit, price, stock_quantity, low_stock_threshold, is_active)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        dto.service_name,
                        dto.unit,
                        dto.price,
                        dto.stock_quantity,
                        threshold,
                        isActive ? 1 : 0,
                    ],
                );

                await this.writeHistory(connection, userId, result.insertId, null, {
                    service_name: dto.service_name,
                    price: dto.price,
                    stock_quantity: dto.stock_quantity,
                    is_active: isActive ? 1 : 0,
                });

                return result.insertId;
            } catch (error) {
                if (isDuplicateEntry(error)) {
                    throw new ConflictException('Tên dịch vụ đã tồn tại.');
                }

                throw error;
            }
        });

        return this.get(id);
    }

    async update(userId: number, id: number, dto: UpdateServiceDto) {
        const fields: Record<string, string | number> = {};

        if (dto.service_name !== undefined) fields.service_name = dto.service_name;
        if (dto.unit !== undefined) fields.unit = dto.unit;
        if (dto.price !== undefined) fields.price = dto.price;
        if (dto.stock_quantity !== undefined) fields.stock_quantity = dto.stock_quantity;
        if (dto.low_stock_threshold !== undefined) {
            fields.low_stock_threshold = dto.low_stock_threshold;
        }
        if (dto.is_active !== undefined) fields.is_active = dto.is_active ? 1 : 0;

        if (Object.keys(fields).length === 0) {
            throw new BadRequestException('Không có thông tin nào để cập nhật.');
        }

        await this.database.transaction(async (connection) => {
            // Khóa dòng để không đè lên lượt trừ/hoàn kho của booking đang chạy
            const current = await this.lockService(connection, id);

            try {
                await connection.execute(
                    `UPDATE services SET ${Object.keys(fields)
                        .map((column) => `${column} = ?`)
                        .join(', ')} WHERE service_id = ?`,
                    [...Object.values(fields), id],
                );
            } catch (error) {
                if (isDuplicateEntry(error)) {
                    throw new ConflictException('Tên dịch vụ đã tồn tại.');
                }

                throw error;
            }

            await this.writeHistory(connection, userId, id, current, fields);
        });

        return this.get(id);
    }

    // Ngừng bán / bán lại. Không có thao tác xóa: dịch vụ đã dùng phải giữ
    // nguyên cho đơn cũ (booking_services có khóa ngoại RESTRICT).
    async changeStatus(userId: number, id: number, isActive: boolean) {
        await this.database.transaction(async (connection) => {
            const current = await this.lockService(connection, id);

            await connection.execute(
                'UPDATE services SET is_active = ? WHERE service_id = ?',
                [isActive ? 1 : 0, id],
            );

            await this.writeHistory(connection, userId, id, current, {
                is_active: isActive ? 1 : 0,
            });
        });

        return this.get(id);
    }

    async history(id: number) {
        await this.get(id);

        const rows = await this.database.query<HistoryRow[]>(
            `SELECT h.history_id, h.old_service_name, h.new_service_name,
                    h.old_price, h.new_price,
                    h.old_stock_quantity, h.new_stock_quantity,
                    h.old_is_active, h.new_is_active,
                    h.changed_by, u.email AS changed_by_email, h.changed_at
             FROM service_history h
             LEFT JOIN users u ON u.user_id = h.changed_by
             WHERE h.service_id = ?
             ORDER BY h.changed_at DESC, h.history_id DESC
             LIMIT ${HISTORY_LIMIT}`,
            [id],
        );

        return rows.map((row) => ({
            history_id: Number(row.history_id),
            old_service_name: row.old_service_name,
            new_service_name: row.new_service_name,
            old_price: row.old_price === null ? null : Number(row.old_price),
            new_price: row.new_price === null ? null : Number(row.new_price),
            old_stock_quantity: row.old_stock_quantity,
            new_stock_quantity: row.new_stock_quantity,
            old_is_active: row.old_is_active === null ? null : Boolean(row.old_is_active),
            new_is_active: row.new_is_active === null ? null : Boolean(row.new_is_active),
            changed_by: row.changed_by,
            changed_by_email: row.changed_by_email,
            changed_at: row.changed_at,
        }));
    }

    // ------------------------------------------------------------------

    private select(): string {
        return `SELECT service_id, service_name, unit, price, stock_quantity,
                       low_stock_threshold, is_active
                FROM services`;
    }

    private toItem(row: ServiceRow) {
        return {
            service_id: Number(row.service_id),
            service_name: row.service_name,
            unit: row.unit,
            price: Number(row.price),
            stock_quantity: Number(row.stock_quantity),
            low_stock_threshold: Number(row.low_stock_threshold),
            is_active: Boolean(row.is_active),
            is_low_stock: isLowStock(row),
        };
    }

    private async lockService(connection: PoolConnection, id: number): Promise<ServiceRow> {
        const [rows] = await connection.execute<ServiceRow[]>(
            `${this.select()} WHERE service_id = ? FOR UPDATE`,
            [id],
        );

        if (!rows[0]) {
            throw new NotFoundException('Không tìm thấy dịch vụ.');
        }

        return rows[0];
    }

    // Chỉ ghi lịch sử khi tên / giá / tồn kho / trạng thái thật sự đổi
    private async writeHistory(
        connection: PoolConnection,
        userId: number,
        serviceId: number,
        before: ServiceRow | null,
        changes: Partial<Record<'service_name' | 'price' | 'stock_quantity' | 'is_active', string | number>>,
    ): Promise<void> {
        type Key = 'service_name' | 'price' | 'stock_quantity' | 'is_active';
        const previous = (key: Key): string | number | null =>
            before === null ? null : key === 'is_active' ? Number(before.is_active) : before[key];
        const same = (key: Key): boolean => {
            const next = changes[key];
            const prev = previous(key);
            return key === 'service_name' ? next === prev : Number(next) === Number(prev);
        };
        const changed = (key: Key) =>
            changes[key] !== undefined && (before === null || !same(key));

        const tracked = (['service_name', 'price', 'stock_quantity', 'is_active'] as const)
            .filter(changed);

        if (tracked.length === 0) {
            return;
        }

        type Cell = string | number | null;
        const pair = (key: Key): [Cell, Cell] => [
            previous(key),
            changed(key) ? (changes[key] ?? null) : null,
        ];

        const [oldName, newName] = pair('service_name');
        const [oldPrice, newPrice] = pair('price');
        const [oldStock, newStock] = pair('stock_quantity');
        const [oldActive, newActive] = pair('is_active');

        const values: Cell[] = [
            serviceId,
            changed('service_name') ? oldName : null,
            newName,
            changed('price') ? oldPrice : null,
            newPrice,
            changed('stock_quantity') ? oldStock : null,
            newStock,
            changed('is_active') ? oldActive : null,
            newActive,
            userId,
        ];

        await connection.execute(
            `INSERT INTO service_history
                (service_id, old_service_name, new_service_name, old_price, new_price,
                 old_stock_quantity, new_stock_quantity, old_is_active, new_is_active, changed_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            values,
        );
    }
}
