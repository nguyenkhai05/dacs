import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_URL, ApiError, apiFetch, isAbortError, setUnauthorizedHandler } from './api'
import { login } from '../features/auth/authApi'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(response: Response | Error) {
  const fetchMock =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('gọi đúng URL, gửi JSON và trả về dữ liệu', async () => {
    const fetchMock = mockFetch(jsonResponse({ ok: true }))

    const result = await apiFetch<{ ok: boolean }>('/ping', { method: 'POST', body: { a: 1 } })

    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_URL}/ping`)
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('gắn token vào header Authorization khi có', async () => {
    const fetchMock = mockFetch(jsonResponse({}))

    await apiFetch('/me', { token: 'abc' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc')
  })

  it('không gửi Content-Type khi không có body', async () => {
    const fetchMock = mockFetch(jsonResponse({}))

    await apiFetch('/me')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).not.toHaveProperty('Content-Type')
  })

  it('ném ApiError với message của server và status tương ứng', async () => {
    mockFetch(jsonResponse({ message: 'Sai mật khẩu', statusCode: 401 }, 401))

    await expect(apiFetch('/x')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Sai mật khẩu',
      status: 401,
    })
  })

  it('lấy thông báo đầu tiên khi server trả mảng lỗi (validation)', async () => {
    mockFetch(jsonResponse({ message: ['Email không hợp lệ', 'Thiếu mật khẩu'] }, 400))

    await expect(apiFetch('/x')).rejects.toMatchObject({ message: 'Email không hợp lệ', status: 400 })
  })

  it('dùng thông báo mặc định khi body lỗi không phải JSON', async () => {
    mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }))

    const error = await apiFetch('/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(502)
    expect((error as ApiError).message).toBe('Có lỗi xảy ra. Vui lòng thử lại.')
  })

  it('status = 0 khi không kết nối được máy chủ', async () => {
    mockFetch(new TypeError('Failed to fetch'))

    await expect(apiFetch('/x')).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('Không kết nối được máy chủ'),
    })
  })
})

describe('login()', () => {
  it('gửi identifier đã cắt khoảng trắng tới /auth/login', async () => {
    const fetchMock = mockFetch(jsonResponse({ access_token: 't', user: { user_id: 1 } }))

    const result = await login('  anh@example.com ', 'matkhau123')

    expect(result.access_token).toBe('t')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_URL}/auth/login`)
    expect(JSON.parse(init.body as string)).toEqual({
      identifier: 'anh@example.com',
      password: 'matkhau123',
    })
  })
})

describe('apiFetch - 401, hủy request và timeout', () => {
  afterEach(() => {
    setUnauthorizedHandler(null)
  })

  it('401 khi có gửi token → gọi handler đăng xuất', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockFetch(jsonResponse({ message: 'hết hạn' }, 401))

    await expect(apiFetch('/bookings/my', { token: 't' })).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('401 khi KHÔNG gửi token (vd sai mật khẩu) → không đăng xuất', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockFetch(jsonResponse({ message: 'Sai mật khẩu' }, 401))

    await expect(apiFetch('/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('request bị hủy chủ động ném AbortError (không phải ApiError)', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
      ),
    )

    const pending = apiFetch('/slow', { signal: controller.signal })
    controller.abort()

    const error = await pending.catch((e: unknown) => e)
    expect(isAbortError(error)).toBe(true)
  })

  it('quá thời gian chờ → ApiError status 0 báo máy chủ phản hồi chậm', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
      ),
    )

    await expect(apiFetch('/hang', { timeoutMs: 20 })).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('quá chậm'),
    })
  })
})

