import { API_URL, ApiError, apiFetch } from '../../lib/api'
import type { ReportPeriod } from './dashboardUtils'

export type ReportGroup = 'pitch' | 'category'

export interface BookingListItem {
  booking_id: number
  booking_code: string
  customer_name: string
  pitch_name: string
  booking_date: string
  start_time: string
  end_time: string
  status: string
}

export interface Overview {
  date: string
  kpis: {
    total_bookings: number
    pending_deposit_bookings: number
    occupancy_rate: number
    booked_hours: number
    capacity_hours: number
    collected_amount: number
  }
  upcoming_bookings: BookingListItem[]
}

export interface RevenuePoint {
  key: string
  label: string
  gross: number
  refunded: number
  net: number
  is_selected: boolean
}

export interface RevenueTrend {
  date: string
  from: string
  to: string
  total_net: number
  points: RevenuePoint[]
}

export interface ReportRow {
  key: string
  label: string
  bookings: number
  booked_hours: number
  gross: number
  refunded: number
  net_revenue: number
}

export interface Report {
  period: ReportPeriod
  group_by: ReportGroup
  from: string
  to: string
  label: string
  rows: ReportRow[]
  totals: { bookings: number; booked_hours: number; gross: number; refunded: number; net_revenue: number }
  peak: { label: string; occupancy_rate: number; booked_hours: number } | null
  rates: { total_bookings: number; cancelled: number; no_show: number; cancel_rate: number; no_show_rate: number }
}

export interface ReportParams {
  period: ReportPeriod
  date: string
  group_by: ReportGroup
}

const reportQuery = ({ period, date, group_by }: ReportParams) =>
  `period=${period}&date=${date}&group_by=${group_by}`

export const fetchOverview = (date: string, token: string | null, signal?: AbortSignal) =>
  apiFetch<Overview>(`/dashboard/overview?date=${date}`, { token, signal })

export const fetchRevenueTrend = (date: string, token: string | null, signal?: AbortSignal) =>
  apiFetch<RevenueTrend>(`/dashboard/revenue?date=${date}`, { token, signal })

export const fetchReport = (params: ReportParams, token: string | null, signal?: AbortSignal) =>
  apiFetch<Report>(`/dashboard/report?${reportQuery(params)}`, { token, signal })

/** Tải file CSV báo cáo. apiFetch chỉ đọc JSON nên dùng fetch riêng, vẫn gửi kèm token. */
export async function downloadReportCsv(params: ReportParams, token: string | null): Promise<void> {
  const response = await fetch(`${API_URL}/dashboard/report/export?${reportQuery(params)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message =
      body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : 'Không xuất được báo cáo. Vui lòng thử lại.'
    throw new ApiError(message, response.status)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bao-cao-${params.period}-${params.date}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
