import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../features/auth/authContext'
import AdminServicesPage from './AdminServicesPage'

const service = (id: number, name: string, unit: string, price: number, stock: number, active = true, threshold = 10) => ({
  service_id: id,
  service_name: name,
  unit,
  price,
  stock_quantity: stock,
  low_stock_threshold: threshold,
  is_active: active,
  is_low_stock: active && stock < threshold,
})

const services = [
  service(1, 'Nước suối', 'chai', 10000, 120),
  service(2, 'Áo bib', 'chiếc', 3000, 40),
  service(3, 'Bóng thi đấu', 'quả', 20000, 8, true, 5),
  service(4, 'Khăn lạnh', 'gói', 5000, 4),
  service(5, 'Nước điện giải', 'chai', 15000, 0, false),
]

const listBody = () => ({
  summary: {
    total: 5,
    active: 4,
    inactive: 1,
    low_stock: 1,
    low_stock_items: [services[3]],
  },
  services,
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

interface Call { url: string; method: string; body?: Record<string, unknown> }

function mockApi(options: { listStatus?: number; writeError?: { status: number; message: string } } = {}) {
  const calls: Call[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
      calls.push({ url, method, body })

      if (method === 'GET') {
        return options.listStatus ? json({ message: 'Lỗi máy chủ' }, options.listStatus) : json(listBody())
      }

      if (options.writeError) return json({ message: options.writeError.message }, options.writeError.status)

      if (method === 'POST') return json({ ...service(9, String(body?.service_name), String(body?.unit), Number(body?.price), Number(body?.stock_quantity)) }, 201)

      return json({ ...services[0], ...body })
    }),
  )

  return calls
}

function renderPage(roles = ['Admin']) {
  const user = { user_id: 9, full_name: 'Trần Hoàng', email: null, roles }
  return render(
    <AuthContext.Provider value={{ user, token: 'tok', signIn: () => {}, signOut: () => {}, updateUser: () => {} }}>
      <MemoryRouter>
        <AdminServicesPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Admin Dịch vụ - hiển thị', () => {
  it('hiện 3 thẻ thống kê, bảng dịch vụ và cảnh báo sắp hết', async () => {
    mockApi()
    renderPage()

    const active = await screen.findByLabelText('Dịch vụ hoạt động')
    expect(await within(active).findByText('04')).toBeInTheDocument()
    expect(within(active).getByText('Trong 5 dịch vụ đã tạo')).toBeInTheDocument()

    const low = screen.getByLabelText('Cần bổ sung kho')
    expect(within(low).getByText('01')).toBeInTheDocument()
    expect(within(low).getByText('Khăn lạnh · còn 4 gói')).toBeInTheDocument()

    expect(screen.getByText('Giảm khi Đã xác nhận')).toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(within(table).getByText('Nước suối / chai')).toBeInTheDocument()
    expect(within(table).getByText('10.000 đ')).toBeInTheDocument()
    expect(within(table).getByText('4 · thấp')).toBeInTheDocument()
    expect(within(table).getByText('Ngừng hoạt động')).toBeInTheDocument()

    expect(screen.getByText('Khăn lạnh sắp hết')).toBeInTheDocument()
    expect(screen.getByText(/Còn 4 gói, dưới ngưỡng cảnh báo 10/)).toBeInTheDocument()
  })

  it('tự mở sẵn dịch vụ đầu tiên trong form chỉnh sửa', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Chỉnh sửa · Nước suối' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tên dịch vụ')).toHaveValue('Nước suối')
    expect(screen.getByLabelText('Giá bán')).toHaveValue('10.000')
    expect(screen.getByLabelText(/^Số lượng tồn kho/)).toHaveValue('120')
  })

  it('bấm "Sửa" ở dòng khác thì form đổi sang dịch vụ đó', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Sửa Áo bib' }))

    expect(screen.getByRole('heading', { name: 'Chỉnh sửa · Áo bib' })).toBeInTheDocument()
    expect(screen.getByLabelText('Đơn vị')).toHaveValue('chiếc')
  })

  it('lỗi tải danh sách thì báo lỗi và cho thử lại', async () => {
    mockApi({ listStatus: 500 })
    renderPage()

    expect(await screen.findByText(/Lỗi máy chủ/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })
})

describe('Admin Dịch vụ - sửa và thêm', () => {
  it('sửa giá + tồn kho: chỉ gửi trường đổi, báo thành công và tải lại danh sách', async () => {
    const calls = mockApi()
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { name: 'Chỉnh sửa · Nước suối' })
    const price = screen.getByLabelText('Giá bán')
    await user.clear(price)
    await user.type(price, '12000')
    const stock = screen.getByLabelText(/^Số lượng tồn kho/)
    await user.clear(stock)
    await user.type(stock, '100')
    await user.click(screen.getByRole('button', { name: 'Lưu dịch vụ' }))

    expect(await screen.findByText('Đã lưu dịch vụ Nước suối.')).toBeInTheDocument()

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch?.url).toContain('/admin/services/1')
    expect(patch?.body).toEqual({ price: 12000, stock_quantity: 100 })
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(2) // tải lần đầu + tải lại sau khi lưu
  })

  it('chuyển sang Ngừng hoạt động', async () => {
    const calls = mockApi()
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { name: 'Chỉnh sửa · Nước suối' })
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'inactive')
    await user.click(screen.getByRole('button', { name: 'Lưu dịch vụ' }))

    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH')).toBe(true))
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ is_active: false })
  })

  it('không đổi gì mà bấm Lưu → báo lỗi, KHÔNG gọi server', async () => {
    const calls = mockApi()
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Lưu dịch vụ' }))

    expect(screen.getAllByText('Bạn chưa thay đổi thông tin nào.').length).toBeGreaterThan(0)
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false)
  })

  it('giá âm → báo lỗi, KHÔNG gọi server', async () => {
    const calls = mockApi()
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { name: 'Chỉnh sửa · Nước suối' })
    const price = screen.getByLabelText('Giá bán')
    await user.clear(price)
    await user.type(price, '-500')
    await user.click(screen.getByRole('button', { name: 'Lưu dịch vụ' }))

    expect(screen.getAllByText('Giá bán phải là số nguyên không âm.').length).toBeGreaterThan(0)
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false)
  })

  it('"Hủy sửa" trả form về giá trị đã lưu', async () => {
    mockApi()
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { name: 'Chỉnh sửa · Nước suối' })
    await user.type(screen.getByLabelText('Tên dịch vụ'), ' thêm')
    expect(screen.getByLabelText('Tên dịch vụ')).toHaveValue('Nước suối thêm')

    await user.click(screen.getByRole('button', { name: 'Hủy sửa' }))

    expect(screen.getByLabelText('Tên dịch vụ')).toHaveValue('Nước suối')
  })

  it('thêm dịch vụ mới: ngưỡng mặc định 10 và đang hoạt động', async () => {
    const calls = mockApi()
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '+ Thêm dịch vụ' }))
    expect(screen.getByRole('heading', { name: 'Thêm dịch vụ' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Tên dịch vụ'), 'Băng cổ tay')
    await user.type(screen.getByLabelText('Đơn vị'), 'cái')
    await user.type(screen.getByLabelText('Giá bán'), '7000')
    await user.type(screen.getByLabelText(/^Số lượng tồn kho/), '30')
    await user.click(screen.getByRole('button', { name: 'Lưu dịch vụ' }))

    expect(await screen.findByText('Đã thêm dịch vụ Băng cổ tay.')).toBeInTheDocument()
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      service_name: 'Băng cổ tay',
      unit: 'cái',
      price: 7000,
      stock_quantity: 30,
      low_stock_threshold: 10,
      is_active: true,
    })
  })

  it('server báo trùng tên → hiện lỗi từ server', async () => {
    mockApi({ writeError: { status: 409, message: 'Tên dịch vụ đã tồn tại.' } })
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { name: 'Chỉnh sửa · Nước suối' })
    const name = screen.getByLabelText('Tên dịch vụ')
    await user.clear(name)
    await user.type(name, 'Áo bib')
    await user.click(screen.getByRole('button', { name: 'Lưu dịch vụ' }))

    expect((await screen.findAllByText('Tên dịch vụ đã tồn tại.')).length).toBeGreaterThan(0)
  })
})

describe('Admin Dịch vụ - nhân viên (chỉ xem)', () => {
  it('không có nút thêm/lưu, các ô bị khóa và có ghi chú chỉ đọc', async () => {
    mockApi()
    renderPage(['Staff'])

    expect(await screen.findByRole('heading', { name: 'Chi tiết · Nước suối' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Thêm dịch vụ' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu dịch vụ' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Tên dịch vụ')).toBeDisabled()
    expect(screen.getByLabelText('Trạng thái')).toBeDisabled()
    expect(screen.getByText(/Chỉ Admin được thêm hoặc chỉnh sửa dịch vụ/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xem Áo bib' })).toBeInTheDocument()
  })
})
