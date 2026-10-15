import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../features/auth/authContext'
import { sampleUser } from '../test/helpers'
import AccountPage from './AccountPage'

const profile = {
  user_id: 1,
  full_name: 'Nguyễn Minh Anh',
  initials: 'MA',
  phone_number: '0912345678',
  email: 'minhanh@gmail.com',
  avatar_url: null,
  address: '25 Đường số 8, TP. Thủ Đức',
  date_of_birth: '2002-08-12',
  roles: ['Customer'],
  created_at: '2026-09-03T10:00:00.000Z',
}

type Reply = { status: number; body: unknown }

/** Giả lập server: mỗi "METHOD đường-dẫn" trả về một Reply. */
function mockServer(routes: Record<string, Reply>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`
    const reply = routes[key] ?? { status: 404, body: { message: `Không có route ${key}` } }
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const bodiesOf = (fetchMock: ReturnType<typeof mockServer>, key: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? 'GET'} ${new URL(url).pathname}` === key)
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)

function renderPage() {
  const signOut = vi.fn()
  const updateUser = vi.fn()
  render(
    <AuthContext.Provider value={{ user: sampleUser, token: 'tok', signIn: () => {}, signOut, updateUser }}>
      <MemoryRouter initialEntries={['/account']}>
        <AccountPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return { signOut, updateUser }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AccountPage', () => {
  it('tải và hiển thị hồ sơ, gửi kèm token', async () => {
    const fetchMock = mockServer({ 'GET /users/me': { status: 200, body: profile } })
    renderPage()

    expect(await screen.findByLabelText('Họ và tên')).toHaveValue('Nguyễn Minh Anh')
    expect(screen.getByLabelText('Số điện thoại')).toHaveValue('0912345678')
    expect(screen.getByLabelText('Email')).toHaveValue('minhanh@gmail.com')
    expect(screen.getByLabelText('Ngày sinh')).toHaveValue('2002-08-12')
    expect(screen.getByLabelText('Địa chỉ')).toHaveValue('25 Đường số 8, TP. Thủ Đức')
    expect(screen.getByText('Thành viên từ tháng 09/2026')).toBeInTheDocument()
    expect(screen.getByText('Khách hàng')).toBeInTheDocument()

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
  })

  it('lỗi tải thì có nút Thử lại', async () => {
    mockServer({ 'GET /users/me': { status: 500, body: { message: 'Lỗi máy chủ' } } })
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Lỗi máy chủ')).toBeInTheDocument()

    mockServer({ 'GET /users/me': { status: 200, body: profile } })
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByLabelText('Họ và tên')).toBeInTheDocument()
  })

  it('401 khi tải hồ sơ thì đăng xuất', async () => {
    mockServer({ 'GET /users/me': { status: 401, body: { message: 'Phiên đăng nhập hết hạn' } } })
    const { signOut } = renderPage()

    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })

  it('xóa họ tên rồi lưu thì báo lỗi và không gọi server', async () => {
    const fetchMock = mockServer({ 'GET /users/me': { status: 200, body: profile } })
    const user = userEvent.setup()
    renderPage()

    await user.clear(await screen.findByLabelText('Họ và tên'))
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }))

    expect(screen.getByText('Vui lòng nhập họ và tên')).toBeInTheDocument()
    expect(bodiesOf(fetchMock, 'PATCH /users/me')).toHaveLength(0)
  })

  it('không đổi gì thì không gọi server', async () => {
    const fetchMock = mockServer({ 'GET /users/me': { status: 200, body: profile } })
    const user = userEvent.setup()
    renderPage()

    await screen.findByLabelText('Họ và tên')
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }))

    expect(screen.getByText('Thông tin chưa có thay đổi nào.')).toBeInTheDocument()
    expect(bodiesOf(fetchMock, 'PATCH /users/me')).toHaveLength(0)
  })

  it('lưu chỉ gửi trường đã đổi và cập nhật tên trên thanh đầu trang', async () => {
    const updated = { ...profile, full_name: 'Trần Văn B', initials: 'VB' }
    const fetchMock = mockServer({
      'GET /users/me': { status: 200, body: profile },
      'PATCH /users/me': { status: 200, body: { message: 'Cập nhật thông tin thành công', profile: updated } },
    })
    const user = userEvent.setup()
    const { updateUser } = renderPage()

    const name = await screen.findByLabelText('Họ và tên')
    await user.clear(name)
    await user.type(name, 'Trần Văn B')
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }))

    expect(await screen.findByText('Cập nhật thông tin thành công')).toBeInTheDocument()
    expect(bodiesOf(fetchMock, 'PATCH /users/me')).toEqual([{ fullName: 'Trần Văn B' }])
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ user_id: 1, full_name: 'Trần Văn B' }))
  })

  it('hiện lỗi từ server (email đã được dùng)', async () => {
    mockServer({
      'GET /users/me': { status: 200, body: profile },
      'PATCH /users/me': { status: 409, body: { message: 'Email đã được sử dụng' } },
    })
    const user = userEvent.setup()
    renderPage()

    const email = await screen.findByLabelText('Email')
    await user.clear(email)
    await user.type(email, 'khac@gmail.com')
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }))

    expect(await screen.findByText('Email đã được sử dụng')).toBeInTheDocument()
  })

  it('đổi mật khẩu: xác nhận không khớp thì không gọi server', async () => {
    const fetchMock = mockServer({ 'GET /users/me': { status: 200, body: profile } })
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'matkhaucu1')
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'matkhaumoi2')
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'matkhaukhac')
    await user.click(screen.getByRole('button', { name: 'Cập nhật mật khẩu' }))

    expect(screen.getByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument()
    expect(bodiesOf(fetchMock, 'PATCH /users/me/password')).toHaveLength(0)
  })

  it('đổi mật khẩu thành công thì xóa các ô và báo thành công', async () => {
    const fetchMock = mockServer({
      'GET /users/me': { status: 200, body: profile },
      'PATCH /users/me/password': { status: 200, body: { message: 'Đổi mật khẩu thành công' } },
    })
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'matkhaucu1')
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'matkhaumoi2')
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'matkhaumoi2')
    await user.click(screen.getByRole('button', { name: 'Cập nhật mật khẩu' }))

    expect(await screen.findByText('Đổi mật khẩu thành công')).toBeInTheDocument()
    expect(bodiesOf(fetchMock, 'PATCH /users/me/password')).toEqual([
      { currentPassword: 'matkhaucu1', newPassword: 'matkhaumoi2', confirmNewPassword: 'matkhaumoi2' },
    ])
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toHaveValue('')
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('')
  })

  it('sai mật khẩu hiện tại (400) thì hiện lỗi và giữ nguyên phiên đăng nhập', async () => {
    mockServer({
      'GET /users/me': { status: 200, body: profile },
      'PATCH /users/me/password': { status: 400, body: { message: 'Mật khẩu hiện tại không đúng' } },
    })
    const user = userEvent.setup()
    const { signOut } = renderPage()

    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'saimatkhau')
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'matkhaumoi2')
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'matkhaumoi2')
    await user.click(screen.getByRole('button', { name: 'Cập nhật mật khẩu' }))

    expect(await screen.findByText('Mật khẩu hiện tại không đúng')).toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
  })
})
