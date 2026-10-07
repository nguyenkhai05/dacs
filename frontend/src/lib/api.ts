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
}

export async function apiFetch<T>(
  path: string,
  { method = 'GET', body, token }: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // fetch chỉ ném lỗi khi KHÔNG tới được server (mất mạng, server tắt, bị chặn CORS...)
    throw new ApiError('Không kết nối được máy chủ. Vui lòng thử lại.', 0)
  }

  // Body có thể rỗng hoặc không phải JSON (vd trang lỗi của proxy)
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      extractMessage(data, 'Có lỗi xảy ra. Vui lòng thử lại.'),
      response.status,
    )
  }

  return data as T
}
