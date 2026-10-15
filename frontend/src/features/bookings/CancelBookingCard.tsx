import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../../lib/api'
import { cancelBooking } from './bookingApi'
import { cancelNotice } from './bookingDetailView'
import type { BookingDetail } from './bookingTypes'
import './BookingDetail.css'

interface CancelBookingCardProps {
  detail: BookingDetail
  token: string | null
  /** Thời điểm tải dữ liệu, dùng cho dòng "Hiện tại ..." */
  nowMs: number
  onCancelled: (message: string) => void
}

const MAX_REASON = 500

/** Khung "Hủy booking": xem trước khoản hoàn, nhập lý do, tick xác nhận rồi mới được hủy. */
export function CancelBookingCard({ detail, token, nowMs, onCancelled }: CancelBookingCardProps) {
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const notice = cancelNotice(detail.cancellation, detail.amounts.paid, nowMs)
  const canCancel = detail.cancellation.can_cancel

  function reset() {
    setReason('')
    setAcknowledged(false)
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!acknowledged || busy) return

    setBusy(true)
    setError(null)
    try {
      const result = await cancelBooking(detail.booking_id, reason, token)
      onCancelled(result.message)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Không hủy được booking. Vui lòng thử lại.',
      )
      setBusy(false)
    }
  }

  return (
    <section className="bd-card" aria-labelledby="bd-cancel-title">
      <h2 className="bd-card__title" id="bd-cancel-title">
        Hủy booking
      </h2>

      <div className={`bd-notice bd-notice--${notice.tone}`}>
        <strong>{notice.title}</strong>
        <p>{notice.body}</p>
      </div>

      {canCancel && (
        <form className="bd-form" onSubmit={handleSubmit}>
          <div className="bd-field">
            <label htmlFor="bd-cancel-reason">Lý do hủy</label>
            <textarea
              id="bd-cancel-reason"
              className="bd-textarea"
              value={reason}
              maxLength={MAX_REASON}
              placeholder="Ví dụ: đội thay đổi kế hoạch"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <label className="bd-check">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>Tôi hiểu rằng giờ sân sẽ được giải phóng và không thể khôi phục đơn.</span>
          </label>

          {error && (
            <div className="bd-alert bd-alert--error" role="alert">
              {error}
            </div>
          )}

          <div className="bd-actions">
            <button type="submit" className="bd-btn bd-btn--danger" disabled={!acknowledged || busy}>
              {busy ? 'Đang hủy...' : 'Xác nhận hủy booking'}
            </button>
            <button type="button" className="bd-btn bd-btn--outline" onClick={reset} disabled={busy}>
              Giữ booking
            </button>
          </div>
        </form>
      )}

      <p className="bd-fineprint">
        Không sửa giờ hoặc sân trên đơn. Muốn đổi lịch, hãy hủy và đặt lại.
      </p>
    </section>
  )
}
