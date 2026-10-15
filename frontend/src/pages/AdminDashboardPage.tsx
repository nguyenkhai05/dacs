import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { adminRoute, AdminLayout } from '../components/AdminLayout'
import { useAuth } from '../features/auth/useAuth'
import {
  downloadReportCsv,
  fetchOverview,
  fetchReport,
  fetchRevenueTrend,
  type ReportParams,
} from '../features/dashboard/dashboardApi'
import {
  bookingStatus,
  formatHourRange,
  formatMillions,
  formatNumber,
  formatPercent,
  formatVnd,
  pad2,
} from '../features/dashboard/dashboardUtils'
import { ReportPanel } from '../features/dashboard/ReportPanel'
import { useApiData } from '../features/dashboard/useApiData'
import { formatShortDate, formatVnTime, formatWeekdayDate, isValidDateString, todayLocal } from '../lib/format'
import './AdminDashboardPage.css'

type Tab = 'overview' | 'report'

/** Màn 13 - Tổng quan & báo cáo. */
export default function AdminDashboardPage() {
  const { token } = useAuth()
  const today = todayLocal()
  const [tab, setTab] = useState<Tab>('overview')
  const [date, setDate] = useState(today)
  const [reportParams, setReportParams] = useState<ReportParams>({ period: 'month', date: today, group_by: 'pitch' })
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const enabled = Boolean(token)
  const overview = useApiData((signal) => fetchOverview(date, token, signal), [date, token], enabled)
  const trend = useApiData((signal) => fetchRevenueTrend(date, token, signal), [date, token], enabled)
  const report = useApiData(
    (signal) => fetchReport(reportParams, token, signal),
    [reportParams.period, reportParams.date, reportParams.group_by, token],
    enabled && tab === 'report',
  )

  async function handleExport() {
    setExporting(true)
    setExportError('')
    try {
      await downloadReportCsv(reportParams, token)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Không xuất được báo cáo. Vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }

  const kpis = overview.data?.kpis
  const selectedDay = trend.data?.points.find((point) => point.is_selected)
  const isToday = date === today
  const bookingsRoute = adminRoute('bookings')

  return (
    <AdminLayout breadcrumb="Tổng quan & báo cáo">
      <div className="dsh">
        <div className="dsh-head">
          <div>
            <h1>Một ngày vận hành rõ ràng</h1>
            <p className="dsh-muted">
              {formatWeekdayDate(date)}
              {overview.loadedAt && ` · Dữ liệu cập nhật ${formatVnTime(overview.loadedAt)}`}
            </p>
          </div>

          <div className="dsh-head__actions">
            <label className="dsh-date">
              <span>Ngày xem</span>
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  if (isValidDateString(event.target.value)) setDate(event.target.value)
                }}
              />
            </label>
            <button type="button" className="dsh-btn" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Đang xuất...' : 'Xuất CSV'}
            </button>
          </div>
        </div>

        {exportError && <Alert>{exportError}</Alert>}

        <div className="dsh-tabs" role="tablist" aria-label="Chế độ xem">
          <button type="button" role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'is-active' : ''} onClick={() => setTab('overview')}>
            Tổng quan
          </button>
          <button type="button" role="tab" aria-selected={tab === 'report'} className={tab === 'report' ? 'is-active' : ''} onClick={() => setTab('report')}>
            Báo cáo
          </button>
        </div>

        {tab === 'overview' && (
          <div role="tabpanel" aria-label="Tổng quan">
            {overview.error && (
              <Alert>
                {overview.error} <button type="button" className="dsh-link" onClick={overview.reload}>Thử lại</button>
              </Alert>
            )}

            <div className="dsh-kpis">
              <section className="dsh-card dsh-kpi" aria-label="Đơn trong ngày">
                <h2>Đơn trong ngày</h2>
                <strong>{kpis ? pad2(kpis.total_bookings) : '—'}</strong>
                <small>Theo ngày đá {formatShortDate(date).slice(0, 5)}</small>
              </section>

              <section className="dsh-card dsh-kpi" aria-label="Đang chờ cọc">
                <h2>Đang chờ cọc</h2>
                <strong>{kpis ? pad2(kpis.pending_deposit_bookings) : '—'}</strong>
                <small>Chỗ giữ chưa hết 15 phút</small>
              </section>

              <section className="dsh-card dsh-kpi" aria-label="Tỷ lệ lấp đầy">
                <h2>Tỷ lệ lấp đầy</h2>
                <strong>{kpis ? formatPercent(kpis.occupancy_rate) : '—'}</strong>
                <small>
                  {kpis ? `${formatNumber(kpis.booked_hours, 1)} / ${formatNumber(kpis.capacity_hours, 1)} giờ sân` : ' '}
                </small>
              </section>

              <section className="dsh-card dsh-kpi" aria-label="Doanh thu thuần">
                <h2>{isToday ? 'Doanh thu thuần hôm nay' : `Doanh thu thuần ${formatShortDate(date).slice(0, 5)}`}</h2>
                <strong>{kpis ? formatVnd(kpis.collected_amount) : '—'}</strong>
                <small>
                  {selectedDay
                    ? `Thu ${formatNumber(selectedDay.gross, 0)} − hoàn ${formatNumber(selectedDay.refunded, 0)}`
                    : 'Đã trừ hoàn cọc thành công'}
                </small>
              </section>
            </div>

            <div className="dsh-note" role="note">
              <strong>Doanh thu = thanh toán thành công − hoàn tiền thành công</strong>
              <p>
                Tính theo ngày giao dịch thanh toán / hoàn tiền (UTC+7), không theo giá trị booking hay ngày đá. Cọc và
                tiền mặt đều là khoản thu.
              </p>
            </div>

            <div className="dsh-split">
              <section className="dsh-card" aria-labelledby="trend-title">
                <h2 id="trend-title">Doanh thu thuần 7 ngày</h2>
                {trend.error && <Alert>{trend.error}</Alert>}
                {trend.data && (
                  <>
                    <p className="dsh-muted dsh-small">
                      {formatShortDate(trend.data.from).slice(0, 5)}–{formatShortDate(trend.data.to)} · Tổng{' '}
                      {formatVnd(trend.data.total_net)}
                    </p>
                    <TrendChart points={trend.data.points} />
                  </>
                )}
                {!trend.data && !trend.error && <p className="dsh-muted" role="status">Đang tải biểu đồ...</p>}
              </section>

              <section className="dsh-card" aria-labelledby="upcoming-title">
                <h2 id="upcoming-title">Sắp đến giờ đá</h2>
                {overview.data && overview.data.upcoming_bookings.length === 0 && (
                  <p className="dsh-empty">Không có lượt đá sắp tới.</p>
                )}
                {overview.data && overview.data.upcoming_bookings.length > 0 && (
                  <table className="dsh-table dsh-table--compact">
                    <thead>
                      <tr>
                        <th scope="col">Booking / sân</th>
                        <th scope="col">Giờ</th>
                        <th scope="col">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.data.upcoming_bookings.map((booking) => {
                        const status = bookingStatus(booking.status)
                        return (
                          <tr key={booking.booking_id}>
                            <th scope="row">
                              {booking.booking_code}
                              <small>{booking.pitch_name}</small>
                            </th>
                            <td>{formatHourRange(booking.start_time, booking.end_time)}</td>
                            <td><span className={`dsh-badge dsh-badge--${status.tone}`}>{status.label}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                {!overview.data && !overview.error && <p className="dsh-muted" role="status">Đang tải...</p>}
                {bookingsRoute && (
                  <Link className="dsh-link" to={bookingsRoute}>Mở Đơn đặt &amp; lịch sân →</Link>
                )}
              </section>
            </div>
          </div>
        )}

        {tab === 'report' && (
          <div role="tabpanel" aria-label="Báo cáo">
            <ReportPanel
              params={reportParams}
              onChange={setReportParams}
              report={report.data}
              loading={report.loading}
              error={report.error}
              onRetry={report.reload}
            />
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

interface TrendChartProps {
  points: { key: string; label: string; net: number; is_selected: boolean }[]
}

function TrendChart({ points }: TrendChartProps) {
  const max = Math.max(...points.map((point) => point.net), 1)

  return (
    <ol className="dsh-bars" aria-label="Doanh thu thuần từng ngày">
      {points.map((point) => {
        const height = point.net > 0 ? Math.max((point.net / max) * 100, 3) : 0
        return (
          <li key={point.key} className={point.is_selected ? 'is-selected' : ''} aria-current={point.is_selected ? 'date' : undefined}>
            <span className="dsh-bars__value">{formatMillions(point.net)}</span>
            <span className="dsh-bars__track">
              <span className="dsh-bars__bar" style={{ height: `${height}%` }} />
            </span>
            <span className="dsh-bars__label">{point.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
