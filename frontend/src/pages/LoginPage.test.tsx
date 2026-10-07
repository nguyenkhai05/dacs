import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../features/auth/AuthProvider'
import { fakeJwt, sampleUser } from '../test/helpers'
import LoginPage from './LoginPage'

// Dựng một "mini app" chỉ gồm các route cần thiết để kiểm tra việc chuyển trang
function renderLogin(entry: string | { pathname: string; state?: unknown } = '/login') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>TRANG CHỦ</p>} />
          <Route path="/bookings" element={<p>TRANG LỊCH ĐẶT</p>} />
          <Route path="/register" element={<p>TRANG ĐĂNG KÝ</p>} />
          <Route path="/forgot-password" element={<p>TRANG QUÊN MẬT KHẨU</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const successBody = () => ({ access_token: fakeJwt(), user: sampleUser })

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  identifier = 'anh@example.com',
  password = 'matkhau123',
) {
  await user.type(screen.getByLabelText('Email hoặc số điện thoại'), identifier)
  await user.type(screen.getByLabelText('Mật khẩu'), password)
  await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LoginPage', () => {
  it('hiển thị đủ các thành phần của màn đăng nhập', () => {
    renderLogin()

    expect(screen.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email hoặc số điện thoại')).toBeInTheDocument()
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Ghi nhớ đăng nhập')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Quên mật khẩu?' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: 'Đăng ký ngay' })).toHaveAttribute('href', '/register')
  })

  it('báo lỗi từng ô và KHÔNG gọi server khi bỏ trống', async () => {
    const fetchMock = mockFetch(200, successBody())
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))

    expect(screen.getByText('Vui lòng nhập email hoặc số điện thoại')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập mật khẩu')).toBeInTheDocument()
    expect(screen.getByLabelText('Email hoặc số điện thoại')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('báo lỗi định dạng khi nhập sai email/SĐT', async () => {
    const fetchMock = mockFetch(200, successBody())
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user, 'abc')

    expect(screen.getByText('Nhập email hợp lệ hoặc số điện thoại 10–11 chữ số')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('xóa lỗi của ô khi người dùng bắt đầu sửa', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    expect(screen.getByText('Vui lòng nhập mật khẩu')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Mật khẩu'), 'a')

    expect(screen.queryByText('Vui lòng nhập mật khẩu')).not.toBeInTheDocument()
  })

  it('đăng nhập thành công: gọi đúng API, lưu phiên và chuyển về trang chủ', async () => {
    const fetchMock = mockFetch(200, successBody())
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    expect(await screen.findByText('TRANG CHỦ')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/auth\/login$/)
    expect(JSON.parse(init.body as string)).toEqual({
      identifier: 'anh@example.com',
      password: 'matkhau123',
    })
    expect(localStorage.getItem('dsn_session')).toContain('Nguyễn Minh Anh')
  })

  it('bỏ chọn "Ghi nhớ" → lưu phiên ở sessionStorage', async () => {
    mockFetch(200, successBody())
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByLabelText('Ghi nhớ đăng nhập'))
    await fillAndSubmit(user)

    expect(await screen.findByText('TRANG CHỦ')).toBeInTheDocument()
    expect(sessionStorage.getItem('dsn_session')).not.toBeNull()
    expect(localStorage.getItem('dsn_session')).toBeNull()
  })

  it('sai tài khoản/mật khẩu: hiện lỗi từ server, giữ nguyên dữ liệu đã nhập', async () => {
    mockFetch(401, {
      message: 'Email/số điện thoại hoặc mật khẩu không chính xác',
      error: 'Unauthorized',
      statusCode: 401,
    })
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user, 'anh@example.com', 'sai-mat-khau')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email/số điện thoại hoặc mật khẩu không chính xác',
    )
    expect(screen.getByLabelText('Email hoặc số điện thoại')).toHaveValue('anh@example.com')
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('sai-mat-khau')
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeEnabled()
    expect(localStorage.getItem('dsn_session')).toBeNull()
  })

  it('bị khóa tạm (429): hiện thông báo của server', async () => {
    mockFetch(429, { message: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút', statusCode: 429 })
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('sai quá nhiều lần')
  })

  it('không kết nối được server: báo lỗi thân thiện', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ')
  })

  it('khóa nút và hiện "Đang đăng nhập…" trong lúc chờ server', async () => {
    let resolveFetch: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<Response>((resolve) => (resolveFetch = resolve))),
    )
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    expect(screen.getByRole('button', { name: 'Đang đăng nhập…' })).toBeDisabled()

    resolveFetch(
      new Response(JSON.stringify(successBody()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(await screen.findByText('TRANG CHỦ')).toBeInTheDocument()
  })

  it('nút Hiện/Ẩn đổi kiểu hiển thị của mật khẩu', async () => {
    const user = userEvent.setup()
    renderLogin()
    const password = screen.getByLabelText('Mật khẩu')

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(password).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('đã đăng nhập sẵn thì /login chuyển thẳng về trang chủ', () => {
    localStorage.setItem('dsn_session', JSON.stringify({ token: fakeJwt(), user: sampleUser }))

    renderLogin()

    expect(screen.getByText('TRANG CHỦ')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Chào mừng trở lại' })).not.toBeInTheDocument()
  })

  it('sau khi đăng nhập quay lại đúng trang đang định vào (state.from)', async () => {
    mockFetch(200, successBody())
    const user = userEvent.setup()
    renderLogin({ pathname: '/login', state: { from: '/bookings' } })

    await fillAndSubmit(user)

    expect(await screen.findByText('TRANG LỊCH ĐẶT')).toBeInTheDocument()
  })

  it('bấm "Đăng ký ngay" chuyển sang trang đăng ký', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('link', { name: 'Đăng ký ngay' }))

    expect(screen.getByText('TRANG ĐĂNG KÝ')).toBeInTheDocument()
  })
})
