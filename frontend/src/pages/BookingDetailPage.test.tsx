import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../features/auth/AuthProvider'
import { saveSession } from '../features/auth/storage'
import { makeDetail } from '../features/bookings/bookingFixtures'
import type { BookingDetail, RefundItem } from '../features/bookings/bookingTypes'
import { fakeJwt, sampleUser } from '../test/helpers'
import BookingDetailPage from './BookingDetailPage'

// ---- Máy chủ giả: giữ "dữ liệu hiện tại" của đơn và ghi lại các lời gọi
interface FakeServer {
  detail: BookingDetail | null
  calls: { method: string; path: string; body: unknown }[]
  onCancel?: () => Response | void
  onSaveAccount?: () => Response | void
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installServer(server: FakeServer) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace('http://localhost:3000', '')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    server.calls.push({ method, path, body })

    if (method === 'GET' && /^\/bookings\/\d+$/.test(path)) {
      return server.detail ? json(200, server.detail) : json(404, { message: 'Không tìm thấy đơn đặt sân' })
    }
    if (method === 'POST' && path.endsWith('/cancel')) {
      return server.onCancel?.() ?? json(200, { message: 'Đã hủy đơn. Yêu cầu hoàn cọc đang chờ duyệt.', status: 'Cancelled' })
    }
    if (method === 'PATCH' && path.endsWith('/refund-account')) {
      return server.onSaveAccount?.() ?? json(200, { message: 'Đã lưu thông tin nhận hoàn', updated_refunds: 1 })
    }
    return json(500, { message: `Không có route giả cho ${method} ${path}` })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAt(path: string) {
  saveSession({ token: fakeJwt(), user: sampleUser }, true)
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/bookings/:bookingId" element={<BookingDetailPage />} />
          <Route path="/bookings" element={<p>TRANG LỊCH ĐẶT</p>} />
          <Route path="/payment/:bookingId" element={<p>TRANG THANH TOÁN</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

const refund = (patch: Partial<RefundItem> = {}): RefundItem => ({
  refund_id: 5,
  amount: 222000,
  reason: null,
  status: 'Pending',
  created_at: '2026-10-05T08:10:00.000Z',
  processed_at: null,
  bank_name: null,
  bank_account_number: null,
  bank_account_name: null,
  failure_reason: null,
  ...patch,
})

const cancelledDetail = (refunds: RefundItem[]): BookingDetail =>
  makeDetail({
    status: 'Cancelled',
    refunds,
    amounts: { ...makeDetail().amounts, remaining: 0, refund_pending: 222000 },
    history: [
      { old_status: null, new_status: 'Pending', reason: 'Tao booking', changed_at: '2026-10-05T08:00:00.000Z' },
      { old_status: 'Pending', new_status: 'Confirmed', reason: null, changed_at: '2026-10-05T08:03:00.000Z' },
      { old_status: 'Confirmed', new_status: 'Cancelled', reason: 'Khách hủy đơn: Đội thay đổi kế hoạch', changed_at: '2026-10-05T08:10:00.000Z' },
    ],
    cancellation: { ...makeDetail().cancellation, can_cancel: false, reason: 'Đơn ở trạng thái này không thể hủy', refund_amount: 0 },
  })

let server: FakeServer

beforeEach(() => {
  server = { detail: makeDetail(), calls: [] }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BookingDetailPage - đơn đã xác nhận (đúng thiết kế)', () => {
  it('hiện đủ thông tin, chi phí, tiến trình và chính sách', async () => {
    installServer(server)
    renderAt('/bookings/107')

    expect(await screen.findByRole('heading', { name: 'Chi tiết booking DS107' })).toBeInTheDocument()
    expect(screen.getByText('Bình An 01 · Sân 5 người · 07/10/2026 · 18:00–20:00')).toBeInTheDocument()
    expect(screen.getAllByText('Đã xác nhận').length).toBeGreaterThan(0)

    // Bảng chi phí: hai khung giá sân + hai dịch vụ
    const table = screen.getByRole('table')
    expect(within(table).getByText('Sân · 18:00–19:00')).toBeInTheDocument()
    expect(within(table).getByText('1 giờ × 300.000 đ')).toBeInTheDocument()
    expect(within(table).getByText('Sân · 19:00–20:00')).toBeInTheDocument()
    expect(within(table).getByText('1 giờ × 350.000 đ')).toBeInTheDocument()
    expect(within(table).getByText('6 chai × 10.000 đ')).toBeInTheDocument()
    expect(within(table).getByText('10 chiếc × 3.000 đ')).toBeInTheDocument()

    expect(screen.getByText('Tổng đơn: 740.000 đ')).toBeInTheDocument()
    expect(screen.getByText('Thanh toán một phần')).toBeInTheDocument()
    expect(screen.getByText('Đã cọc 222.000 đ')).toBeInTheDocument()
    expect(screen.getByText(/Còn lại 518\.000 đ trả bằng tiền mặt tại sân/)).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Minh Anh · 0912345678')).toBeInTheDocument()
    expect(screen.getByText('Ghi chú: Đội 10 người, vui lòng chuẩn bị áo bib.')).toBeInTheDocument()

    // Tiến trình
    expect(screen.getByText('05/10 · 15:00 — Tạo đơn')).toBeInTheDocument()
    expect(screen.getByText('Chờ cọc · Giữ chỗ 15 phút')).toBeInTheDocument()
    expect(screen.getByText('Nhận đủ 222.000 đ qua VietQR')).toBeInTheDocument()
    expect(screen.getByText('07/10 · 18:00 — Check-in tại sân')).toBeInTheDocument()
    expect(screen.getByText('Sau trận — Thu tiền mặt & hoàn thành')).toBeInTheDocument()

    // Chính sách hủy (2 mức vì partial_percent = 0)
    expect(screen.getByText('Trước giờ đá ≥ 24 giờ')).toBeInTheDocument()
    expect(screen.getByText('Trước giờ đá < 24 giờ')).toBeInTheDocument()

    // Khung hủy: xem trước khoản hoàn
    expect(screen.getByText('Hủy lúc này: được hoàn 222.000 đ')).toBeInTheDocument()
  })

  it('có menu "Lịch đặt của tôi" ở thanh đầu trang và breadcrumb quay về danh sách', async () => {
    installServer(server)
    renderAt('/bookings/107')
    await screen.findByRole('heading', { name: 'Chi tiết booking DS107' })

    const links = screen.getAllByRole('link', { name: 'Lịch đặt của tôi' })
    expect(links.length).toBeGreaterThanOrEqual(2)
  })

  it('gọi API bằng token của người đăng nhập', async () => {
    const fetchMock = installServer(server)
    renderAt('/bookings/107')
    await screen.findByRole('heading', { name: 'Chi tiết booking DS107' })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /)
  })
})

describe('BookingDetailPage - hủy booking', () => {
  it('nút hủy chỉ bật khi đã tick xác nhận; "Giữ booking" xóa form', async () => {
    installServer(server)
    const user = userEvent.setup()
    renderAt('/bookings/107')
    await screen.findByRole('heading', { name: 'Chi tiết booking DS107' })

    const confirm = screen.getByRole('button', { name: 'Xác nhận hủy booking' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText('Lý do hủy'), 'Đội bận')
    await user.click(screen.getByLabelText(/Tôi hiểu rằng giờ sân sẽ được giải phóng/))
    expect(confirm).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Giữ booking' }))
    expect(screen.getByLabelText('Lý do hủy')).toHaveValue('')
    expect(confirm).toBeDisabled()
    expect(server.calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('hủy thành công: gửi lý do, tải lại và chuyển sang trạng thái đã hủy chờ hoàn cọc', async () => {
    installServer(server)
    server.onCancel = () => {
      server.detail = cancelledDetail([refund()])
      return json(200, { message: 'Đã hủy đơn. Yêu cầu hoàn cọc đang chờ duyệt.', status: 'Cancelled' })
    }
    const user = userEvent.setup()
    renderAt('/bookings/107')
    await screen.findByRole('heading', { name: 'Chi tiết booking DS107' })

    await user.type(screen.getByLabelText('Lý do hủy'), '  Đội thay đổi kế hoạch ')
    await user.click(screen.getByLabelText(/Tôi hiểu rằng giờ sân sẽ được giải phóng/))
    await user.click(screen.getByRole('button', { name: 'Xác nhận hủy booking' }))

    expect(await screen.findByText('Đơn đã hủy · đang chờ hoàn cọc')).toBeInTheDocument()
    expect(server.calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/bookings/107/cancel',
      body: { reason: 'Đội thay đổi kế hoạch' },
    })
    expect(screen.getByRole('status')).toHaveTextContent('Đã hủy đơn. Yêu cầu hoàn cọc đang chờ duyệt.')
    expect(screen.getByText('Chờ hoàn 222.000 đ')).toBeInTheDocument()
    expect(screen.getByText(/Lý do hủy: Đội thay đổi kế hoạch\./)).toBeInTheDocument()
    // card "Hủy booking" biến mất, đơn không còn bước sắp tới
    expect(screen.queryByRole('button', { name: 'Xác nhận hủy booking' })).not.toBeInTheDocument()
    expect(screen.queryByText('Check-in tại sân')).not.toBeInTheDocument()
  })

  it('không nhập lý do vẫn hủy được (gửi body rỗng)', async () => {
    installServer(server)
    server.onCancel = () => {
      server.detail = cancelledDetail([])
      return json(200, { message: 'Đã hủy đơn.', status: 'Cancelled' })
    }
    const user = userEvent.setup()
    renderAt('/bookings/107')
    await screen.findByRole('heading', { name: 'Chi tiết booking DS107' })

    await user.click(screen.getByLabelText(/Tôi hiểu rằng/))
    await user.click(screen.getByRole('button', { name: 'Xác nhận hủy booking' }))

    expect(await screen.findByText('Đơn đã hủy')).toBeInTheDocument()
    expect(server.calls.find((c) => c.method === 'POST')?.body).toEqual({})
    expect(screen.getByText(/Theo chính sách hủy, đơn này không được hoàn tiền cọc/)).toBeInTheDocument()
  })

  it('hủy lỗi: hiện thông báo của máy chủ và cho thử lại', async () => {
    installServer(server)
    server.onCancel = () => json(409, { message: 'Đã quá giờ bắt đầu, không thể hủy' })
    const user = userEvent.setup()
    renderAt('/bookings/107')
    await screen.findByRole('heading', { name: 'Chi tiết booking DS107' })

    await user.click(screen.getByLabelText(/Tôi hiểu rằng/))
    await user.click(screen.getByRole('button', { name: 'Xác nhận hủy booking' }))

    expect(await screen.findByText('Đã quá giờ bắt đầu, không thể hủy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xác nhận hủy booking' })).toBeEnabled()
  })

  it('đơn không còn hủy được thì chỉ hiện lý do, không có form', async () => {
    server.detail = makeDetail({
      cancellation: { ...makeDetail().cancellation, can_cancel: false, reason: 'Đã quá giờ bắt đầu, không thể hủy', refund_amount: 0 },
    })
    installServer(server)
    renderAt('/bookings/107')

    expect(await screen.findByText('Không thể hủy booking này')).toBeInTheDocument()
    expect(screen.getByText('Đã quá giờ bắt đầu, không thể hủy')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận hủy booking' })).not.toBeInTheDocument()
  })

  it('đơn đã check-in không có card hủy', async () => {
    server.detail = makeDetail({ status: 'CheckedIn' })
    installServer(server)
    renderAt('/bookings/107')

    expect(await screen.findByText('Đã check-in')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Hủy booking' })).not.toBeInTheDocument()
  })
})

describe('BookingDetailPage - tài khoản nhận hoàn', () => {
  it('kiểm tra form trước khi gửi', async () => {
    server.detail = cancelledDetail([refund()])
    installServer(server)
    const user = userEvent.setup()
    renderAt('/bookings/107')
    await screen.findByText('Đơn đã hủy · đang chờ hoàn cọc')

    await user.click(screen.getByRole('button', { name: 'Lưu thông tin nhận hoàn' }))

    expect(screen.getByText('Hãy nhập tên ngân hàng')).toBeInTheDocument()
    expect(screen.getByText('Số tài khoản phải gồm 6-30 chữ số')).toBeInTheDocument()
    expect(screen.getByText('Hãy nhập tên chủ tài khoản')).toBeInTheDocument()
    expect(server.calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('lưu tài khoản: làm sạch số tài khoản, đổi tên không dấu viết hoa, hiện thông báo', async () => {
    server.detail = cancelledDetail([refund()])
    installServer(server)
    server.onSaveAccount = () => {
      server.detail = cancelledDetail([
        refund({ bank_name: 'ACB', bank_account_number: '1234567890', bank_account_name: 'NGUYEN MINH ANH' }),
      ])
      return json(200, { message: 'Đã lưu thông tin nhận hoàn', updated_refunds: 1 })
    }
    const user = userEvent.setup()
    renderAt('/bookings/107')
    await screen.findByText('Đơn đã hủy · đang chờ hoàn cọc')

    await user.type(screen.getByLabelText('Ngân hàng nhận hoàn'), ' ACB ')
    await user.type(screen.getByLabelText('Số tài khoản'), '1234 567 890')
    await user.type(screen.getByLabelText('Chủ tài khoản'), 'Nguyễn Minh Anh')
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin nhận hoàn' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Đã lưu thông tin nhận hoàn'))
    expect(server.calls.find((c) => c.method === 'PATCH')).toMatchObject({
      path: '/bookings/107/refund-account',
      body: { bank_name: 'ACB', bank_account_number: '1234567890', bank_account_name: 'NGUYEN MINH ANH' },
    })
    // Form được điền lại bằng dữ liệu đã lưu từ máy chủ
    await waitFor(() => expect(screen.getByLabelText('Số tài khoản')).toHaveValue('1234567890'))
    expect(screen.getByLabelText('Chủ tài khoản')).toHaveValue('NGUYEN MINH ANH')
  })

  it('điền sẵn tài khoản đã lưu', async () => {
    server.detail = cancelledDetail([
      refund({ bank_name: 'ACB', bank_account_number: '1234567890', bank_account_name: 'NGUYEN MINH ANH' }),
    ])
    installServer(server)
    renderAt('/bookings/107')
    await screen.findByText('Đơn đã hủy · đang chờ hoàn cọc')

    expect(screen.getByLabelText('Ngân hàng nhận hoàn')).toHaveValue('ACB')
    expect(screen.getByLabelText('Số tài khoản')).toHaveValue('1234567890')
  })

  it('lỗi từ máy chủ khi lưu được hiển thị', async () => {
    server.detail = cancelledDetail([refund()])
    installServer(server)
    server.onSaveAccount = () => json(409, { message: 'Khoản hoàn đã được chuyển, không thể sửa thông tin nhận hoàn' })
    const user = userEvent.setup()
    renderAt('/bookings/107')
    await screen.findByText('Đơn đã hủy · đang chờ hoàn cọc')

    await user.type(screen.getByLabelText('Ngân hàng nhận hoàn'), 'ACB')
    await user.type(screen.getByLabelText('Số tài khoản'), '1234567890')
    await user.type(screen.getByLabelText('Chủ tài khoản'), 'Minh Anh')
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin nhận hoàn' }))

    expect(await screen.findByText('Khoản hoàn đã được chuyển, không thể sửa thông tin nhận hoàn')).toBeInTheDocument()
  })

  it('hoàn thất bại: hiện lý do và cho sửa tài khoản', async () => {
    server.detail = cancelledDetail([refund({ status: 'Failed', failure_reason: 'Sai số tài khoản', bank_name: 'ACB', bank_account_number: '111111', bank_account_name: 'A B' })])
    installServer(server)
    renderAt('/bookings/107')

    expect(await screen.findByText('Hoàn cọc chưa thành công')).toBeInTheDocument()
    expect(screen.getByText('Hoàn thất bại')).toBeInTheDocument()
    expect(screen.getByText(/Sai số tài khoản/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu thông tin nhận hoàn' })).toBeInTheDocument()
  })

  it('đơn do nhân viên hủy: nói rõ ai hủy và lý do', async () => {
    const detail = cancelledDetail([refund()])
    detail.history[2] = { old_status: 'Confirmed', new_status: 'Cancelled', reason: 'Nhân viên hủy đơn: Sân bảo trì đột xuất', changed_at: '2026-10-05T08:10:00.000Z' }
    server.detail = detail
    installServer(server)
    renderAt('/bookings/107')

    expect(await screen.findByText(/Đơn được hủy bởi nhân viên — lý do: Sân bảo trì đột xuất\./)).toBeInTheDocument()
  })

  it('đã hoàn xong: chỉ xem, không có form', async () => {
    server.detail = cancelledDetail([refund({ status: 'Successful', bank_name: 'ACB', bank_account_number: '1234567890', bank_account_name: 'NGUYEN MINH ANH' })])
    installServer(server)
    renderAt('/bookings/107')

    expect(await screen.findByText('Đã hoàn cọc')).toBeInTheDocument()
    expect(screen.getByText('Đã hoàn 222.000 đ')).toBeInTheDocument()
    expect(screen.getByText('1234567890')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu thông tin nhận hoàn' })).not.toBeInTheDocument()
  })
})

describe('BookingDetailPage - đơn chờ cọc và các lỗi', () => {
  it('đơn chờ cọc: có nút thanh toán và đồng hồ giữ chỗ', async () => {
    server.detail = makeDetail({
      status: 'Pending',
      hold_seconds_left: 872,
      payments: [],
      history: [{ old_status: null, new_status: 'Pending', reason: 'Tao booking', changed_at: '2026-10-05T08:00:00.000Z' }],
      amounts: { ...makeDetail().amounts, paid: 0, remaining: 740000 },
    })
    installServer(server)
    renderAt('/bookings/107')

    expect(await screen.findByText('Chưa đóng cọc')).toBeInTheDocument()
    expect(screen.getByText('Chưa thanh toán')).toBeInTheDocument()
    expect(screen.getByText(/Giữ chỗ còn 14:3\d/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Thanh toán cọc' })).toHaveAttribute('href', '/payment/107')
    expect(screen.getByText('Thanh toán cọc qua VietQR')).toBeInTheDocument()
  })

  it('hết thời gian giữ chỗ thì báo hết giờ', async () => {
    server.detail = makeDetail({
      status: 'Pending',
      hold_seconds_left: 0,
      payments: [],
      amounts: { ...makeDetail().amounts, paid: 0, remaining: 740000 },
    })
    installServer(server)
    renderAt('/bookings/107')

    expect(await screen.findByText('Đã hết thời gian giữ chỗ')).toBeInTheDocument()
  })

  it('không tìm thấy đơn (404): báo lỗi và có link về lịch đặt', async () => {
    server.detail = null
    installServer(server)
    renderAt('/bookings/999')

    expect(await screen.findByText('Không tìm thấy booking này.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về lịch đặt của tôi' })).toHaveAttribute('href', '/bookings')
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
  })

  it('mã đơn không hợp lệ: báo lỗi và không gọi API', async () => {
    const fetchMock = installServer(server)
    renderAt('/bookings/abc')

    expect(await screen.findByText('Mã booking không hợp lệ.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lỗi mạng: có nút Thử lại tải lại được', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(json(200, makeDetail()))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderAt('/bookings/107')

    expect(await screen.findByText(/Không kết nối được máy chủ/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findByRole('heading', { name: 'Chi tiết booking DS107' })).toBeInTheDocument()
  })

  it('bảng giá đã đổi: tiền sân gộp một dòng theo số tiền đã chốt', async () => {
    server.detail = makeDetail({ pitch_lines: null })
    installServer(server)
    renderAt('/bookings/107')

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Sân · 18:00–20:00')).toBeInTheDocument()
    expect(within(table).getByText('650.000 đ')).toBeInTheDocument()
  })
})
