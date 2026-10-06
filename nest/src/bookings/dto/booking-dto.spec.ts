import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { CancelBookingDto } from './cancel-booking.dto.js';
import { CreateBookingDto } from './create-booking.dto.js';
import { MyBookingsQueryDto } from './my-bookings-query.dto.js';
import { QuoteBookingDto } from './quote-booking.dto.js';

// Dùng đúng cấu hình ValidationPipe như trong main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const transform = <T>(metatype: new () => T, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

const base = {
  pitch_id: '1', // frontend có thể gửi chuỗi
  booking_date: '2099-01-05',
  start_time: '16:00',
  end_time: '17:00',
};

describe('CreateBookingDto / QuoteBookingDto', () => {
  it('chấp nhận đơn có dịch vụ và ép kiểu số', async () => {
    const dto = (await transform(CreateBookingDto, {
      ...base,
      services: [{ service_id: '2', quantity: '3' }],
      customer_note: 'Gần cổng',
    })) as CreateBookingDto;

    expect(dto.pitch_id).toBe(1);
    expect(dto.services?.[0]).toMatchObject({ service_id: 2, quantity: 3 });
    expect(dto.customer_note).toBe('Gần cổng');
  });

  it('không bắt buộc services', async () => {
    await expect(transform(CreateBookingDto, base)).resolves.toBeDefined();
  });

  it('từ chối số lượng ≤ 0, quá 99 hoặc không phải số nguyên', async () => {
    for (const quantity of [0, -1, 100, 1.5]) {
      await expect(
        transform(CreateBookingDto, { ...base, services: [{ service_id: 1, quantity }] }),
      ).rejects.toBeDefined();
    }
  });

  it('từ chối quá 20 dịch vụ và phần tử sai kiểu', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ service_id: i + 1, quantity: 1 }));

    await expect(
      transform(CreateBookingDto, { ...base, services: many }),
    ).rejects.toBeDefined();
    await expect(
      transform(CreateBookingDto, { ...base, services: 'nuoc' }),
    ).rejects.toBeDefined();
    await expect(
      transform(CreateBookingDto, { ...base, services: [{ service_id: 'abc', quantity: 1 }] }),
    ).rejects.toBeDefined();
  });

  it('bỏ trường lạ (whitelist), kể cả giá tiền do client gửi lên', async () => {
    const dto = (await transform(CreateBookingDto, {
      ...base,
      total_pitch_price: 1,
      services: [{ service_id: 1, quantity: 1, unit_price: 1 }],
    })) as Record<string, unknown>;

    expect(dto.total_pitch_price).toBeUndefined();
    expect((dto.services as Record<string, unknown>[])[0].unit_price).toBeUndefined();
  });

  it('quote không nhận ghi chú', async () => {
    const dto = (await transform(QuoteBookingDto, {
      ...base,
      customer_note: 'x',
    })) as Record<string, unknown>;

    expect(dto.customer_note).toBeUndefined();
  });
});

describe('MyBookingsQueryDto / CancelBookingDto', () => {
  it('ép page/limit sang số và kiểm tra tab', async () => {
    const dto = (await transform(MyBookingsQueryDto, {
      tab: 'upcoming',
      page: '2',
      limit: '20',
    })) as MyBookingsQueryDto;

    expect(dto).toMatchObject({ tab: 'upcoming', page: 2, limit: 20 });
    await expect(transform(MyBookingsQueryDto, { tab: 'abc' })).rejects.toBeDefined();
    await expect(transform(MyBookingsQueryDto, { limit: '500' })).rejects.toBeDefined();
  });

  it('lý do hủy tối đa 500 ký tự và không bắt buộc', async () => {
    await expect(transform(CancelBookingDto, {})).resolves.toBeDefined();
    await expect(
      transform(CancelBookingDto, { reason: 'a'.repeat(501) }),
    ).rejects.toBeDefined();
  });
});
