// Kiểu dữ liệu của GET /bookings/:id (màn 10) - khớp với backend MyBookingsService.getDetail.

export type BookingStatus =
  | 'Pending'
  | 'Confirmed'
  | 'CheckedIn'
  | 'Playing'
  | 'Completed'
  | 'Cancelled'
  | 'NoShow'

export type MoneyStatus = 'Pending' | 'Successful' | 'Failed'

export interface PitchLine {
  start_time: string // HH:mm
  end_time: string // HH:mm
  hours: number
  price_per_hour: number
  amount: number
}

export interface ServiceLine {
  service_id: number
  service_name: string
  unit: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface PaymentItem {
  payment_id: number
  method: string // 'Banking' | 'Cash' | ...
  transaction_code: string | null
  amount: number
  status: MoneyStatus
  paid_at: string | null
  created_at: string
}

export interface RefundItem {
  refund_id: number
  amount: number
  reason: string | null
  status: MoneyStatus
  created_at: string
  processed_at: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_account_name: string | null
  failure_reason: string | null
}

export interface HistoryItem {
  old_status: string | null
  new_status: string
  reason: string | null
  changed_at: string
}

export interface RefundPolicy {
  full_hours: number
  partial_hours: number
  partial_percent: number
}

export interface CancellationInfo {
  can_cancel: boolean
  reason: string | null
  hours_until_start: number
  refund_percent: number
  refund_amount: number
  policy: RefundPolicy
}

export interface BookingDetail {
  booking_id: number
  booking_code: string
  status: BookingStatus
  booking_date: string // YYYY-MM-DD
  start_time: string // HH:mm:ss
  end_time: string
  customer_note: string | null
  created_at: string
  customer: { full_name: string; phone_number: string | null }
  hold_minutes: number
  pitch: {
    pitch_id: number
    pitch_name: string
    category_name: string | null
    image_url: string | null
    surface_type: string | null
  }
  services: ServiceLine[]
  /** null khi bảng giá đã đổi sau lúc đặt: giao diện gộp thành một dòng */
  pitch_lines: PitchLine[] | null
  amounts: {
    pitch_total: number
    services_total: number
    total_amount: number
    paid: number
    refunded: number
    refund_pending: number
    remaining: number
  }
  payments: PaymentItem[]
  refunds: RefundItem[]
  history: HistoryItem[]
  hold_seconds_left: number
  cancellation: CancellationInfo
}

export interface CancelResult {
  message: string
  booking_id: number
  status: 'Cancelled'
  deposit_paid: number
  refund: { percent: number; amount: number; status: 'Pending' | null }
}

export interface RefundAccountInput {
  bank_name: string
  bank_account_number: string
  bank_account_name: string
}

export interface RefundAccountResult {
  message: string
  booking_id: number
  updated_refunds: number
}
