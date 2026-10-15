import { useState, type FormEvent } from 'react'
import { Alert } from '../../components/Alert'
import { ApiError } from '../../lib/api'
import { formatShortDate, formatTime } from '../../lib/format'
import { formatMoney, statusView } from '../bookings/bookingView'
import {
  confirmRefund,
  failRefund,
  updateRefundAccount,
  type RefundDetail,
  type RefundList,
} from './paymentAdminApi'
import {
  INVOICE_STATUS_ROWS,
  cancelLeadText,
  dayMonth,
  invoiceStatusLabel,
  isValidTransactionCode,
  normalizeAccountNumber,
  timeOfDay,
  validateAccount,
  vnDateTimeLocal,
  vnLocalToIso,
} from './paymentView'

interface RefundPanelProps {
  token: string | null
  list: RefundList | null
  listLoading: boolean
  listError: string
  selectedId: number | null
  onSelect: (id: number) => void
  detail: RefundDetail | null
  detailLoading: boolean
  detailError: string
  onRetry: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}

const messageOf = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback)

/** Hai khung dưới cùng: "Hoàn cọc đang chờ" (bên trái) và "Hóa đơn & kết quả hoàn" + "Nếu chuyển khoản hoàn thất bại" (bên phải). */
export function RefundPanel(props: RefundPanelProps) {
  const { list, listLoading, listError, selectedId, onSelect, detail, detailLoading, detailError, onRetry } = props
  const items = list?.items ?? []
  const error = listError || detailError

  return (
    <div className="pay-bottom">
      <section className="pay-card" aria-labelledby="pay-refund-title">
        <h2 id="pay-refund-title">Hoàn cọc đang chờ{detail ? ` · ${detail.refund.booking_code}` : ''}</h2>

        {error && (
          <div className="pay-error">
            <Alert>{error}</Alert>
            <button type="button" className="pay-btn" onClick={onRetry}>
              Thử lại
            </button>
          </div>
        )}

        {!error && !list && listLoading && <p className="pay-empty">Đang tải yêu cầu hoàn cọc…</p>}
        {!error && list && items.length === 0 && <p className="pay-empty">Không có khoản hoàn cọc nào đang chờ xử lý.</p>}

        {items.length > 1 && (
          <div className="pay-chips" role="group" aria-label="Chọn yêu cầu hoàn cọc">
            {items.map((item) => (
              <button
                key={item.refund_id}
                type="button"
                aria-pressed={item.refund_id === selectedId}
                className={item.refund_id === selectedId ? 'is-active' : undefined}
                onClick={() => onSelect(item.refund_id)}
              >
                {item.booking_code} · {formatMoney(item.amount)}
                {item.status === 'Failed' ? ' · thất bại' : ''}
              </button>
            ))}
          </div>
        )}

        {!error && items.length > 0 && !detail && detailLoading && <p className="pay-empty">Đang tải chi tiết…</p>}

        {!error && detail && (
          <RefundWorkspace
            key={`${detail.refund.refund_id}-${detail.refund.status}-${detail.account.account_number ?? ''}`}
            {...props}
            detail={detail}
          />
        )}
      </section>

      <div className="pay-side">
        <InvoiceCard detail={detail} />
        {detail && <FailCard key={`fail-${detail.refund.refund_id}-${detail.refund.status}`} {...props} detail={detail} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function RefundWorkspace({
  token,
  detail,
  onDone,
  onError,
}: RefundPanelProps & { detail: RefundDetail }) {
  const { refund, booking, customer, account, can } = detail
  const bookingStatus = statusView(booking.status)

  const [editing, setEditing] = useState(!account.is_complete)
  const [bank, setBank] = useState(account.bank_name ?? '')
  const [number, setNumber] = useState(account.account_number ?? '')
  const [holder, setHolder] = useState(account.account_name ?? '')
  const [accountErrors, setAccountErrors] = useState<ReturnType<typeof validateAccount>>({})
  const [code, setCode] = useState('')
  const [transferredAt, setTransferredAt] = useState(() => vnDateTimeLocal())
  const [codeError, setCodeError] = useState('')
  const [busy, setBusy] = useState<'account' | 'confirm' | null>(null)

  const lead = cancelLeadText(booking.hours_before_start)

  async function saveAccount(event: FormEvent) {
    event.preventDefault()
    const errors = validateAccount({ bank_name: bank, bank_account_number: number, bank_account_name: holder })
    setAccountErrors(errors)
    if (Object.keys(errors).length > 0) return

    setBusy('account')
    try {
      const result = await updateRefundAccount(
        refund.refund_id,
        { bank_name: bank.trim(), bank_account_number: normalizeAccountNumber(number), bank_account_name: holder.trim() },
        token,
      )
      onDone(result.message)
    } catch (e) {
      onError(messageOf(e, 'Không lưu được thông tin nhận hoàn.'))
    } finally {
      setBusy(null)
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault()
    if (!isValidTransactionCode(code)) {
      setCodeError('Mã giao dịch gồm 4-100 ký tự chữ, số, . _ - /')
      return
    }
    setCodeError('')
    setBusy('confirm')
    try {
      const iso = vnLocalToIso(transferredAt)
      const result = await confirmRefund(refund.refund_id, { transaction_code: code.trim(), ...(iso ? { transferred_at: iso } : {}) }, token)
      onDone(result.message)
    } catch (e) {
      onError(messageOf(e, 'Không ghi nhận được khoản hoàn.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="pay-chips-row">
        <span className={`pay-badge pay-badge--${bookingStatus.tone}`}>{bookingStatus.label}</span>
        <span className={`pay-badge pay-badge--${refund.status === 'Failed' ? 'danger' : 'warning'}`}>{refund.status_label}</span>
      </div>

      <p className="pay-customer">
        <b>{customer.name ?? 'Khách hàng'}</b>
        {customer.phone ? ` · ${customer.phone}` : ''}
      </p>
      <p className="pay-meta">
        Ngày đá {formatShortDate(booking.booking_date)} · {formatTime(booking.start_time)}–{formatTime(booking.end_time)} · {booking.pitch_name}
        {booking.cancelled_at ? ` · Hủy ${dayMonth(booking.cancelled_at)} lúc ${timeOfDay(booking.cancelled_at)}` : ''}
        <br />
        {[lead, booking.refund_percent > 0 ? `Hoàn ${booking.refund_percent}% cọc` : ''].filter(Boolean).join(' · ')}
      </p>

      <p className="pay-big">{formatMoney(refund.amount)}</p>

      {refund.status === 'Failed' && refund.failure_reason && (
        <p className="pay-warn-box" role="status">
          Lần chuyển trước thất bại: {refund.failure_reason}. Kiểm tra thông tin nhận hoàn rồi chuyển lại.
        </p>
      )}

      {refund.status === 'Successful' ? (
        <p className="pay-ok-box">
          Đã hoàn xong{refund.processed_at ? ` lúc ${timeOfDay(refund.processed_at)} ${dayMonth(refund.processed_at)}` : ''}
          {refund.transaction_code ? ` · mã giao dịch ${refund.transaction_code}` : ''}.
        </p>
      ) : (
        <>
          <table className="pay-mini">
            <thead>
              <tr>
                <th scope="col">Thông tin nhận hoàn</th>
                <th scope="col">Giá trị</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Ngân hàng</th>
                <td>{account.bank_name ?? <i>Chưa có</i>}</td>
              </tr>
              <tr>
                <th scope="row">Số tài khoản</th>
                <td>{account.account_number ?? <i>Chưa có</i>}</td>
              </tr>
              <tr>
                <th scope="row">Chủ tài khoản</th>
                <td>{account.account_name ?? <i>Chưa có</i>}</td>
              </tr>
            </tbody>
          </table>

          {can.update_account && !editing && (
            <button type="button" className="pay-link" onClick={() => setEditing(true)}>
              Sửa thông tin nhận hoàn
            </button>
          )}

          {can.update_account && editing && (
            <form className="pay-inline-form" onSubmit={saveAccount} noValidate>
              <label className="pay-field">
                <span>Ngân hàng</span>
                <input type="text" value={bank} onChange={(event) => setBank(event.target.value)} aria-invalid={Boolean(accountErrors.bank_name)} />
                {accountErrors.bank_name && <small className="pay-err">{accountErrors.bank_name}</small>}
              </label>
              <label className="pay-field">
                <span>Số tài khoản</span>
                <input type="text" inputMode="numeric" value={number} onChange={(event) => setNumber(event.target.value)} aria-invalid={Boolean(accountErrors.bank_account_number)} />
                {accountErrors.bank_account_number && <small className="pay-err">{accountErrors.bank_account_number}</small>}
              </label>
              <label className="pay-field">
                <span>Chủ tài khoản</span>
                <input type="text" value={holder} onChange={(event) => setHolder(event.target.value)} aria-invalid={Boolean(accountErrors.bank_account_name)} />
                {accountErrors.bank_account_name && <small className="pay-err">{accountErrors.bank_account_name}</small>}
              </label>
              <div className="pay-actions">
                <button type="submit" className="pay-btn" disabled={busy !== null}>
                  {busy === 'account' ? 'Đang lưu…' : 'Lưu thông tin'}
                </button>
                {account.is_complete && (
                  <button type="button" className="pay-btn" disabled={busy !== null} onClick={() => setEditing(false)}>
                    Đóng
                  </button>
                )}
              </div>
            </form>
          )}

          <form className="pay-inline-form" onSubmit={confirm} noValidate>
            <label className="pay-field">
              <span>Mã giao dịch thật sau khi chuyển</span>
              <input
                type="text"
                placeholder="Nhập mã giao dịch thực tế"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-invalid={Boolean(codeError)}
                disabled={!can.confirm}
              />
              {codeError && <small className="pay-err">{codeError}</small>}
            </label>
            <label className="pay-field">
              <span>Thời gian chuyển tiền</span>
              <input type="datetime-local" value={transferredAt} onChange={(event) => setTransferredAt(event.target.value)} disabled={!can.confirm} />
            </label>
            <button type="submit" className="pay-btn pay-btn--primary" disabled={!can.confirm || !account.is_complete || busy !== null}>
              {busy === 'confirm' ? 'Đang ghi nhận…' : 'Xác nhận đã hoàn thành công'}
            </button>
            {!account.is_complete && <small className="pay-err">Nhập đủ thông tin nhận hoàn trước khi xác nhận.</small>}
          </form>

          <p className="pay-warn-box">
            <b>Chỉ ghi nhận khoản tiền đã chuyển:</b> nhân viên tự chuyển khoản qua ngân hàng; hệ thống không thực chi tiền. Chỉ xác nhận
            khi đã có mã giao dịch thật.
          </p>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function InvoiceCard({ detail }: { detail: RefundDetail | null }) {
  const invoice = detail?.invoice ?? null
  const highlight = invoice ? (invoice.after_confirm?.status ?? invoice.status) : null

  return (
    <section className="pay-card" aria-labelledby="pay-invoice-title">
      <h2 id="pay-invoice-title">Hóa đơn &amp; kết quả hoàn</h2>

      <table className="pay-mini">
        <thead>
          <tr>
            <th scope="col">Nhóm hóa đơn</th>
            <th scope="col">Ý nghĩa</th>
          </tr>
        </thead>
        <tbody>
          {INVOICE_STATUS_ROWS.map((row) => (
            <tr key={row.status} className={row.status === highlight ? 'is-current' : undefined}>
              <th scope="row">
                <span className="pay-pill">{row.label}</span>
              </th>
              <td>{row.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {detail && invoice && invoice.after_confirm && (
        <p className="pay-ok-box">
          <b>Khi hoàn {detail.refund.booking_code} thành công</b>
          <br />
          Hóa đơn chuyển sang “{invoiceStatusLabel(invoice.after_confirm.status)}”. Doanh thu thuần của ngày chuyển hoàn giảm{' '}
          {formatMoney(Math.abs(invoice.after_confirm.net_revenue_change))}; phần tiền khách đã thu còn lại không bị trừ.
        </p>
      )}

      {detail && invoice && !invoice.after_confirm && (
        <p className="pay-ok-box">
          Hóa đơn {detail.refund.booking_code} hiện ở trạng thái “{invoiceStatusLabel(invoice.status)}” (đã thu {formatMoney(invoice.paid_amount)}, đã hoàn{' '}
          {formatMoney(invoice.refunded_amount)}).
        </p>
      )}

      {detail && !invoice && <p className="pay-note">Đơn này chưa có hóa đơn.</p>}
    </section>
  )
}

function FailCard({ token, detail, onDone, onError }: RefundPanelProps & { detail: RefundDetail }) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (reason.trim().length < 3) {
      setReasonError('Hãy nhập lý do thất bại (ít nhất 3 ký tự).')
      return
    }
    setReasonError('')
    setBusy(true)
    try {
      const result = await failRefund(detail.refund.refund_id, { reason: reason.trim() }, token)
      onDone(result.message)
    } catch (e) {
      onError(messageOf(e, 'Không ghi nhận được thất bại.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="pay-card" aria-labelledby="pay-fail-title">
      <h2 id="pay-fail-title">Nếu chuyển khoản hoàn thất bại</h2>

      <form className="pay-inline-form" onSubmit={submit} noValidate>
        <label className="pay-field">
          <span>Lý do thất bại</span>
          <input
            type="text"
            maxLength={500}
            placeholder="Ví dụ: Sai thông tin tài khoản nhận"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={!detail.can.fail}
            aria-invalid={Boolean(reasonError)}
          />
          {reasonError && <small className="pay-err">{reasonError}</small>}
        </label>
        <div>
          <button type="submit" className="pay-btn pay-btn--danger" disabled={!detail.can.fail || busy}>
            {busy ? 'Đang ghi nhận…' : 'Ghi nhận Thất bại'}
          </button>
        </div>
      </form>

      <p className="pay-note">
        {detail.can.fail
          ? 'Khoản hoàn vẫn được giữ lại để bạn sửa thông tin nhận hoàn và chuyển lại. Chưa trừ doanh thu cho tới khi hoàn thành công.'
          : 'Chỉ ghi nhận thất bại được với khoản đang chờ hoàn.'}
      </p>

      {detail.history.length > 0 && (
        <details className="pay-history">
          <summary>Lịch sử xử lý ({detail.history.length})</summary>
          <ul>
            {detail.history.map((entry) => (
              <li key={entry.history_id}>
                <b>
                  {dayMonth(entry.changed_at)} {timeOfDay(entry.changed_at)}
                </b>{' '}
                · {entry.note ?? entry.new_status}
                {entry.changed_by_name ? ` (${entry.changed_by_name})` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
