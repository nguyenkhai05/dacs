import { useState } from 'react'
import { AdminLayout } from '../components/AdminLayout'
import { useAuth } from '../features/auth/useAuth'
import { formatMoney } from '../features/bookings/bookingView'
import { useApiData } from '../features/dashboard/useApiData'
import { LedgerPanel } from '../features/payments/LedgerPanel'
import { ReconciliationPanel } from '../features/payments/ReconciliationPanel'
import { RefundPanel } from '../features/payments/RefundPanel'
import {
  downloadLedgerCsv,
  fetchLedger,
  fetchPaymentOverview,
  fetchReconciliations,
  fetchRefundDetail,
  fetchRefunds,
  type LedgerMethod,
  type LedgerStatus,
} from '../features/payments/paymentAdminApi'
import { dayMonthOfDate } from '../features/payments/paymentView'
import { todayLocal } from '../lib/format'
import './AdminPaymentsPage.css'

type Notice = { kind: 'success' | 'error'; text: string } | null

const PAGE_SIZE = 10

/** Màn 17: Thanh toán & hoàn cọc. Admin và Staff đều dùng được. */
export default function AdminPaymentsPage() {
  const { token } = useAuth()

  const [date, setDate] = useState(todayLocal)
  const [status, setStatus] = useState<LedgerStatus | ''>('')
  const [method, setMethod] = useState<LedgerMethod | ''>('')
  const [page, setPage] = useState(1)
  const [selectedRefundId, setSelectedRefundId] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [exporting, setExporting] = useState(false)
  // Tăng sau mỗi thao tác ghi để tải lại toàn bộ số liệu trên trang
  const [reloadKey, setReloadKey] = useState(0)
  const refresh = () => setReloadKey((value) => value + 1)

  const overview = useApiData((signal) => fetchPaymentOverview(date, token, signal), [date, token, reloadKey])
  const ledger = useApiData(
    (signal) => fetchLedger({ date, status, method, page, limit: PAGE_SIZE }, token, signal),
    [date, status, method, page, token, reloadKey],
  )
  const reconciliations = useApiData((signal) => fetchReconciliations(token, signal), [token, reloadKey])
  const refunds = useApiData((signal) => fetchRefunds(token, signal), [token, reloadKey])

  // Khoản hoàn đang xem: khoản được chọn, nếu không còn trong danh sách thì lấy khoản đầu tiên
  const refundItems = refunds.data?.items ?? []
  const activeRefundId = refundItems.some((item) => item.refund_id === selectedRefundId)
    ? selectedRefundId
    : (refundItems[0]?.refund_id ?? null)

  const detail = useApiData(
    (signal) => fetchRefundDetail(activeRefundId as number, token, signal),
    [activeRefundId, token, reloadKey],
    activeRefundId !== null,
  )
  // Bỏ dữ liệu cũ của khoản hoàn khác (hiện trong lúc đang tải khoản mới)
  const detailData = activeRefundId !== null && detail.data?.refund.refund_id === activeRefundId ? detail.data : null

  const kpis = overview.data?.kpis
  const dayLabel = dayMonthOfDate(date)

  const changeDate = (value: string) => {
    setDate(value)
    setPage(1)
  }

  async function exportCsv() {
    setExporting(true)
    try {
      await downloadLedgerCsv({ date, status, method }, token)
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Không xuất được file CSV.' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <AdminLayout breadcrumb="Thanh toán & hoàn cọc">
      <div className="pay">
        <header className="pay-head">
          <div>
            <h1>Thanh toán &amp; hoàn cọc</h1>
            <p className="pay-sub">Đối soát tiền cọc, tiền mặt và khoản hoàn đã chuyển thủ công.</p>
          </div>
          <button type="button" className="pay-btn" onClick={exportCsv} disabled={exporting}>
            {exporting ? 'Đang xuất…' : 'Xuất CSV'}
          </button>
        </header>

        {notice && (
          <div className={`pay-notice pay-notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            <button type="button" aria-label="Đóng thông báo" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}

        <section className="pay-kpis" aria-label={`Tổng quan thanh toán ngày ${dayLabel}`}>
          <article className="pay-kpi">
            <h2>Thu thành công · {dayLabel}</h2>
            <p className="pay-kpi__value">{kpis ? formatMoney(kpis.collected_amount) : '—'}</p>
            <small>{kpis ? `${kpis.collected_count} giao dịch` : ' '}</small>
          </article>
          <article className="pay-kpi">
            <h2>Hoàn thành công · {dayLabel}</h2>
            <p className="pay-kpi__value pay-kpi__value--red">{kpis ? formatMoney(kpis.refunded_amount) : '—'}</p>
            <small>{kpis ? `${kpis.refunded_count} khoản hoàn` : ' '}</small>
          </article>
          <article className="pay-kpi">
            <h2>Doanh thu thuần · {dayLabel}</h2>
            <p className="pay-kpi__value pay-kpi__value--green">{kpis ? formatMoney(kpis.net_revenue) : '—'}</p>
            <small>Thu thành công trừ hoàn thành công</small>
          </article>
        </section>
        {overview.error && (
          <p className="pay-note" role="alert">
            Không tải được số liệu tổng quan: {overview.error}
          </p>
        )}

        <LedgerPanel
          date={date}
          status={status}
          method={method}
          onDate={changeDate}
          onStatus={(value) => {
            setStatus(value)
            setPage(1)
          }}
          onMethod={(value) => {
            setMethod(value)
            setPage(1)
          }}
          data={ledger.data}
          loading={ledger.loading}
          error={ledger.error}
          onRetry={ledger.reload}
          onPage={setPage}
        />

        <ReconciliationPanel
          token={token}
          data={reconciliations.data}
          loading={reconciliations.loading}
          error={reconciliations.error}
          onRetry={reconciliations.reload}
          onResolved={(message, refundId) => {
            setNotice({
              kind: 'success',
              text: refundId ? `${message} Yêu cầu hoàn mới đã được tạo ở khung "Hoàn cọc đang chờ".` : message,
            })
            if (refundId) setSelectedRefundId(refundId)
            refresh()
          }}
        />

        <RefundPanel
          token={token}
          list={refunds.data}
          listLoading={refunds.loading}
          listError={refunds.error}
          selectedId={activeRefundId}
          onSelect={setSelectedRefundId}
          detail={detailData}
          detailLoading={detail.loading}
          detailError={detail.error}
          onRetry={() => {
            refunds.reload()
            if (activeRefundId !== null) detail.reload()
          }}
          onDone={(message) => {
            setNotice({ kind: 'success', text: message })
            refresh()
          }}
          onError={(text) => setNotice({ kind: 'error', text })}
        />
      </div>
    </AdminLayout>
  )
}
