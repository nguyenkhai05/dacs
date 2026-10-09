import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemLogService } from './system-log.service.js';

function makeDb(queryImpl?: (sql: string, params?: unknown[]) => Promise<unknown>) {
    return {
        query: vi.fn(
            queryImpl ??
                (async () => {
                    return [];
                }),
        ),
    };
}

describe('SystemLogService', () => {
    let service: SystemLogService;
    let db: ReturnType<typeof makeDb>;

    beforeEach(() => {
        db = makeDb();
        service = new SystemLogService(db as any);
    });

    it('ném lỗi khi from > to', async () => {
        await expect(
            service.list({ from: '2026-10-05', to: '2026-10-01' }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('trả về danh sách rỗng khi không có dữ liệu', async () => {
        db.query
            .mockResolvedValueOnce([{ total: 0 }])
            .mockResolvedValueOnce([]);

        const result = await service.list({ page: 1, limit: 20 });

        expect(result).toEqual({
            items: [],
            total: 0,
            page: 1,
            limit: 20,
            total_pages: 0,
        });
    });

    it('map booking history đúng nhãn tiếng Việt', async () => {
        db.query
            .mockResolvedValueOnce([{ total: 1 }])
            .mockResolvedValueOnce([
                {
                    source: 'booking',
                    history_id: 10,
                    changed_at: '2026-10-05 15:00:00',
                    changed_by: 3,
                    booking_id: 26107,
                    old_status: null,
                    new_status: 'Pending',
                    reason: 'Tao booking',
                    pitch_id: null,
                    pitch_name: null,
                    old_pitch_name: null,
                    new_pitch_name: null,
                    old_pitch_status: null,
                    new_pitch_status: null,
                    old_notes: null,
                    new_notes: null,
                    old_category_name: null,
                    new_category_name: null,
                    price_slot_id: null,
                    old_price: null,
                    new_price: null,
                    slot_start: null,
                    slot_end: null,
                    day_type: null,
                    category_name: null,
                    actor_name: 'Nguyễn Minh Anh',
                    employee_code: null,
                    position: null,
                    is_admin: 0,
                },
            ]);

        const result = await service.list({});

        expect(result.total).toBe(1);
        expect(result.items[0]).toMatchObject({
            id: 'booking-10',
            change_type: 'booking',
            target: 'DS26107',
            action: 'Tạo booking',
            old_value: '—',
            new_value: 'Chờ cọc',
            actor: {
                user_id: 3,
                display_name: 'Nguyễn Minh Anh',
            },
        });
    });

    it('map pitch history khi đổi trạng thái bảo trì', async () => {
        db.query
            .mockResolvedValueOnce([{ total: 1 }])
            .mockResolvedValueOnce([
                {
                    source: 'pitch',
                    history_id: 5,
                    changed_at: '2026-10-04 08:30:00',
                    changed_by: 1,
                    booking_id: null,
                    old_status: null,
                    new_status: null,
                    reason: null,
                    pitch_id: 4,
                    pitch_name: 'Bình An 04',
                    old_pitch_name: 'Bình An 04',
                    new_pitch_name: 'Bình An 04',
                    old_pitch_status: 'Available',
                    new_pitch_status: 'Maintenance',
                    old_notes: null,
                    new_notes: 'Lý do: thay lưới',
                    old_category_name: null,
                    new_category_name: null,
                    price_slot_id: null,
                    old_price: null,
                    new_price: null,
                    slot_start: null,
                    slot_end: null,
                    day_type: null,
                    category_name: null,
                    actor_name: 'Trần Hoàng',
                    employee_code: null,
                    position: null,
                    is_admin: 1,
                },
            ]);

        const result = await service.list({ change_type: 'pitch' });

        expect(result.items[0]).toMatchObject({
            id: 'pitch-5',
            change_type: 'pitch',
            target: 'Bình An 04',
            action: 'Bảo trì sân',
            old_value: 'Hoạt động',
            new_value: 'Bảo trì',
            actor: {
                user_id: 1,
                display_name: 'Trần Hoàng - Admin',
            },
        });
    });

    it('map price history với khung giờ và VND', async () => {
        db.query
            .mockResolvedValueOnce([{ total: 1 }])
            .mockResolvedValueOnce([
                {
                    source: 'price',
                    history_id: 8,
                    changed_at: '2026-10-01 09:00:00',
                    changed_by: 1,
                    booking_id: null,
                    old_status: null,
                    new_status: null,
                    reason: null,
                    pitch_id: null,
                    pitch_name: null,
                    old_pitch_name: null,
                    new_pitch_name: null,
                    old_pitch_status: null,
                    new_pitch_status: null,
                    old_notes: null,
                    new_notes: null,
                    old_category_name: null,
                    new_category_name: null,
                    price_slot_id: 12,
                    old_price: 330000,
                    new_price: 350000,
                    slot_start: '19:00:00',
                    slot_end: '22:00:00',
                    day_type: 'All',
                    category_name: 'Sân 5 người',
                    actor_name: 'Trần Hoàng',
                    employee_code: null,
                    position: null,
                    is_admin: 1,
                },
            ]);

        const result = await service.list({ change_type: 'price' });

        expect(result.items[0]).toMatchObject({
            id: 'price-8',
            change_type: 'price',
            target: 'Sân 5 người · 19–22h',
            action: 'Sửa giá 19–22h',
            old_value: '330.000 ₫ / giờ',
            new_value: '350.000 ₫ / giờ',
            actor: {
                display_name: 'Trần Hoàng - Admin',
            },
        });
    });

    it('hiển thị Hệ thống khi changed_by null', async () => {
        db.query
            .mockResolvedValueOnce([{ total: 1 }])
            .mockResolvedValueOnce([
                {
                    source: 'booking',
                    history_id: 1,
                    changed_at: '2026-10-05 15:05:00',
                    changed_by: null,
                    booking_id: 100,
                    old_status: 'Pending',
                    new_status: 'Confirmed',
                    reason: null,
                    pitch_id: null,
                    pitch_name: null,
                    old_pitch_name: null,
                    new_pitch_name: null,
                    old_pitch_status: null,
                    new_pitch_status: null,
                    old_notes: null,
                    new_notes: null,
                    old_category_name: null,
                    new_category_name: null,
                    price_slot_id: null,
                    old_price: null,
                    new_price: null,
                    slot_start: null,
                    slot_end: null,
                    day_type: null,
                    category_name: null,
                    actor_name: null,
                    employee_code: null,
                    position: null,
                    is_admin: null,
                },
            ]);

        const result = await service.list({});

        expect(result.items[0].actor).toEqual({
            user_id: null,
            display_name: 'Hệ thống',
        });
        expect(result.items[0].old_value).toBe('Chờ cọc');
        expect(result.items[0].new_value).toBe('Đã xác nhận');
    });

    it('listActors trả về tên hiển thị đúng', async () => {
        db.query.mockResolvedValueOnce([
            {
                user_id: 2,
                full_name: 'Nguyễn Văn A',
                employee_code: 'NV002',
                position: 'Thu Ngân',
                is_admin: 0,
            },
            {
                user_id: 1,
                full_name: 'Trần Hoàng',
                employee_code: null,
                position: null,
                is_admin: 1,
            },
        ]);

        const actors = await service.listActors();

        expect(actors).toEqual([
            { user_id: 2, display_name: 'Thu Ngân - NV002' },
            { user_id: 1, display_name: 'Trần Hoàng - Admin' },
        ]);
    });
});
