import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../../lib/api'
import { saveRefundAccount } from './bookingApi'
import {
  cancelReasonOf,
  money,
  normalizeAccountName,
  validateRefundForm,
} from './bookingDetailView'
import type { RefundFormErrors, RefundFormValues, RefundSummary } from './bookingDetailView'
import type { BookingDetail } from './bookingTypes'
import { Chip } from './Chip'
import './BookingDetail.css'

interface RefundAccountCardProps {
  detail: BookingDetail
  summary: RefundSummary
  token: string | null
  onSaved: (message: string) => void
}

/** Card cuối trang khi đơn đã hủy có khoản hoàn: trạng thái hoàn + form tài khoản nhận hoàn. */
export function RefundAccountCard({ detail, summary, token, onSaved }: RefundAccountCardProps) {
  const { current } = summary
  const editable = summary.kind !== 'done'

  const [values, setValues] = useState<RefundFormValues>({
    bank_name: current.bank_name ?? '',
    bank_account_number: current.bank_account_number ?? '',
    bank_account_name: current.bank_account_name ?? '',
  })
  const [errors, setErrors] = useState<RefundFormErrors>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancelInfo = cancelReasonOf(detail)
  const whoCancelled =
    cancelInfo?.by === 'staff'
      ? `Đơn được hủy bởi nhân viên${cancelInfo.text ? ` — lý do: ${cancelInfo.text}` : ''}. `
      : cancelInfo?.text
        ? `Lý do hủy: ${cancelInfo.text}. `
        : ''

  const title =
    summary.kind === 'done'
      ? 'Đã hoàn cọc'
      : summary.kind === 'failed'
        ? 'Hoàn cọc chưa thành công'
        : 'Đơn đã hủy · đang chờ hoàn cọc'

  function update(field: keyof RefundFormValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    const found = validateRefundForm(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    setError(null)
    try {
      const result = await saveRefundAccount(
        detail.booking_id,
        {
          bank_name: values.bank_name.trim(),
          bank_account_number: values.bank_account_number.replace(/[\s-]/g, ''),
          bank_account_name: normalizeAccountName(values.bank_account_name),
        },
        token,
      )
      onSaved(result.message)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Không lưu được thông tin nhận hoàn. Vui lòng thử lại.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bd-card bd-refund" aria-labelledby="bd-refund-title">
      <div>
        <h2 className="bd-card__title" id="bd-refund-title">
          {title}
        </h2>

        <div className="bd-chips">
          <Chip tone="danger">Đã hủy</Chip>
          {summary.kind === 'pending' && <Chip tone="warning">Chờ hoàn {money(summary.total)}</Chip>}
          {summary.kind === 'failed' && <Chip tone="danger">Hoàn thất bại</Chip>}
          {summary.kind === 'done' && <Chip tone="success">Đã hoàn {money(summary.total)}</Chip>}
        </div>

        <p className="bd-refund__text">
          {whoCancelled}
          Sân đã được giải phóng.{' '}
          {summary.kind === 'done'
            ? 'Quản lý đã chuyển khoản hoàn cọc cho bạn.'
            : 'Quản lý sẽ chuyển khoản thủ công và cập nhật khi hoàn thành.'}
        </p>

        {summary.kind === 'failed' && summary.failureReason && (
          <div className="bd-notice bd-notice--danger" style={{ marginTop: 12 }}>
            <strong>Lý do chuyển khoản không thành công</strong>
            <p>{summary.failureReason}. Hãy kiểm tra và lưu lại tài khoản nhận hoàn.</p>
          </div>
        )}
      </div>

      <div>
        {editable ? (
          <form className="bd-form" style={{ marginTop: 0 }} onSubmit={handleSubmit} noValidate>
            <div className="bd-field">
              <label htmlFor="bd-bank">Ngân hàng nhận hoàn</label>
              <input
                id="bd-bank"
                className="bd-input"
                value={values.bank_name}
                aria-invalid={errors.bank_name ? true : undefined}
                autoComplete="off"
                onChange={(event) => update('bank_name', event.target.value)}
              />
              {errors.bank_name && <p className="bd-field__error">{errors.bank_name}</p>}
            </div>

            <div className="bd-field">
              <label htmlFor="bd-account-number">Số tài khoản</label>
              <input
                id="bd-account-number"
                className="bd-input"
                inputMode="numeric"
                value={values.bank_account_number}
                aria-invalid={errors.bank_account_number ? true : undefined}
                autoComplete="off"
                onChange={(event) => update('bank_account_number', event.target.value)}
              />
              {errors.bank_account_number && (
                <p className="bd-field__error">{errors.bank_account_number}</p>
              )}
            </div>

            <div className="bd-field">
              <label htmlFor="bd-account-name">Chủ tài khoản</label>
              <input
                id="bd-account-name"
                className="bd-input"
                value={values.bank_account_name}
                aria-invalid={errors.bank_account_name ? true : undefined}
                autoComplete="off"
                onChange={(event) => update('bank_account_name', event.target.value)}
              />
              {errors.bank_account_name ? (
                <p className="bd-field__error">{errors.bank_account_name}</p>
              ) : (
                <p className="bd-field__hint">Tự đổi thành không dấu, viết hoa khi lưu.</p>
              )}
            </div>

            {error && (
              <div className="bd-alert bd-alert--error" role="alert">
                {error}
              </div>
            )}

            <div className="bd-actions" style={{ marginTop: 0 }}>
              <button type="submit" className="bd-btn bd-btn--outline" disabled={busy}>
                {busy ? 'Đang lưu...' : 'Lưu thông tin nhận hoàn'}
              </button>
            </div>
          </form>
        ) : (
          <dl className="bd-summary">
            <dt>Ngân hàng</dt>
            <dd>{current.bank_name ?? '—'}</dd>
            <dt>Số tài khoản</dt>
            <dd>{current.bank_account_number ?? '—'}</dd>
            <dt>Chủ tài khoản</dt>
            <dd>{current.bank_account_name ?? '—'}</dd>
          </dl>
        )}
      </div>
    </section>
  )
}
