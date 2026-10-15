// Các hàm thuần (không gọi API, không đụng React) của màn 12 - Đánh giá sân.

export const MAX_COMMENT_LENGTH = 1000
export const REVIEWS_PAGE_SIZE = 5

const RATING_LABELS: Record<number, string> = {
  1: 'Rất không hài lòng',
  2: 'Chưa hài lòng',
  3: 'Bình thường',
  4: 'Hài lòng',
  5: 'Rất hài lòng',
}

/** 5 → "Rất hài lòng". Số sao ngoài 1–5 → chuỗi rỗng. */
export function ratingLabel(rating: number): string {
  return RATING_LABELS[rating] ?? ''
}

/** 4.8 → "4,8" (dấu phẩy kiểu Việt Nam, luôn có 1 chữ số thập phân). */
export function formatAverage(value: number): string {
  return value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Thời điểm ISO từ backend → "03/10/2026" theo giờ Việt Nam. Dữ liệu hỏng → chuỗi rỗng. */
export function formatReviewDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

/** Phần trăm bề rộng thanh phân bố sao (0–100). Chưa có đánh giá nào → 0. */
export function barPercent(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0
  return Math.min(100, Math.round((count / total) * 100))
}

/** Trang 2, 5 mục/trang, 12 mục → [6, 10]; không có mục nào → [0, 0]. */
export function visibleRange(page: number, limit: number, total: number): [number, number] {
  if (total <= 0) return [0, 0]
  const from = (page - 1) * limit + 1
  return [from, Math.min(total, page * limit)]
}

/** Dãy số trang cần hiện, tối đa `size` nút, ôm quanh trang hiện tại. */
export function pageWindow(page: number, totalPages: number, size = 5): number[] {
  const count = Math.min(size, totalPages)
  let start = Math.max(1, page - Math.floor(count / 2))
  start = Math.min(start, totalPages - count + 1)
  return Array.from({ length: count }, (_, index) => start + index)
}
