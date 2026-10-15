import { useState, type FormEvent } from 'react'
import { Alert } from '../../components/Alert'
import { ApiError } from '../../lib/api'
import { formatMoney } from '../bookings/bookingView'
import { resolveReconciliation, type ReconcileActionKey, type ReconciliationItem, type ReconciliationPage } from './paymentAdminApi'

interface ReconciliationPanelProps {
  token: string | null
  data: ReconciliationPage | null
  loading: boolean
  error: string
  onRetry: () => void
  /** Xử lý xong: trả thông báo và mã yêu cầu hoàn mới (nếu có) */
  onResolved: (message: string, refundId: number | null) => void
}

const SHORT_LABEL: Record<ReconcileActionKey, string> = {
  apply_to_booking: 'Ghi nhận bổ sung',
  request_refund: 'Khởi tạo hoàn tiền',
  dismiss: 'Bỏ qua',
}

const HINT: Record<ReconcileActionKey, string> = {
  apply_to_booking: 'Nhập số tiền khách đã chuyển bổ sung ngoài hệ thống (nếu có). Đủ tiền cọc thì đơn sẽ được xác nhận.',
  request_refund: 'Tạo yêu cầu hoàn cọc cho khoản này. Bạn xử lý tiếp ở khung "Hoàn cọc đang chờ" bên dưới.',
  dismiss: 'Chỉ đánh dấu đã xử lý ngoài hệ thống, không thay đổi tiền hay đơn đặt.',
}

/** Khung "Hàng đợi đối soát thủ công": các khoản chuyển khoản hệ thống không tự khớp được. */
export function ReconciliationPanel({ token, data, loading, error, onRetry, onResolved }: ReconciliationPanelProps) {
  const [open, setOpen] = useState<{ id: number; action: ReconcileActionKey } | null>(null)
  const [extra, setExtra] = useState('0')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const items = data?.items ?? []

  function start(item: ReconciliationItem, action: ReconcileActionKey) {
    setOpen({ id: item.transfer_id, action })
    // Gợi ý sẵn đúng số tiền còn thiếu
    setExtra(String(Math.max(0, Math.round(-(item.difference ?? 0)))))
    setNote('')
    setFormError('')
  }

  async function submit(event: FormEvent, item: ReconciliationItem) {
    event.preventDefault()
    if (!open) return

    if (open.action === 'dismiss' && note.trim().length === 0) {
      setFormError('Hãy ghi chú cách đã xử lý khoản này.')
      return
    }
    const extraAmount = Number(extra)
    if (open.action === 'apply_to_booking' && (!Number.isInteger(extraAmount) || extraAmount < 0)) {
      setFormError('Số tiền bổ sung phải là số nguyên không âm.')
      return
    }

    setBusy(true)
    setFormError('')
    try {
      const result = await resolveReconciliation(
        item.transfer_id,
        {
          action: open.action,
          ...(open.action === 'apply_to_booking' ? { extra_amount: extraAmount } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        token,
      )
      setOpen(null)
      onResolved(result.message, result.refund_id ?? null)
    } catch (e) {
      setFormError(e instanceof ApiError || e instanceof Error ? e.message : 'Không xử lý được khoản này.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="pay-card" aria-labelledby="pay-recon-title">
      <h2 id="pay-recon-title">
        Hàng đợi đối soát thủ công{data ? ` · ${data.total} giao dịch` : ''}
      </h2>

      {error && (
        <div className="pay-error">
          <Alert>{error}</Alert>
          <button type="button" className="pay-btn" onClick={onRetry}>
            Thử lại
          </button>
        </div>
      )}

      {!error && !data && loading && <p className="pay-empty">Đang tải hàng đợi…</p>}
      {!error && data && items.length === 0 && <p className="pay-empty">Không có khoản nào cần đối soát. 🎉</p>}

      {!error && items.length > 0 && (
        <div className="pay-scroll">
          <table className="pay-table">
            <thead>
              <tr>
                <th scope="col">Booking</th>
                <th scope="col">Đã nhận / cần nhận</th>
                <th scope="col">Vấn đề</th>
                <th scope="col">Xử lý</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isOpen = open?.id === item.transfer_id
                return [
                  <tr key={item.transfer_id} className={isOpen ? 'is-selected' : undefined}>
                    <td>
                      <b>{item.booking_code ?? item.code}</b>
                      <small>{item.customer_name ?? item.content ?? '—'}</small>
                    </td>
                    <td>
                      {formatMoney(item.received_amount)} / {item.expected_amount === null ? '—' : formatMoney(item.expected_amount)}
                    </td>
                    <td>{item.issue_label}</td>
                    <td>
                      <div className="pay-row-actions">
                        {item.actions.map(({ action, label }) => (
                          <button
                            key={action}
                            type="button"
                            title={label}
                            aria-pressed={isOpen && open?.action === action}
                            disabled={busy}
                            onClick={() => start(item, action)}
                          >
                            {SHORT_LABEL[action]}
                          </button>
                        ))}
                        {item.actions.length === 0 && <span>—</span>}
                      </div>
                    </td>
                  </tr>,
                  isOpen && open ? (
                    <tr key={`${item.transfer_id}-form`} className="pay-form-row">
                      <td colSpan={4}>
                        <form className="pay-inline-form" onSubmit={(event) => submit(event, item)}>
                          <p className="pay-hint">
                            <b>{item.actions.find((a) => a.action === open.action)?.label}:</b> {HINT[open.action]}
                          </p>
                          {open.action === 'apply_to_booking' && (
                            <label className="pay-field">
                              <span>Số tiền khách chuyển bổ sung (đ)</span>
                              <input type="number" min={0} step={1000} inputMode="numeric" value={extra} onChange={(event) => setExtra(event.target.value)} />
                            </label>
                          )}
                          <label className="pay-field">
                            <span>Ghi chú{open.action === 'dismiss' ? ' (bắt buộc)' : ' (không bắt buộc)'}</span>
                            <input type="text" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
                          </label>
                          {formError && <Alert>{formError}</Alert>}
                          <div className="pay-actions">
                            <button type="submit" className="pay-btn pay-btn--primary" disabled={busy}>
                              {busy ? 'Đang xử lý…' : 'Xác nhận'}
                            </button>
                            <button type="button" className="pay-btn" disabled={busy} onClick={() => setOpen(null)}>
                              Hủy
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : null,
                ]
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="pay-note">
        Đối soát số tiền, mã booking và mã giao dịch ngân hàng trước khi xử lý. Chuyển khoản chưa khớp chưa được tính vào doanh thu.
      </p>
    </section>
  )
}
