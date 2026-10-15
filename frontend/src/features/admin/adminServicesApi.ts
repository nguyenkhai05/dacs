import { apiFetch } from '../../lib/api'

// ----- Kiểu dữ liệu (khớp với nest/src/service-admin)

export interface AdminService {
  service_id: number
  service_name: string
  unit: string
  price: number
  stock_quantity: number
  /** Cảnh báo "sắp hết" khi tồn kho thấp hơn số này */
  low_stock_threshold: number
  is_active: boolean
  /** Đang bán và tồn kho thấp hơn ngưỡng cảnh báo */
  is_low_stock: boolean
}

export interface AdminServiceList {
  summary: {
    total: number
    active: number
    inactive: number
    low_stock: number
    low_stock_items: AdminService[]
  }
  services: AdminService[]
}

export interface CreateServicePayload {
  service_name: string
  unit: string
  price: number
  stock_quantity: number
  low_stock_threshold: number
  is_active: boolean
}

export type UpdateServicePayload = Partial<CreateServicePayload>

// ----- Gọi API (Admin + Staff xem được; thêm/sửa chỉ Admin)

export function listServices(token: string, signal?: AbortSignal) {
  return apiFetch<AdminServiceList>('/admin/services', { token, signal })
}

export function createService(payload: CreateServicePayload, token: string) {
  return apiFetch<AdminService>('/admin/services', { method: 'POST', body: payload, token })
}

export function updateService(id: number, payload: UpdateServicePayload, token: string) {
  return apiFetch<AdminService>(`/admin/services/${id}`, { method: 'PATCH', body: payload, token })
}
