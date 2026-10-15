import { apiFetch } from '../../lib/api'

// ----- Kiểu dữ liệu (khớp với nest/src/admin-bookings)

export type BookingStatus =
  | 'Pending'
  | 'Confirmed'
  | 'CheckedIn'
  | 'Playing'
  | 'Completed'
  | 'Cancelled'
  | 'NoShow'

export type PaymentSummary =
  | 'Unpaid'
  | 'PartiallyPaid'
  | 'Paid'
  | 'PartiallyRefunded'
  | 'Refunded'

export type ActionKey = 'check_in' | 'collect_cash' | 'complete' | 'no_show' | 'cancel'

export interface ActionState {
  allowed: boolean
  reason: string | null
}

export type Actions = Record<ActionKey, ActionState>

export interface AdminBookingItem {
  booking_id: number
  booking_code: string
  status: BookingStatus
  payment_status: PaymentSummary
  customer: { customer_id: number; full_name: string; phone_number: string }
  pitch: { pitch_id: number; pitch_name: string }
  booking_date: string
  start_time: string
  end_time: string
  total_amount: number
  paid_amount: number
  refunded_amount: number
  due_amount: number
  hold_seconds_left: number
  actions: Actions
}

export interface AdminBookingList {
  date: string
  page: number
  limit: number
  total: number
  total_pages: number
  summary: { total: number; by_status: Partial<Record<BookingStatus, number>> }
  items: AdminBookingItem[]
}

export interface ListParams {
  date: string
  pitch_id?: number
  status?: BookingStatus | ''
  q?: string
  page?: number
  limit?: number
}

export type CellState = 'free' | 'past' | 'closed' | 'unavailable' | 'booked'

export interface ScheduleBooking {
  booking_id: number
  booking_code: string
  status: BookingStatus
  customer_name: string
  phone_number: string
  start_time: string
  end_time: string
}

export interface ScheduleCell {
  start_time: string
  end_time: string
  state: CellState
  booking: ScheduleBooking | null
  extra_bookings: number
}

export interface Schedule {
  date: string
  window: { from: string; to: string }
  hours: { start_time: string; end_time: string }[]
  pitches: {
    pitch_id: number
    pitch_name: string
    category_name: string | null
    status: string
    cells: ScheduleCell[]
  }[]
}

export interface ServiceLine {
  service_id: number
  service_name: string
  unit: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface AdminBookingDetail {
  booking_id: number
  booking_code: string
  status: BookingStatus
  booking_date: string
  start_time: string
  end_time: string
  customer_note: string | null
  pitch: { pitch_id: number; pitch_name: string; category_name: string | null }
  services: ServiceLine[]
  amounts: {
    pitch_total: number
    services_total: number
    total_amount: number
    paid: number
    refunded: number
    refund_pending: number
    remaining: number
  }
  customer: { customer_id: number; full_name: string; phone_number: string; email: string | null } | null
  payment_status: PaymentSummary
  cash_due: number
  actions: Actions
}

export interface CounterPayload {
  pitch_id: number
  booking_date: string
  start_time: string
  end_time: string
  services: { service_id: number; quantity: number }[]
}

export interface CounterConflict {
  booking_id: number
  booking_code: string
  status: BookingStatus
  start_time: string
  end_time: string
  customer_name: string
}

export interface CounterCustomer {
  customer_id: number
  full_name: string
  exists: boolean
}

export interface CounterQuote {
  available: boolean
  conflicts: CounterConflict[]
  customer: CounterCustomer | null
  pitch_total?: number
  services_total?: number
  total_amount?: number
  deposit_percent?: number
  deposit_amount?: number
  remaining_amount?: number
  cash_options?: { full: number; deposit: number }
}

export interface CreatedCounterBooking {
  message: string
  booking: { booking_id: number; booking_code: string; paid_amount: number; due_amount: number }
}

export interface ActionResult {
  message: string
  booking_id: number
  booking_code: string
}

// ----- Gọi API

const BASE = '/admin/bookings'

export function listBookings(params: ListParams, token: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ date: params.date })
  if (params.pitch_id) query.set('pitch_id', String(params.pitch_id))
  if (params.status) query.set('status', params.status)
  if (params.q?.trim()) query.set('q', params.q.trim())
  query.set('page', String(params.page ?? 1))
  query.set('limit', String(params.limit ?? 7))
  return apiFetch<AdminBookingList>(`${BASE}?${query.toString()}`, { token, signal })
}

export function getSchedule(date: string, token: string, signal?: AbortSignal) {
  return apiFetch<Schedule>(`${BASE}/schedule?date=${encodeURIComponent(date)}`, { token, signal })
}

export function getBookingDetail(id: number, token: string, signal?: AbortSignal) {
  return apiFetch<AdminBookingDetail>(`${BASE}/${id}`, { token, signal })
}

export function checkIn(id: number, token: string) {
  return apiFetch<ActionResult>(`${BASE}/${id}/check-in`, { method: 'POST', token })
}

export function collectCash(id: number, amount: number, token: string) {
  return apiFetch<ActionResult>(`${BASE}/${id}/collect-cash`, { method: 'POST', body: { amount }, token })
}

export function completeBooking(id: number, token: string) {
  return apiFetch<ActionResult>(`${BASE}/${id}/complete`, { method: 'POST', token })
}

export function markNoShow(id: number, reason: string, token: string) {
  return apiFetch<ActionResult>(`${BASE}/${id}/no-show`, {
    method: 'POST',
    body: reason.trim() ? { reason: reason.trim() } : {},
    token,
  })
}

export function cancelBooking(id: number, reason: string, fullRefund: boolean, token: string) {
  const body: { reason?: string; full_refund?: boolean } = {}
  if (reason.trim()) body.reason = reason.trim()
  if (fullRefund) body.full_refund = true
  return apiFetch<ActionResult & { refund?: { percent: number; amount: number } }>(`${BASE}/${id}/cancel`, {
    method: 'POST',
    body,
    token,
  })
}

export function counterQuote(payload: CounterPayload & { phone_number?: string }, token: string, signal?: AbortSignal) {
  return apiFetch<CounterQuote>(`${BASE}/counter/quote`, { method: 'POST', body: payload, token, signal })
}

export function createCounterBooking(
  payload: CounterPayload & {
    customer_name: string
    phone_number: string
    payment_mode: 'full' | 'deposit'
    customer_note?: string
  },
  token: string,
) {
  return apiFetch<CreatedCounterBooking>(BASE, { method: 'POST', body: payload, token })
}
