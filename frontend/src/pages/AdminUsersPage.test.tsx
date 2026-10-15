import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../features/auth/authContext'
import AdminUsersPage from './AdminUsersPage'

const customer = (id: number, name: string, active: boolean, over = {}) => ({
  user_id: id,
  full_name: name,
  email: `u${id}@gmail.com`,
  phone_number: `090000000${id}`,
  is_active: active,
  status: active ? 'active' : 'locked',
  total_bookings: 12,
  cancelled_count: 1,
  no_show_count: 0,
  ...over,
})

const customers = [customer(1, 'Nguyễn Minh Anh', true), customer(2, 'Trần Quốc Huy', false, { cancelled_count: 2 })]

const detail = (id: number, name: string, active: boolean, extra = {}) => ({
  ...customer(id, name, active),
  created_at: '2026-01-01T00:00:00.000Z',
  note: id === 1 ? 'Khách đặt thường xuyên' : '',
  upcoming_bookings: id === 1 ? 2 : 0,
  recent_bookings: [
    {
      booking_id: 107, booking_code: 'DS260107', booking_date: '2026-10-07', start_time: '18:00', end_time: '20:00',
      pitch_name: 'Binh An 01', status: 'Confirmed', services_count: 0, refund_amount: 0, refund_pending_amount: 0, refunded_at: null,
    },
    {
      booking_id: 108, booking_code: 'DS261008', booking_date: '2026-10-08', start_time: '18:00', end_time: '20:00',
      pitch_name: 'Binh An 01', status: 'Cancelled', services_count: 0, refund_amount: 222000, refund_pending_amount: 0,
      refunded_at: '2026-10-03T03:00:00.000Z',
    },
  ],
  account_history: [
    { history_id: 1, action: 'Lock', reason: 'Bom sân', performed_by: 9, performed_by_name: 'Trần Hoàng', created_at: '2026-10-07T11:20:00.000Z' },
  ],
  ...extra,
})

const staff = [
  { user_id: 1, employee_code: 'NV001', full_name: 'Trần Hoàng', email: 'hoang@x.com', phone_number: '0911111111', position: 'Quản lý', is_active: true, role: 'Admin', role_label: 'Admin', is_last_admin: true, can_grant_admin: false, can_revoke_admin: false },
  { user_id: 2, employee_code: 'NV002', full_name: 'Nguyễn Thu Ngân', email: 'ngan@x.com', phone_number: '0922222222', position: 'Thu ngân', is_active: true, role: 'Staff', role_label: 'Nhân viên', is_last_admin: false, can_grant_admin: true, can_revoke_admin: false },
  { user_id: 3, employee_code: 'NV003', full_name: 'Lê Hoàng Phúc', email: 'phuc@x.com', phone_number: '0933333333', position: 'Trực sân', is_active: true, role: 'Admin', role_label: 'Admin', is_last_admin: false, can_grant_admin: false, can_revoke_admin: true },
]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

interface Call { url: string; method: string; body?: Record<string, unknown> }

function mockApi(options: { listStatus?: number; emailSent?: boolean; roleError?: string } = {}) {
  const calls: Call[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    calls.push({ url, method, body })

    if (url.includes('/admin/users/staff')) {
      if (method === 'POST' && url.includes('resend-invite')) return json({ email_sent: options.emailSent ?? true })
      if (method === 'POST') return json({ ...staff[1], user_id: 9, employee_code: 'NV004', full_name: body?.full_name, email_sent: options.emailSent ?? true })
      if (method === 'PATCH') {
        return options.roleError ? json({ message: options.roleError }, 409) : json(staff[1])
      }
      return json({ summary: { total: 3, admin_count: 2, active_admin_count: 2 }, staff })
    }

    const one = url.match(/\/admin\/users\/customers\/(\d+)(\/\w+)?(\?|$)/)
    if (one) {
      const id = Number(one[1])
      const found = customers.find((item) => item.user_id === id)!
      return json(detail(id, found.full_name, found.is_active))
    }

    if (url.includes('/admin/users/customers')) {
      if (options.listStatus) return json({ message: 'Lỗi máy chủ' }, options.listStatus)
      return json({ customers, pagination: { page: 1, limit: 10, total: 126, total_pages: 13, from: 1, to: 2 } })
    }

    return json({}, 404)
  })

  vi.stubGlobal('fetch', fetchMock)
  const writes = () => calls.filter((call) => call.method !== 'GET')
  return { calls, writes }
}

function renderPage(roles = ['Admin']) {
  const user = { user_id: 9, full_name: 'Trần Hoàng', email: null, roles }
  return render(
    <AuthContext.Provider value={{ user, token: 'tok', signIn: () => {}, signOut: () => {}, updateUser: () => {} }}>
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Người dùng - tab Khách hàng', () => {
  it('hiện danh sách, phân trang và tự mở chi tiết khách đầu tiên', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByText('Hiển thị 1–2 trong 126 khách hàng')).toBeInTheDocument()
    expect(screen.getByText('0900000001')).toBeInTheDocument()
    expect(screen.getByText('Hoạt động', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getAllByText('Đã khóa').length).toBeGreaterThan(0)
    expect(screen.getByText('2 / 0')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'Chi tiết khách · Nguyễn Minh Anh' })).toBeInTheDocument()
    expect(screen.getByText('DS260107 · 07/10')).toBeInTheDocument()
    expect(screen.getAllByText('Binh An 01 · 18–20h')).toHaveLength(2)
    expect(screen.getByText('Đã xác nhận')).toBeInTheDocument()
    expect(screen.getByText('DS261008 hủy 08/10, hoàn cọc 222.000 đ ngày 03/10.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Khách đặt thường xuyên')).toBeInTheDocument()
    expect(screen.getByText(/Khách còn 2 đơn sắp tới/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeInTheDocument()
  })

  it('tìm kiếm và lọc tình trạng gọi lại API đúng tham số', async () => {
    const { calls } = mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Hiển thị 1–2 trong 126 khách hàng')

    await user.type(screen.getByLabelText('Tìm khách hàng'), 'huy')
    await waitFor(() => expect(calls.some((call) => call.url.includes('q=huy'))).toBe(true), { timeout: 2000 })

    await user.selectOptions(screen.getByLabelText('Tình trạng'), 'locked')
    await waitFor(() => expect(calls.some((call) => call.url.includes('status=locked'))).toBe(true))
  })

  it('bấm Xem đổi sang khách khác', async () => {
    const { calls } = mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Chi tiết khách · Nguyễn Minh Anh' })

    await user.click(screen.getByRole('button', { name: 'Xem Trần Quốc Huy' }))

    expect(await screen.findByRole('heading', { name: 'Chi tiết khách · Trần Quốc Huy' })).toBeInTheDocument()
    expect(calls.some((call) => /customers\/2$/.test(call.url))).toBe(true)
  })

  it('khóa tài khoản bắt buộc có lý do; có lý do thì gửi PATCH', async () => {
    const { writes } = mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Chi tiết khách · Nguyễn Minh Anh' })

    await user.click(screen.getByRole('button', { name: 'Khóa tài khoản' }))
    expect(await screen.findByText('Vui lòng nhập lý do khóa tài khoản.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)

    await user.type(screen.getByLabelText('Lý do khóa / mở khóa'), 'Bom sân nhiều lần')
    await user.click(screen.getByRole('button', { name: 'Khóa tài khoản' }))

    expect(await screen.findByText('Đã khóa tài khoản.')).toBeInTheDocument()
    expect(writes()[0]).toMatchObject({
      method: 'PATCH',
      body: { is_active: false, reason: 'Bom sân nhiều lần' },
    })
    expect(writes()[0].url).toContain('/customers/1/status')
  })

  it('mở khóa không cần lý do', async () => {
    const { writes } = mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Chi tiết khách · Nguyễn Minh Anh' })

    await user.click(screen.getByRole('button', { name: 'Mở khóa Trần Quốc Huy' }))
    await screen.findByRole('heading', { name: 'Chi tiết khách · Trần Quốc Huy' })
    await user.click(screen.getByRole('button', { name: 'Mở khóa tài khoản' }))

    expect(await screen.findByText('Đã mở khóa tài khoản.')).toBeInTheDocument()
    expect(writes()[0].body).toEqual({ is_active: true })
  })

  it('lưu ghi chú: nút chỉ bật khi nội dung thay đổi', async () => {
    const { writes } = mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Chi tiết khách · Nguyễn Minh Anh' })

    const save = screen.getByRole('button', { name: 'Lưu ghi chú' })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText('Ghi chú nội bộ'), ' - ưu tiên sân 1')
    expect(save).toBeEnabled()
    await user.click(save)

    expect(await screen.findByText('Đã lưu ghi chú.')).toBeInTheDocument()
    expect(writes()[0]).toMatchObject({ method: 'PATCH', body: { note: 'Khách đặt thường xuyên - ưu tiên sân 1' } })
  })

  it('lỗi tải danh sách hiện thông báo và nút Thử lại', async () => {
    mockApi({ listStatus: 500 })
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Lỗi máy chủ')
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })
})

describe('Người dùng - tab Nhân viên & vai trò', () => {
  async function openStaffTab() {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Nhân viên & vai trò' }))
    await screen.findByText('NV001 · Trần Hoàng')
    return user
  }

  it('hiện vai trò, "Admin cuối cùng" và chỉ hiện thao tác phù hợp', async () => {
    mockApi()
    await openStaffTab()

    expect(screen.getByText('Admin cuối cùng')).toBeInTheDocument()
    expect(screen.getByText('Bảo vệ Admin cuối cùng')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cấp Admin cho Nguyễn Thu Ngân' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thu hồi Admin của Lê Hoàng Phúc' })).toBeInTheDocument()
    // Admin cuối cùng không có nút thu hồi, nhân viên không có nút thu hồi
    expect(screen.queryByRole('button', { name: 'Thu hồi Admin của Trần Hoàng' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thu hồi Admin của Nguyễn Thu Ngân' })).not.toBeInTheDocument()
  })

  it('cấp Admin: hỏi xác nhận rồi gửi PATCH role=Admin', async () => {
    const { writes } = mockApi()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = await openStaffTab()

    await user.click(screen.getByRole('button', { name: 'Cấp Admin cho Nguyễn Thu Ngân' }))

    expect(await screen.findByText('Đã cấp Admin cho Nguyễn Thu Ngân.')).toBeInTheDocument()
    expect(writes()[0]).toMatchObject({ method: 'PATCH', body: { role: 'Admin' } })
    expect(writes()[0].url).toContain('/staff/2/role')
  })

  it('bấm Hủy ở hộp xác nhận thì không gọi API', async () => {
    const { writes } = mockApi()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = await openStaffTab()

    await user.click(screen.getByRole('button', { name: 'Thu hồi Admin của Lê Hoàng Phúc' }))

    expect(writes()).toHaveLength(0)
  })

  it('server từ chối (vd Admin cuối cùng) → hiện lỗi từ server', async () => {
    mockApi({ roleError: 'Không thể thu hồi quyền của Admin cuối cùng.' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = await openStaffTab()

    await user.click(screen.getByRole('button', { name: 'Thu hồi Admin của Lê Hoàng Phúc' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể thu hồi quyền của Admin cuối cùng.')
  })

  it('form tạo nhân viên báo lỗi khi thiếu thông tin và không gửi API', async () => {
    const { writes } = mockApi()
    const user = await openStaffTab()

    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản nhân viên' }))

    expect(await screen.findByText('Vui lòng nhập họ tên.')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập email đăng nhập.')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
  })

  it('tạo nhân viên thành công: gửi đúng dữ liệu và báo đã gửi email', async () => {
    const { writes } = mockApi()
    const user = await openStaffTab()

    await user.type(screen.getByLabelText('Họ tên nhân viên mới'), 'Phạm Văn Bình')
    await user.type(screen.getByLabelText('Email đăng nhập'), 'binh@x.com')
    await user.type(screen.getByLabelText('Vị trí'), 'Trực sân')
    await user.selectOptions(screen.getByLabelText('Vai trò được cấp'), 'Admin')
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản nhân viên' }))

    expect(await screen.findByText(/Đã tạo tài khoản Phạm Văn Bình \(NV004\)\. Email hướng dẫn/)).toBeInTheDocument()
    expect(writes()[0]).toMatchObject({
      method: 'POST',
      body: { full_name: 'Phạm Văn Bình', email: 'binh@x.com', position: 'Trực sân', role: 'Admin' },
    })
    expect(writes()[0].body).not.toHaveProperty('employee_code')
    expect(screen.getByLabelText('Họ tên nhân viên mới')).toHaveValue('')
  })

  it('tạo xong nhưng email không gửi được → cảnh báo dùng "Gửi lại email"', async () => {
    mockApi({ emailSent: false })
    const user = await openStaffTab()

    await user.type(screen.getByLabelText('Họ tên nhân viên mới'), 'Phạm Văn Bình')
    await user.type(screen.getByLabelText('Email đăng nhập'), 'binh@x.com')
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản nhân viên' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('chưa gửi được email')
  })

  it('gửi lại email hướng dẫn', async () => {
    const { writes } = mockApi()
    const user = await openStaffTab()

    await user.click(screen.getByRole('button', { name: 'Gửi lại email cho Nguyễn Thu Ngân' }))

    expect(await screen.findByText('Đã gửi lại email hướng dẫn tới ngan@x.com.')).toBeInTheDocument()
    expect(writes()[0].url).toContain('/staff/2/resend-invite')
  })
})
