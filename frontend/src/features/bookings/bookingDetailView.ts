import { formatShortDate, formatTime, formatVnTime, toMinutes } from '../../lib/format'
import { formatActivityTime, formatNextSlot } from './bookingView'
import type { BookingDetail, BookingStatus, CancellationInfo, RefundItem, RefundPolicy } from './bookingTypes'

// Các hàm thuần (không phụ thuộc React) của màn 10 - Chi tiết booking & hoàn cọc.
// Tách riêng để dễ viết test (xem bookingDetailView.test.ts).

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const STATUS_META: Record<BookingStatus, { label: string; tone: Tone }> = {
  Pending: { label: 'Chờ cọc', tone: 'warning' },
  Confirmed: { label: 'Đã xác nhận', tone: 'success' },
  CheckedIn: { label: 'Đã check-in', tone: 'info' },
  Playing: { label: 'Đang đá', tone: 'info' },
  Completed: { label: 'Hoàn thành', tone: 'neutral' },
  Cancelled: { label: 'Đã hủy', tone: 'danger' },
  NoShow: { label: 'Không đến', tone: 'danger' },
}

// ---------------------------------------------------------------
// Định dạng
// ---------------------------------------------------------------

/** 740000 → "740.000 đ". */
export function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(value))} đ`
}

/** Thời điểm ISO → "05/10 · 15:03" theo giờ Việt Nam. */
export function formatDayTime(iso: string): string {
  return formatActivityTime(iso)
}

/** Số giờ còn lại → "2 ngày 3 giờ", "5 giờ 30 phút", "15 phút"; hết giờ → "đã đến giờ đá". */
export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return 'đã đến giờ đá'

  const days = Math.floor(totalMinutes / 1440)
  const hoursPart = Math.floor((totalMinutes % 1440) / 60)
  const minutesPart = totalMinutes % 60

  if (days > 0) return hoursPart > 0 ? `${days} ngày ${hoursPart} giờ` : `${days} ngày`
  if (hoursPart > 0) return minutesPart > 0 ? `${hoursPart} giờ ${minutesPart} phút` : `${hoursPart} giờ`
  return `${minutesPart} phút`
}

/** 1 → "1 giờ"; 1.5 → "1,5 giờ". */
export function formatHours(hours: number): string {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(hours)} giờ`
}

/** 872 giây → "14:32"; số âm → "00:00". */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/** "05/10/2026 · 15:10" theo giờ Việt Nam. */
function formatNow(ms: number): string {
  const date = new Date(ms)
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return `${formatShortDate(day)} · ${formatVnTime(date)}`
}

// ---------------------------------------------------------------
// Thanh toán và khung cọc
// ---------------------------------------------------------------

const ENDED_STATUSES: BookingStatus[] = ['Cancelled', 'NoShow']

/** Nhãn thanh toán cạnh tổng đơn. Đơn đã hủy / không đến không hiện. */
export function paymentChip(detail: BookingDetail): { label: string; tone: Tone } | null {
  if (ENDED_STATUSES.includes(detail.status)) return null

  const { paid, remaining } = detail.amounts
  if (paid <= 0) return { label: 'Chưa thanh toán', tone: 'warning' }
  if (remaining <= 0) return { label: 'Đã thanh toán đủ', tone: 'success' }
  return { label: 'Thanh toán một phần', tone: 'info' }
}

/** Khung thông báo cọc dưới bảng chi phí. */
export function depositNotice(
  detail: BookingDetail,
): { tone: Tone; title: string; body: string | null } | null {
  if (ENDED_STATUSES.includes(detail.status)) return null

  const { paid, remaining } = detail.amounts

  if (paid <= 0) {
    return {
      tone: 'warning',
      title: 'Chưa đóng cọc',
      body:
        detail.status === 'Pending'
          ? `Sân được giữ chỗ ${detail.hold_minutes} phút kể từ lúc đặt. Thanh toán cọc để xác nhận đơn.`
          : 'Chưa ghi nhận khoản thanh toán nào cho đơn này.',
    }
  }

  if (remaining <= 0) {
    return { tone: 'success', title: `Đã thanh toán đủ ${money(paid)}`, body: null }
  }

  const rest = `Còn lại ${money(remaining)} trả bằng tiền mặt tại sân.`
  const beforeCheckIn = detail.status === 'Pending' || detail.status === 'Confirmed'

  return {
    tone: 'success',
    title: `Đã cọc ${money(paid)}`,
    body: beforeCheckIn ? `${rest} Vui lòng đến trước 10 phút để check-in.` : rest,
  }
}

// ---------------------------------------------------------------
// Bảng chi phí
// ---------------------------------------------------------------

export interface CostRow {
  key: string
  item: string
  quantity: string
  amount: number
}

export function costRows(detail: BookingDetail): CostRow[] {
  const rows: CostRow[] = []

  if (detail.pitch_lines && detail.pitch_lines.length > 0) {
    for (const line of detail.pitch_lines) {
      rows.push({
        key: `pitch-${line.start_time}`,
        item: `Sân · ${line.start_time}–${line.end_time}`,
        quantity: `${formatHours(line.hours)} × ${money(line.price_per_hour)}`,
        amount: line.amount,
      })
    }
  } else {
    // Bảng giá đã đổi sau lúc đặt: gộp một dòng theo số tiền đã chốt
    const hours = Math.max(0, toMinutes(detail.end_time) - toMinutes(detail.start_time)) / 60
    rows.push({
      key: 'pitch',
      item: `Sân · ${formatTime(detail.start_time)}–${formatTime(detail.end_time)}`,
      quantity: formatHours(hours),
      amount: detail.amounts.pitch_total,
    })
  }

  for (const service of detail.services) {
    rows.push({
      key: `service-${service.service_id}`,
      item: service.service_name,
      quantity: `${service.quantity} ${service.unit} × ${money(service.unit_price)}`,
      amount: service.line_total,
    })
  }

  return rows
}

// ---------------------------------------------------------------
// Lý do hủy
// ---------------------------------------------------------------

export interface CancelReason {
  by: 'customer' | 'staff' | 'other'
  text: string | null
}

const CUSTOMER_PREFIX = 'Khách hủy đơn'
const STAFF_PREFIX = 'Nhân viên hủy đơn'

/** Tách người hủy và lý do theo định dạng backend ghi vào lịch sử trạng thái. */
export function parseCancelReason(reason: string | null): CancelReason {
  const value = reason?.trim() ?? ''
  if (!value) return { by: 'other', text: null }

  const split = (prefix: string, by: 'customer' | 'staff'): CancelReason | null => {
    if (!value.startsWith(prefix)) return null
    const text = value.slice(prefix.length).replace(/^\s*:\s*/, '').trim()
    return { by, text: text || null }
  }

  return split(CUSTOMER_PREFIX, 'customer') ?? split(STAFF_PREFIX, 'staff') ?? { by: 'other', text: value }
}

/** Lý do hủy của đơn (lấy từ bản ghi đổi sang Đã hủy). Chưa hủy → null. */
export function cancelReasonOf(detail: BookingDetail): CancelReason | null {
  const entry = [...detail.history].reverse().find((item) => item.new_status === 'Cancelled')
  return entry ? parseCancelReason(entry.reason) : null
}

// ---------------------------------------------------------------
// Tiến trình booking
// ---------------------------------------------------------------

export interface TimelineItem {
  key: string
  title: string
  time: string | null
  note: string | null
  done: boolean
}

const COUNTER_PREFIX = 'Đặt tại quầy'

/** "Đặt tại quầy (thu cọc tiền mặt)" → "Thu cọc tiền mặt"; không có ngoặc → null. */
function counterNote(reason: string | null): string | null {
  const match = /\(([^)]+)\)/.exec(reason ?? '')
  if (!match) return null
  const text = match[1].trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null
}

function cancelNote(reason: string | null): string | null {
  const parsed = parseCancelReason(reason)
  if (parsed.by === 'staff') return parsed.text ? `Nhân viên hủy: ${parsed.text}` : 'Nhân viên hủy'
  return parsed.text
}

export function buildTimeline(detail: BookingDetail): TimelineItem[] {
  const items: TimelineItem[] = []
  const bankPayment = detail.payments.find((p) => p.status === 'Successful' && p.method === 'Banking')

  detail.history.forEach((entry, index) => {
    const base = { key: `history-${index}`, time: formatDayTime(entry.changed_at), done: true }

    if (entry.old_status === null) {
      if (entry.reason?.startsWith(COUNTER_PREFIX)) {
        items.push({ ...base, title: COUNTER_PREFIX, note: counterNote(entry.reason) })
      } else {
        items.push({
          ...base,
          title: 'Tạo đơn',
          note: entry.new_status === 'Pending' ? `Chờ cọc · Giữ chỗ ${detail.hold_minutes} phút` : null,
        })
      }
      return
    }

    switch (entry.new_status) {
      case 'Confirmed':
        items.push({
          ...base,
          title: 'Đã xác nhận',
          note: bankPayment ? `Nhận đủ ${money(bankPayment.amount)} qua VietQR` : null,
        })
        break
      case 'CheckedIn':
        items.push({ ...base, title: 'Đã check-in', note: null })
        break
      case 'Playing':
        items.push({ ...base, title: 'Đang đá', note: null })
        break
      case 'Completed':
        items.push({ ...base, title: 'Hoàn thành', note: null })
        break
      case 'Cancelled':
        items.push({ ...base, title: 'Đã hủy', note: cancelNote(entry.reason) })
        break
      case 'NoShow':
        items.push({ ...base, title: 'Không đến', note: null })
        break
      default:
        items.push({ ...base, title: entry.new_status, note: null })
    }
  })

  if (items.length === 0) {
    items.push({
      key: 'created',
      title: 'Tạo đơn',
      time: formatDayTime(detail.created_at),
      note: null,
      done: true,
    })
  }

  // Các bước sắp tới tùy theo trạng thái hiện tại
  const upcoming = (key: string, title: string, time: string | null, note: string | null = null): TimelineItem => ({
    key,
    title,
    time,
    note,
    done: false,
  })
  const pay = upcoming('todo-pay', 'Thanh toán cọc qua VietQR', null)
  const checkIn = upcoming('todo-check-in', 'Check-in tại sân', formatNextSlot(detail.booking_date, detail.start_time))
  const collect = upcoming('todo-collect', 'Thu tiền mặt & hoàn thành', 'Sau trận')

  switch (detail.status) {
    case 'Pending':
      items.push(pay, checkIn, collect)
      break
    case 'Confirmed':
      items.push(checkIn, collect)
      break
    case 'CheckedIn':
    case 'Playing':
      items.push(collect)
      break
    default:
      break
  }

  return items
}

// ---------------------------------------------------------------
// Chính sách hủy
// ---------------------------------------------------------------

export interface PolicyTier {
  key: string
  title: string
  text: string
  tone: Tone
}

export function policyTiers(policy: RefundPolicy): PolicyTier[] {
  const { full_hours: full, partial_hours: partial, partial_percent: percent } = policy

  if (percent > 0) {
    return [
      { key: 'full', title: `Trước giờ đá ≥ ${full} giờ`, text: 'Hoàn 100% tiền cọc đã nhận.', tone: 'success' },
      { key: 'partial', title: `Trước giờ đá ${partial}–${full} giờ`, text: `Hoàn ${percent}% tiền cọc đã nhận.`, tone: 'warning' },
      { key: 'none', title: `Trước giờ đá < ${partial} giờ`, text: 'Không hoàn tiền cọc.', tone: 'danger' },
    ]
  }

  return [
    { key: 'full', title: `Trước giờ đá ≥ ${full} giờ`, text: 'Hoàn 100% tiền cọc đã nhận.', tone: 'success' },
    { key: 'none', title: `Trước giờ đá < ${full} giờ`, text: 'Không hoàn tiền cọc.', tone: 'warning' },
  ]
}

/** Khung "Hủy lúc này ..." trước nút hủy: cho khách biết sẽ được hoàn bao nhiêu. */
export function cancelNotice(
  cancellation: CancellationInfo,
  paid: number,
  nowMs: number,
): { tone: Tone; title: string; body: string } {
  if (!cancellation.can_cancel) {
    return {
      tone: 'neutral',
      title: 'Không thể hủy booking này',
      body: cancellation.reason ?? 'Đơn này không còn ở trạng thái có thể hủy.',
    }
  }

  const timing = `Hiện tại ${formatNow(nowMs)}; còn ${formatDuration(cancellation.hours_until_start)} trước giờ đá.`

  if (paid <= 0) {
    return {
      tone: 'neutral',
      title: 'Đơn chưa đóng cọc nên hủy không phát sinh hoàn tiền',
      body: `${timing} Sân sẽ được giải phóng ngay khi hủy.`,
    }
  }

  if (cancellation.refund_percent <= 0 || cancellation.refund_amount <= 0) {
    return {
      tone: 'warning',
      title: 'Hủy lúc này: không được hoàn cọc',
      body: `${timing} Theo chính sách hủy, tiền cọc đã đóng sẽ không được hoàn.`,
    }
  }

  const percentText = cancellation.refund_percent < 100 ? ` (${cancellation.refund_percent}%)` : ''
  return {
    tone: cancellation.refund_percent < 100 ? 'warning' : 'success',
    title: `Hủy lúc này: được hoàn ${money(cancellation.refund_amount)}${percentText}`,
    body: `${timing} Khoản hoàn sẽ được quản lý chuyển khoản thủ công.`,
  }
}

// ---------------------------------------------------------------
// Khoản hoàn cọc
// ---------------------------------------------------------------

export interface RefundSummary {
  kind: 'pending' | 'failed' | 'done'
  total: number
  /** Khoản hoàn đại diện (mới nhất theo trạng thái ưu tiên) dùng để điền sẵn tài khoản nhận hoàn */
  current: RefundItem
  failureReason: string | null
}

/** Ưu tiên khoản đang chờ, rồi khoản lỗi, rồi khoản đã xong. Không có khoản hoàn → null. */
export function summarizeRefunds(refunds: RefundItem[]): RefundSummary | null {
  if (refunds.length === 0) return null

  const latest = (items: RefundItem[]) => [...items].sort((a, b) => b.refund_id - a.refund_id)[0]
  const total = refunds.reduce((sum, refund) => sum + refund.amount, 0)

  const pending = refunds.filter((r) => r.status === 'Pending')
  if (pending.length > 0) return { kind: 'pending', total, current: latest(pending), failureReason: null }

  const failed = refunds.filter((r) => r.status === 'Failed')
  if (failed.length > 0) {
    const current = latest(failed)
    return { kind: 'failed', total, current, failureReason: current.failure_reason }
  }

  return { kind: 'done', total, current: latest(refunds), failureReason: null }
}

// ---------------------------------------------------------------
// Form tài khoản nhận hoàn
// ---------------------------------------------------------------

export interface RefundFormValues {
  bank_name: string
  bank_account_number: string
  bank_account_name: string
}

export type RefundFormErrors = Partial<Record<keyof RefundFormValues, string>>

/** "Nguyễn  Minh Anh" → "NGUYEN MINH ANH" (ngân hàng yêu cầu tên không dấu, viết hoa). */
export function normalizeAccountName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Kiểm tra từng ô, cùng quy tắc với backend (RefundAccountDto). Hợp lệ → {}. */
export function validateRefundForm(values: RefundFormValues): RefundFormErrors {
  const errors: RefundFormErrors = {}

  const bank = values.bank_name.trim()
  if (bank.length === 0) errors.bank_name = 'Hãy nhập tên ngân hàng'
  else if (bank.length < 2) errors.bank_name = 'Tên ngân hàng quá ngắn'
  else if (bank.length > 100) errors.bank_name = 'Tên ngân hàng tối đa 100 ký tự'

  const number = values.bank_account_number.replace(/[\s-]/g, '')
  if (!/^\d{6,30}$/.test(number)) errors.bank_account_number = 'Số tài khoản phải gồm 6-30 chữ số'

  const name = normalizeAccountName(values.bank_account_name)
  if (name.length === 0) errors.bank_account_name = 'Hãy nhập tên chủ tài khoản'
  else if (name.length < 2) errors.bank_account_name = 'Tên chủ tài khoản quá ngắn'
  else if (name.length > 100) errors.bank_account_name = 'Tên chủ tài khoản tối đa 100 ký tự'

  return errors
}