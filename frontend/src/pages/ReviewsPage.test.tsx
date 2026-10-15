import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../features/auth/authContext'
import { sampleUser } from '../test/helpers'
import ReviewsPage from './ReviewsPage'

type Handler = (init?: RequestInit) => { status?: number; body: unknown }

/** Giả backend: tìm handler đầu tiên có đường dẫn nằm trong URL được gọi. */
function mockApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const key = Object.keys(handlers).find((path) => url.includes(path))
    if (!key) throw new Error(`Chưa mock: ${url}`)
    const { status = 200, body } = handlers[key](init)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const reviewsBody = (overrides: Record<string, unknown> = {}) => ({
  pitch_id: 2,
  pitch_name: 'Bình An 01',
  summary: { average: 4.8, review_count: 24, distribution: { '5': 20, '4': 3, '3': 1, '2': 0, '1': 0 } },
  page: 1,
  limit: 5,
  total: 24,
  total_pages: 5,
  items: [
    { review_id: 1, rating: 5, comment: 'Đèn sáng, mặt cỏ tốt.', reviewer_name: 'T. Q. Huy', created_at: '2026-10-03T05:00:00.000Z' },
    { review_id: 2, rating: 4, comment: null, reviewer_name: 'P. N. Sơn', created_at: '2026-09-28T05:00:00.000Z' },
  ],
  ...overrides,
})

const booking = (id: number, pitchId: number) => ({
  booking_id: id,
  booking_code: `DS${id}`,
  pitch_id: pitchId,
  pitch_name: pitchId === 2 ? 'Bình An 01' : 'Sân khác',
  booking_date: '2026-10-04',
  start_time: '18:00:00',
  end_time: '20:00:00',
})

function renderPage(loggedIn: boolean, path = '/pitches/2/reviews') {
  const user = loggedIn ? sampleUser : null
  return render(
    <AuthContext.Provider
      value={{ user, token: user ? 'jwt-test' : null, signIn: () => {}, signOut: () => {}, updateUser: () => {} }}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/pitches/:id/reviews" element={<ReviewsPage />} />
          <Route path="/pitches" element={<p>DANH SÁCH SÂN</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReviewsPage - phần xem đánh giá', () => {
  it('hiển thị điểm trung bình, phân bố sao, danh sách và phạm vi phân trang', async () => {
    mockApi({ '/reviews?pitch_id=2': () => ({ body: reviewsBody() }) })
    renderPage(false)

    expect(await screen.findByRole('heading', { name: 'Chia sẻ sau trận đấu' })).toBeInTheDocument()
    expect(screen.getByText(/Đánh giá Bình An 01 để những đội bóng tiếp theo/)).toBeInTheDocument()
    expect(screen.getByText('4,8', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('24 đánh giá')).toBeInTheDocument()
    expect(screen.getByText('T. Q. Huy')).toBeInTheDocument()
    expect(screen.getByText('Đèn sáng, mặt cỏ tốt.')).toBeInTheDocument()
    expect(screen.getByText('03/10/2026 · Đã chơi tại sân')).toBeInTheDocument()
    expect(screen.getByText('Hiển thị 1–5 trong 24 đánh giá')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang 2' })).toBeInTheDocument()
  })

  it('đổi trang thì gọi lại API với trang mới', async () => {
    const fetchMock = mockApi({ '/reviews?pitch_id=2': () => ({ body: reviewsBody() }) })
    const user = userEvent.setup()
    renderPage(false)

    await user.click(await screen.findByRole('button', { name: 'Trang 2' }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true),
    )
  })

  it('sân chưa có đánh giá thì báo trống', async () => {
    mockApi({
      '/reviews?pitch_id=2': () => ({
        body: reviewsBody({
          summary: { average: 0, review_count: 0, distribution: { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 } },
          total: 0,
          total_pages: 1,
          items: [],
        }),
      }),
    })
    renderPage(false)

    expect(await screen.findByText('Chưa có đánh giá nào cho sân này.')).toBeInTheDocument()
    expect(screen.getByText(/Sân chưa có đánh giá nào/)).toBeInTheDocument()
  })

  it('sân không tồn tại → màn báo lỗi có đường về danh sách', async () => {
    mockApi({ '/reviews?pitch_id=2': () => ({ status: 404, body: { message: 'Không tìm thấy sân' } }) })
    renderPage(false)

    expect(await screen.findByRole('heading', { name: 'Không tìm thấy sân' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về danh sách sân' })).toHaveAttribute('href', '/pitches')
  })

  it('đường dẫn sân không hợp lệ thì không gọi server', async () => {
    const fetchMock = mockApi({})
    renderPage(false, '/pitches/abc/reviews')

    expect(await screen.findByRole('heading', { name: 'Không tìm thấy sân' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('ReviewsPage - phần gửi đánh giá', () => {
  it('chưa đăng nhập: mời đăng nhập và không gọi API booking', async () => {
    const fetchMock = mockApi({ '/reviews?pitch_id=2': () => ({ body: reviewsBody() }) })
    renderPage(false)

    expect(await screen.findByText(/Đăng nhập để đánh giá các trận bạn đã chơi/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/bookings/my'))).toBe(false)
  })

  it('đã đăng nhập: chỉ liệt kê booking hoàn thành của sân này và chưa đánh giá', async () => {
    mockApi({
      '/reviews?pitch_id=2': () => ({ body: reviewsBody() }),
      '/bookings/my': () => ({ body: { bookings: [booking(10, 2), booking(11, 2), booking(12, 9)] } }),
      '/reviews/booking/10': () => ({ body: { can_review: true } }),
      '/reviews/booking/11': () => ({ body: { can_review: false } }),
    })
    renderPage(true)

    expect(
      await screen.findByRole('option', { name: 'DS10 · Bình An 01 · 04/10/2026 · 18:00–20:00' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /DS11/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /DS12/ })).not.toBeInTheDocument()
  })

  it('không có booking nào đánh giá được thì giải thích rõ lý do', async () => {
    mockApi({
      '/reviews?pitch_id=2': () => ({ body: reviewsBody() }),
      '/bookings/my': () => ({ body: { bookings: [] } }),
    })
    renderPage(true)

    expect(await screen.findByText(/chưa có booking đã hoàn thành tại sân này cần đánh giá/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi đánh giá' })).not.toBeInTheDocument()
  })

  it('bắt buộc chọn số sao trước khi gửi và KHÔNG gọi server khi thiếu', async () => {
    const fetchMock = mockApi({
      '/reviews?pitch_id=2': () => ({ body: reviewsBody() }),
      '/bookings/my': () => ({ body: { bookings: [booking(10, 2)] } }),
      '/reviews/booking/10': () => ({ body: { can_review: true } }),
    })
    const user = userEvent.setup()
    renderPage(true)

    await user.click(await screen.findByRole('button', { name: 'Gửi đánh giá' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Hãy chọn số sao cho trận đấu.')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('gửi thành công: đúng nội dung, báo cảm ơn, tải lại danh sách và bỏ booking khỏi ô chọn', async () => {
    let created = false
    const fetchMock = mockApi({
      '/reviews?pitch_id=2': () => ({ body: reviewsBody() }),
      '/bookings/my': () => ({ body: { bookings: [booking(10, 2)] } }),
      '/reviews/booking/10': () => ({ body: { can_review: !created } }),
      '/reviews': (init) => {
        created = true
        return { status: 201, body: { message: 'Cảm ơn bạn đã đánh giá', sent: init?.body } }
      },
    })
    const user = userEvent.setup()
    renderPage(true)

    await screen.findByRole('button', { name: 'Gửi đánh giá' })
    await user.click(screen.getByRole('radio', { name: '5 sao' }))
    expect(screen.getByText('5 sao · Rất hài lòng')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nhận xét'), '  Sân sạch, nhân viên nhiệt tình  ')
    await user.click(screen.getByRole('button', { name: 'Gửi đánh giá' }))

    expect(await screen.findByText(/Cảm ơn bạn đã đánh giá! Đánh giá của bạn đã được đăng/)).toBeInTheDocument()

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post).toBeDefined()
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      booking_id: 10,
      rating: 5,
      comment: 'Sân sạch, nhân viên nhiệt tình',
    })
    expect((post?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer jwt-test')

    // Danh sách + điểm trung bình được tải lại (lần đầu + sau khi gửi)
    const reviewListCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/reviews?pitch_id=2'))
    expect(reviewListCalls.length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('button', { name: 'Gửi đánh giá' })).not.toBeInTheDocument()
  })

  it('server báo đơn đã được đánh giá (409): hiện lỗi và bỏ booking đó', async () => {
    mockApi({
      '/reviews?pitch_id=2': () => ({ body: reviewsBody() }),
      '/bookings/my': () => ({ body: { bookings: [booking(10, 2)] } }),
      '/reviews/booking/10': () => ({ body: { can_review: true } }),
      '/reviews': () => ({ status: 409, body: { message: 'Đơn này đã được đánh giá' } }),
    })
    const user = userEvent.setup()
    renderPage(true)

    await screen.findByRole('button', { name: 'Gửi đánh giá' })
    await user.click(screen.getByRole('radio', { name: '4 sao' }))
    await user.click(screen.getByRole('button', { name: 'Gửi đánh giá' }))

    expect(await screen.findByText('Đơn này đã được đánh giá')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('option', { name: /DS10/ })).not.toBeInTheDocument())
  })

  it('chọn sẵn booking theo ?booking= trên URL', async () => {
    mockApi({
      '/reviews?pitch_id=2': () => ({ body: reviewsBody() }),
      '/bookings/my': () => ({ body: { bookings: [booking(10, 2), booking(11, 2)] } }),
      '/reviews/booking/': () => ({ body: { can_review: true } }),
    })
    renderPage(true, '/pitches/2/reviews?booking=11')

    const select = await screen.findByLabelText('Booking đã hoàn thành')
    expect(select).toHaveValue('11')
  })
})
