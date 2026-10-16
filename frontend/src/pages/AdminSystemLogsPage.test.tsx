import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../features/auth/authContext'
import { defaultRange } from '../features/systemLog/systemLogView'
import { todayLocal } from '../lib/format'
import AdminSystemLogsPage from './AdminSystemLogsPage'

const item = (overrides: Record<string, unknown>) => ({
  id: 'booking-1',
  changed_at: '2026-10-05T08:05:00.000Z',
  actor: { user_id: null, display_name: 'Hệ thống' },
  change_type: 'booking',
  target: 'DS26100503',
  action: 'Ghi nhận cọc thiếu',
  old_value: 'Chờ cọc',
  new_value: 'Đã xác nhận',
  ...overrides,
})

const rows = [
  item({}),
  item({
    id: 'booking-2',
    changed_at: '2026-10-05T07:30:00.000Z',
    actor: { user_id: 5, display_name: 'Trần Quốc Huy' },
    target: 'DS261009',
    action: 'Hủy booking',
    old_value: 'Đã xác nhận',
    new_value: 'Đã hủy',
  }),
  item({
    id: 'price-1',
    changed_at: '2026-10-01T02:00:00.000Z',
    actor: { user_id: 2, display_name: 'Trần Hoàng · Admin' },
    change_type: 'price',
    target: 'Sân 5 người · 19–22h',
    action: 'Sửa giá 19–22h',
    old_value: '330.000 ₫ / giờ',
    new_value: '350.000 ₫ / giờ',
  }),
]

const actors = [
  { user_id: 2, display_name: 'Trần Hoàng · Admin' },
  { user_id: 5, display_name: 'Trần Quốc Huy' },
]

const pageOf = (items: unknown[], overrides: Record<string, unknown> = {}) => ({
  items,
  total: 84,
  page: 1,
  limit: 10,
  total_pages: 9,
  ...overrides,
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Giả lập server; trả về danh sách các lần gọi /admin/system-logs (đã tách tham số). */
function mockApi(handler: (params: URLSearchParams) => Response = () => json(pageOf(rows))) {
  const calls: URLSearchParams[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/admin/system-logs/actors') return json(actors)
      if (url.pathname === '/admin/system-logs') {
        calls.push(url.searchParams)
        return handler(url.searchParams)
      }
      return json({}, 404)
    }),
  )
  return calls
}

function renderPage() {
  const user = { user_id: 1, full_name: 'Trần Hoàng', email: null, roles: ['Admin'] }
  return render(
    <AuthContext.Provider value={{ user, token: 'tok', signIn: () => {}, signOut: () => {}, updateUser: () => {} }}>
      <MemoryRouter>
        <AdminSystemLogsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdminSystemLogsPage', () => {
  it('hiện bảng nhật ký: giờ Việt Nam, người thực hiện, đối tượng, giá trị cũ/mới', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByText('DS26100503')).toBeInTheDocument()
    expect(screen.getByText('05/10 · 15:05')).toBeInTheDocument()
    expect(screen.getByText('05/10 · 14:30')).toBeInTheDocument()
    expect(screen.getByText('01/10 · 09:00')).toBeInTheDocument()
    expect(screen.getByText('Ghi nhận cọc thiếu')).toBeInTheDocument()
    expect(screen.getByText('Hệ thống')).toBeInTheDocument()
    expect(screen.getAllByText('Trần Quốc Huy').length).toBeGreaterThan(0)
    expect(screen.getByText('330.000 ₫ / giờ')).toBeInTheDocument()
    expect(screen.getByText('350.000 ₫ / giờ')).toBeInTheDocument()
    expect(screen.getByText('Hiển thị 1–3 trong 84 thay đổi')).toBeInTheDocument()
  })

  it('trạng thái hiện thành nhãn màu, tiền và ghi chú hiện chữ thường', async () => {
    mockApi()
    renderPage()

    const table = await screen.findByRole('table')
    const cancelled = within(table).getByText('Đã hủy')
    expect(cancelled).toHaveClass('sl-badge', 'sl-badge--danger')
    expect(within(table).getByText('330.000 ₫ / giờ')).not.toHaveClass('sl-badge')
  })

  it('là chế độ chỉ đọc: không có nút sửa hay xóa', async () => {
    mockApi()
    renderPage()

    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: /sửa|xóa/i })).not.toBeInTheDocument()
    expect(screen.getByText('Chế độ chỉ đọc')).toBeInTheDocument()
  })

  it('mặc định lọc từ đầu tháng đến hôm nay, đủ 10 dòng mỗi trang', async () => {
    const calls = mockApi()
    renderPage()
    await screen.findByRole('table')

    const { from, to } = defaultRange(todayLocal())
    expect(calls[0].get('from')).toBe(from)
    expect(calls[0].get('to')).toBe(to)
    expect(calls[0].get('limit')).toBe('10')
    expect(calls[0].get('page')).toBe('1')
    expect(screen.getByLabelText('Từ ngày')).toHaveValue(from)
    expect(screen.getByLabelText('Đến ngày')).toHaveValue(to)
  })

  it('có danh sách người thực hiện để lọc, lọc xong quay về trang 1', async () => {
    const calls = mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(calls.at(-1)?.get('page')).toBe('2'))

    const actorSelect = screen.getByLabelText('Người thực hiện')
    await waitFor(() => expect(within(actorSelect).getByRole('option', { name: 'Trần Quốc Huy' })).toBeInTheDocument())
    await user.selectOptions(actorSelect, 'Trần Quốc Huy')

    await waitFor(() => expect(calls.at(-1)?.get('actor_id')).toBe('5'))
    expect(calls.at(-1)?.get('page')).toBe('1')
  })

  it('lọc theo loại thay đổi', async () => {
    const calls = mockApi()
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')

    await user.selectOptions(screen.getByLabelText('Loại thay đổi'), 'Giá')

    await waitFor(() => expect(calls.at(-1)?.get('change_type')).toBe('price'))
  })

  it('chọn khoảng ngày sai (từ > đến) thì báo lỗi và không gọi server', async () => {
    const calls = mockApi()
    renderPage()
    await screen.findByRole('table')
    const before = calls.length

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2999-01-01' } })

    expect(await screen.findByText('Ngày bắt đầu không được sau ngày kết thúc.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(calls.length).toBe(before)
  })

  it('bấm số trang chuyển trang và cập nhật dòng "Hiển thị"', async () => {
    const calls = mockApi((params) =>
      json(pageOf(params.get('page') === '2' ? [item({ id: 'b-9', target: 'DS260999' })] : rows, { page: Number(params.get('page')) })),
    )
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('DS26100503')

    await user.click(screen.getByRole('button', { name: 'Trang 2' }))

    expect(await screen.findByText('DS260999')).toBeInTheDocument()
    expect(calls.at(-1)?.get('page')).toBe('2')
    expect(screen.getByText('Hiển thị 11–11 trong 84 thay đổi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang 2' })).toHaveAttribute('aria-current', 'page')
  })

  it('không có dữ liệu thì báo trống', async () => {
    mockApi(() => json(pageOf([], { total: 0, total_pages: 0 })))
    renderPage()

    expect(await screen.findByText(/Không có thay đổi nào trong khoảng này/)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Phân trang nhật ký' })).not.toBeInTheDocument()
  })

  it('lỗi tải thì có nút Thử lại', async () => {
    let fail = true
    mockApi(() => (fail ? json({ message: 'Lỗi máy chủ' }, 500) : json(pageOf(rows))))
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Lỗi máy chủ')).toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('DS26100503')).toBeInTheDocument()
  })

  it('có liên kết sang Thanh toán & hoàn cọc', async () => {
    mockApi()
    renderPage()
    await screen.findByRole('table')

    // Menu bên trái cũng có liên kết cùng tên, nên chỉ tìm trong dòng ghi chú cuối trang
    const note = screen.getByText(/được hợp nhất tại đây/)
    expect(within(note).getByRole('link', { name: 'Thanh toán & hoàn cọc' })).toHaveAttribute('href', '/admin/payments')
  })
})
