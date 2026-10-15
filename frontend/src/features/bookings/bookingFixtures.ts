// Dữ liệu mẫu cho test (khớp thiết kế màn 10): đơn DS260107 đã xác nhận, cọc 222.000 đ.
import type { BookingDetail } from './bookingTypes'

export function makeDetail(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    booking_id: 107,
    booking_code: 'DS107',
    status: 'Confirmed',
    booking_date: '2026-10-07',
    start_time: '18:00:00',
    end_time: '20:00:00',
    customer_note: 'Đội 10 người, vui lòng chuẩn bị áo bib.',
    created_at: '2026-10-05T08:00:00.000Z',
    customer: { full_name: 'Nguyễn Minh Anh', phone_number: '0912345678' },
    hold_minutes: 15,
    pitch: {
      pitch_id: 1,
      pitch_name: 'Bình An 01',
      category_name: 'Sân 5 người',
      image_url: null,
      surface_type: 'Cỏ nhân tạo',
    },
    services: [
      { service_id: 1, service_name: 'Nước suối', unit: 'chai', quantity: 6, unit_price: 10000, line_total: 60000 },
      { service_id: 2, service_name: 'Áo bib', unit: 'chiếc', quantity: 10, unit_price: 3000, line_total: 30000 },
    ],
    pitch_lines: [
      { start_time: '18:00', end_time: '19:00', hours: 1, price_per_hour: 300000, amount: 300000 },
      { start_time: '19:00', end_time: '20:00', hours: 1, price_per_hour: 350000, amount: 350000 },
    ],
    amounts: {
      pitch_total: 650000,
      services_total: 90000,
      total_amount: 740000,
      paid: 222000,
      refunded: 0,
      refund_pending: 0,
      remaining: 518000,
    },
    payments: [
      {
        payment_id: 1,
        method: 'Banking',
        transaction_code: 'DS107',
        amount: 222000,
        status: 'Successful',
        paid_at: '2026-10-05T08:03:00.000Z',
        created_at: '2026-10-05T08:00:00.000Z',
      },
    ],
    refunds: [],
    history: [
      { old_status: null, new_status: 'Pending', reason: 'Tao booking', changed_at: '2026-10-05T08:00:00.000Z' },
      { old_status: 'Pending', new_status: 'Confirmed', reason: null, changed_at: '2026-10-05T08:03:00.000Z' },
    ],
    hold_seconds_left: 0,
    cancellation: {
      can_cancel: true,
      reason: null,
      hours_until_start: 51,
      refund_percent: 100,
      refund_amount: 222000,
      policy: { full_hours: 24, partial_hours: 12, partial_percent: 0 },
    },
    ...overrides,
  }
}
