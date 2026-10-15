import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SiteHeader } from '../components/SiteHeader'
import { useAuth } from '../features/auth/useAuth'
import { fetchBookingDetail } from '../features/bookings/bookingApi'
import {
  buildTimeline,
  costRows,
  depositNotice,
  formatCountdown,
  money,
  paymentChip,
  policyTiers,
  STATUS_META,
  summarizeRefunds,
} from '../features/bookings/bookingDetailView'
import type { BookingDetail } from '../features/bookings/bookingTypes'
import { CancelBookingCard } from '../features/bookings/CancelBookingCard'
import { Chip } from '../features/bookings/Chip'
import { RefundAccountCard } from '../features/bookings/RefundAccountCard'
import { ApiError, isAbortError } from '../lib/api'
import { formatShortDate, formatTime } from '../lib/format'
import '../features/bookings/BookingDetail.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; notFound: boolean }
  | { kind: 'ready'; detail: BookingDetail; loadedAt: number }

const CANCELLABLE_VIEW_STATUSES = ['Pending', 'Confirmed']

/** Màn 10 - Chi tiết booking & hoàn cọc (đường dẫn /bookings/:bookingId). */
export default function BookingDetailPage() {
  const { bookingId } = useParams()
  const { token } = useAuth()

  const id = Number(bookingId)
  const validId = Number.isInteger(id) && id > 0

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Tải chi tiết; tải lại khi reloadKey đổi (sau khi hủy / lưu tài khoản / hết giờ giữ chỗ)
  useEffect(() => {
    if (!validId) return

    const controller = new AbortController()

    fetchBookingDetail(id, token, controller.signal)
      .then((detail) => setState({ kind: 'ready', detail, loadedAt: Date.now() }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setState({
          kind: 'error',
          message:
            error instanceof ApiError ? error.message : 'Không tải được thông tin booking.',
          notFound: error instanceof ApiError && error.status === 404,
        })
      })

    return () => controller.abort()
  }, [id, token, validId, reloadKey])

  // Đồng hồ giữ chỗ của đơn chờ cọc; hết giờ thì tải lại để thấy trạng thái mới
  const holdEndsAt =
    state.kind === 'ready' &&
    state.detail.status === 'Pending' &&
    state.detail.hold_seconds_left > 0
      ? state.loadedAt + state.detail.hold_seconds_left * 1000
      : null

  useEffect(() => {
    if (holdEndsAt === null) return

    const timer = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= holdEndsAt) {
        clearInterval(timer)
        setReloadKey((key) => key + 1)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [holdEndsAt])

  function reload(message: string) {
    setNotice(message)
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="bd">
      <SiteHeader active="bookings" />

      <main className="bd__main">
        {!validId ? (
          <ErrorState message="Mã booking không hợp lệ." notFound />
        ) : state.kind === 'loading' ? (
          <div className="bd-state" role="status">
            <p>Đang tải thông tin booking...</p>
          </div>
        ) : state.kind === 'error' ? (
          <ErrorState
            message={state.notFound ? 'Không tìm thấy booking này.' : state.message}
            notFound={state.notFound}
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        ) : (
          <DetailView
            detail={state.detail}
            loadedAt={state.loadedAt}
            token={token}
            notice={notice}
            secondsLeft={
              holdEndsAt === null ? 0 : Math.max(0, Math.ceil((holdEndsAt - now) / 1000))
            }
            onChanged={reload}
          />
        )}
      </main>

      <footer className="bd-footer">
        <div className="bd-footer__inner">
          <span>© 2026 Đặt Sân Nhanh · Kết nối đam mê sân cỏ</span>
          <span>Quy định đặt sân · 0901 234 567 · Giờ Việt Nam (UTC+7)</span>
        </div>
      </footer>
    </div>
  )
}

function ErrorState({
  message,
  notFound,
  onRetry,
}: {
  message: string
  notFound?: boolean
  onRetry?: () => void
}) {
  return (
    <div className="bd-state">
      <h1>Không xem được booking</h1>
      <p role="alert">{message}</p>
      <div className="bd-actions" style={{ justifyContent: 'center' }}>
        {!notFound && onRetry && (
          <button type="button" className="bd-btn bd-btn--outline" onClick={onRetry}>
            Thử lại
          </button>
        )}
        <Link to="/bookings" className="bd-btn bd-btn--primary">
          Về lịch đặt của tôi
        </Link>
      </div>
    </div>
  )
}

interface DetailViewProps {
  detail: BookingDetail
  loadedAt: number
  token: string | null
  notice: string | null
  secondsLeft: number
  onChanged: (message: string) => void
}

function DetailView({ detail, loadedAt, token, notice, secondsLeft, onChanged }: DetailViewProps) {
  const status = STATUS_META[detail.status]
  const chip = paymentChip(detail)
  const deposit = depositNotice(detail)
  const rows = costRows(detail)
  const timeline = buildTimeline(detail)
  const tiers = policyTiers(detail.cancellation.policy)
  const refunds = summarizeRefunds(detail.refunds)

  const showCancelCard = CANCELLABLE_VIEW_STATUSES.includes(detail.status)
  const showPayLink = detail.status === 'Pending'

  return (
    <>
      <nav className="bd__crumbs" aria-label="Đường dẫn">
        <Link to="/bookings">Lịch đặt của tôi</Link>
        <span>/</span>
        {detail.booking_code}
      </nav>

      <div className="bd__head">
        <div>
          <h1 className="bd__title">Chi tiết booking {detail.booking_code}</h1>
          <p className="bd__subtitle">
            {detail.pitch.pitch_name}
            {detail.pitch.category_name ? ` · ${detail.pitch.category_name}` : ''} ·{' '}
            {formatShortDate(detail.booking_date)} · {formatTime(detail.start_time)}–
            {formatTime(detail.end_time)}
          </p>
        </div>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>

      {notice && (
        <div className="bd-alert bd-alert--success" role="status" style={{ marginBottom: 20 }}>
          {notice}
        </div>
      )}

      <div className="bd__grid">
        <div className="bd__col">
          <section className="bd-card" aria-labelledby="bd-cost-title">
            <h2 className="bd-card__title" id="bd-cost-title">
              Thông tin &amp; chi phí
            </h2>

            <div className="bd-table-wrap">
              <table className="bd-table">
                <thead>
                  <tr>
                    <th>Khoản mục</th>
                    <th>Số lượng / giờ</th>
                    <th>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.item}</td>
                      <td>{row.quantity}</td>
                      <td>{money(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bd-total">
              <strong>Tổng đơn: {money(detail.amounts.total_amount)}</strong>
              {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
            </div>

            {deposit && (
              <div className={`bd-notice bd-notice--${deposit.tone}`}>
                <strong>{deposit.title}</strong>
                {deposit.body && <p>{deposit.body}</p>}
              </div>
            )}

            {showPayLink && (
              <div className="bd-pay">
                <Link to={`/payment/${detail.booking_id}`} className="bd-btn bd-btn--primary">
                  Thanh toán cọc
                </Link>
                <span className="bd-countdown">
                  {detail.hold_seconds_left > 0
                    ? `Giữ chỗ còn ${formatCountdown(secondsLeft)}`
                    : 'Đã hết thời gian giữ chỗ'}
                </span>
              </div>
            )}

            <div className="bd-customer">
              <p>
                {detail.customer.full_name}
                {detail.customer.phone_number ? ` · ${detail.customer.phone_number}` : ''}
              </p>
              {detail.customer_note && <p>Ghi chú: {detail.customer_note}</p>}
            </div>
          </section>

          {showCancelCard && (
            <CancelBookingCard
              detail={detail}
              token={token}
              nowMs={loadedAt}
              onCancelled={onChanged}
            />
          )}
        </div>

        <aside className="bd__side">
          <section className="bd-card" aria-labelledby="bd-progress-title">
            <h2 className="bd-card__title" id="bd-progress-title">
              Tiến trình booking
            </h2>
            <ol className="bd-timeline">
              {timeline.map((item) => (
                <li key={item.key} className={item.done ? 'is-done' : 'is-todo'}>
                  <span className="bd-dot" aria-hidden="true" />
                  <div>
                    <strong>
                      {item.time ? `${item.time} — ` : ''}
                      {item.title}
                    </strong>
                    {item.note && <small>{item.note}</small>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="bd-card" aria-labelledby="bd-policy-title">
            <h2 className="bd-card__title" id="bd-policy-title">
              Chính sách hủy
            </h2>
            <div className="bd-policy">
              {tiers.map((tier) => (
                <div key={tier.key} className={`is-${tier.tone}`}>
                  <h3>{tier.title}</h3>
                  <p>{tier.text}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {detail.status === 'Cancelled' && refunds && (
        <RefundAccountCard
          key={`${refunds.current.refund_id}-${refunds.kind}-${refunds.current.bank_account_number ?? ''}`}
          detail={detail}
          summary={refunds}
          token={token}
          onSaved={onChanged}
        />
      )}

      {detail.status === 'Cancelled' && !refunds && (
        <section className="bd-card" style={{ marginTop: 20 }}>
          <h2 className="bd-card__title">Đơn đã hủy</h2>
          <p className="bd-refund__text">
            {detail.amounts.paid > 0
              ? 'Theo chính sách hủy, đơn này không được hoàn tiền cọc. Sân đã được giải phóng.'
              : 'Đơn chưa đóng cọc nên không có khoản hoàn. Sân đã được giải phóng.'}
          </p>
        </section>
      )}
    </>
  )
}
