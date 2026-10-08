import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import {
    enumerateDates,
    HolidaysService,
    MAX_HOLIDAY_RANGE_DAYS,
} from './holidays.service.js';

function createService(result: unknown = []) {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => result);
    return { service: new HolidaysService({ query } as unknown as DatabaseService), query };
}

describe('enumerateDates', () => {
    it('gồm cả hai đầu và qua tháng/năm', () => {
        expect(enumerateDates('2027-01-30', '2027-02-02')).toEqual([
            '2027-01-30', '2027-01-31', '2027-02-01', '2027-02-02',
        ]);
        expect(enumerateDates('2026-12-31', '2027-01-01')).toHaveLength(2);
        expect(enumerateDates('2026-09-02', '2026-09-02')).toEqual(['2026-09-02']);
    });
});

describe('HolidaysService.create', () => {
    it('thêm một ngày: một dòng INSERT, ON DUPLICATE KEY UPDATE', async () => {
        const { service, query } = createService();
        const res = await service.create(5, { name: 'Quốc khánh', date: '2026-09-02' });
        expect(res.dates).toEqual(['2026-09-02']);
        const [sql, params] = query.mock.calls[0];
        expect(sql).toContain('ON DUPLICATE KEY UPDATE');
        expect(params).toEqual(['2026-09-02', 'Quốc khánh', 5]);
    });

    it('thêm cả khoảng ngày trong một câu lệnh', async () => {
        const { service, query } = createService();
        const res = await service.create(5, { name: 'Tết', date: '2027-02-05', end_date: '2027-02-07' });
        expect(res.dates).toHaveLength(3);
        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0][1]).toHaveLength(9);
    });

    it('từ chối ngày không tồn tại, khoảng ngược, khoảng quá dài', async () => {
        const { service, query } = createService();
        await expect(service.create(1, { name: 'x', date: '2026-02-30' })).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.create(1, { name: 'x', date: '2026-09-05', end_date: '2026-09-01' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.create(1, { name: 'x', date: '2026-01-01', end_date: '2026-12-31' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(MAX_HOLIDAY_RANGE_DAYS).toBe(31);
        expect(query).not.toHaveBeenCalled();
    });
});

describe('HolidaysService.remove / list', () => {
    it('xóa ngày không có trong danh sách → 404', async () => {
        const { service } = createService({ affectedRows: 0 });
        await expect(service.remove('2026-09-02')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('xóa thành công', async () => {
        const { service } = createService({ affectedRows: 1 });
        expect(await service.remove('2026-09-02')).toEqual({ deleted: true, date: '2026-09-02' });
    });

    it('list từ chối khoảng ngược', async () => {
        const { service } = createService();
        await expect(service.list({ from: '2026-10-10', to: '2026-10-01' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('list mặc định bắt đầu từ hôm nay', async () => {
        const { service, query } = createService([]);
        await service.list({});
        const [, params] = query.mock.calls[0] as [string, string[]];
        expect(params[0] <= params[1]).toBe(true);
    });
});
