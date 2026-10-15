import { apiFetch } from '../../lib/api'

// Kiểu dữ liệu + hàm gọi API cho màn 09 "Lịch đặt của tôi".
// Khớp với GET /bookings/my và GET /bookings/my/activity ở backend.

export type BookingStatus =
  | 'Pending'
  | 'Confirmed'
  | 'CheckedIn'
  | 'Playing'
  | 'Completed'
  | 'Cancelled'
  | 'NoShow'

/** Các tab hiển thị ở màn 09 (backend còn có tab "all" nhưng giao diện không dùng). */
export type BookingTab = 'upcoming' | 'completed' | 'cancelled'

export interface BookingListItem {
  booking_id: number
  booking_code: string
  pitch_id: number
  pitch_name: string
  image_url: string | null
  category_name: string | null
  booking_date: string // YYYY-MM-DD
  start_time: string // HH:mm:ss
  end_time: string
  status: BookingStatus
  total_amount: number
  deposit_paid: number
  deposit_required: number
  refund_amount: number
  /** > 0 nghĩa là đơn chờ cọc còn hạn giữ chỗ */
  hold_seconds_left: number
  can_cancel: boolean
}

export interface NextBooking {
  booking_id: number
  booking_code: string
  pitch_name: string
  booking_date: string
  start_time: string
  end_time: string
}

export interface MyBookingsResponse {
  tab: string
  page: number
  limit: number
  total: number
  total_pages: number
  summary: {
    counts: Record<'all' | BookingTab, number>
    total_spent: number
    next_booking: NextBooking | null
  }
  bookings: BookingListItem[]
}

export interface ActivityItem {
  at: string
  type: string
  booking_id: number
  booking_code: string
  amount: number | null
  note: string | null
}

export function fetchMyBookings(
  params: { tab: BookingTab; page: number; limit: number },
  token: string | null,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    tab: params.tab,
    page: String(params.page),
    limit: String(params.limit),
  })
  return apiFetch<MyBookingsResponse>(`/bookings/my?${query.toString()}`, { token, signal })
}

export function fetchMyActivity(token: string | null, limit = 5, signal?: AbortSignal) {
  return apiFetch<{ activities: ActivityItem[] }>(`/bookings/my/activity?limit=${limit}`, {
    token,
    signal,
  })
}
