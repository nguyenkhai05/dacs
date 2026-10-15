import { useState } from 'react'
import { Button } from '../../components/Button'
import { formatPrice, formatShortDate } from '../../lib/format'
import { PAYMENT_LABEL, STATUS_LABEL, hhmm } from '../../lib/adminBookingLabels'
import {
  cancelBooking,
  checkIn,
  collectCash,
  completeBooking,
  markNoShow,
  type ActionKey,
  type AdminBookingDetail,
} from './adminBookingsApi'
import { ApiError } from '../../lib/api'

interface BookingDetailPanelProps {
  detail: AdminBookingDetail | null
  loading: boolean
  token: string
  /** Gọi sau khi thao tác thành công để trang tải lại bảng, lịch và chi tiết */
  onChanged: (message: string) => void
  onError: (message: string) => void
}

/** Ô "Chi tiết đang chọn": tiền, thu tiền mặt, check-in, hoàn thành, hủy / không đến. */
export function BookingDetailPanel({ detail, loading, token, onChanged, onError }: BookingDetailPanelProps) {
  if (!detail) {
    return (
      <section className="ab-card" id="ab-detail" aria-label="Chi tiết đơn">
        <h2>Chi tiết đang chọn</h2>
        <p className="ab-empty">
          {loading ? 'Đang tải chi tiết...' : 'Chọn một đơn trong bảng hoặc lịch để xem chi tiết và thao tác.'}
        </p>
      </section>
    )
  }

  // key theo đơn + số tiền còn thu: đổi đơn / sau khi thu tiền thì ô nhập tự đặt lại
  return (
    <DetailBody
      key={`${detail.booking_id}-${detail.cash_due}-${detail.status}`}
      detail={detail}
      token={token}
      onChanged={onChanged}
      onError={onError}
    />
  )
}

function DetailBody({
  detail,
  token,
  onChanged,
  onError,
}: Omit<BookingDetailPanelProps, 'detail' | 'loading'> & { detail: AdminBookingDetail }) {
  const [cashAmount, setCashAmount] = useState(String(detail.cash_due))
  const [reason, setReason] = useState('')
  const [fullRefund, setFullRefund] = useState(false)
  const [busy, setBusy] = useState<ActionKey | null>(null)

  const { actions, amounts } = detail

  async function run(key: ActionKey, task: () => Promise<{ message: string }>) {
    setBusy(key)
    try {
      const result = await task()
      onChanged(result.message)
    } catch (error) {
      onError(error instanceof ApiError || error instanceof Error ? error.message : 'Không thực hiện được thao tác.')
    } finally {
      setBusy(null)
    }
  }

  function handleCollect() {
    const amount = Number(cashAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      onError('Nhập số tiền thu lớn hơn 0.')
      return
    }
    if (amount > detail.cash_due) {
      onError(`Số tiền vượt quá số còn phải thu (${formatPrice(detail.cash_due)}).`)
      return
    }
    void run('collect_cash', () => collectCash(detail.booking_id, amount, token))
  }

  function handleCancel() {
    if (amounts.paid > 0 && !reason.trim()) {
      onError('Đơn đã có tiền, vui lòng nhập lý do hủy.')
      return
    }
    if (!window.confirm(`Hủy đơn ${detail.booking_code}?`)) return
    void run('cancel', () => cancelBooking(detail.booking_id, reason, fullRefund, token))
  }

  function handleNoShow() {
    if (!window.confirm(`Đánh dấu đơn ${detail.booking_code} là khách không đến?`)) return
    void run('no_show', () => markNoShow(detail.booking_id, reason, token))
  }

  const hint = (key: ActionKey) =>
    !actions[key].allowed && actions[key].reason ? <small className="ab-hint">{actions[key].reason}</small> : null

  return (
    <section className="ab-card" id="ab-detail" aria-label="Chi tiết đơn">
      <h2>Chi tiết đang chọn · {detail.booking_code}</h2>
      <div className="ab-badges">
        <span className={`ab-chip ab-chip--${detail.status}`}>{STATUS_LABEL[detail.status]}</span>
        <span className="ab-chip ab-chip--pay">{PAYMENT_LABEL[detail.payment_status]}</span>
      </div>
      <p className="ab-who">
        <b>{detail.customer?.full_name ?? 'Khách'}</b> · {detail.pitch.pitch_name} · {hhmm(detail.start_time)}–
        {hhmm(detail.end_time)} · {formatShortDate(detail.booking_date)}
        {detail.customer?.phone_number ? ` · ${detail.customer.phone_number}` : ''}
      </p>
      {detail.customer_note && <p className="ab-note">Ghi chú của khách: {detail.customer_note}</p>}

      <table className="ab-money">
        <thead>
          <tr>
            <th scope="col">Khoản mục</th>
            <th scope="col">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Tiền sân</td>
            <td>{formatPrice(amounts.pitch_total)}</td>
          </tr>
          {detail.services.map((line) => (
            <tr key={line.service_id}>
              <td>
                {line.service_name} · {line.quantity} {line.unit}
              </td>
              <td>{formatPrice(line.line_total)}</td>
            </tr>
          ))}
          <tr className="ab-money__total">
            <td>Tổng hóa đơn</td>
            <td>{formatPrice(amounts.total_amount)}</td>
          </tr>
          <tr>
            <td>Đã thu</td>
            <td>{formatPrice(amounts.paid)}</td>
          </tr>
          {amounts.refunded > 0 && (
            <tr>
              <td>Đã hoàn</td>
              <td>{formatPrice(amounts.refunded)}</td>
            </tr>
          )}
          <tr className="ab-money__due">
            <td>Còn thu tiền mặt</td>
            <td>{formatPrice(detail.cash_due)}</td>
          </tr>
        </tbody>
      </table>

      <label className="ab-field">
        <span>Tiền mặt nhận tại sân</span>
        <input
          type="number"
          min={0}
          step={1000}
          inputMode="numeric"
          value={cashAmount}
          onChange={(event) => setCashAmount(event.target.value)}
          disabled={!actions.collect_cash.allowed}
        />
      </label>
      <div className="ab-actions">
        <Button
          onClick={handleCollect}
          disabled={!actions.collect_cash.allowed}
          loading={busy === 'collect_cash'}
          loadingText="Đang ghi nhận..."
        >
          Xác nhận đã thu tiền mặt
        </Button>
        <button
          type="button"
          className="ab-btn"
          disabled={!actions.check_in.allowed || busy !== null}
          onClick={() => void run('check_in', () => checkIn(detail.booking_id, token))}
        >
          {busy === 'check_in' ? 'Đang check-in...' : 'Check-in'}
        </button>
        <button
          type="button"
          className="ab-btn"
          disabled={!actions.complete.allowed || busy !== null}
          onClick={() => void run('complete', () => completeBooking(detail.booking_id, token))}
        >
          {busy === 'complete' ? 'Đang xử lý...' : 'Hoàn thành sau trận'}
        </button>
      </div>
      {hint('collect_cash')}
      {hint('check_in')}
      {hint('complete')}

      <label className="ab-field">
        <span>Lý do hủy (khi cần)</span>
        <textarea
          rows={2}
          maxLength={500}
          value={reason}
          placeholder="Nhập lý do hủy / không đến"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {actions.cancel.allowed && amounts.paid > 0 && (
        <label className="ab-check">
          <input type="checkbox" checked={fullRefund} onChange={(event) => setFullRefund(event.target.checked)} />
          Lỗi từ phía sân (bảo trì...), hoàn 100% số đã thu
        </label>
      )}
      <div className="ab-actions">
        <button
          type="button"
          className="ab-btn ab-btn--danger"
          disabled={!actions.cancel.allowed || busy !== null}
          onClick={handleCancel}
        >
          {busy === 'cancel' ? 'Đang hủy...' : 'Hủy đơn'}
        </button>
        <button
          type="button"
          className="ab-btn ab-btn--danger"
          disabled={!actions.no_show.allowed || busy !== null}
          onClick={handleNoShow}
        >
          {busy === 'no_show' ? 'Đang xử lý...' : 'Khách không đến'}
        </button>
      </div>
      {hint('cancel')}
      {hint('no_show')}
    </section>
  )
}
