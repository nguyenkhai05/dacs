// Hàm định dạng riêng cho màn Tổng quan & báo cáo (màn 13).

const numberFormat = (maxFraction: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: maxFraction })

/** 5 → "05"; 18 → "18" (số liệu KPI luôn hiện tối thiểu 2 chữ số). */
export const pad2 = (value: number): string => String(Math.trunc(value)).padStart(2, '0')

/** 1234.5 → "1.234,5". */
export const formatNumber = (value: number, maxFraction = 2): string =>
  numberFormat(maxFraction).format(value)

/** 5480000 → "5.480.000 đ". */
export const formatVnd = (value: number): string => `${formatNumber(Math.round(value), 0)} đ`

/** Nhãn gọn trên cột biểu đồ: 4960000 → "4,96 tr"; 0 → "0". */
export function formatMillions(value: number): string {
  if (value === 0) return '0'
  return `${formatNumber(value / 1_000_000, 2)} tr`
}

/** 68.75 → "68,75%"; 8.2 → "8,2%". */
export const formatPercent = (value: number): string => `${formatNumber(value, 2)}%`

/** "17:00","18:00" → "17–18h"; lệch phút thì giữ đủ "17:30–19:00". */
export function formatHourRange(start: string, end: string): string {
  const [startHour, startMinute] = start.split(':')
  const [endHour, endMinute] = end.split(':')
  if (startMinute === '00' && endMinute === '00') {
    return `${Number(startHour)}–${Number(endHour)}h`
  }
  return `${start}–${end}`
}

/** 182 → "182 giờ"; 4.5 → "4,5 giờ". */
export const formatHours = (value: number): string => `${formatNumber(value, 1)} giờ`

export type StatusTone = 'ok' | 'warn' | 'danger' | 'muted'

const BOOKING_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  Pending: { label: 'Chờ cọc', tone: 'warn' },
  Confirmed: { label: 'Đã xác nhận', tone: 'ok' },
  CheckedIn: { label: 'Đã nhận sân', tone: 'ok' },
  Playing: { label: 'Đang đá', tone: 'ok' },
  Completed: { label: 'Hoàn thành', tone: 'muted' },
  Cancelled: { label: 'Đã hủy', tone: 'danger' },
  NoShow: { label: 'Không đến', tone: 'danger' },
}

export function bookingStatus(status: string): { label: string; tone: StatusTone } {
  return BOOKING_STATUS[status] ?? { label: status, tone: 'muted' }
}

export type ReportPeriod = 'day' | 'week' | 'month'

/** Tiêu đề cột doanh thu: "Thuần tháng 09" / "Thuần tuần" / "Thuần ngày". */
export function netColumnTitle(period: ReportPeriod, from: string): string {
  if (period === 'month') return `Thuần tháng ${from.slice(5, 7)}`
  return period === 'week' ? 'Thuần tuần' : 'Thuần ngày'
}

/** Đổi giá trị ô nhập (month → "YYYY-MM", còn lại "YYYY-MM-DD") thành ngày mốc YYYY-MM-DD. */
export function toAnchorDate(period: ReportPeriod, value: string): string | null {
  if (period === 'month') return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : null
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

/** Ngược lại: ngày mốc → giá trị hiển thị trong ô nhập theo kỳ. */
export const toInputValue = (period: ReportPeriod, date: string): string =>
  period === 'month' ? date.slice(0, 7) : date
