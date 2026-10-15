import { formatShortDate, formatTime, toMinutes } from '../../lib/format'
import type { ActivityItem, BookingListItem, BookingStatus } from './myBookingsApi'

// Các hàm thuần (không phụ thuộc React) để chuyển dữ liệu API thành chữ hiển thị.
// Tách riêng để dễ viết test.

export type StatusTone = 'success' | 'warning' | 'info' | 'muted' | 'danger'

const STATUS_VIEW: Record<BookingStatus, { label: string; tone: StatusTone }> = {
  Pending: { label: 'Chờ cọc', tone: 'warning' },
  Confirmed: { label: 'Đã xác nhận', tone: 'success' },
  CheckedIn: { label: 'Đã check-in', tone: 'info' },
  Playing: { label: 'Đang đá', tone: 'info' },
  Completed: { label: 'Hoàn thành', tone: 'muted' },
  Cancelled: { label: 'Đã hủy', tone: 'danger' },
  NoShow: { label: 'Không đến', tone: 'danger' },
}

export function statusView(status: string): { label: string; tone: StatusTone } {
  return STATUS_VIEW[status as BookingStatus] ?? { label: status, tone: 'muted' }
}

/** 740000 → "740.000 đ" (có dấu cách trước chữ đ, đúng như thiết kế). */
export function formatMoney(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(value))} đ`
}

/** 3 → "03" (số liệu ở thẻ tổng quan luôn có ít nhất 2 chữ số). */
export function padCount(value: number): string {
  return String(Math.max(0, value)).padStart(2, '0')
}

/** ("18:00:00", "20:00:00") → "18:00–20:00". */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)}–${formatTime(end)}`
}

/** ("18:00:00", "20:00:00") → "2 giờ"; ("18:00", "19:30") → "1,5 giờ". */
export function formatDuration(start: string, end: string): string {
  const hours = Math.max(0, toMinutes(end) - toMinutes(start)) / 60
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(hours)} giờ`
}

/** ("2026-10-07", "18:00:00") → "07/10 · 18:00". */
export function formatNextSlot(date: string, start: string): string {
  const [day, month] = formatShortDate(date).split('/')
  return `${day}/${month} · ${formatTime(start)}`
}

/** Thời điểm ISO → "05/10 · 15:03" theo giờ Việt Nam. Dữ liệu hỏng → chuỗi rỗng. */
export function formatActivityTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('day')}/${get('month')} · ${get('hour')}:${get('minute')}`
}

/** Câu mô tả một dòng "Hoạt động gần đây". */
export function activityText(activity: ActivityItem): string {
  const money = activity.amount === null ? '' : formatMoney(activity.amount)
  switch (activity.type) {
    case 'deposit_paid':
      return `Đã nhận cọc ${money}`
    case 'status_Confirmed':
      return 'Đơn đã được xác nhận'
    case 'status_Completed':
      return 'Hoàn thành trận đấu'
    case 'status_Cancelled':
      return 'Đơn đã được hủy'
    case 'status_NoShow':
      return 'Ghi nhận không đến sân'
    case 'refund_Pending':
      return `Yêu cầu hoàn cọc ${money} đang chờ duyệt`
    case 'refund_Successful':
      return `Đã hoàn cọc ${money}`
    case 'refund_Failed':
      return `Hoàn cọc ${money} chưa thành công`
    default:
      return 'Cập nhật đơn đặt sân'
  }
}

/** Đếm các đơn "sắp tới" theo trạng thái để hiện dòng phụ "2 đã xác nhận · 1 chờ cọc". */
export function upcomingBreakdown(bookings: BookingListItem[]): string {
  const pending = bookings.filter((b) => b.status === 'Pending').length
  const confirmed = bookings.length - pending
  const parts: string[] = []
  if (confirmed > 0) parts.push(`${confirmed} đã xác nhận`)
  if (pending > 0) parts.push(`${pending} chờ cọc`)
  return parts.join(' · ')
}

/** Chữ viết tắt trong avatar: lấy chữ cái đầu của 2 từ cuối ("Nguyễn Minh Anh" → "MA"). */
export function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words
    .slice(-2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
}
