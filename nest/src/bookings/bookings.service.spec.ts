import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from '../database/database.service.js';
import { BookingsService } from './bookings.service.js';

const FUTURE_DATE = '2099-01-05';

// Bảng giá mẫu: 06-17h = 200.000đ/giờ, 17-22h = 300.000đ/giờ
const PRICE_SLOTS = [
  { start_time: '06:00:00', end_time: '17:00:00', price_per_hour: '200000.00' },
  { start_time: '17:00:00', end_time: '22:00:00', price_per_hour: '300000.00' },
];

const SERVICE_ROWS = [
  {
    service_id: 1,
    service_name: 'Nước Aquafina',
    unit: 'chai',
    price: '10000.00',
    stock_quantity: 50,
    is_active: 1,
  },
  {
    service_id: 2,
    service_name: 'Thuê bóng',
    unit: 'quả',
    price: '30000.00',
    stock_quantity: 2,
    is_active: 1,
  },
  {
    service_id: 3,
    service_name: 'Áo bib',
    unit: 'bộ',
    price: '20000.00',
    stock_quantity: 10,
    is_active: 0,
  },
];

interface Options {
  customerExists?: boolean;
  services?: unknown[];
  stockAffected?: number;
  config?: Record<string, string>;
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
    services = SERVICE_ROWS,
    stockAffected = 1,
    config = {},
  } = options;

  const execute = vi.fn(async (sql: string) => {
    if (sql.includes('FROM pitches')) return [pitch ? [pitch] : []];
    if (sql.includes('FROM bookings')) return [overlaps];
    if (sql.includes('FROM price_slots')) return [priceSlots];
    if (sql.includes('FROM services')) return [services];
    if (sql.includes('INSERT INTO bookings')) return [{ insertId: 77 }];
    if (sql.includes('INSERT INTO booking_services')) return [{ insertId: 1 }];
    if (sql.includes('UPDATE services')) return [{ affectedRows: stockAffected }];
    throw new Error(`SQL không mong đợi: ${sql}`);
  });
  const connection = { execute, query: vi.fn().mockResolvedValue([]) };

  const database = {
    query: vi.fn().mockResolvedValue(customerExists ? [{ user_id: 9 }] : []),
    transaction: vi.fn(async (cb: (c: typeof connection) => unknown) =>
      cb(connection),
    ),
  };

  const configService = {
    get: (key: string) => config[key],
  } as unknown as ConfigService;
  const service = new BookingsService(
    database as unknown as DatabaseService,
    configService,
  );
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

describe('BookingsService.create với dịch vụ đi kèm', () => {
  const withServices = (services: { service_id: number; quantity: number }[]) => ({
    ...baseDto,
    services,
  });

  it('cộng tiền dịch vụ vào tổng, lưu giá lúc đặt và trừ tồn kho', async () => {
    const { service, execute } = createService();

    const result = await service.create(
      9,
      withServices([
        { service_id: 1, quantity: 4 },
        { service_id: 2, quantity: 1 },
      ]),
    );

    // sân 500.000 + 4 nước * 10.000 + 1 bóng * 30.000
    expect(result.booking.services_total).toBe(70000);
    expect(result.booking.total_amount).toBe(570000);
    // cọc mặc định 30%
    expect(result.booking.deposit_percent).toBe(30);
    expect(result.booking.deposit_amount).toBe(171000);
    expect(result.booking.remaining_amount).toBe(399000);
    expect(result.booking.services).toHaveLength(2);

    const sqls = execute.mock.calls.map((call) => call[0] as string);
    expect(sqls.filter((sql) => sql.includes('INSERT INTO booking_services'))).toHaveLength(2);
    expect(sqls.filter((sql) => sql.includes('UPDATE services'))).toHaveLength(2);

    const insertCall = execute.mock.calls.find((call) =>
      (call[0] as string).includes('INSERT INTO booking_services'),
    ) as unknown[];
    // [booking_id, service_id, quantity, unit_price]
    expect(insertCall[1]).toEqual([77, 1, 4, 10000]);
  });

  it('khóa dòng dịch vụ khi tạo đơn để không bán lố tồn kho', async () => {
    const { service, execute } = createService();

    await service.create(9, withServices([{ service_id: 1, quantity: 1 }]));

    const select = execute.mock.calls.find((call) =>
      (call[0] as string).includes('FROM services'),
    ) as unknown[];
    expect(select[0]).toContain('FOR UPDATE');
  });

  it('gộp các dòng trùng service_id', async () => {
    const { service } = createService();

    const result = await service.create(
      9,
      withServices([
        { service_id: 1, quantity: 2 },
        { service_id: 1, quantity: 3 },
      ]),
    );

    expect(result.booking.services).toHaveLength(1);
    expect(result.booking.services[0].quantity).toBe(5);
  });

  it('báo 409 khi vượt quá tồn kho', async () => {
    const { service } = createService();

    await expect(
      service.create(9, withServices([{ service_id: 2, quantity: 3 }])),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('từ chối dịch vụ không tồn tại hoặc ngừng kinh doanh', async () => {
    const { service } = createService();

    await expect(
      service.create(9, withServices([{ service_id: 99, quantity: 1 }])),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(9, withServices([{ service_id: 3, quantity: 1 }])),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối tổng số lượng một dịch vụ quá 99', async () => {
    const { service } = createService();

    await expect(
      service.create(
        9,
        withServices([
          { service_id: 1, quantity: 60 },
          { service_id: 1, quantity: 60 },
        ]),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('báo lỗi nếu giữ hàng thất bại (hết hàng sát giờ)', async () => {
    const { service } = createService({ stockAffected: 0 });

    await expect(
      service.create(9, withServices([{ service_id: 1, quantity: 1 }])),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('không dịch vụ → không đụng tới kho', async () => {
    const { service, execute } = createService();

    await service.create(9, baseDto);

    const sqls = execute.mock.calls.map((call) => call[0] as string);
    expect(sqls.some((sql) => sql.includes('booking_services'))).toBe(false);
    expect(sqls.some((sql) => sql.includes('UPDATE services'))).toBe(false);
  });

  it('dùng DEPOSIT_PERCENT trong cấu hình', async () => {
    const { service } = createService({ config: { DEPOSIT_PERCENT: '50' } });

    const result = await service.create(9, baseDto);

    expect(result.booking.deposit_amount).toBe(250000);
  });
});

describe('BookingsService.quote', () => {
  it('tính tiền thử mà không tạo đơn và không khóa dòng', async () => {
    const { service, execute } = createService();

    const result = await service.quote({
      ...baseDto,
      services: [{ service_id: 1, quantity: 2 }],
    });

    expect(result.total_amount).toBe(520000);
    expect(result.deposit_amount).toBe(156000);
    const sqls = execute.mock.calls.map((call) => call[0] as string);
    expect(sqls.some((sql) => sql.includes('INSERT INTO bookings'))).toBe(false);
    expect(sqls.some((sql) => sql.includes('FOR UPDATE'))).toBe(false);
  });

  it('báo 409 nếu khung giờ đã có người đặt', async () => {
    const { service } = createService({
      overlaps: [{ start_time: '16:00:00', end_time: '17:00:00' }],
    });

    await expect(service.quote(baseDto)).rejects.toBeInstanceOf(ConflictException);
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
    return new BookingsService(
      { query } as unknown as DatabaseService,
      { get: () => undefined } as unknown as ConfigService,
    );
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
