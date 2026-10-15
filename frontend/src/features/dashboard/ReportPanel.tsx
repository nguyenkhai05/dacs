import { Alert } from '../../components/Alert'
import type { Report, ReportGroup, ReportParams } from './dashboardApi'
import {
  formatHours,
  formatPercent,
  formatVnd,
  netColumnTitle,
  toAnchorDate,
  toInputValue,
  type ReportPeriod,
} from './dashboardUtils'

interface ReportPanelProps {
  params: ReportParams
  onChange: (next: ReportParams) => void
  report: Report | null
  loading: boolean
  error: string
  onRetry: () => void
}

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 'day', label: 'Theo ngày' },
  { value: 'week', label: 'Theo tuần' },
  { value: 'month', label: 'Theo tháng' },
]

const GROUP_OPTIONS: { value: ReportGroup; label: string }[] = [
  { value: 'pitch', label: 'Theo sân' },
  { value: 'category', label: 'Theo loại sân' },
]

const shortDate = (value: string) => value.split('-').reverse().join('/')

/** Tab "Báo cáo": bộ lọc kỳ / thời gian / phân nhóm + bảng + giờ cao điểm + tỷ lệ hủy. */
export function ReportPanel({ params, onChange, report, loading, error, onRetry }: ReportPanelProps) {
  const periodWord = report ? report.label.toLowerCase() : 'kỳ này'

  return (
    <section className="dsh-card dsh-report" aria-labelledby="report-title">
      <h2 id="report-title">Báo cáo</h2>
      <p className="dsh-muted">Chọn kỳ báo cáo, thời gian và cách phân nhóm; bấm “Xuất CSV” để tải đúng bảng đang xem.</p>

      <div className="dsh-filters">
        <label>
          <span>Kỳ báo cáo</span>
          <select
            value={params.period}
            onChange={(event) => onChange({ ...params, period: event.target.value as ReportPeriod })}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Thời gian</span>
          <input
            type={params.period === 'month' ? 'month' : 'date'}
            value={toInputValue(params.period, params.date)}
            onChange={(event) => {
              const date = toAnchorDate(params.period, event.target.value)
              if (date) onChange({ ...params, date })
            }}
          />
          {report && <small>{shortDate(report.from)}–{shortDate(report.to)}</small>}
        </label>

        <label>
          <span>Phân nhóm</span>
          <select
            value={params.group_by}
            onChange={(event) => onChange({ ...params, group_by: event.target.value as ReportGroup })}
          >
            {GROUP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <Alert>
          {error} <button type="button" className="dsh-link" onClick={onRetry}>Thử lại</button>
        </Alert>
      )}

      {!report && loading && <p className="dsh-muted" role="status">Đang tải báo cáo...</p>}

      {report && (
        <div className={`dsh-report__grid${loading ? ' is-loading' : ''}`}>
          <div className="dsh-table-wrap">
            <table className="dsh-table">
              <thead>
                <tr>
                  <th scope="col">{params.group_by === 'pitch' ? 'Sân / loại' : 'Loại sân'}</th>
                  <th scope="col">Giờ đã đặt</th>
                  <th scope="col">{netColumnTitle(report.period, report.from)}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 && (
                  <tr><td colSpan={3} className="dsh-empty">Không có dữ liệu trong kỳ này.</td></tr>
                )}
                {report.rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    <td>{formatHours(row.booked_hours)}</td>
                    <td>{formatVnd(row.net_revenue)}</td>
                  </tr>
                ))}
              </tbody>
              {report.rows.length > 0 && (
                <tfoot>
                  <tr>
                    <th scope="row">Tổng</th>
                    <td>{formatHours(report.totals.booked_hours)}</td>
                    <td>{formatVnd(report.totals.net_revenue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <aside className="dsh-insights">
            <div className="dsh-peak">
              {report.peak ? (
                <>
                  <strong>Giờ cao điểm: {report.peak.label}</strong>
                  <p>
                    Lấp đầy {formatPercent(report.peak.occupancy_rate)} trong {periodWord}. Ưu tiên đủ nhân sự và dịch vụ
                    khung giờ này.
                  </p>
                </>
              ) : (
                <strong>Chưa có dữ liệu giờ cao điểm</strong>
              )}
            </div>

            <p className="dsh-rate">Tỷ lệ hủy: <strong>{formatPercent(report.rates.cancel_rate)}</strong></p>
            <p className="dsh-rate">Tỷ lệ Không đến: <strong>{formatPercent(report.rates.no_show_rate)}</strong></p>
            <p className="dsh-muted dsh-small">
              Mẫu số: tổng booking có ngày đá trong {periodWord}, gồm mọi trạng thái ({report.rates.total_bookings} booking).
            </p>
          </aside>
        </div>
      )}

      {report && (
        <p className="dsh-muted dsh-small dsh-report__foot">
          {report.label}: thu thành công {formatVnd(report.totals.gross)} − hoàn thành công {formatVnd(report.totals.refunded)}.
        </p>
      )}
    </section>
  )
}
