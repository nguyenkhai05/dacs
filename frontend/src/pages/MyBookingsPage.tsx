import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { useAuth } from '../features/auth/useAuth'
import {
  activityText,
  formatActivityTime,
  formatDuration,
  formatMoney,
  formatNextSlot,
  formatTimeRange,
  padCount,
  statusView,
  upcomingBreakdown,
} from '../features/bookings/bookingView'
import {
  fetchMyActivity,
  fetchMyBookings,
} from '../features/bookings/myBookingsApi'
import type {
  ActivityItem,
  BookingListItem,
  BookingTab,
  MyBookingsResponse,
} from '../features/bookings/myBookingsApi'
import { isAbortError } from '../lib/api'
import { formatShortDate } from '../lib/format'
import './MyBookingsPage.css'

const PAGE_SIZE = 5

const TABS: { key: BookingTab; label: string; noun: string; empty: string }[] = [
  { key: 'upcoming', label: 'Sắp tới', noun: 'lịch sắp tới', empty: 'Bạn chưa có lịch đá nào sắp tới.' },
  { key: 'completed', label: 'Đã hoàn thành', noun: 'trận đã hoàn thành', empty: 'Bạn chưa có trận nào hoàn thành.' },
  { key: 'cancelled', label: 'Đã hủy', noun: 'đơn đã hủy', empty: 'Bạn không có đơn nào bị hủy.' },
]

function BookingRow({ booking }: { booking: BookingListItem }) {
  const status = statusView(booking.status)
  const awaitingDeposit = booking.status === 'Pending'
  const canPayNow = awaitingDeposit && booking.hold_seconds_left > 0

  return (
    <tr>
      <td data-label="Mã đơn / sân">
        <strong>{booking.booking_code}</strong>
        <span className="mb-pitch">{booking.pitch_name}</span>
      </td>
      <td data-label="Ngày / giờ">
        {formatShortDate(booking.booking_date)}
        <span className="mb-sub">{formatTimeRange(booking.start_time, booking.end_time)}</span>
      </td>
      <td data-label="Tổng đơn">{formatMoney(booking.total_amount)}</td>
      <td data-label="Đã cọc">
        {awaitingDeposit
          ? `${formatMoney(booking.deposit_paid)} / ${formatMoney(booking.deposit_required)}`
          : formatMoney(booking.deposit_paid)}
        {booking.refund_amount > 0 && (
          <span className="mb-sub">Hoàn {formatMoney(booking.refund_amount)}</span>
        )}
      </td>
      <td data-label="Trạng thái">
        <span className={`mb-badge mb-badge--${status.tone}`}>{status.label}</span>
      </td>
      <td data-label="Thao tác">
        {canPayNow ? (
          <Link className="mb-action" to={`/payment/${booking.booking_id}`}>
            Thanh toán cọc →
          </Link>
        ) : (
          <Link className="mb-action mb-action--plain" to={`/bookings/${booking.booking_id}`}>
            Xem chi tiết →
          </Link>
        )}
      </td>
    </tr>
  )
}

export default function MyBookingsPage() {
  const { token } = useAuth()
  const [tab, setTab] = useState<BookingTab>('upcoming')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<MyBookingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  // Dòng phụ "2 đã xác nhận · 1 chờ cọc" của thẻ "Sắp tới": nhớ lại để không mất khi chuyển tab
  const [upcomingNote, setUpcomingNote] = useState('')
  const [activities, setActivities] = useState<ActivityItem[] | null>(null)

  // Tải danh sách theo tab + trang. Đổi tab/trang giữa chừng thì hủy request cũ.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetchMyBookings({ tab, page, limit: PAGE_SIZE }, token, controller.signal)
      .then((result) => {
        setData(result)
        // Chỉ tính dòng phụ khi đã có đủ toàn bộ đơn sắp tới trong một trang
        if (tab === 'upcoming' && result.total <= result.limit) {
          setUpcomingNote(upcomingBreakdown(result.bookings))
        }
      })
      .catch((e: unknown) => {
        if (isAbortError(e)) return
        setError(e instanceof Error ? e.message : 'Không thể tải lịch đặt. Vui lòng thử lại.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [tab, page, token, reloadKey])

  // Hoạt động gần đây: tải một lần; lỗi ở đây không chặn phần còn lại của trang
  useEffect(() => {
    const controller = new AbortController()
    fetchMyActivity(token, 5, controller.signal)
      .then((result) => setActivities(result.activities))
      .catch((e: unknown) => {
        if (!isAbortError(e)) setActivities([])
      })
    return () => controller.abort()
  }, [token, reloadKey])

  const changeTab = useCallback((next: BookingTab) => {
    setTab(next)
    setPage(1)
  }, [])

  const counts = data?.summary.counts
  const next = data?.summary.next_booking ?? null
  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0]
  const bookings = data?.bookings ?? []
  const from = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0
  const to = data ? from + bookings.length - (bookings.length > 0 ? 1 : 0) : 0

  return (
    <div className="mb-page">
      <SiteHeader active="bookings" />

      <main className="mb-main">
        <div className="mb-title">
          <div>
            <h1>Lịch đặt của tôi</h1>
            <p>Tất cả lịch đá, trạng thái thanh toán và hoạt động gần đây ở một nơi.</p>
          </div>
          <Link to="/pitches" className="mb-primary">
            + Đặt sân mới
          </Link>
        </div>

        <section className="mb-stats" aria-label="Tổng quan lịch đặt">
          <article className="mb-card">
            <h2>Sắp tới</h2>
            <p className="mb-stat mb-stat--green">{counts ? `${padCount(counts.upcoming)} lịch đá` : '—'}</p>
            <small>{counts && counts.upcoming === 0 ? 'Chưa có lịch nào' : upcomingNote || ' '}</small>
          </article>
          <article className="mb-card">
            <h2>Trận tiếp theo</h2>
            <p className="mb-stat">{next ? formatNextSlot(next.booking_date, next.start_time) : counts ? 'Chưa có' : '—'}</p>
            <small>
              {next
                ? `${next.pitch_name} · ${formatDuration(next.start_time, next.end_time)}`
                : counts
                  ? 'Chưa có trận nào đã xác nhận'
                  : ' '}
            </small>
          </article>
          <article className="mb-card">
            <h2>Đã hoàn thành</h2>
            <p className="mb-stat">{counts ? `${padCount(counts.completed)} trận` : '—'}</p>
            <small>Có thể đánh giá sau trận</small>
          </article>
        </section>

        <section className="mb-card mb-list" aria-label="Danh sách lịch đặt">
          <div className="mb-tabs" role="tablist" aria-label="Lọc theo trạng thái">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={tab === t.key ? 'is-active' : undefined}
                onClick={() => changeTab(t.key)}
              >
                {t.label}
                {counts ? ` (${counts[t.key]})` : ''}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-error">
              <Alert>{error}</Alert>
              <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
                Thử lại
              </button>
            </div>
          )}

          {!error && loading && !data && <p className="mb-empty">Đang tải lịch đặt…</p>}

          {!error && data && bookings.length === 0 && !loading && (
            <div className="mb-empty">
              <p>{activeTab.empty}</p>
              {tab === 'upcoming' && <Link to="/pitches">Tìm sân và đặt ngay →</Link>}
            </div>
          )}

          {!error && data && bookings.length > 0 && (
            <div className={`mb-table-wrap${loading ? ' is-loading' : ''}`} aria-busy={loading}>
              <table className="mb-table">
                <thead>
                  <tr>
                    <th scope="col">Mã đơn / sân</th>
                    <th scope="col">Ngày / giờ</th>
                    <th scope="col">Tổng đơn</th>
                    <th scope="col">Đã cọc</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <BookingRow key={booking.booking_id} booking={booking} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!error && data && data.total > 0 && (
            <div className="mb-pager">
              <span>
                Hiển thị {from}–{to} trong {data.total} {activeTab.noun} · Trang {data.page} / {data.total_pages}
              </span>
              <div className="mb-pager__buttons">
                <button
                  type="button"
                  aria-label="Trang trước"
                  disabled={data.page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </button>
                <button type="button" className="is-current" aria-current="page" disabled>
                  {data.page}
                </button>
                <button
                  type="button"
                  aria-label="Trang sau"
                  disabled={data.page >= data.total_pages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="mb-bottom">
          <section className="mb-card mb-activity" aria-label="Hoạt động gần đây">
            <h2>Hoạt động gần đây</h2>
            {activities === null ? (
              <p className="mb-muted">Đang tải hoạt động…</p>
            ) : activities.length === 0 ? (
              <p className="mb-muted">Chưa có hoạt động nào.</p>
            ) : (
              <div className="mb-table-wrap">
                <table className="mb-table mb-table--activity">
                  <thead>
                    <tr>
                      <th scope="col">Thời gian</th>
                      <th scope="col">Hoạt động</th>
                      <th scope="col">Booking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((activity, index) => (
                      <tr key={`${activity.booking_id}-${activity.type}-${activity.at}-${index}`}>
                        <td data-label="Thời gian">
                          <strong>{formatActivityTime(activity.at)}</strong>
                        </td>
                        <td data-label="Hoạt động">{activityText(activity)}</td>
                        <td data-label="Booking">
                          <Link to={`/bookings/${activity.booking_id}`}>{activity.booking_code}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="mb-aside">
            <div className="mb-note">
              <strong>Theo dõi ngay trên lịch đặt</strong>
              <p>
                Trạng thái đơn và giao dịch được cập nhật tại đây. Mở chi tiết để xem tiến trình hoặc thông tin hoàn
                cọc.
              </p>
            </div>
            <p className="mb-policy">
              Không hỗ trợ đổi giờ hoặc sân trực tiếp. Bạn có thể hủy và đặt lại theo chính sách.
            </p>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
