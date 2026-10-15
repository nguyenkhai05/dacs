import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../features/auth/authContext'
import { sampleUser } from '../test/helpers'
import MyBookingsPage from './MyBookingsPage'

const booking = (overrides: Record<string, unknown> = {}) => ({
  booking_id: 107,
  booking_code: 'DS107',
  pitch_id: 1,
  pitch_name: 'Bình An 01',
  image_url: null,
  category_name: 'Sân 7',
  booking_date: '2026-10-07',
  start_time: '18:00:00',
  end_time: '20:00:00',
  status: 'Confirmed',
  total_amount: 740000,
  deposit_paid: 222000,
  deposit_required: 222000,
  refund_amount: 0,
  hold_seconds_left: 0,
  can_cancel: true,
  ...overrides,
})

const listBody = (bookings: unknown[]) => ({
  tab: 'upcoming',
  page: 1,
  limit: 5,
  total: bookings.length,
  total_pages: 1,
  summary: {
    counts: { all: 12, upcoming: bookings.length, completed: 8, cancelled: 1 },
    total_spent: 0,
    next_booking: {
      booking_id: 107,
      booking_code: 'DS107',
      pitch_name: 'Bình An 01',
      booking_date: '2026-10-07',
      start_time: '18:00:00',
      end_time: '20:00:00',
    },
  },
  bookings,
})

function mockApi(list: unknown, activity: unknown = { activities: [] }) {
  const fetchMock = vi.fn((url: string) => {
    const body = String(url).includes('/bookings/my/activity') ? activity : list
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage() {
  return render(
    <AuthContext.Provider value={{ user: sampleUser, token: 'token-abc', signIn: () => {}, signOut: () => {}, updateUser: () => {} }}>
      <MemoryRouter initialEntries={['/bookings']}>
        <MyBookingsPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('MyBookingsPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hiện số liệu tổng quan, đơn sắp tới và gửi kèm token', async () => {
    const fetchMock = mockApi(
      listBody([
        booking(),
        booking({ booking_id: 112, booking_code: 'DS112', pitch_name: 'Bình An 03', status: 'Pending', total_amount: 300000, deposit_paid: 0, deposit_required: 90000, hold_seconds_left: 600 }),
      ]),
    )
    renderPage()

    expect(await screen.findByText('Bình An 01')).toBeInTheDocument()
    expect(screen.getByText('02 lịch đá')).toBeInTheDocument()
    expect(screen.getByText('08 trận')).toBeInTheDocument()
    expect(screen.getByText('07/10 · 18:00')).toBeInTheDocument()
    expect(screen.getByText('0 đ / 90.000 đ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Thanh toán cọc/ })).toHaveAttribute('href', '/payment/112')
    expect(screen.getByRole('link', { name: /Xem chi tiết/ })).toHaveAttribute('href', '/bookings/107')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/bookings/my?tab=upcoming&page=1&limit=5')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc')
  })

  it('đổi tab thì gọi lại API với tab mới', async () => {
    const fetchMock = mockApi(listBody([booking()]))
    renderPage()
    await screen.findByText('Bình An 01')

    await userEvent.click(screen.getByRole('tab', { name: /Đã hủy/ }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('tab=cancelled'))).toBe(true),
    )
  })

  it('danh sách rỗng → thông báo và gợi ý tìm sân', async () => {
    mockApi({ ...listBody([]), total_pages: 1 })
    renderPage()

    expect(await screen.findByText('Bạn chưa có lịch đá nào sắp tới.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tìm sân và đặt ngay/ })).toHaveAttribute('href', '/pitches')
  })

  it('lỗi tải danh sách → báo lỗi và có nút thử lại', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Lỗi máy chủ' }), { status: 500, headers: { 'Content-Type': 'application/json' } }),
      ),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi máy chủ')
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })

  it('hiện hoạt động gần đây', async () => {
    mockApi(listBody([booking()]), {
      activities: [{ at: '2026-10-05T08:03:00.000Z', type: 'deposit_paid', booking_id: 107, booking_code: 'DS107', amount: 222000, note: null }],
    })
    renderPage()

    expect(await screen.findByText('Đã nhận cọc 222.000 đ')).toBeInTheDocument()
    expect(screen.getByText('05/10 · 15:03')).toBeInTheDocument()
  })
})
