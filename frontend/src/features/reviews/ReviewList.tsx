import { pageWindow, visibleRange, formatReviewDate } from './reviewsUtils'
import type { ReviewItem } from './reviewsApi'

interface ReviewListProps {
  items: ReviewItem[]
  page: number
  limit: number
  total: number
  totalPages: number
  /** true khi đang tải trang khác: giữ nguyên danh sách cũ nhưng làm mờ */
  busy: boolean
  onPageChange: (page: number) => void
}

/** Khung "Đánh giá gần đây" kèm phân trang. */
export function ReviewList({
  items,
  page,
  limit,
  total,
  totalPages,
  busy,
  onPageChange,
}: ReviewListProps) {
  const [from, to] = visibleRange(page, limit, total)

  return (
    <section className="rv-card" aria-labelledby="rv-list-title" aria-busy={busy}>
      <h2 id="rv-list-title" className="rv-card__title">
        Đánh giá gần đây
      </h2>

      {items.length === 0 ? (
        <p className="rv-empty">Chưa có đánh giá nào cho sân này.</p>
      ) : (
        <ul className={`rv-list${busy ? ' is-busy' : ''}`}>
          {items.map((review) => (
            <li key={review.review_id} className="rv-review">
              <span className={`rv-badge rv-badge--${review.rating >= 4 ? 'good' : review.rating === 3 ? 'mid' : 'low'}`}>
                {review.rating} sao
              </span>
              <div className="rv-review__body">
                <p className="rv-review__name">{review.reviewer_name}</p>
                <p className="rv-review__date">{formatReviewDate(review.created_at)} · Đã chơi tại sân</p>
                {review.comment && <p className="rv-review__comment">{review.comment}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > 0 && (
        <div className="rv-list__foot">
          <p>
            Hiển thị {from}–{to} trong {total} đánh giá
          </p>
          {totalPages > 1 && (
            <nav className="rv-pager" aria-label="Phân trang đánh giá">
              <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Trang trước">
                ‹
              </button>
              {pageWindow(page, totalPages).map((number) => (
                <button
                  key={number}
                  type="button"
                  className={number === page ? 'is-current' : undefined}
                  aria-current={number === page ? 'page' : undefined}
                  aria-label={`Trang ${number}`}
                  onClick={() => onPageChange(number)}
                >
                  {number}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                aria-label="Trang sau"
              >
                ›
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  )
}
