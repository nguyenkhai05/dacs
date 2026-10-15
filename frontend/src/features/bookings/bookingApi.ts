import { apiFetch } from '../../lib/api'
import type {
  BookingDetail,
  CancelResult,
  RefundAccountInput,
  RefundAccountResult,
} from './bookingTypes'

/** GET /bookings/:id - chi tiết một đơn của chính khách đang đăng nhập. */
export function fetchBookingDetail(id: number, token: string | null, signal?: AbortSignal) {
  return apiFetch<BookingDetail>(`/bookings/${id}`, { token, signal })
}

/** POST /bookings/:id/cancel - hủy đơn (lý do không bắt buộc). */
export function cancelBooking(id: number, reason: string, token: string | null) {
  const trimmed = reason.trim()
  return apiFetch<CancelResult>(`/bookings/${id}/cancel`, {
    method: 'POST',
    token,
    body: trimmed ? { reason: trimmed } : {},
  })
}

/** PATCH /bookings/:id/refund-account - điền/sửa tài khoản nhận hoàn cọc. */
export function saveRefundAccount(id: number, input: RefundAccountInput, token: string | null) {
  return apiFetch<RefundAccountResult>(`/bookings/${id}/refund-account`, {
    method: 'PATCH',
    token,
    body: input,
  })
}
