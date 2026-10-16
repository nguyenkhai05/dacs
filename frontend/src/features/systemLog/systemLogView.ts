import type { ChangeType } from './systemLogApi'

// Hàm thuần cho màn "Nhật ký hệ thống" (dễ test, không phụ thuộc React).

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh'

export const CHANGE_TYPE_OPTIONS: { value: ChangeType; label: string }[] = [
  { value: 'booking', label: 'Booking' },
  { value: 'pitch', label: 'Sân' },
  { value: 'price', label: 'Giá' },
]

/** Phần ngày giờ theo giờ Việt Nam; undefined nếu chuỗi không phải thời gian hợp lệ. */
function vnParts(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return undefined
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { day: pick('day'), month: pick('month'), year: pick('year'), hour: pick('hour'), minute: pick('minute') }
}

/** "2026-10-05T08:05:00.000Z" → "05/10 · 15:05" (giờ Việt Nam). Dữ liệu hỏng → "—". */
export function formatLogTime(iso: string): string {
  const p = vnParts(iso)
  return p ? `${p.day}/${p.month} · ${p.hour}:${p.minute}` : '—'
}

/** Dạng đầy đủ để hiện khi rê chuột: "05/10/2026 15:05 (UTC+7)". */
export function formatLogTimeFull(iso: string): string {
  const p = vnParts(iso)
  return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} (UTC+7)` : ''
}

/** Khoảng ngày mặc định: từ đầu tháng đến hôm nay (today dạng YYYY-MM-DD). */
export function defaultRange(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 8)}01`, to: today }
}

/** Thông báo lỗi nếu khoảng ngày sai (từ > đến); không có lỗi → ''. */
export function validateRange(from: string, to: string): string {
  return from && to && from > to ? 'Ngày bắt đầu không được sau ngày kết thúc.' : ''
}

export type ValueTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const STATUS_TONES: Record<string, ValueTone> = {
  // Trạng thái booking
  'Chờ cọc': 'warning',
  'Đã xác nhận': 'success',
  'Đã check-in': 'info',
  'Đang đá': 'info',
  'Hoàn thành': 'muted',
  'Đã hủy': 'danger',
  'Vắng mặt': 'danger',
  // Trạng thái sân
  'Hoạt động': 'success',
  'Bảo trì': 'warning',
  'Ngưng hoạt động': 'muted',
}

/** Giá trị là một trạng thái đã biết thì hiện thành nhãn màu; còn lại (tiền, ghi chú...) hiện chữ thường. */
export function toneOfValue(changeType: ChangeType, value: string): ValueTone | null {
  if (changeType === 'price') return null
  return STATUS_TONES[value] ?? null
}

/** Các số trang hiển thị quanh trang hiện tại (tối đa `size` số). */
export function pageWindow(current: number, totalPages: number, size = 5): number[] {
  if (totalPages <= 0) return []
  const start = Math.max(1, Math.min(current - Math.floor(size / 2), totalPages - size + 1))
  const end = Math.min(totalPages, start + size - 1)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}
