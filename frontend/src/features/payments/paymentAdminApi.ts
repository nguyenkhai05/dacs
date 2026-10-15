import { API_URL, ApiError, apiFetch } from '../../lib/api'

// Kiểu dữ liệu + hàm gọi API cho màn 17 "Thanh toán & hoàn cọc".
// Khớp với nest/src/payment-admin (đường dẫn /admin/payments/...).

export type LedgerStatus = 'Successful' | 'Pending' | 'Failed'
export type LedgerMethod = 'Banking' | 'Cash' | 'Momo' | 'VNPay'
export type InvoiceStatus = 'Unpaid' | 'PartiallyPaid' | 'Paid' | 'PartiallyRefunded' | 'Refunded'
export type ReconcileActionKey = 'apply_to_booking' | 'request_refund' | 'dismiss'

export interface PaymentOverview {
  date: string
  kpis: {
    collected_amount: number
    collected_count: number
    refunded_amount: number
    refunded_count: number
    net_revenue: number
  }
  backlog: {
    pending_refund_count: number
    pending_refund_amount: number
    failed_refund_count: number
    reconciliation_open_count: number
  }
}

export interface LedgerItem {
  kind: 'payment' | 'refund' | 'transfer'
  id: number
  code: string
  occurred_at: string | null
  booking_id: number | null
  booking_code: string | null
  customer_name: string | null
  type: 'Deposit' | 'Balance' | 'Refund' | 'Unmatched'
  type_label: string
  /** Dương = tiền vào, âm = tiền hoàn ra */
  amount: number
  method: string
  method_label: string
  status: LedgerStatus
  status_label: string
  counts_in_revenue: boolean
  reference: string | null
}

export interface LedgerPage {
  date: string
  page: number
  limit: number
  total: number
  totals: { collected: number; refunded: number; net: number }
  items: LedgerItem[]
}

export interface LedgerParams {
  date: string
  status?: LedgerStatus | ''
  method?: LedgerMethod | ''
  page?: number
  limit?: number
}

export interface ReconciliationItem {
  transfer_id: number
  code: string
  booking_id: number | null
  booking_code: string | null
  booking_status: string | null
  customer_name: string | null
  customer_phone: string | null
  content: string | null
  reference_code: string | null
  received_amount: number
  expected_amount: number | null
  /** received - expected (âm = thiếu tiền) */
  difference: number | null
  issue: string
  issue_label: string
  status: 'Open' | 'Resolved' | 'Dismissed'
  received_at: string | null
  actions: { action: ReconcileActionKey; label: string }[]
}

export interface ReconciliationPage {
  status: string
  page: number
  limit: number
  total: number
  items: ReconciliationItem[]
}

export interface RefundAccount {
  bank_name: string | null
  account_number: string | null
  account_name: string | null
  is_complete: boolean
}

export interface RefundItem {
  refund_id: number
  code: string
  status: 'Pending' | 'Failed' | 'Successful'
  status_label: string
  amount: number
  reason: string | null
  failure_reason: string | null
  transaction_code: string | null
  requested_at: string | null
  processed_at: string | null
  booking_id: number
  booking_code: string
  booking_status: string
  booking_date: string
  start_time: string
  end_time: string
  pitch_name: string
  customer_name: string | null
  customer_phone: string | null
  account: RefundAccount
}

export interface RefundList {
  filter: string
  page: number
  limit: number
  total: number
  summary: { pending_count: number; pending_amount: number; failed_count: number; done_count: number }
  items: RefundItem[]
}

export interface RefundDetail {
  refund: RefundItem & { processed_by_name: string | null }
  booking: {
    booking_id: number
    booking_code: string
    status: string
    pitch_name: string
    booking_date: string
    start_time: string
    end_time: string
    cancelled_at: string | null
    cancel_reason: string | null
    /** Giờ còn lại từ lúc hủy tới giờ đá (âm = hủy sau giờ bắt đầu) */
    hours_before_start: number | null
    refund_percent: number
  }
  customer: { name: string | null; phone: string | null }
  account: RefundAccount
  invoice: {
    invoice_id: number
    total_amount: number
    status: InvoiceStatus
    paid_amount: number
    refunded_amount: number
    after_confirm: { status: InvoiceStatus; refunded_amount: number; net_revenue_change: number } | null
  } | null
  can: { confirm: boolean; fail: boolean; update_account: boolean }
  history: {
    history_id: number
    old_status: string | null
    new_status: string
    note: string | null
    changed_by_name: string | null
    changed_at: string | null
  }[]
}

export interface ActionResult {
  message: string
  [key: string]: unknown
}

// ----- Gọi API (token luôn là JWT của Admin/Staff)

const BASE = '/admin/payments'

function ledgerQuery(params: LedgerParams): string {
  const query = new URLSearchParams({ date: params.date })
  if (params.status) query.set('status', params.status)
  if (params.method) query.set('method', params.method)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  return query.toString()
}

export const fetchPaymentOverview = (date: string, token: string | null, signal?: AbortSignal) =>
  apiFetch<PaymentOverview>(`${BASE}/overview?date=${encodeURIComponent(date)}`, { token, signal })

export const fetchLedger = (params: LedgerParams, token: string | null, signal?: AbortSignal) =>
  apiFetch<LedgerPage>(`${BASE}/transactions?${ledgerQuery(params)}`, { token, signal })

export const fetchReconciliations = (token: string | null, signal?: AbortSignal) =>
  apiFetch<ReconciliationPage>(`${BASE}/reconciliations?status=Open&limit=20`, { token, signal })

export const resolveReconciliation = (
  id: number,
  body: { action: ReconcileActionKey; extra_amount?: number; note?: string },
  token: string | null,
) => apiFetch<ActionResult & { refund_id: number | null }>(`${BASE}/reconciliations/${id}/resolve`, { method: 'POST', body, token })

export const fetchRefunds = (token: string | null, signal?: AbortSignal) =>
  apiFetch<RefundList>(`${BASE}/refunds?status=open&limit=50`, { token, signal })

export const fetchRefundDetail = (id: number, token: string | null, signal?: AbortSignal) =>
  apiFetch<RefundDetail>(`${BASE}/refunds/${id}`, { token, signal })

export const updateRefundAccount = (
  id: number,
  body: { bank_name: string; bank_account_number: string; bank_account_name: string },
  token: string | null,
) => apiFetch<ActionResult>(`${BASE}/refunds/${id}/account`, { method: 'PATCH', body, token })

export const confirmRefund = (
  id: number,
  body: { transaction_code: string; transferred_at?: string },
  token: string | null,
) => apiFetch<ActionResult>(`${BASE}/refunds/${id}/confirm`, { method: 'POST', body, token })

export const failRefund = (id: number, body: { reason: string }, token: string | null) =>
  apiFetch<ActionResult>(`${BASE}/refunds/${id}/fail`, { method: 'POST', body, token })

/** Tải CSV sổ giao dịch (cùng bộ lọc với bảng). apiFetch chỉ đọc JSON nên dùng fetch riêng, vẫn gửi token. */
export async function downloadLedgerCsv(params: LedgerParams, token: string | null): Promise<void> {
  const { date, status, method } = params
  const response = await fetch(`${API_URL}${BASE}/transactions/export?${ledgerQuery({ date, status, method })}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message =
      body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : 'Không xuất được file CSV. Vui lòng thử lại.'
    throw new ApiError(message, response.status)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `giao-dich-${date}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
