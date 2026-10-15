import type { AdminService, CreateServicePayload, UpdateServicePayload } from './adminServicesApi'

// Giới hạn khớp với nest/src/service-admin/dto/service-admin.dto.ts
export const MAX_NAME = 100
export const MAX_UNIT = 20
export const MAX_PRICE = 99_999_999
export const MAX_STOCK = 1_000_000
export const DEFAULT_LOW_STOCK_THRESHOLD = 10

/** Giá trị các ô của form (ô số giữ dạng chuỗi để người dùng gõ tự do). */
export interface ServiceFormValues {
  name: string
  unit: string
  price: string
  stock: string
  threshold: string
  active: boolean
}

const grouped = new Intl.NumberFormat('vi-VN')

/** 10000 → "10.000". */
export const groupNumber = (value: number): string => grouped.format(value)

export function toFormValues(service: AdminService | null): ServiceFormValues {
  if (!service) {
    return { name: '', unit: '', price: '', stock: '', threshold: String(DEFAULT_LOW_STOCK_THRESHOLD), active: true }
  }

  return {
    name: service.service_name,
    unit: service.unit,
    price: groupNumber(service.price),
    stock: String(service.stock_quantity),
    threshold: String(service.low_stock_threshold),
    active: service.is_active,
  }
}

/**
 * "10.000", "10000", " 10.000 đ " → 10000. Rỗng, số âm, số thập phân hoặc có chữ → null.
 * (Dấu chấm/phẩy chỉ được hiểu là dấu phân cách hàng nghìn.)
 */
export function parseWholeNumber(text: string): number | null {
  const cleaned = text.replace(/\s|đ|Đ/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '')
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null
}

type Built =
  | { ok: true; payload: CreateServicePayload; changes: UpdateServicePayload }
  | { ok: false; error: string }

/**
 * Kiểm tra form (cùng luật với backend) và dựng dữ liệu gửi đi.
 * `original` = null khi thêm mới; khi sửa chỉ gửi những trường thực sự đổi.
 */
export function buildServicePayload(values: ServiceFormValues, original: AdminService | null): Built {
  const name = values.name.trim()
  const unit = values.unit.trim()

  if (!name) return { ok: false, error: 'Tên dịch vụ không được để trống.' }
  if (name.length > MAX_NAME) return { ok: false, error: `Tên dịch vụ tối đa ${MAX_NAME} ký tự.` }
  if (!unit) return { ok: false, error: 'Đơn vị không được để trống.' }
  if (unit.length > MAX_UNIT) return { ok: false, error: `Đơn vị tối đa ${MAX_UNIT} ký tự.` }

  const price = parseWholeNumber(values.price)
  if (price === null) return { ok: false, error: 'Giá bán phải là số nguyên không âm.' }
  if (price > MAX_PRICE) return { ok: false, error: `Giá bán tối đa ${groupNumber(MAX_PRICE)} đ.` }

  const stock = parseWholeNumber(values.stock)
  if (stock === null) return { ok: false, error: 'Số lượng tồn kho phải là số nguyên không âm.' }
  if (stock > MAX_STOCK) return { ok: false, error: `Số lượng tồn kho tối đa ${groupNumber(MAX_STOCK)}.` }

  const threshold = parseWholeNumber(values.threshold)
  if (threshold === null) return { ok: false, error: 'Ngưỡng cảnh báo phải là số nguyên không âm.' }
  if (threshold > MAX_STOCK) return { ok: false, error: `Ngưỡng cảnh báo tối đa ${groupNumber(MAX_STOCK)}.` }

  const payload: CreateServicePayload = {
    service_name: name,
    unit,
    price,
    stock_quantity: stock,
    low_stock_threshold: threshold,
    is_active: values.active,
  }

  if (!original) return { ok: true, payload, changes: payload }

  const changes: UpdateServicePayload = {}
  if (payload.service_name !== original.service_name) changes.service_name = payload.service_name
  if (payload.unit !== original.unit) changes.unit = payload.unit
  if (payload.price !== original.price) changes.price = payload.price
  if (payload.stock_quantity !== original.stock_quantity) changes.stock_quantity = payload.stock_quantity
  if (payload.low_stock_threshold !== original.low_stock_threshold) {
    changes.low_stock_threshold = payload.low_stock_threshold
  }
  if (payload.is_active !== original.is_active) changes.is_active = payload.is_active

  if (Object.keys(changes).length === 0) {
    return { ok: false, error: 'Bạn chưa thay đổi thông tin nào.' }
  }

  return { ok: true, payload, changes }
}

/** Ô "Tồn kho" trong bảng: 120 → "120"; sắp hết → "4 · thấp". */
export const stockCell = (service: Pick<AdminService, 'stock_quantity' | 'is_low_stock'>): string =>
  service.is_low_stock ? `${service.stock_quantity} · thấp` : String(service.stock_quantity)

/** Dòng nhỏ của thẻ "Cần bổ sung kho": "Khăn lạnh · còn 4 gói" (+ " · và 2 dịch vụ khác"). */
export function lowStockSummary(items: AdminService[]): string {
  if (items.length === 0) return 'Tồn kho đang đủ'

  const [first, ...rest] = items
  const base = `${first.service_name} · còn ${first.stock_quantity} ${first.unit}`
  return rest.length > 0 ? `${base} · và ${rest.length} dịch vụ khác` : base
}
