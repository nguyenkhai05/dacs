// Tầng gọi API dùng chung cho MỌI màn hình.
// Mọi lời gọi tới backend đều đi qua apiFetch để xử lý lỗi ở một chỗ duy nhất.

export const API_URL: string = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
).replace(/\/$/, '')

/** Lỗi do server (hoặc đường truyền) trả về. status = 0 nghĩa là không kết nối được. */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// NestJS trả lỗi dạng { message: string | string[], error, statusCode }
function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message
    if (typeof message === 'string' && message) return message
    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message[0]
    }
  }
  return fallback
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** JWT, sẽ được gắn vào header Authorization */
  token?: string | null
  /** Hủy request (vd khi người dùng đổi ngày/rời trang). Request bị hủy ném AbortError. */
  signal?: AbortSignal
  /** Quá thời gian này (ms) thì báo lỗi thay vì treo vô hạn. Mặc định 15 giây. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000

/** true nếu lỗi do chính mình hủy request (không phải lỗi thật, nên bỏ qua). */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

// Khi server trả 401 cho request CÓ gửi token (token hết hạn / tài khoản bị khóa),
// AuthProvider đăng ký hàm này để xóa phiên và đưa người dùng về trang đăng nhập.
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

export async function apiFetch<T>(
  path: string,
  { method = 'GET', body, token, signal, timeoutMs = DEFAULT_TIMEOUT_MS }: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  // Gộp "hủy từ bên ngoài" và "quá thời gian" vào một AbortController
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    if (signal?.aborted) {
      // Chủ động hủy: để nơi gọi bỏ qua, không hiện lỗi cho người dùng
      const abort = new Error('Request đã bị hủy')
      abort.name = 'AbortError'
      throw abort
    }
    if (timedOut) {
      throw new ApiError(
        'Máy chủ phản hồi quá chậm. Hãy kiểm tra backend và MySQL đang chạy, rồi thử lại.',
        0,
      )
    }
    // fetch chỉ ném lỗi khi KHÔNG tới được server (mất mạng, server tắt, bị chặn CORS...)
    void error
    throw new ApiError(
      'Không kết nối được máy chủ. Hãy kiểm tra backend đã chạy (http://localhost:3000/health) rồi thử lại.',
      0,
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternalAbort)
  }

  // Body có thể rỗng hoặc không phải JSON (vd trang lỗi của proxy)
  const data: unknown = await response.json().catch(() => null)

  if (response.status === 401 && token) {
    unauthorizedHandler?.()
  }

  if (!response.ok) {
    throw new ApiError(
      extractMessage(data, 'Có lỗi xảy ra. Vui lòng thử lại.'),
      response.status,
    )
  }

  return data as T
}
