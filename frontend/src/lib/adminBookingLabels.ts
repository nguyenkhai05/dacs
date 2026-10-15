import type { BookingStatus, PaymentSummary } from '../features/admin/adminBookingsApi'

export const STATUS_LABEL: Record<BookingStatus, string> = {
  Pending: 'Chờ cọc',
  Confirmed: 'Đã xác nhận',
  CheckedIn: 'Đã check-in',
  Playing: 'Đang đá',
  Completed: 'Hoàn thành',
  Cancelled: 'Đã hủy',
  NoShow: 'Không đến',
}

export const PAYMENT_LABEL: Record<PaymentSummary, string> = {
  Unpaid: 'Chưa thanh toán',
  PartiallyPaid: 'Thanh toán một phần',
  Paid: 'Đã thanh toán',
  PartiallyRefunded: 'Hoàn tiền một phần',
  Refunded: 'Đã hoàn tiền',
}

/** Thứ tự hiển thị trong ô lọc trạng thái. */
export const STATUS_OPTIONS: BookingStatus[] = [
  'Pending',
  'Confirmed',
  'CheckedIn',
  'Playing',
  'Completed',
  'Cancelled',
  'NoShow',
]

/** Giờ: "17:00:00" → "17:00". */
export function hhmm(value: string): string {
  return value.slice(0, 5)
}
