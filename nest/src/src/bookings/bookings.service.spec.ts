import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { BookingsService } from './bookings.service.js';

const FUTURE_DATE = '2099-01-05';

// Bảng giá mẫu: 06-17h = 200.000đ/giờ, 17-22h = 300.000đ/giờ
const PRICE_SLOTS = [
  { start_time: '06:00:00', end_time: '17:00:00', price_per_hour: '200000.00' },
  { start_time: '17:00:00', end_time: '22:00:00', price_per_hour: '300000.00' },
];

interface Options {
  customerExists?: boolean;
  pitch?: Record<string, unknown> | null;
  overlaps?: unknown[];
  priceSlots?: unknown[];
}

function createService(options: Options = {}) {
  const {
    customerExists = true,
    pitch = { pitch_id: 1, category_id: 1, status: 'Available' },
    overlaps = [],
    priceSlots = PRICE_SLOTS,
  } = options;

  const execute = vi.fn(async (sql: string) => {
    if (sql.includes('FROM pitches')) return [pitch ? [pitch] : []];
    if (sql.includes('FROM bookings')) return [overlaps];
    if (sql.includes('FROM price_slots')) return [priceSlots];
    if (sql.includes('INSERT INTO bookings')) return [{ insertId: 77 }];
    throw new Error(`SQL không mong đợi: ${sql}`);
  });
  const connection = { execute, query: vi.fn().mockResolvedValue([]) };

  const database = {
    query: vi.fn().mockResolvedValue(customerExists ? [{ user_id: 9 }] : []),
    transaction: vi.fn(async (cb: (c: typeof connection) => unknown) =>
      cb(connection),
    ),
  };

  const service = new BookingsService(database as unknown as DatabaseService);
  return { service, execute, database };
}

const baseDto = {
  pitch_id: 1,
  booking_date: FUTURE_DATE,
  start_time: '16:00',
  end_time: '18:00',
};

describe('BookingsService.create', () => {
  it('tính tiền xuyên qua hai khung giá và tạo đơn Pending', async () => {
    const { service, execute } = createService();

    const result = await service.create(9, baseDto);

    // 16-17h * 200.000 + 17-18h * 300.000
    expect(result.booking.total_pitch_price).toBe(500000);
    expect(result.booking.booking_id).toBe(77);
    expect(result.booking.status).toBe('Pending');
    // Phải khóa dòng sân trước khi kiểm tra trùng giờ
    const firstSql = execute.mock.calls[0][0] as string;
    expect(firstSql).toContain('FOR UPDATE');
  });

  it('đặt nửa tiếng được tính theo tỉ lệ', async () => {
    const { service } = createService();

    const result = await service.create(9, {
      ...baseDto,
      start_time: '08:00',
      end_time: '08:30',
    });

    expect(result.booking.total_pitch_price).toBe(100000);
  });

  it('báo 409 khi trùng giờ với đơn đang giữ sân', async () => {
    const { service } = createService({
      overlaps: [{ start_time: '17:00:00', end_time: '18:00:00' }],
    });

    await expect(service.create(9, baseDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('báo lỗi khi khung giờ không có bảng giá phủ hết', async () => {
    const { service } = createService();

    await expect(
      service.create(9, { ...baseDto, start_time: '05:00', end_time: '07:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối thời gian ở quá khứ', async () => {
    const { service, database } = createService();

    await expect(
      service.create(9, { ...baseDto, booking_date: '2000-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('từ chối giờ kết thúc không sau giờ bắt đầu', async () => {
    const { service } = createService();

    await expect(
      service.create(9, { ...baseDto, start_time: '18:00', end_time: '16:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối ngày không tồn tại', async () => {
    const { service } = createService();

    await expect(
      service.create(9, { ...baseDto, booking_date: '2099-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối sân không tồn tại hoặc đang bảo trì', async () => {
    const missing = createService({ pitch: null });
    await expect(missing.service.create(9, baseDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const maintenance = createService({
      pitch: { pitch_id: 1, category_id: 1, status: 'Maintenance' },
    });
    await expect(maintenance.service.create(9, baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('tài khoản chưa có hồ sơ khách hàng bị từ chối', async () => {
    const { service } = createService({ customerExists: false });

    await expect(service.create(9, baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('BookingsService.getAvailability', () => {
  function availabilityService(bookings: unknown[]) {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { pitch_id: 1, pitch_name: 'Sân 1', category_id: 1, status: 'Available' },
      ])
      .mockResolvedValueOnce(PRICE_SLOTS)
      .mockResolvedValueOnce(bookings);
    return new BookingsService({ query } as unknown as DatabaseService);
  }

  it('chia khung giá thành các ca 1 giờ và đánh dấu ca đã đặt', async () => {
    const service = availabilityService([
      { start_time: '17:00:00', end_time: '18:00:00' },
    ]);

    const result = await service.getAvailability('1', FUTURE_DATE);

    expect(result.total_slots).toBe(16); // 11 ca + 5 ca
    expect(result.available_slots).toBe(15);
    const booked = result.slots.find((slot) => slot.start_time === '17:00');
    expect(booked?.available).toBe(false);
    expect(booked?.price_per_hour).toBe(300000);
  });

  it('từ chối pitch_id sai và ngày đã qua', async () => {
    const service = availabilityService([]);

    await expect(
      service.getAvailability('abc', FUTURE_DATE),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getAvailability('1', '2000-01-01'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
