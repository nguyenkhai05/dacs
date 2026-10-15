import { formatMoney } from '../bookings/bookingView'
import { Alert } from '../../components/Alert'
import { formatShortDate } from '../../lib/format'
import type { LedgerMethod, LedgerPage, LedgerStatus } from './paymentAdminApi'
import { dayMonthOfDate, formatSignedMoney, ledgerTone, timeOfDay } from './paymentView'

interface LedgerPanelProps {
  date: string
  status: LedgerStatus | ''
  method: LedgerMethod | ''
  onDate: (value: string) => void
  onStatus: (value: LedgerStatus | '') => void
  onMethod: (value: LedgerMethod | '') => void
  data: LedgerPage | null
  loading: boolean
  error: string
  onRetry: () => void
  onPage: (page: number) => void
}

const STATUS_OPTIONS: { value: LedgerStatus; label: string }[] = [
  { value: 'Successful', label: 'Thành công' },
  { value: 'Pending', label: 'Chờ xử lý' },
  { value: 'Failed', label: 'Thất bại' },
]

const METHOD_OPTIONS: { value: LedgerMethod; label: string }[] = [
  { value: 'Banking', label: 'VietQR / Chuyển khoản' },
  { value: 'Cash', label: 'Tiền mặt' },
  { value: 'Momo', label: 'Momo' },
  { value: 'VNPay', label: 'VNPay' },
]

/** Khung "Sổ giao dịch": bộ lọc + bảng thu/hoàn của một ngày + phân trang. */
export function LedgerPanel({
  date,
  status,
  method,
  onDate,
  onStatus,
  onMethod,
  data,
  loading,
  error,
  onRetry,
  onPage,
}: LedgerPanelProps) {
  const items = data?.items ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1
  const from = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0
  const to = data ? from + items.length - (items.length > 0 ? 1 : 0) : 0

  return (
    <section className="pay-card" aria-labelledby="pay-ledger-title">
      <h2 id="pay-ledger-title">Sổ giao dịch</h2>

      <div className="pay-filters">
        <label className="pay-field">
          <span>Ngày giao dịch</span>
          <input type="date" value={date} onChange={(event) => event.target.value && onDate(event.target.value)} />
        </label>
        <label className="pay-field">
          <span>Trạng thái</span>
          <select value={status} onChange={(event) => onStatus(event.target.value as LedgerStatus | '')}>
            <option value="">Tất cả</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pay-field">
          <span>Phương thức</span>
          <select value={method} onChange={(event) => onMethod(event.target.value as LedgerMethod | '')}>
            <option value="">Tất cả</option>
            {METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="pay-error">
          <Alert>{error}</Alert>
          <button type="button" className="pay-btn" onClick={onRetry}>
            Thử lại
          </button>
        </div>
      )}

      {!error && !data && loading && <p className="pay-empty">Đang tải sổ giao dịch…</p>}

      {!error && data && items.length === 0 && !loading && (
        <p className="pay-empty">Không có giao dịch nào ngày {formatShortDate(data.date)} với bộ lọc này.</p>
      )}

      {!error && data && items.length > 0 && (
        <div className={`pay-scroll${loading ? ' is-loading' : ''}`} aria-busy={loading}>
          <table className="pay-table">
            <thead>
              <tr>
                <th scope="col">Mã / thời gian</th>
                <th scope="col">Booking</th>
                <th scope="col">Loại giao dịch</th>
                <th scope="col" className="is-right">
                  Số tiền
                </th>
                <th scope="col">Phương thức</th>
                <th scope="col">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.kind}-${item.id}`}>
                  <td>
                    <b>{item.code}</b>
                    <small>{timeOfDay(item.occurred_at)}</small>
                  </td>
                  <td>
                    {item.booking_code ?? '—'}
                    {item.customer_name && <small>{item.customer_name}</small>}
                  </td>
                  <td>{item.type_label}</td>
                  <td className={`is-right pay-amount${item.amount < 0 ? ' is-out' : ''}`}>{formatSignedMoney(item.amount)}</td>
                  <td>{item.method_label}</td>
                  <td>
                    <span className={`pay-badge pay-badge--${ledgerTone(item.status)}`}>{item.status_label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!error && data && data.total > 0 && (
        <div className="pay-pager">
          <span>
            Hiển thị {from}–{to} trong {data.total} giao dịch ngày {dayMonthOfDate(data.date)}
          </span>
          <div className="pay-pager__buttons">
            <button type="button" aria-label="Trang trước" disabled={data.page <= 1 || loading} onClick={() => onPage(data.page - 1)}>
              ‹
            </button>
            <button type="button" className="is-current" aria-current="page" disabled>
              {data.page}
            </button>
            <button type="button" aria-label="Trang sau" disabled={data.page >= totalPages || loading} onClick={() => onPage(data.page + 1)}>
              ›
            </button>
          </div>
        </div>
      )}

      {data && (
        <>
          <p className="pay-totals">
            Tổng kết quả lọc (chỉ giao dịch thành công): thu <b>{formatMoney(data.totals.collected)}</b> · hoàn{' '}
            <b>{formatMoney(data.totals.refunded)}</b> · thuần <b>{formatMoney(data.totals.net)}</b>
          </p>
          <p className="pay-note">
            Tổng gồm toàn bộ kết quả lọc, không chỉ trang đang xem. Chỉ giao dịch thành công được tính doanh thu; chờ đối soát, chờ hoàn
            và thất bại chưa ảnh hưởng doanh thu. Tính theo ngày thanh toán / hoàn tiền (UTC+7).
          </p>
        </>
      )}
    </section>
  )
}
