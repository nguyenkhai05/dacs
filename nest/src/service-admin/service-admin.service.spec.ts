import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { isLowStock, ServiceAdminService } from './service-admin.service.js';

const rows = [
    { service_id: 1, service_name: 'Nước suối', unit: 'chai', price: '10000.00', stock_quantity: 120, low_stock_threshold: 10, is_active: 1 },
    { service_id: 2, service_name: 'Áo bib', unit: 'chiếc', price: '3000.00', stock_quantity: 40, low_stock_threshold: 10, is_active: 1 },
    { service_id: 3, service_name: 'Bóng thi đấu', unit: 'quả', price: '20000.00', stock_quantity: 8, low_stock_threshold: 5, is_active: 1 },
    { service_id: 4, service_name: 'Khăn lạnh', unit: 'gói', price: '5000.00', stock_quantity: 4, low_stock_threshold: 10, is_active: 1 },
    { service_id: 5, service_name: 'Nước điện giải', unit: 'chai', price: '15000.00', stock_quantity: 0, low_stock_threshold: 10, is_active: 0 },
];

function createService(options: { current?: Record<string, unknown> | null; insertError?: unknown } = {}) {
    const { current = rows[0], insertError } = options;

    const execute = vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('FOR UPDATE')) return [current ? [current] : [], []];
        if (sql.startsWith('INSERT INTO services')) {
            if (insertError) throw insertError;
            return [{ insertId: 9, affectedRows: 1 }, []];
        }
        return [{ affectedRows: 1 }, []];
    });

    const query = vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('WHERE service_id = ? LIMIT 1')) {
            const found = rows.find((row) => row.service_id === params?.[0]) ?? (current && params?.[0] === 9 ? current : undefined);
            return found ? [found] : [];
        }
        return rows;
    });

    const database = {
        query,
        transaction: vi.fn(async (callback: (connection: unknown) => unknown) => callback({ execute })),
    } as unknown as DatabaseService;

    return { service: new ServiceAdminService(database), execute, query };
}

describe('isLowStock', () => {
    it('chỉ tính dịch vụ đang bán và tồn kho dưới ngưỡng của chính nó', () => {
        expect(isLowStock(rows[3])).toBe(true); // 4 < 10
        expect(isLowStock(rows[2])).toBe(false); // 8 >= 5
        expect(isLowStock(rows[4])).toBe(false); // ngừng bán
    });
});

describe('ServiceAdminService', () => {
    it('list trả thống kê 4 hoạt động / 5 dịch vụ, 1 cần bổ sung kho', async () => {
        const { service } = createService();
        const result = await service.list({});

        expect(result.summary).toMatchObject({ total: 5, active: 4, inactive: 1, low_stock: 1 });
        expect(result.summary.low_stock_items[0].service_name).toBe('Khăn lạnh');
        expect(result.services[0]).toMatchObject({ price: 10000, is_active: true });
    });

    it('get báo 404 khi không có dịch vụ', async () => {
        const { service } = createService();
        await expect(service.get(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('create báo 409 khi trùng tên', async () => {
        const { service } = createService({ insertError: { errno: 1062, code: 'ER_DUP_ENTRY' } });
        await expect(
            service.create(1, { service_name: 'Nước suối', unit: 'chai', price: 10000, stock_quantity: 1 }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('create ghi lịch sử và trả về dịch vụ mới', async () => {
        const { service, execute } = createService({ current: { ...rows[0], service_id: 9 } });
        await service.create(1, { service_name: 'Nước suối', unit: 'chai', price: 10000, stock_quantity: 120 });
        expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO service_history'))).toBe(true);
    });

    it('update không có trường nào thì báo 400', async () => {
        const { service } = createService();
        await expect(service.update(1, 1, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('update báo 404 khi dịch vụ không tồn tại', async () => {
        const { service } = createService({ current: null });
        await expect(service.update(1, 999, { price: 1 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('update đổi giá/tồn kho thì ghi một dòng lịch sử, giữ nguyên các cột không đổi', async () => {
        const { service, execute } = createService();
        await service.update(1, 1, { price: 12000, stock_quantity: 120 });

        const history = execute.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO service_history'));
        expect(history).toBeDefined();
        const params = history![1] as unknown[];
        expect(params).toEqual([1, null, null, '10000.00', 12000, null, null, null, null, 1]);
    });

    it('update không đổi gì thật sự thì không ghi lịch sử', async () => {
        const { service, execute } = createService();
        await service.update(1, 1, { stock_quantity: 120 });
        expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO service_history'))).toBe(false);
    });

    it('changeStatus ngừng bán và ghi lịch sử', async () => {
        const { service, execute } = createService();
        await service.changeStatus(1, 1, false);
        expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE services SET is_active'))).toBe(true);
        expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO service_history'))).toBe(true);
    });
});
