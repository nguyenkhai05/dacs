import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
    CreateHolidayDto,
    CreatePitchDto,
    CreatePriceSlotDto,
    UpdatePriceSlotDto,
} from './dto/pitch-admin.dto.js';

const errorsOf = async <T extends object>(cls: new () => T, plain: object) =>
    (await validate(plainToInstance(cls, plain), { whitelist: true })).map(
        (error) => error.property,
    );

describe('CreatePriceSlotDto', () => {
    it('hợp lệ', async () => {
        expect(
            await errorsOf(CreatePriceSlotDto, {
                start_time: '06:00',
                end_time: '16:00',
                price_per_hour: '200000',
            }),
        ).toEqual([]);
    });

    it('giờ sai định dạng, giá âm, quá 2 số lẻ', async () => {
        const errors = await errorsOf(CreatePriceSlotDto, {
            start_time: '6:00',
            end_time: '25:00',
            price_per_hour: -1,
        });
        expect(errors).toEqual(
            expect.arrayContaining(['start_time', 'end_time', 'price_per_hour']),
        );
        expect(
            await errorsOf(CreatePriceSlotDto, {
                start_time: '06:00',
                end_time: '07:00',
                price_per_hour: 1.234,
            }),
        ).toEqual(['price_per_hour']);
    });
});

describe('day_type của khung giá', () => {
    const base = { start_time: '06:00', end_time: '12:00', price_per_hour: 1000 };

    it('nhận All/Weekday/Weekend/Holiday, từ chối giá trị lạ', async () => {
        for (const day_type of ['All', 'Weekday', 'Weekend', 'Holiday']) {
            expect(await errorsOf(CreatePriceSlotDto, { ...base, day_type })).toEqual([]);
        }
        expect(await errorsOf(CreatePriceSlotDto, { ...base, day_type: 'Sunday' })).toEqual(['day_type']);
        expect(await errorsOf(UpdatePriceSlotDto, { day_type: 'Tet' })).toEqual(['day_type']);
    });

    it('bỏ trống day_type vẫn hợp lệ (mặc định All ở service)', async () => {
        expect(await errorsOf(CreatePriceSlotDto, base)).toEqual([]);
    });
});

describe('CreateHolidayDto', () => {
    it('hợp lệ một ngày hoặc cả khoảng', async () => {
        expect(await errorsOf(CreateHolidayDto, { name: 'Quốc khánh', date: '2026-09-02' })).toEqual([]);
        expect(
            await errorsOf(CreateHolidayDto, { name: 'Tết', date: '2027-02-05', end_date: '2027-02-11' }),
        ).toEqual([]);
    });

    it('thiếu tên, sai định dạng ngày', async () => {
        expect(await errorsOf(CreateHolidayDto, { name: ' ', date: '2/9/2026' })).toEqual(
            expect.arrayContaining(['name', 'date']),
        );
    });
});

describe('UpdatePriceSlotDto', () => {
    it('cho phép chỉ gửi giá', async () => {
        expect(await errorsOf(UpdatePriceSlotDto, { price_per_hour: 250000 })).toEqual([]);
    });
});

describe('CreatePitchDto', () => {
    it('thiếu tên và loại sân', async () => {
        expect(await errorsOf(CreatePitchDto, {})).toEqual(
            expect.arrayContaining(['pitch_name', 'category_id']),
        );
    });

    it('trim tên, chặn tên rỗng và status lạ', async () => {
        const dto = plainToInstance(CreatePitchDto, { pitch_name: '  Sân 1  ', category_id: '2' });
        expect(dto.pitch_name).toBe('Sân 1');
        expect(await errorsOf(CreatePitchDto, { pitch_name: '   ', category_id: 1 })).toContain('pitch_name');
        expect(
            await errorsOf(CreatePitchDto, { pitch_name: 'A', category_id: 1, status: 'Broken' }),
        ).toContain('status');
    });
});
