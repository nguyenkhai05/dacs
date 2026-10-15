import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../features/auth/authContext'
import AdminDashboardPage from './AdminDashboardPage'

const overview = {
  date: '2026-10-05',
  kpis: {
    total_bookings: 18,
    pending_deposit_bookings: 3,
    occupancy_rate: 68.75,
    booked_hours: 33,
    capacity_hours: 48,
    collected_amount: 5480000,
  },
  upcoming_bookings: [
    { booking_id: 501, booking_code: 'DS26100501', customer_name: 'A', pitch_name: 'Binh An 01', booking_date: '2026-10-05', start_time: '17:00', end_time: '18:00', status: 'Confirmed' },
    { booking_id: 503, booking_code: 'DS26100503', customer_name: 'B', pitch_name: 'Binh An 03', booking_date: '2026-10-05', start_time: '19:00', end_time: '20:00', status: 'Pending' },
  ],
}

const nets = [3820000, 4960000, 3740000, 5120000, 4660000, 4060000, 5480000]
const trend = {
  date: '2026-10-05',
  from: '2026-09-29',
  to: '2026-10-05',
  total_net: 31840000,
  points: nets.map((net, index) => ({
    key: `2026-09-${29 + index}`,
    label: `L${index}`,
    gross: index === 6 ? 5702000 : net,
    refunded: index === 6 ? 222000 : 0,
    net,
    is_selected: index === 6,
  })),
}

const report = {
  period: 'month',
  group_by: 'pitch',
  from: '2026-09-01',
  to: '2026-09-30',
  label: 'Tháng 09/2026',
  rows: [
    { key: 'pitch-1', label: 'Binh An 01 · Sân 5 người', bookings: 60, booked_hours: 182, gross: 46000000, refunded: 200000, net_revenue: 45800000 },
    { key: 'pitch-2', label: 'Binh An 02 · Sân 7 người', bookings: 50, booked_hours: 146, gross: 50680000, refunded: 0, net_revenue: 50680000 },
  ],
  totals: { bookings: 110, booked_hours: 328, gross: 96680000, refunded: 200000, net_revenue: 96480000 },
  peak: { label: '19:00–21:00', occupancy_rate: 86, booked_hours: 100 },
  rates: { total_bookings: 200, cancelled: 16, no_show: 6, cancel_rate: 8.2, no_show_rate: 3.1 },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function mockApi(options: { overviewStatus?: number } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/dashboard/overview'))
      return options.overviewStatus ? json({ message: 'Lỗi máy chủ' }, options.overviewStatus) : json(overview)
    if (url.includes('/dashboard/revenue')) return json(trend)
    if (url.includes('/dashboard/report/export')) return new Response('a,b', { headers: { 'Content-Type': 'text/csv' } })
    if (url.includes('/dashboard/report')) return json(report)
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage() {
  const user = { user_id: 1, full_name: 'Trần Hoàng', email: null, roles: ['Admin'] }
  return render(
    <AuthContext.Provider value={{ user, token: 'tok', signIn: () => {}, signOut: () => {}, updateUser: () => {} }}>
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:csv')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AdminDashboardPage - tab Tổng quan', () => {
  it('hiện 4 KPI, tổng doanh thu 7 ngày và danh sách sắp đến giờ đá', async () => {
    mockApi()
    renderPage()

    const orders = await screen.findByLabelText('Đơn trong ngày')
    await waitFor(() => expect(within(orders).getByText('18')).toBeInTheDocument())
    expect(within(screen.getByLabelText('Đang chờ cọc')).getByText('03')).toBeInTheDocument()

    const occupancy = screen.getByLabelText('Tỷ lệ lấp đầy')
    expect(within(occupancy).getByText('68,75%')).toBeInTheDocument()
    expect(within(occupancy).getByText('33 / 48 giờ sân')).toBeInTheDocument()

    const revenue = screen.getByLabelText('Doanh thu thuần')
    expect(within(revenue).getByText('5.480.000 đ')).toBeInTheDocument()
    expect(await within(revenue).findByText('Thu 5.702.000 − hoàn 222.000')).toBeInTheDocument()

    expect(await screen.findByText(/Tổng 31\.840\.000 đ/)).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Doanh thu thuần từng ngày' })).getAllByRole('listitem')).toHaveLength(7)

    expect(screen.getByText('DS26100501')).toBeInTheDocument()
    expect(screen.getByText('17–18h')).toBeInTheDocument()
    expect(screen.getByText('Đã xác nhận')).toBeInTheDocument()
    expect(screen.getByText('Chờ cọc', { selector: 'span' })).toBeInTheDocument()
  })

  it('gửi kèm token khi gọi API', async () => {
    const fetchMock = mockApi()
    renderPage()
    await screen.findByText('DS26100501')

    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('lỗi tải tổng quan → hiện thông báo và nút Thử lại', async () => {
    mockApi({ overviewStatus: 500 })
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Lỗi máy chủ')
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })
})

describe('AdminDashboardPage - tab Báo cáo', () => {
  it('chuyển tab hiện bảng, giờ cao điểm, tỷ lệ hủy và dòng tổng thu − hoàn', async () => {
    const fetchMock = mockApi()
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'Báo cáo' }))

    expect(await screen.findByText('Binh An 01 · Sân 5 người')).toBeInTheDocument()
    expect(screen.getByText('182 giờ')).toBeInTheDocument()
    expect(screen.getByText('Thuần tháng 09')).toBeInTheDocument()
    expect(screen.getByText('Tổng')).toBeInTheDocument()
    expect(screen.getByText('96.480.000 đ')).toBeInTheDocument()
    expect(screen.getByText('Giờ cao điểm: 19:00–21:00')).toBeInTheDocument()
    expect(screen.getByText('8,2%')).toBeInTheDocument()
    expect(screen.getByText('3,1%')).toBeInTheDocument()
    expect(screen.getByText(/thu thành công 96\.680\.000 đ − hoàn thành công 200\.000 đ/)).toBeInTheDocument()

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('period=month') && String(url).includes('group_by=pitch'))).toBe(true)
  })

  it('đổi phân nhóm → gọi lại API với group_by=category', async () => {
    const fetchMock = mockApi()
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Báo cáo' }))
    await screen.findByText('Binh An 01 · Sân 5 người')

    await user.selectOptions(screen.getByLabelText('Phân nhóm'), 'category')

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('group_by=category'))).toBe(true),
    )
  })
})

describe('AdminDashboardPage - Xuất CSV', () => {
  it('gọi endpoint export kèm token và tải file', async () => {
    const fetchMock = mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('DS26100501')

    await user.click(screen.getByRole('button', { name: 'Xuất CSV' }))

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/dashboard/report/export'))
    expect(call).toBeDefined()
    expect((call![1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
  })
})
