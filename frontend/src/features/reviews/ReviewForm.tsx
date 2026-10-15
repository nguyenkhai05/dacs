import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { useAuth } from '../auth/useAuth'
import { ApiError, isAbortError } from '../../lib/api'
import { formatShortDate, formatTime } from '../../lib/format'
import { fetchReviewableBookings, submitReview } from './reviewsApi'
import type { ReviewableBooking } from './reviewsApi'
import { StarInput } from './Stars'
import { MAX_COMMENT_LENGTH, ratingLabel } from './reviewsUtils'

interface ReviewFormProps {
  pitchId: number
  /** Booking muốn chọn sẵn (từ ?booking=... trên URL, vd bấm "Đánh giá" ở màn Lịch đặt) */
  preselectBookingId: string | null
  /** Gọi sau khi gửi thành công để trang tải lại danh sách + điểm trung bình */
  onSubmitted: () => void
}

function describeBooking(booking: ReviewableBooking): string {
  return `${booking.booking_code} · ${booking.pitch_name} · ${formatShortDate(booking.booking_date)} · ${formatTime(booking.start_time)}–${formatTime(booking.end_time)}`
}

/** Khung "Viết đánh giá của bạn". */
export function ReviewForm({ pitchId, preselectBookingId, onSubmitted }: ReviewFormProps) {
  const { user, token } = useAuth()
  const location = useLocation()

  // null = đang tải danh sách booking có thể đánh giá
  const [bookings, setBookings] = useState<ReviewableBooking[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    setBookings(null)
    setLoadError('')

    fetchReviewableBookings(pitchId, token, controller.signal)
      .then(setBookings)
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setLoadError(error instanceof Error ? error.message : 'Không tải được danh sách booking của bạn.')
      })

    return () => controller.abort()
  }, [pitchId, token, reloadKey])

  const removeBooking = useCallback((bookingId: number) => {
    setBookings((list) => list?.filter((item) => item.booking_id !== bookingId) ?? list)
  }, [])

  // Chưa đăng nhập: mời đăng nhập, sau đó quay lại đúng trang này
  if (!user) {
    return (
      <section className="rv-card" aria-labelledby="rv-form-title">
        <h2 id="rv-form-title" className="rv-card__title">Viết đánh giá của bạn</h2>
        <p className="rv-note">
          Đăng nhập để đánh giá các trận bạn đã chơi tại sân này.
        </p>
        <Link className="rv-button" to="/login" state={{ from: location.pathname }}>
          Đăng nhập
        </Link>
      </section>
    )
  }

  // Chọn sẵn booking trên URL nếu hợp lệ, không thì lấy booking đầu tiên
  const defaultId =
    bookings?.find((item) => String(item.booking_id) === preselectBookingId)?.booking_id ??
    bookings?.[0]?.booking_id
  const activeId =
    bookings?.find((item) => String(item.booking_id) === selectedId)?.booking_id ?? defaultId

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || activeId === undefined) return

    if (rating === 0) {
      setFormError('Hãy chọn số sao cho trận đấu.')
      return
    }

    setSubmitting(true)
    setFormError('')
    setSuccess('')

    try {
      await submitReview(token, {
        booking_id: activeId,
        rating,
        comment: comment.trim() || undefined,
      })
      removeBooking(activeId)
      setSelectedId(null)
      setRating(0)
      setComment('')
      setSuccess('Cảm ơn bạn đã đánh giá! Đánh giá của bạn đã được đăng.')
      onSubmitted()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không gửi được đánh giá. Vui lòng thử lại.')
      // Đã đánh giá từ tab/thiết bị khác: bỏ khỏi danh sách để khỏi gửi lại
      if (error instanceof ApiError && error.status === 409) removeBooking(activeId)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="rv-card" aria-labelledby="rv-form-title">
      <h2 id="rv-form-title" className="rv-card__title">Viết đánh giá của bạn</h2>

      {success && <div className="rv-flash"><Alert variant="success">{success}</Alert></div>}

      {loadError ? (
        <div className="rv-flash">
          <Alert>{loadError}</Alert>
          <button type="button" className="rv-link-button" onClick={() => setReloadKey((key) => key + 1)}>
            Thử lại
          </button>
        </div>
      ) : bookings === null ? (
        <p className="rv-note">Đang tải các booking của bạn...</p>
      ) : bookings.length === 0 ? (
        <p className="rv-note">
          Bạn chưa có booking đã hoàn thành tại sân này cần đánh giá. Sau khi chơi xong và booking
          chuyển sang Hoàn thành, bạn sẽ đánh giá được tại đây.
        </p>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="rv-field">
            <label htmlFor="rv-booking">Booking đã hoàn thành</label>
            <select
              id="rv-booking"
              value={activeId}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={submitting}
            >
              {bookings.map((item) => (
                <option key={item.booking_id} value={item.booking_id}>
                  {describeBooking(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="rv-field">
            <span id="rv-rating-label" className="rv-field__label">Chọn mức đánh giá (1–5 sao)</span>
            <StarInput value={rating} onChange={setRating} disabled={submitting} labelledBy="rv-rating-label" />
            {rating > 0 && (
              <span className="rv-chip">
                {rating} sao · {ratingLabel(rating)}
              </span>
            )}
          </div>

          <div className="rv-field">
            <label htmlFor="rv-comment">Nhận xét</label>
            <textarea
              id="rv-comment"
              rows={4}
              maxLength={MAX_COMMENT_LENGTH}
              value={comment}
              placeholder="Sân, ánh sáng, nhân viên hỗ trợ... bạn thấy thế nào?"
              onChange={(event) => setComment(event.target.value)}
              disabled={submitting}
            />
            <span className="rv-counter" aria-hidden="true">
              {comment.length}/{MAX_COMMENT_LENGTH}
            </span>
          </div>

          {formError && <Alert>{formError}</Alert>}

          <Button type="submit" loading={submitting} loadingText="Đang gửi...">
            Gửi đánh giá
          </Button>
          <p className="rv-note rv-note--small">
            Mỗi booking chỉ gửi một lần. Nội dung cần lịch sự và phản ánh trải nghiệm thực tế.
          </p>
        </form>
      )}
    </section>
  )
}
