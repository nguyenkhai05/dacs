import { apiFetch } from '../../lib/api'

// ----- Kiểu dữ liệu (khớp với nest/src/user-admin)

export type CustomerStatusFilter = '' | 'active' | 'locked'
export type StaffRole = 'Admin' | 'Staff'

export interface CustomerListItem {
  user_id: number
  full_name: string
  email: string | null
  phone_number: string
  is_active: boolean
  status: 'active' | 'locked'
  total_bookings: number
  cancelled_count: number
  no_show_count: number
}

export interface Pagination {
  page: number
  limit: number
  total: number
  total_pages: number
  from: number
  to: number
}

export interface CustomerList {
  customers: CustomerListItem[]
  pagination: Pagination
}

export interface RecentBooking {
  booking_id: number
  booking_code: string
  booking_date: string
  start_time: string
  end_time: string
  pitch_name: string
  status: string
  services_count: number
  refund_amount: number
  refund_pending_amount: number
  refunded_at: string | null
}

export interface AccountHistoryEntry {
  history_id: number
  action: string
  reason: string | null
  performed_by: number | null
  performed_by_name: string | null
  created_at: string
}

export interface CustomerDetail extends CustomerListItem {
  created_at: string
  note: string
  upcoming_bookings: number
  recent_bookings: RecentBooking[]
  account_history: AccountHistoryEntry[]
}

export interface StaffItem {
  user_id: number
  employee_code: string | null
  full_name: string
  email: string | null
  phone_number: string
  position: string | null
  is_active: boolean
  role: StaffRole
  role_label: string
  is_last_admin: boolean
  can_grant_admin: boolean
  can_revoke_admin: boolean
}

export interface StaffList {
  summary: { total: number; admin_count: number; active_admin_count: number }
  staff: StaffItem[]
}

export interface CreateStaffInput {
  full_name: string
  email: string
  role: StaffRole
  employee_code?: string
  position?: string
  phone_number?: string
}

export interface ListCustomersParams {
  q: string
  status: CustomerStatusFilter
  page: number
  limit?: number
}

// ----- Tab Khách hàng

export function listCustomers(token: string, params: ListCustomersParams, signal?: AbortSignal) {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.status) query.set('status', params.status)
  query.set('page', String(params.page))
  query.set('limit', String(params.limit ?? 10))
  return apiFetch<CustomerList>(`/admin/users/customers?${query}`, { token, signal })
}

export const getCustomer = (token: string, id: number, signal?: AbortSignal) =>
  apiFetch<CustomerDetail>(`/admin/users/customers/${id}`, { token, signal })

export const saveCustomerNote = (token: string, id: number, note: string) =>
  apiFetch<CustomerDetail>(`/admin/users/customers/${id}/note`, { method: 'PATCH', token, body: { note } })

/** Khóa (is_active=false, bắt buộc có lý do) hoặc mở khóa tài khoản khách. */
export const setCustomerStatus = (token: string, id: number, isActive: boolean, reason: string) =>
  apiFetch<CustomerDetail>(`/admin/users/customers/${id}/status`, {
    method: 'PATCH',
    token,
    body: { is_active: isActive, ...(reason ? { reason } : {}) },
  })

// ----- Tab Nhân viên & vai trò

export const listStaff = (token: string, signal?: AbortSignal) =>
  apiFetch<StaffList>('/admin/users/staff', { token, signal })

export const createStaff = (token: string, input: CreateStaffInput) =>
  apiFetch<StaffItem & { email_sent: boolean }>('/admin/users/staff', { method: 'POST', token, body: input })

/** role = 'Admin' → cấp Admin; role = 'Staff' → thu hồi Admin (vẫn là nhân viên). */
export const changeStaffRole = (token: string, id: number, role: StaffRole) =>
  apiFetch<StaffItem>(`/admin/users/staff/${id}/role`, { method: 'PATCH', token, body: { role } })

export const resendStaffInvite = (token: string, id: number) =>
  apiFetch<{ email_sent: boolean }>(`/admin/users/staff/${id}/resend-invite`, { method: 'POST', token })
