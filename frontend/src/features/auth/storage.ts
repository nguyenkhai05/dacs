import type { AuthUser } from './authApi'

export interface Session {
  token: string
  user: AuthUser
}

const STORAGE_KEY = 'dsn_session'

/** Đọc ngày hết hạn (exp) trong JWT. Token hỏng hoặc đã hết hạn → true. */
export function isTokenExpired(token: string, nowMs: number = Date.now()): boolean {
  try {
    const payloadPart = token.split('.')[1]
    if (!payloadPart) return true
    // JWT dùng base64url, atob cần base64 chuẩn (đổi - _ và thêm dấu =)
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const payload = JSON.parse(atob(padded)) as { exp?: number }
    if (typeof payload.exp !== 'number') return false
    return payload.exp * 1000 <= nowMs
  } catch {
    return true
  }
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Session>
  return (
    typeof candidate.token === 'string' &&
    !!candidate.user &&
    typeof candidate.user.user_id === 'number'
  )
}

/**
 * "Ghi nhớ đăng nhập" bật → localStorage (còn sau khi đóng trình duyệt).
 * Tắt → sessionStorage (mất khi đóng tab).
 */
export function saveSession(session: Session, remember: boolean): void {
  clearSession()
  try {
    const storage = remember ? localStorage : sessionStorage
    storage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Chế độ riêng tư / hết dung lượng: bỏ qua, phiên chỉ tồn tại trong bộ nhớ
  }
}

function removeSafely(storage: Storage): void {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // không truy cập được storage thì thôi
  }
}

export function loadSession(): Session | null {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (!raw) continue
      const parsed: unknown = JSON.parse(raw) // ném lỗi nếu JSON hỏng
      if (isSession(parsed) && !isTokenExpired(parsed.token)) return parsed
    } catch {
      // JSON hỏng hoặc không đọc được storage → coi như không có phiên ở đây
    }
    removeSafely(storage) // dữ liệu hỏng, sai cấu trúc hoặc hết hạn → dọn đi
  }
  return null
}

export function clearSession(): void {
  removeSafely(localStorage)
  removeSafely(sessionStorage)
}
