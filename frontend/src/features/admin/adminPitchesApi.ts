import { apiFetch } from '../../lib/api'

// ----- Kiểu dữ liệu (khớp với nest/src/pitch-admin)

export type PitchStatus = 'Available' | 'Maintenance' | 'Inactive'
export type DayType = 'All' | 'Weekday' | 'Weekend' | 'Holiday'

export interface AdminPitch {
  pitch_id: number
  pitch_name: string
  category_id: number | null
  category_name: string | null
  status: PitchStatus
  notes: string | null
  image_url: string | null
  surface_type: string | null
  address: string | null
  district: string | null
  amenities: string[]
  min_price: number | null
  max_price: number | null
  has_pricing: boolean
  upcoming_bookings: number
}

export interface AdminPitchList {
  summary: { total: number; available: number; maintenance: number; inactive: number }
  pitches: AdminPitch[]
}

export interface PriceSlot {
  price_slot_id: number
  category_id: number
  day_type: DayType
  start_time: string
  end_time: string
  price_per_hour: number
}

export interface TimeRange {
  start_time: string
  end_time: string
}

export type PriceGaps = Partial<Record<'Weekday' | 'Weekend' | 'Holiday', TimeRange[]>>

export interface PitchCategory {
  category_id: number
  category_name: string
  description: string | null
  is_active: boolean
  pitch_count: number
  price_slots: PriceSlot[]
  price_gaps: PriceGaps
}

export interface PitchPayload {
  pitch_name?: string
  category_id?: number
  status?: PitchStatus
  notes?: string
  image_url?: string
  surface_type?: string
  address?: string
  district?: string
  amenities?: string[]
}

export interface SlotPayload {
  day_type?: DayType
  start_time?: string
  end_time?: string
  price_per_hour?: number
}

// ----- Gọi API

export function listPitches(token: string, params: { status?: PitchStatus | ''; q?: string }, signal?: AbortSignal) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.q?.trim()) query.set('q', params.q.trim())
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return apiFetch<AdminPitchList>(`/admin/pitches${suffix}`, { token, signal })
}

export function createPitch(payload: PitchPayload, token: string) {
  return apiFetch<AdminPitch>('/admin/pitches', { method: 'POST', body: payload, token })
}

export function updatePitch(id: number, payload: PitchPayload, token: string) {
  return apiFetch<AdminPitch>(`/admin/pitches/${id}`, { method: 'PATCH', body: payload, token })
}

/** Nhân viên (Staff) chỉ được đổi trạng thái sân, không sửa các thông tin khác. */
export function changePitchStatus(id: number, status: PitchStatus, token: string) {
  return apiFetch<AdminPitch>(`/admin/pitches/${id}/status`, { method: 'PATCH', body: { status }, token })
}

export function listCategories(token: string, signal?: AbortSignal) {
  return apiFetch<PitchCategory[]>('/admin/pitch-categories', { token, signal })
}

export function createCategory(payload: { category_name: string; description?: string }, token: string) {
  return apiFetch<unknown>('/admin/pitch-categories', { method: 'POST', body: payload, token })
}

export function updateCategory(
  id: number,
  payload: { category_name?: string; description?: string; is_active?: boolean },
  token: string,
) {
  return apiFetch<unknown>(`/admin/pitch-categories/${id}`, { method: 'PATCH', body: payload, token })
}

export function createPriceSlot(categoryId: number, payload: Required<SlotPayload>, token: string) {
  return apiFetch<unknown>(`/admin/pitch-categories/${categoryId}/price-slots`, {
    method: 'POST',
    body: payload,
    token,
  })
}

export function updatePriceSlot(slotId: number, payload: SlotPayload, token: string) {
  return apiFetch<unknown>(`/admin/price-slots/${slotId}`, { method: 'PATCH', body: payload, token })
}

export function deletePriceSlot(slotId: number, token: string) {
  return apiFetch<unknown>(`/admin/price-slots/${slotId}`, { method: 'DELETE', token })
}
