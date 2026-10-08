import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { PitchAdminService } from './pitch-admin.service.js';

interface Options {
    pitch?: Record<string, unknown> | null;
    upcoming?: number;
    category?: Record<string, unknown> | null;
    slots?: Record<string, unknown>[];
    insertError?: unknown;
    deleteError?: unknown;
}

const PITCH_ROW = {
    pitch_id: 1,
    pitch_name: 'Sân 5 - Số 1',
    category_id: 1,
    category_name: 'Sân 5 người',
    status: 'Available',
    notes: null,
    image_url: null,
    surface_type: 'Cỏ nhân tạo',
    address: null,
    district: null,
    amenities: ['Wifi'],
    min_price: '200000.00',
    max_price: '250000.00',
    upcoming_bookings: 0,
};

const SLOTS = [
    { price_slot_id: 1, category_id: 1, start_time: '06:00', end_time: '16:00', price_per_hour: '200000.00' },
    { price_slot_id: 2, category_id: 1, start_time: '16:00', end_time: '22:00', price_per_hour: '250000.00' },
];

function createService(options: Options = {}) {
    const {
        pitch = { pitch_id: 1, category_id: 1, status: 'Available' },
        upcoming = 0,
        category = { category_id: 1, category_name: 'Sân 5 người', description: null, is_active: 1 },
        slots = SLOTS,
        insertError,
        deleteError,
    } = options;

    const execute = vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.startsWith('INSERT INTO price_slots') && insertError) throw insertError;
        if (sql.startsWith('DELETE FROM price_slots') && deleteError) throw deleteError;
        if (sql.includes('FROM pitches WHERE pitch_id')) return [pitch ? [pitch] : [], []];
        if (sql.includes('FROM pitch_categories WHERE category_id')) {
            return [category ? [category] : [], []];
        }
        if (sql.includes('COUNT(*) AS total FROM bookings')) return [[{ total: upcoming }], []];
        if (sql.includes('FROM price_slots WHERE category_id')) return [slots, []];
        if (sql.includes('FROM price_slots WHERE price_slot_id')) {
            return [slots.length ? [slots[0]] : [], []];
        }
        if (sql.startsWith('INSERT INTO pitches')) return [{ insertId: 9 }, []];
        return [{ affectedRows: 1 }, []];
    });
    const connection = { execute, query: vi.fn(async () => [[], []]) };

    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('GROUP BY status')) {
            return [{ status: 'Available', total: 4 }, { status: 'Maintenance', total: 1 }];
        }
        if (sql.includes('FROM pitch_history')) return [];
        if (sql.includes('FROM price_slots') && !sql.includes('JOIN')) return slots;
        if (sql.includes('FROM pitch_categories WHERE category_id')) return category ? [category] : [];
        if (sql.includes('FROM pitches p')) return pitch ? [PITCH_ROW] : [];
        return [];
    });

    const database = {
        query,
        transaction: vi.fn(async (cb: (c: typeof connection) => unknown) => cb(connection)),
    };

    const service = new PitchAdminService(database as unknown as DatabaseService);
    return { service, execute, query, database, connection };
}

describe('listPitches', () => {
    it('trả tổng quan theo trạng thái và ép kiểu giá', async () => {
        const { service } = createService();
        const res = await service.listPitches({});
        expect(res.summary).toEqual({ total: 5, available: 4, maintenance: 1, inactive: 0 });
        expect(res.pitches[0]).toMatchObject({
            min_price: 200000,
            max_price: 250000,
            has_pricing: true,
            amenities: ['Wifi'],
        });
    });

    it('escape ký tự đặc biệt của LIKE', async () => {
        const { service, query } = createService();
        await service.listPitches({ q: '50%_' });
        const call = query.mock.calls.find(([sql]) => String(sql).includes('LIKE'));
        expect(call?.[1]).toContain('%50\\%\\_%');
    });
});

describe('getPitch', () => {
    it('404 khi không có sân', async () => {
        const { service } = createService({ pitch: null });
        await expect(service.getPitch(99)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('kèm bảng giá và khoảng trống giá', async () => {
        const { service } = createService({
            slots: [SLOTS[0], { ...SLOTS[1], start_time: '18:00' }],
        });
        const res = await service.getPitch(1);
        expect(res.price_slots).toHaveLength(2);
        expect(res.price_gaps).toEqual([{ start_time: '16:00', end_time: '18:00' }]);
    });
});

describe('changePitchStatus', () => {
    it('chặn bảo trì khi còn lịch sắp tới', async () => {
        const { service } = createService({ upcoming: 2 });
        await expect(service.changePitchStatus(1, 1, 'Maintenance')).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it('cho bảo trì khi không còn lịch, gắn @app_user_id', async () => {
        const { service, connection, execute } = createService({ upcoming: 0 });
        await service.changePitchStatus(7, 1, 'Maintenance');
        expect(connection.query).toHaveBeenCalledWith('SET @app_user_id = ?', [7]);
        expect(execute).toHaveBeenCalledWith(
            'UPDATE pitches SET status = ? WHERE pitch_id = ?',
            ['Maintenance', 1],
        );
    });

    it('bật lại Available không cần kiểm tra lịch', async () => {
        const { service, execute } = createService({ upcoming: 5 });
        await service.changePitchStatus(1, 1, 'Available');
        expect(
            execute.mock.calls.some(([sql]) => String(sql).includes('COUNT(*) AS total')),
        ).toBe(false);
    });

    it('404 khi sân không tồn tại', async () => {
        const { service } = createService({ pitch: null });
        await expect(service.changePitchStatus(1, 99, 'Inactive')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe('createPitch / updatePitch', () => {
    it('loại sân không tồn tại → 400', async () => {
        const { service } = createService({ category: null });
        await expect(
            service.createPitch(1, { pitch_name: 'Sân mới', category_id: 99 }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('loại sân đang ẩn → 400', async () => {
        const { service } = createService({
            category: { category_id: 1, category_name: 'X', description: null, is_active: 0 },
        });
        await expect(
            service.createPitch(1, { pitch_name: 'Sân mới', category_id: 1 }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('trùng tên → 409', async () => {
        const { service, execute } = createService();
        execute.mockImplementationOnce(async () => [[{ category_id: 1, is_active: 1 }], []]);
        execute.mockImplementationOnce(async () => {
            throw { errno: 1062 };
        });
        await expect(
            service.createPitch(1, { pitch_name: 'Sân 5 - Số 1', category_id: 1 }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('update rỗng → 400', async () => {
        const { service } = createService();
        await expect(service.updatePitch(1, 1, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('update chỉ set các cột được gửi, amenities lưu JSON', async () => {
        const { service, execute } = createService();
        await service.updatePitch(1, 1, { notes: 'Mới sơn', amenities: ['Wifi', 'Đèn'] });
        const call = execute.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE pitches SET'));
        expect(call?.[0]).toBe('UPDATE pitches SET notes = ?, amenities = ? WHERE pitch_id = ?');
        expect(call?.[1]).toEqual(['Mới sơn', '["Wifi","Đèn"]', 1]);
    });
});

describe('khung giá', () => {
    it('giờ kết thúc <= giờ bắt đầu → 400', async () => {
        const { service } = createService();
        await expect(
            service.createPriceSlot(1, 1, { start_time: '10:00', end_time: '10:00', price_per_hour: 1 }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('chồng lấn khung đã có → 409, không INSERT', async () => {
        const { service, execute } = createService();
        await expect(
            service.createPriceSlot(1, 1, { start_time: '15:00', end_time: '17:00', price_per_hour: 300000 }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(
            execute.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO price_slots')),
        ).toBe(false);
    });

    it('khung liền kề hợp lệ được tạo', async () => {
        const { service, execute } = createService({ slots: [SLOTS[0]] });
        await service.createPriceSlot(1, 1, { start_time: '16:00', end_time: '22:00', price_per_hour: 250000 });
        const call = execute.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO price_slots'));
        expect(call?.[1]).toEqual([1, '16:00:00', '22:00:00', 250000]);
    });

    it('trigger DB báo chồng lấn (ghi đồng thời) → 409', async () => {
        const { service } = createService({ slots: [SLOTS[0]], insertError: { errno: 1644 } });
        await expect(
            service.createPriceSlot(1, 1, { start_time: '16:00', end_time: '22:00', price_per_hour: 1 }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('sửa giá một khung: giữ giờ cũ, bỏ qua chính nó khi kiểm tra chồng lấn', async () => {
        const { service, execute } = createService();
        await service.updatePriceSlot(1, 1, { price_per_hour: 220000 });
        const call = execute.mock.calls.find(([sql]) => String(sql).includes('UPDATE price_slots'));
        expect(call?.[1]).toEqual(['06:00', '16:00', 220000, 1]);
    });

    it('sửa rỗng → 400', async () => {
        const { service } = createService();
        await expect(service.updatePriceSlot(1, 1, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('xóa khung đã có lịch sử giá → 409 giải thích', async () => {
        const { service } = createService({ deleteError: { errno: 1451 } });
        await expect(service.deletePriceSlot(1, 1)).rejects.toBeInstanceOf(ConflictException);
    });

    it('xóa thành công trả về bảng giá còn lại', async () => {
        const { service } = createService({ slots: [SLOTS[0]] });
        const res = await service.deletePriceSlot(1, 1);
        expect(res.deleted).toBe(true);
    });
});

describe('loại sân', () => {
    it('listCategories gom khung giá theo loại', async () => {
        const { service, query } = createService();
        query.mockImplementation(async (sql: string) => {
            if (sql.includes('FROM pitch_categories pc')) {
                return [
                    { category_id: 1, category_name: 'A', description: null, is_active: 1, pitch_count: 2 },
                    { category_id: 2, category_name: 'B', description: null, is_active: 0, pitch_count: 0 },
                ];
            }
            return [SLOTS[0]];
        });
        const res = await service.listCategories();
        expect(res[0]).toMatchObject({ pitch_count: 2, is_active: true });
        expect(res[0].price_slots).toHaveLength(1);
        expect(res[1].price_slots).toEqual([]);
        expect(res[1].is_active).toBe(false);
    });

    it('trùng tên loại sân → 409', async () => {
        const { service, query } = createService();
        query.mockImplementationOnce(async () => {
            throw { errno: 1062 };
        });
        await expect(service.createCategory({ category_name: 'Sân 5 người' })).rejects.toBeInstanceOf(
            ConflictException,
        );
    });
});
