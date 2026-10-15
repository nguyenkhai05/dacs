import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../features/auth/authContext'
import AdminPaymentsPage from './AdminPaymentsPage'

const overview = {
  date: '2026-10-05',
  kpis: { collected_amount: 5702000, collected_count: 27, refunded_amount: 222000, refunded_count: 1, net_revenue: 5480000 },
  backlog: { pending_refund_count: 1, pending_refund_amount: 222000, failed_refund_count: 0, reconciliation_open_count: 1 },
}

const ledger = {
  date: '2026-10-05',
  page: 1,
  limit: 10,
  total: 27,
  totals: { collected: 5702000, refunded: 222000, net: 5480000 },
  items: [
    { kind: 'payment', id: 501, code: 'TT0501', occurred_at: '2026-10-05T08:03:00.000Z', booking_id: 107, booking_code: 'DS107', customer_name: 'Nguyễn An', type: 'Deposit', type_label: 'Thu cọc', amount: 223000, method: 'Banking', method_label: 'VietQR', status: 'Successful', status_label: 'Thành công', counts_in_revenue: true, reference: 'DS107' },
    { kind: 'refund', id: 1, code: 'HT0001', occurred_at: '2026-10-05T04:20:00.000Z', booking_id: 9, booking_code: 'DS9', customer_name: 'Trần Huy', type: 'Refund', type_label: 'Hoàn cọc', amount: -222000, method: 'Banking', method_label: 'Chuyển khoản thủ công', status: 'Successful', status_label: 'Thành công', counts_in_revenue: true, reference: 'FT1' },
    { kind: 'transfer', id: 3, code: 'CK0003', occurred_at: '2026-10-05T08:05:00.000Z', booking_id: 503, booking_code: 'DS503', customer_name: null, type: 'Unmatched', type_label: 'Chuyển khoản chưa khớp', amount: 50000, method: 'Banking', method_label: 'VietQR', status: 'Pending', status_label: 'Chờ đối soát', counts_in_revenue: false, reference: null },
  ],
}

const reconciliations = {
  status: 'Open',
  page: 1,
  limit: 20,
  total: 2,
  items: [
    { transfer_id: 3, code: 'CK0003', booking_id: 503, booking_code: 'DS503', booking_status: 'Pending', customer_name: 'Lê Bình', customer_phone: null, content: 'DS503', reference_code: 'X', received_amount: 50000, expected_amount: 105000, difference: -55000, issue: 'AmountTooSmall', issue_label: 'Thiếu 55.000 đ', status: 'Open', received_at: null,
      actions: [{ action: 'apply_to_booking', label: 'Ghi nhận bổ sung / xác nhận cọc' }, { action: 'dismiss', label: 'Bỏ qua (đã xử lý ngoài hệ thống)' }] },
    { transfer_id: 4, code: 'CK0004', booking_id: 9, booking_code: 'DS9', booking_status: 'Cancelled', customer_name: 'Trần Huy', customer_phone: null, content: 'DS9', reference_code: 'Y', received_amount: 90000, expected_amount: 90000, difference: 0, issue: 'BookingNotPending', issue_label: 'Chuyển khoản đơn đã hủy', status: 'Open', received_at: null,
      actions: [{ action: 'request_refund', label: 'Khởi tạo hoàn tiền' }, { action: 'dismiss', label: 'Bỏ qua (đã xử lý ngoài hệ thống)' }] },
  ],
}

const account = { bank_name: 'ACB', account_number: '88887766', account_name: 'TRAN QUOC HUY', is_complete: true }
const refundItem = {
  refund_id: 9, code: 'HT0009', status: 'Pending', status_label: 'Chờ hoàn', amount: 222000, reason: null, failure_reason: null, transaction_code: null,
  requested_at: null, processed_at: null, booking_id: 9, booking_code: 'DS261009', booking_status: 'Cancelled', booking_date: '2026-10-09',
  start_time: '18:00', end_time: '20:00', pitch_name: 'Bình An 01', customer_name: 'Trần Quốc Huy', customer_phone: '0903 123 456', account,
}

const refunds = { filter: 'open', page: 1, limit: 50, total: 1, summary: { pending_count: 1, pending_amount: 222000, failed_count: 0, done_count: 0 }, items: [refundItem] }

const detail = (overrides: { account?: typeof account; status?: string } = {}) => ({
  refund: { ...refundItem, status: overrides.status ?? 'Pending', account: overrides.account ?? account, processed_by_name: null },
  booking: { booking_id: 9, booking_code: 'DS261009', status: 'Cancelled', pitch_name: 'Bình An 01', booking_date: '2026-10-09', start_time: '18:00', end_time: '20:00', cancelled_at: '2026-10-05T07:30:00.000Z', cancel_reason: null, hours_before_start: 24.5, refund_percent: 100 },
  customer: { name: 'Trần Quốc Huy', phone: '0903 123 456' },
  account: overrides.account ?? account,
  invoice: { invoice_id: 1, total_amount: 740000, status: 'PartiallyPaid', paid_amount: 222000, refunded_amount: 0, after_confirm: { status: 'PartiallyRefunded', refunded_amount: 222000, net_revenue_change: -222000 } },
  can: { confirm: true, fail: true, update_account: true },
  history: [{ history_id: 1, old_status: null, new_status: 'Pending', note: 'Tạo yêu cầu hoàn', changed_by_name: 'Admin', changed_at: '2026-10-05T07:31:00.000Z' }],
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function mockApi(options: { detail?: ReturnType<typeof detail> } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/overview')) return json(overview)
    if (url.includes('/transactions/export')) return new Response('a,b', { headers: { 'Content-Type': 'text/csv' } })
    if (url.includes('/transactions')) return json(ledger)
    if (/\/reconciliations\/\d+\/resolve/.test(url)) return json({ message: 'Đã xử lý khoản đối soát CK0004.', transfer_id: 4, action: 'request_refund', payment_id: 7, refund_id: 12 })
    if (url.includes('/reconciliations')) return json(reconciliations)
    if (url.includes('/refunds/9/confirm') && method === 'POST') return json({ message: 'Đã ghi nhận hoàn cọc DS261009 thành công.' })
    if (url.includes('/refunds/9/fail') && method === 'POST') return json({ message: 'Đã ghi nhận chuyển hoàn thất bại.' })
    if (url.includes('/refunds/9/account') && method === 'PATCH') return json({ message: 'Đã cập nhật thông tin nhận hoàn.' })
    if (/\/refunds\/\d+$/.test(url)) return json(options.detail ?? detail())
    if (url.includes('/refunds')) return json(refunds)
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const postBody = (fetchMock: ReturnType<typeof mockApi>, part: string, method = 'POST') => {
  const call = fetchMock.mock.calls.find(([url, init]) => String(url).includes(part) && (init as RequestInit | undefined)?.method === method)
  return call ? (JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>) : null
}

function renderPage() {
  const user = { user_id: 1, full_name: 'Trần Hoàng', email: null, roles: ['Admin'] }
  return render(
    <AuthContext.Provider value={{ user, token: 'tok', signIn: () => {}, signOut: () => {}, updateUser: () => {} }}>
      <MemoryRouter>
        <AdminPaymentsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const refundRegion = () => screen.findByRole('region', { name: /Hoàn cọc đang chờ/ })

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:csv')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AdminPaymentsPage', () => {
  it('hiện 3 thẻ số liệu, sổ giao dịch (có dấu + / −) và hàng đợi đối soát', async () => {
    mockApi()
    renderPage()

    // Các con số này cũng xuất hiện ở dòng "Tổng kết quả lọc", nên chỉ tìm trong 3 thẻ đầu trang
    const kpis = await screen.findByRole('region', { name: /Tổng quan thanh toán/ })
    expect(await within(kpis).findByText('5.702.000 đ')).toBeInTheDocument()
    expect(within(kpis).getByText('222.000 đ')).toBeInTheDocument()
    expect(within(kpis).getByText('5.480.000 đ')).toBeInTheDocument()

    expect(await screen.findByText('TT0501')).toBeInTheDocument()
    expect(screen.getByText('+223.000 đ')).toBeInTheDocument()
    expect(screen.getByText('−222.000 đ')).toBeInTheDocument()
    expect(screen.getByText('15:03')).toBeInTheDocument()
    expect(screen.getByText('Chờ đối soát')).toBeInTheDocument()
    expect(screen.getByText(/trong 27 giao dịch ngày 05\/10/)).toBeInTheDocument()

    const recon = await screen.findByRole('region', { name: /Hàng đợi đối soát thủ công · 2 giao dịch/ })
    expect(within(recon).getByText('Thiếu 55.000 đ')).toBeInTheDocument()
    expect(within(recon).getByText('50.000 đ / 105.000 đ')).toBeInTheDocument()
  })

  it('hiện chi tiết khoản hoàn: số tiền, tài khoản nhận, kết quả hóa đơn', async () => {
    mockApi()
    renderPage()

    const region = await refundRegion()
    expect(await within(region).findByText('222.000 đ')).toBeInTheDocument()
    expect(within(region).getByText('Trần Quốc Huy', { exact: false })).toBeInTheDocument()
    expect(within(region).getByText('88887766')).toBeInTheDocument()
    expect(within(region).getByText(/Hủy trước 24 giờ/)).toBeInTheDocument()

    const invoice = screen.getByRole('region', { name: /Hóa đơn & kết quả hoàn/ })
    expect(within(invoice).getByText(/Khi hoàn DS261009 thành công/)).toBeInTheDocument()
    expect(within(invoice).getByText(/“Hoàn một phần”/)).toBeInTheDocument()
  })

  it('xác nhận hoàn: nhập mã giao dịch hợp lệ thì gửi POST /confirm kèm thời gian', async () => {
    const fetchMock = mockApi()
    renderPage()
    const region = await refundRegion()

    await userEvent.type(await within(region).findByLabelText(/Mã giao dịch thật/), 'FT26100500123')
    await userEvent.click(within(region).getByRole('button', { name: 'Xác nhận đã hoàn thành công' }))

    expect(await screen.findByText('Đã ghi nhận hoàn cọc DS261009 thành công.')).toBeInTheDocument()
    const body = postBody(fetchMock, '/refunds/9/confirm')
    expect(body?.transaction_code).toBe('FT26100500123')
    expect(typeof body?.transferred_at).toBe('string')
  })

  it('mã giao dịch sai định dạng → báo lỗi và KHÔNG gọi API', async () => {
    const fetchMock = mockApi()
    renderPage()
    const region = await refundRegion()

    await userEvent.type(await within(region).findByLabelText(/Mã giao dịch thật/), 'ab')
    await userEvent.click(within(region).getByRole('button', { name: 'Xác nhận đã hoàn thành công' }))

    expect(await within(region).findByText(/4-100 ký tự/)).toBeInTheDocument()
    expect(postBody(fetchMock, '/refunds/9/confirm')).toBeNull()
  })

  it('chưa có thông tin nhận hoàn → khóa nút xác nhận và hiện sẵn form nhập tài khoản', async () => {
    mockApi({ detail: detail({ account: { bank_name: null, account_number: null, account_name: null, is_complete: false } as unknown as typeof account }) })
    renderPage()
    const region = await refundRegion()

    expect(await within(region).findByRole('button', { name: 'Xác nhận đã hoàn thành công' })).toBeDisabled()
    expect(within(region).getByRole('button', { name: 'Lưu thông tin' })).toBeInTheDocument()
  })

  it('sửa tài khoản nhận hoàn: số tài khoản được chuẩn hóa trước khi gửi', async () => {
    const fetchMock = mockApi()
    renderPage()
    const region = await refundRegion()

    await userEvent.click(await within(region).findByRole('button', { name: 'Sửa thông tin nhận hoàn' }))
    const number = within(region).getByLabelText('Số tài khoản')
    await userEvent.clear(number)
    await userEvent.type(number, '9999 1111 22')
    await userEvent.click(within(region).getByRole('button', { name: 'Lưu thông tin' }))

    expect(await screen.findByText('Đã cập nhật thông tin nhận hoàn.')).toBeInTheDocument()
    expect(postBody(fetchMock, '/refunds/9/account', 'PATCH')).toMatchObject({ bank_name: 'ACB', bank_account_number: '9999111122', bank_account_name: 'TRAN QUOC HUY' })
  })

  it('ghi nhận thất bại: bắt buộc nhập lý do', async () => {
    const fetchMock = mockApi()
    renderPage()
    const card = await screen.findByRole('region', { name: /Nếu chuyển khoản hoàn thất bại/ })

    await userEvent.click(within(card).getByRole('button', { name: 'Ghi nhận Thất bại' }))
    expect(await within(card).findByText(/ít nhất 3 ký tự/)).toBeInTheDocument()
    expect(postBody(fetchMock, '/refunds/9/fail')).toBeNull()

    await userEvent.type(within(card).getByLabelText('Lý do thất bại'), 'Sai thông tin tài khoản nhận')
    await userEvent.click(within(card).getByRole('button', { name: 'Ghi nhận Thất bại' }))

    expect(await screen.findByText('Đã ghi nhận chuyển hoàn thất bại.')).toBeInTheDocument()
    expect(postBody(fetchMock, '/refunds/9/fail')).toEqual({ reason: 'Sai thông tin tài khoản nhận' })
  })

  it('đối soát: khởi tạo hoàn tiền gửi action request_refund', async () => {
    const fetchMock = mockApi()
    renderPage()
    const recon = await screen.findByRole('region', { name: /Hàng đợi đối soát thủ công/ })

    await userEvent.click(await within(recon).findByRole('button', { name: 'Khởi tạo hoàn tiền' }))
    await userEvent.click(within(recon).getByRole('button', { name: 'Xác nhận' }))

    expect(await screen.findByText(/Yêu cầu hoàn mới đã được tạo/)).toBeInTheDocument()
    expect(postBody(fetchMock, '/reconciliations/4/resolve')).toEqual({ action: 'request_refund' })
  })

  it('đối soát: "Ghi nhận bổ sung" gợi ý sẵn số tiền còn thiếu', async () => {
    const fetchMock = mockApi()
    renderPage()
    const recon = await screen.findByRole('region', { name: /Hàng đợi đối soát thủ công/ })

    await userEvent.click(await within(recon).findByRole('button', { name: 'Ghi nhận bổ sung' }))
    expect(within(recon).getByLabelText(/Số tiền khách chuyển bổ sung/)).toHaveValue(55000)
    await userEvent.click(within(recon).getByRole('button', { name: 'Xác nhận' }))

    await waitFor(() => expect(postBody(fetchMock, '/reconciliations/3/resolve')).toEqual({ action: 'apply_to_booking', extra_amount: 55000 }))
  })

  it('đối soát: "Bỏ qua" bắt buộc có ghi chú', async () => {
    const fetchMock = mockApi()
    renderPage()
    const recon = await screen.findByRole('region', { name: /Hàng đợi đối soát thủ công/ })

    await userEvent.click((await within(recon).findAllByRole('button', { name: 'Bỏ qua' }))[0])
    await userEvent.click(within(recon).getByRole('button', { name: 'Xác nhận' }))

    expect(await within(recon).findByText('Hãy ghi chú cách đã xử lý khoản này.')).toBeInTheDocument()
    expect(postBody(fetchMock, '/resolve')).toBeNull()
  })

  it('đổi bộ lọc trạng thái thì gọi lại API với status mới và về trang 1', async () => {
    const fetchMock = mockApi()
    renderPage()
    await screen.findByText('TT0501')

    await userEvent.selectOptions(screen.getByLabelText('Trạng thái'), 'Successful')

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/transactions?') && String(url).includes('status=Successful') && String(url).includes('page=1'))).toBe(true))
  })

  it('"Xuất CSV" gọi API export kèm token', async () => {
    const fetchMock = mockApi()
    renderPage()
    await screen.findByText('TT0501')

    await userEvent.click(screen.getByRole('button', { name: 'Xuất CSV' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/transactions/export'))
      expect(call).toBeTruthy()
      expect(((call?.[1] as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer tok')
    })
  })

  it('lỗi tải sổ giao dịch → hiện lỗi và nút Thử lại', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => (String(input).includes('/transactions') ? json({ message: 'Lỗi máy chủ' }, 500) : json({}, 404))),
    )
    renderPage()

    expect(await screen.findAllByText('Lỗi máy chủ')).not.toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Thử lại' }).length).toBeGreaterThan(0)
  })
})
