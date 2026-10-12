// Hàm định dạng dùng chung cho mọi trang (trước đây mỗi trang tự viết lại một bản).

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh'

/** Ngày hôm nay theo GIỜ VIỆT NAM (YYYY-MM-DD), khớp với cách backend tính "hôm nay". */
export function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** 200000 → "200.000đ". Không có giá trị hợp lệ → "Liên hệ". */
export function formatPrice(value: number | string | null | undefined): string {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return 'Liên hệ'
  return `${new Intl.NumberFormat('vi-VN').format(Number(value))}đ`
}

/** "2026-10-12" → "Thứ Hai, 12 tháng 10, 2026" (dạng đọc được). */
export function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

/** "2026-10-12" → "12/10/2026". */
export function formatShortDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value
}

/** "18:00:00" → "18:00". */
export function formatTime(value: string): string {
  return value.slice(0, 5)
}

/** "18:30" → 1110 (số phút từ 00:00). */
export function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

/** Chuỗi ngày hợp lệ dạng YYYY-MM-DD (kể cả kiểm tra ngày có thật như 30/02). */
export function isValidDateString(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}
