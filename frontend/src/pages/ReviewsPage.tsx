import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { ReviewForm } from '../features/reviews/ReviewForm'
import { ReviewList } from '../features/reviews/ReviewList'
import { ReviewSummaryCard } from '../features/reviews/ReviewSummaryCard'
import { fetchPitchReviews } from '../features/reviews/reviewsApi'
import type { PitchReviewsResponse } from '../features/reviews/reviewsApi'
import { REVIEWS_PAGE_SIZE } from '../features/reviews/reviewsUtils'
import { ApiError, isAbortError } from '../lib/api'
import './ReviewsPage.css'

// Màn 12 - Đánh giá sân (/pitches/:id/reviews). Ai cũng xem được; gửi đánh giá cần đăng nhập.
export default function ReviewsPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const pitchId = id && /^\d+$/.test(id) ? Number(id) : null

  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<PitchReviewsResponse | null>(null)
  const [loading, setLoading] = useState(pitchId !== null)
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(
    pitchId === null ? { message: 'Đường dẫn sân không hợp lệ.', notFound: true } : null,
  )

  useEffect(() => {
    if (pitchId === null) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetchPitchReviews(pitchId, page, REVIEWS_PAGE_SIZE, controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (isAbortError(err)) return
        setError({
          message: err instanceof Error ? err.message : 'Không tải được đánh giá.',
          notFound: err instanceof ApiError && err.status === 404,
        })
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [pitchId, page, reloadKey])

  // Lỗi khi chưa có dữ liệu nào để hiển thị: cả trang là màn báo lỗi
  if (error && !data) {
    return (
      <div className="rv-page">
        <SiteHeader active="pitches" />
        <main className="rv-main">
          <div className="rv-card rv-fail" role="alert">
            <h1>{error.notFound ? 'Không tìm thấy sân' : 'Không tải được đánh giá'}</h1>
            <p>{error.message}</p>
            <div className="rv-fail__actions">
              {!error.notFound && (
                <button type="button" className="rv-button" onClick={() => setReloadKey((key) => key + 1)}>
                  Thử lại
                </button>
              )}
              <Link to="/pitches">Về danh sách sân</Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="rv-page">
      <SiteHeader active="pitches" />

      <main className="rv-main">
        <header className="rv-intro">
          <h1>Chia sẻ sau trận đấu</h1>
          {data ? (
            <p>
              Đánh giá {data.pitch_name} để những đội bóng tiếp theo chọn sân dễ hơn.{' '}
              <Link to={`/pitches/${data.pitch_id}`}>Xem thông tin sân</Link>
            </p>
          ) : (
            <p>Đang tải thông tin sân...</p>
          )}
        </header>

        {error && (
          <p className="rv-banner" role="alert">
            Không cập nhật được danh sách đánh giá: {error.message}{' '}
            <button type="button" className="rv-link-button" onClick={() => setReloadKey((key) => key + 1)}>
              Thử lại
            </button>
          </p>
        )}

        {data === null || pitchId === null ? (
          <div className="rv-skeleton" aria-busy="true" aria-label="Đang tải đánh giá">
            <span /><span /><span />
          </div>
        ) : (
          <div className="rv-layout">
            <aside className="rv-side">
              <ReviewSummaryCard summary={data.summary} />
              <div className="rv-hint">
                <strong>Chỉ đánh giá sau khi hoàn thành</strong>
                <p>
                  Bạn chỉ được đánh giá booking của mình ở trạng thái Hoàn thành, một lần cho mỗi booking.
                </p>
              </div>
            </aside>

            <div className="rv-content">
              <ReviewForm
                pitchId={pitchId}
                preselectBookingId={searchParams.get('booking')}
                onSubmitted={() => {
                  setPage(1)
                  setReloadKey((key) => key + 1)
                }}
              />
              <ReviewList
                items={data.items}
                page={data.page}
                limit={data.limit}
                total={data.total}
                totalPages={data.total_pages}
                busy={loading}
                onPageChange={setPage}
              />
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
