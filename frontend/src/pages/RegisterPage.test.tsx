import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RegisterPage from './RegisterPage'

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<p>TRANG ĐĂNG NHẬP</p>} />
      </Routes>
    </MemoryRouter>,
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

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Họ và tên'), 'Nguyễn Văn B')
  await user.type(screen.getByLabelText('Số điện thoại'), '0912345678')
  await user.type(screen.getByLabelText('Email'), 'b@example.com')
  await user.type(screen.getByLabelText('Mật khẩu'), 'matkhau123')
  await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'matkhau123')
  await user.click(screen.getByLabelText(/Tôi đồng ý với/))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RegisterPage', () => {
  it('hiển thị đầy đủ form đăng ký', () => {
    renderRegister()

    expect(screen.getByRole('heading', { name: 'Tạo tài khoản' })).toBeInTheDocument()
    expect(screen.getByLabelText('Họ và tên')).toBeInTheDocument()
    expect(screen.getByLabelText('Số điện thoại')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Xác nhận mật khẩu')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Đăng ký' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login')
  })

  it('bỏ trống form thì báo lỗi và không gọi server', async () => {
    const fetchMock = mockFetch(200, {})
    const user = userEvent.setup()
    renderRegister()

    await user.click(screen.getByRole('button', { name: 'Đăng ký' }))

    expect(screen.getByText('Vui lòng nhập họ và tên')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập số điện thoại')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập email')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập mật khẩu')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng xác nhận mật khẩu')).toBeInTheDocument()
    expect(screen.getByText('Bạn cần đồng ý với điều khoản sử dụng')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('kiểm tra số điện thoại, email và mật khẩu', async () => {
    const fetchMock = mockFetch(200, {})
    const user = userEvent.setup()
    renderRegister()

    await user.type(screen.getByLabelText('Họ và tên'), 'A')
    await user.type(screen.getByLabelText('Số điện thoại'), '123')
    await user.type(screen.getByLabelText('Email'), 'abc')
    await user.type(screen.getByLabelText('Mật khẩu'), '1234567')
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), '7654321')
    await user.click(screen.getByLabelText(/Tôi đồng ý với/))
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }))

    expect(screen.getByText('Số điện thoại phải có 10–11 chữ số')).toBeInTheDocument()
    expect(screen.getByText('Nhập email hợp lệ')).toBeInTheDocument()
    expect(screen.getByText('Mật khẩu phải có ít nhất 8 ký tự')).toBeInTheDocument()
    expect(screen.getByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mật khẩu xác nhận sai thì không gọi server', async () => {
    const fetchMock = mockFetch(200, {})
    const user = userEvent.setup()
    renderRegister()
    await fillValidForm(user)

    await user.clear(screen.getByLabelText('Xác nhận mật khẩu'))
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'matkhau124')
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }))

    expect(screen.getByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('đăng ký thành công: gửi đúng payload và chuyển sang đăng nhập', async () => {
    const fetchMock = mockFetch(201, {
      message: 'Đăng ký tài khoản thành công',
      user: {
        user_id: 5,
        full_name: 'Nguyễn Văn B',
        phone_number: '0912345678',
        email: 'b@example.com',
        role: 'Customer',
      },
    })
    const user = userEvent.setup()
    renderRegister()
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }))

    expect(await screen.findByText('TRANG ĐĂNG NHẬP')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/auth\/register$/)
    expect(JSON.parse(init.body as string)).toEqual({
      fullName: 'Nguyễn Văn B',
      phoneNumber: '0912345678',
      email: 'b@example.com',
      password: 'matkhau123',
      confirmPassword: 'matkhau123',
      acceptedTerms: true,
    })
  })

  it('email hoặc số điện thoại trùng thì hiện lỗi từ server', async () => {
    mockFetch(409, { message: 'Email đã được sử dụng', statusCode: 409 })
    const user = userEvent.setup()
    renderRegister()
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Email đã được sử dụng')
    expect(screen.getByLabelText('Email')).toHaveValue('b@example.com')
  })

  it('nút đăng ký hiển thị trạng thái đang gửi', async () => {
    let resolveFetch: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
      ),
    )
    const user = userEvent.setup()
    renderRegister()
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }))

    expect(screen.getByRole('button', { name: 'Đang tạo tài khoản…' })).toBeDisabled()

    resolveFetch(
      new Response(JSON.stringify({ message: 'ok' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(await screen.findByText('TRANG ĐĂNG NHẬP')).toBeInTheDocument()
  })

  it('nút Hiện/Ẩn đổi kiểu hiển thị của hai ô mật khẩu', async () => {
    const user = userEvent.setup()
    renderRegister()

    const password = screen.getByLabelText('Mật khẩu')
    const confirm = screen.getByLabelText('Xác nhận mật khẩu')

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(password).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu xác nhận' }))
    expect(confirm).toHaveAttribute('type', 'text')
  })
})
