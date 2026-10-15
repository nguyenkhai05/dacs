import { formatMoney } from '../bookings/bookingView'
import { formatVnTime } from '../../lib/format'
import type { InvoiceStatus, LedgerStatus } from './paymentAdminApi'

// Các hàm thuần (không phụ thuộc React) cho màn 17. Tách riêng để dễ viết test.

export type Tone = 'success' | 'warning' | 'danger' | 'muted' | 'info'

/** +223.000 đ / −222.000 đ (dấu trừ thật để dễ nhìn). */
export function formatSignedMoney(value: number): string {
  if (value === 0) return formatMoney(0)
  return `${value > 0 ? '+' : '−'}${formatMoney(Math.abs(value))}`
}

/** Màu nhãn "Kết quả" của một dòng sổ giao dịch. */
export function ledgerTone(status: LedgerStatus): Tone {
  if (status === 'Successful') return 'success'
  if (status === 'Failed') return 'danger'
  return 'warning'
}

/** ISO → "15:03" (giờ Việt Nam). Dữ liệu hỏng → "—". */
export function timeOfDay(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : formatVnTime(date)
}

/** ISO → "05/10" (giờ Việt Nam) dùng cho dòng "Hủy 05/10 lúc 14:30". */
export function dayMonth(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(date)
}

/** "2026-10-05" → "05/10" */
export function dayMonthOfDate(date: string): string {
  const [, month, day] = date.split('-')
  return month && day ? `${day}/${month}` : date
}

/** Ngày YYYY-MM-DD → "05/10/2026" */
export function dateLabel(date: string): string {
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}/${month}/${year}` : date
}

/** Giờ hủy trước giờ đá: "Hủy trước 24 giờ" / "Hủy sau giờ bắt đầu" / "" nếu không biết. */
export function cancelLeadText(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return ''
  if (hours < 0) return 'Hủy sau giờ bắt đầu'
  return `Hủy trước ${Math.floor(hours)} giờ`
}

export const INVOICE_STATUS_ROWS: { status: InvoiceStatus; label: string; meaning: string }[] = [
  { status: 'Unpaid', label: 'Chưa thanh toán', meaning: 'Chưa nhận khoản thu nào' },
  { status: 'PartiallyPaid', label: 'Thanh toán một phần', meaning: 'Đã thu một phần, còn thiếu' },
  { status: 'Paid', label: 'Đã thanh toán', meaning: 'Đã thu đủ tổng đơn' },
  { status: 'PartiallyRefunded', label: 'Hoàn một phần', meaning: 'Đã hoàn một phần số tiền đã thu' },
  { status: 'Refunded', label: 'Đã hoàn toàn bộ', meaning: 'Đã hoàn toàn bộ số tiền đã thu' },
]

export const invoiceStatusLabel = (status: InvoiceStatus): string =>
  INVOICE_STATUS_ROWS.find((row) => row.status === status)?.label ?? status

/**
 * Giờ Việt Nam dạng "YYYY-MM-DDTHH:mm" (đúng định dạng ô datetime-local).
 * Dùng làm giá trị mặc định cho "Thời gian chuyển tiền".
 */
export function vnDateTimeLocal(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** Giá trị datetime-local (hiểu là giờ Việt Nam) → chuỗi ISO gửi lên backend; không hợp lệ → undefined. */
export function vnLocalToIso(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}:00+07:00`)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** Chuẩn hóa số tài khoản người dùng gõ: bỏ khoảng trắng và dấu gạch. */
export const normalizeAccountNumber = (value: string): string => value.replace(/[\s-]/g, '')

export interface AccountErrors {
  bank_name?: string
  bank_account_number?: string
  bank_account_name?: string
}

/** Kiểm tra form tài khoản nhận hoàn, cùng quy tắc với backend (UpdateRefundAccountDto). */
export function validateAccount(values: { bank_name: string; bank_account_number: string; bank_account_name: string }): AccountErrors {
  const errors: AccountErrors = {}
  if (values.bank_name.trim().length < 2) errors.bank_name = 'Nhập tên ngân hàng.'
  if (!/^\d{6,30}$/.test(normalizeAccountNumber(values.bank_account_number))) {
    errors.bank_account_number = 'Số tài khoản gồm 6-30 chữ số.'
  }
  if (values.bank_account_name.trim().length < 2) errors.bank_account_name = 'Nhập tên chủ tài khoản.'
  return errors
}

/** Mã giao dịch ngân hàng: 4-100 ký tự chữ, số, . _ - / (như backend). */
export const isValidTransactionCode = (value: string): boolean => /^[A-Za-z0-9._\-/]{4,100}$/.test(value.trim())
