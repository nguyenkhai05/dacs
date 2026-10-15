import { formatVnd } from '../dashboard/dashboardUtils'
import type { CreateStaffInput, Pagination, RecentBooking, StaffRole } from './adminUsersApi'

/** "Hiển thị 1–4 trong 126 khách hàng". */
export function paginationText(pagination: Pagination): string {
  if (pagination.total === 0) return 'Không có khách hàng nào'
  return `Hiển thị ${pagination.from}–${pagination.to} trong ${pagination.total} khách hàng`
}

/** Dãy số trang hiển thị quanh trang hiện tại (tối đa `size` số). */
export function pageWindow(page: number, totalPages: number, size = 5): number[] {
  const count = Math.min(size, Math.max(totalPages, 1))
  const start = Math.min(Math.max(page - Math.floor(count / 2), 1), Math.max(totalPages - count + 1, 1))
  return Array.from({ length: count }, (_, index) => start + index)
}

/** "2026-10-07" → "07/10". */
export const shortDayMonth = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`

/** Mốc thời gian ISO (UTC) → "07/10 18:20" theo giờ Việt Nam. */
export function formatHistoryTime(iso: string): string {
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
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`
}

const HISTORY_LABELS: Record<string, string> = {
  Lock: 'Khóa tài khoản',
  Unlock: 'Mở khóa tài khoản',
  NoteUpdate: 'Cập nhật ghi chú',
  GrantAdmin: 'Cấp quyền Admin',
  RevokeAdmin: 'Thu hồi quyền Admin',
  CreateStaff: 'Tạo tài khoản nhân viên',
}

export const historyLabel = (action: string): string => HISTORY_LABELS[action] ?? action

/**
 * Dòng ghi chú dưới bảng booking: đơn hủy gần nhất có hoàn cọc,
 * vd "DS261008 hủy, hoàn cọc 222.000 đ ngày 03/10."
 */
export function refundNote(bookings: RecentBooking[]): string {
  const booking = bookings.find(
    (item) => item.status === 'Cancelled' && (item.refund_amount > 0 || item.refund_pending_amount > 0),
  )
  if (!booking) return ''

  const cancelled = `${booking.booking_code} hủy ${shortDayMonth(booking.booking_date)}`
  if (booking.refund_amount > 0) {
    const day = booking.refunded_at ? ` ngày ${formatHistoryTime(booking.refunded_at).slice(0, 5)}` : ''
    return `${cancelled}, hoàn cọc ${formatVnd(booking.refund_amount)}${day}.`
  }
  return `${cancelled}, đang chờ hoàn cọc ${formatVnd(booking.refund_pending_amount)}.`
}

export const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'Staff', label: 'Nhân viên' },
  { value: 'Admin', label: 'Admin' },
]

export interface StaffFormValues {
  full_name: string
  employee_code: string
  position: string
  email: string
  phone_number: string
  role: StaffRole
}

export type StaffFormErrors = Partial<Record<keyof StaffFormValues, string>>

export const EMPTY_STAFF_FORM: StaffFormValues = {
  full_name: '',
  employee_code: '',
  position: '',
  email: '',
  phone_number: '',
  role: 'Staff',
}

/** Kiểm tra form tạo nhân viên (cùng luật với backend, để báo lỗi trước khi gửi). */
export function validateStaffForm(values: StaffFormValues): StaffFormErrors {
  const errors: StaffFormErrors = {}
  if (!values.full_name.trim()) errors.full_name = 'Vui lòng nhập họ tên.'
  if (!values.email.trim()) errors.email = 'Vui lòng nhập email đăng nhập.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Email không hợp lệ.'
  const code = values.employee_code.trim()
  if (code && !/^[A-Za-z0-9_-]{2,20}$/.test(code)) {
    errors.employee_code = 'Mã gồm 2-20 ký tự chữ, số, gạch ngang hoặc gạch dưới.'
  }
  const phone = values.phone_number.trim()
  if (phone && !/^[0-9]{10,11}$/.test(phone)) errors.phone_number = 'Số điện thoại gồm 10-11 chữ số.'
  return errors
}

/** Bỏ các trường tùy chọn đang để trống trước khi gửi lên server. */
export function toCreateStaffInput(values: StaffFormValues): CreateStaffInput {
  const input: CreateStaffInput = {
    full_name: values.full_name.trim(),
    email: values.email.trim(),
    role: values.role,
  }
  if (values.employee_code.trim()) input.employee_code = values.employee_code.trim()
  if (values.position.trim()) input.position = values.position.trim()
  if (values.phone_number.trim()) input.phone_number = values.phone_number.trim()
  return input
}
