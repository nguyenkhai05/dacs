import { describe, expect, it, vi } from 'vitest';

import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

describe('BookingsController', () => {
  it('create lấy id người dùng từ JWT (sub) chứ không từ body', async () => {
    const create = vi.fn().mockResolvedValue({ ok: true });
    const controller = new BookingsController({
      create,
    } as unknown as BookingsService);
    const dto = {
      pitch_id: 1,
      booking_date: '2099-01-05',
      start_time: '16:00',
      end_time: '17:00',
    };

    await controller.create({ sub: 12, email: 'a@b.c', roles: [] }, dto);

    expect(create).toHaveBeenCalledWith(12, dto);
  });

  it('availability chuyển tham số cho service', () => {
    const getAvailability = vi.fn().mockReturnValue('x');
    const controller = new BookingsController({
      getAvailability,
    } as unknown as BookingsService);

    controller.getAvailability('3', '2099-01-05');

    expect(getAvailability).toHaveBeenCalledWith('3', '2099-01-05');
  });
});
