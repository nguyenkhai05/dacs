import { apiFetch } from '../../lib/api'

// Kiểu dữ liệu + hàm gọi API cho màn 19 "Nhật ký hệ thống" (chỉ đọc).
// Khớp với nest/src/system-log (đường dẫn /admin/system-logs).

export type ChangeType = 'booking' | 'pitch' | 'price'

export interface SystemLogActor {
  /** null = thao tác do hệ thống tự thực hiện */
  user_id: number | null
  display_name: string
}

export interface SystemLogItem {
  id: string
  /** ISO 8601 (UTC); hiển thị theo giờ Việt Nam */
  changed_at: string
  actor: SystemLogActor
  change_type: ChangeType
  /** Dòng chính: mã đơn / tên sân / khung giá */
  target: string
  /** Dòng phụ: mô tả thao tác, vd "Tạo booking" */
  action: string
  old_value: string
  new_value: string
}

export interface SystemLogPage {
  items: SystemLogItem[]
  total: number
  page: number
  limit: number
  total_pages: number
}

export interface SystemLogActorOption {
  user_id: number
  display_name: string
}

export interface SystemLogParams {
  /** user_id; '' = tất cả */
  actorId?: string
  changeType?: ChangeType | ''
  /** YYYY-MM-DD, '' = không giới hạn */
  from?: string
  to?: string
  page?: number
  limit?: number
}

const BASE = '/admin/system-logs'

export function systemLogQuery(params: SystemLogParams): string {
  const query = new URLSearchParams()
  if (params.actorId) query.set('actor_id', params.actorId)
  if (params.changeType) query.set('change_type', params.changeType)
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  return query.toString()
}

export const fetchSystemLogs = (params: SystemLogParams, token: string | null, signal?: AbortSignal) =>
  apiFetch<SystemLogPage>(`${BASE}?${systemLogQuery(params)}`, { token, signal })

export const fetchLogActors = (token: string | null, signal?: AbortSignal) =>
  apiFetch<SystemLogActorOption[]>(`${BASE}/actors`, { token, signal })
