import { describe, expect, it, vi } from 'vitest';

import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { MyBookingsService } from './my-bookings.service.js';

const user = { sub: 12, email: 'a@b.c', roles: ['Customer'] };

function createController(
  bookings: Partial<BookingsService> = {},
  mine: Partial<MyBookingsService> = {},
) {
  return new BookingsController(
    bookings as BookingsService,
    mine as MyBookingsService,
  );
}

describe('BookingsController', () => {
  it('create lấy id người dùng từ JWT (sub) chứ không từ body', async () => {
    const create = vi.fn().mockResolvedValue({ ok: true });
    const controller = createController({ create });
    const dto = {
      pitch_id: 1,
      booking_date: '2099-01-05',
      start_time: '16:00',
      end_time: '17:00',
    };

    await controller.create(user, dto);

    expect(create).toHaveBeenCalledWith(12, dto);
  });

  it('availability chuyển tham số cho service', () => {
    const getAvailability = vi.fn().mockReturnValue('x');
    const controller = createController({ getAvailability });

    controller.getAvailability('3', '2099-01-05');

    expect(getAvailability).toHaveBeenCalledWith('3', '2099-01-05');
  });

  it('quote chuyển dữ liệu cho service', () => {
    const quote = vi.fn().mockReturnValue('x');
    const controller = createController({ quote });
    const dto = {
      pitch_id: 1,
      booking_date: '2099-01-05',
      start_time: '16:00',
      end_time: '17:00',
    };

    controller.quote(dto);

    expect(quote).toHaveBeenCalledWith(dto);
  });

  it('listMine chỉ lấy đơn của người đang đăng nhập', () => {
    const listMine = vi.fn().mockReturnValue('x');
    const controller = createController({}, { listMine });

    controller.listMine(user, { tab: 'upcoming', page: 2 });

    expect(listMine).toHaveBeenCalledWith(12, { tab: 'upcoming', page: 2 });
  });

  it('getDetail truyền id người dùng và vai trò', () => {
    const getDetail = vi.fn().mockReturnValue('x');
    const controller = createController({}, { getDetail });

    controller.getDetail(user, 5);

    expect(getDetail).toHaveBeenCalledWith(12, ['Customer'], 5);
  });

  it('cancel truyền id người dùng, id đơn và lý do', () => {
    const cancel = vi.fn().mockReturnValue('x');
    const controller = createController({}, { cancel });

    controller.cancel(user, 5, { reason: 'Bận việc' });

    expect(cancel).toHaveBeenCalledWith(12, 5, 'Bận việc');
  });
});
