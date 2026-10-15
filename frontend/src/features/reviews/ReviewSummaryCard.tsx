import { Stars } from './Stars'
import { barPercent, formatAverage } from './reviewsUtils'
import type { RatingSummary } from './reviewsApi'

const ROWS = ['5', '4', '3', '2', '1'] as const

/** Khung "Đánh giá từ người chơi": điểm trung bình + số lượt theo từng mức sao. */
export function ReviewSummaryCard({ summary }: { summary: RatingSummary }) {
  const { average, review_count: count, distribution } = summary

  return (
    <section className="rv-card rv-summary" aria-labelledby="rv-summary-title">
      <h2 id="rv-summary-title" className="rv-card__title">
        Đánh giá từ người chơi
      </h2>

      {count === 0 ? (
        <p className="rv-summary__empty">
          Sân chưa có đánh giá nào. Hãy là người đầu tiên chia sẻ sau trận đấu.
        </p>
      ) : (
        <>
          <p className="rv-summary__score">
            {formatAverage(average)} <small>/ 5</small>
          </p>
          <p className="rv-summary__meta">
            <Stars value={Math.round(average)} label={`${formatAverage(average)} trên 5 sao`} />
            <span>{count} đánh giá</span>
          </p>

          <ul className="rv-bars" aria-label="Số đánh giá theo từng mức sao">
            {ROWS.map((star) => (
              <li key={star}>
                <span className="rv-bars__label">{star} ★</span>
                <span className="rv-bars__track" aria-hidden="true">
                  <span style={{ width: `${barPercent(distribution[star], count)}%` }} />
                </span>
                <span className="rv-bars__count">
                  <span className="rv-sr">{star} sao: </span>
                  {distribution[star]}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
