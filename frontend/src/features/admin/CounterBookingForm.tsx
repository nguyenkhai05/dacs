import { useEffect, useState, type FormEvent } from 'react'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { ApiError, apiFetch, isAbortError } from '../../lib/api'
import { formatPrice, toMinutes } from '../../lib/format'
import { STATUS_LABEL, hhmm } from '../../lib/adminBookingLabels'
import { counterQuote, createCounterBooking, type CounterQuote } from './adminBookingsApi'

interface PitchOption {
  pitch_id: number
  pitch_name: string
  status: string
}

interface ServiceOption {
  service_id: number
  service_name: string
  unit: string
  price: number | string
}

export interface CounterPrefill {
  /** Tăng mỗi lần bấm ô trống trên lịch để form nhận giá trị mới */
  nonce: number
  pitchId: number
  date: string
  startTime: string
  endTime: string
}

interface CounterBookingFormProps {
  token: string
  pitches: PitchOption[]
  defaultDate: string
  prefill: CounterPrefill | null
  onCreated: (bookingId: number, message: string) => void
}

const PHONE_PATTERN = /^0\d{9,10}$/

/** Chuẩn hóa SĐT giống backend: "+84 916 333 555" → "0916333555". */
function normalizePhone(raw: string): string {
  let value = raw.trim().replace(/[\s.\-()]/g, '')
  if (value.startsWith('+84')) value = `0${value.slice(3)}`
  else if (value.startsWith('84') && value.length >= 11) value = `0${value.slice(2)}`
  return value
}

/** Form "Tạo booking tại quầy": kiểm tra trùng giờ, tính tiền, tạo đơn đã thu tiền mặt. */
export function CounterBookingForm({ token, pitches, defaultDate, prefill, onCreated }: CounterBookingFormProps) {
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [pitchId, setPitchId] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [services, setServices] = useState<{ service_id: number; quantity: number }[]>([])
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([])
  const [pickService, setPickService] = useState('')
  const [pickQty, setPickQty] = useState('1')
  const [paymentMode, setPaymentMode] = useState<'full' | 'deposit'>('full')
  const [note, setNote] = useState('')

  const [quote, setQuote] = useState<CounterQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Danh sách dịch vụ đang bán (API công khai)
  useEffect(() => {
    const controller = new AbortController()
    apiFetch<ServiceOption[]>('/services', { signal: controller.signal })
      .then(setServiceOptions)
      .catch(() => {
        /* không có dịch vụ vẫn đặt sân được */
      })
    return () => controller.abort()
  }, [])

  // Bấm ô trống trên lịch → điền sẵn sân / ngày / giờ
  useEffect(() => {
    if (!prefill) return
    setPitchId(String(prefill.pitchId))
    setDate(prefill.date)
    setStartTime(prefill.startTime)
    setEndTime(prefill.endTime)
  }, [prefill])

  const phoneNormalized = normalizePhone(phone)
  const phoneValid = PHONE_PATTERN.test(phoneNormalized)
  const timeReady =
    Boolean(pitchId && date && startTime && endTime) && toMinutes(endTime) > toMinutes(startTime)

  // Tính tiền + kiểm tra trùng giờ mỗi khi thông tin đặt sân đổi (chờ 400ms cho đỡ gọi liên tục)
  useEffect(() => {
    if (!timeReady) {
      setQuote(null)
      setQuoteError('')
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setQuoting(true)
      setQuoteError('')
      counterQuote(
        {
          pitch_id: Number(pitchId),
          booking_date: date,
          start_time: startTime,
          end_time: endTime,
          services,
          ...(phoneValid ? { phone_number: phoneNormalized } : {}),
        },
        token,
        controller.signal,
      )
        .then(setQuote)
        .catch((err) => {
          if (isAbortError(err)) return
          setQuote(null)
          setQuoteError(err instanceof Error ? err.message : 'Không tính được tiền.')
        })
        .finally(() => {
          if (!controller.signal.aborted) setQuoting(false)
        })
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [timeReady, pitchId, date, startTime, endTime, services, phoneValid, phoneNormalized, token])

  function addService() {
    const id = Number(pickService)
    const quantity = Math.floor(Number(pickQty))
    if (!id || !Number.isFinite(quantity) || quantity < 1 || quantity > 99) return
    setServices((current) => {
      const existing = current.find((item) => item.service_id === id)
      if (existing) {
        return current.map((item) =>
          item.service_id === id ? { ...item, quantity: Math.min(99, item.quantity + quantity) } : item,
        )
      }
      return [...current, { service_id: id, quantity }]
    })
    setPickService('')
    setPickQty('1')
  }

  const serviceName = (id: number) => serviceOptions.find((item) => item.service_id === id)

  const canSubmit =
    !submitting &&
    !quoting &&
    customerName.trim().length >= 2 &&
    phoneValid &&
    timeReady &&
    quote?.available === true

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const result = await createCounterBooking(
        {
          customer_name: customerName.trim(),
          phone_number: phoneNormalized,
          pitch_id: Number(pitchId),
          booking_date: date,
          start_time: startTime,
          end_time: endTime,
          services,
          payment_mode: paymentMode,
          ...(note.trim() ? { customer_note: note.trim() } : {}),
        },
        token,
      )
      // Xóa form để nhập đơn tiếp theo
      setCustomerName('')
      setPhone('')
      setStartTime('')
      setEndTime('')
      setServices([])
      setNote('')
      setQuote(null)
      onCreated(result.booking.booking_id, `${result.message} ${result.booking.booking_code}`)
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Không tạo được đơn.')
    } finally {
      setSubmitting(false)
    }
  }

  const cashDue = quote?.cash_options ? quote.cash_options[paymentMode] : 0

  return (
    <section className="ab-card" id="ab-counter" aria-label="Tạo booking tại quầy">
      <h2>Tạo booking tại quầy</h2>
      <form onSubmit={handleSubmit} noValidate>
        <div className="ab-two">
          <label className="ab-field">
            <span>Tên khách</span>
            <input
              value={customerName}
              maxLength={100}
              placeholder="Vd: Lê Hoàng Long"
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </label>
          <label className="ab-field">
            <span>Số điện thoại</span>
            <input
              value={phone}
              inputMode="tel"
              placeholder="Vd: 0916 333 555"
              onChange={(event) => setPhone(event.target.value)}
              aria-invalid={phone !== '' && !phoneValid}
            />
          </label>
        </div>
        {phone !== '' && !phoneValid && <small className="ab-hint ab-hint--error">Số điện thoại chưa hợp lệ.</small>}
        {phoneValid && quote?.customer && (
          <div className="ab-box ab-box--info">
            {quote.customer.exists
              ? `Khách đã có tài khoản: ${quote.customer.full_name}. Đơn sẽ gắn vào tài khoản này.`
              : 'Chưa có khách khớp số điện thoại. Hệ thống sẽ tạo khách mới khi lưu đơn.'}
          </div>
        )}
        {phoneValid && !quote?.customer && timeReady && !quoting && quote && (
          <div className="ab-box ab-box--info">
            Chưa có khách khớp số điện thoại. Hệ thống sẽ tạo khách mới khi lưu đơn.
          </div>
        )}

        <div className="ab-two">
          <label className="ab-field">
            <span>Sân</span>
            <select value={pitchId} onChange={(event) => setPitchId(event.target.value)}>
              <option value="">Chọn sân</option>
              {pitches.map((pitch) => (
                <option key={pitch.pitch_id} value={pitch.pitch_id} disabled={pitch.status !== 'Available'}>
                  {pitch.pitch_name}
                  {pitch.status !== 'Available' ? ' (không khả dụng)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="ab-field">
            <span>Ngày đá</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>
        <div className="ab-two">
          <label className="ab-field">
            <span>Giờ bắt đầu</span>
            <input type="time" step={1800} value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label className="ab-field">
            <span>Giờ kết thúc</span>
            <input type="time" step={1800} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </label>
        </div>
        {startTime && endTime && toMinutes(endTime) <= toMinutes(startTime) && (
          <small className="ab-hint ab-hint--error">Giờ kết thúc phải sau giờ bắt đầu.</small>
        )}

        {quote && !quote.available && quote.conflicts.length > 0 && (
          <div className="ab-box ab-box--warn" role="alert">
            <b>
              Khung {hhmm(startTime)}–{hhmm(endTime)} đang có booking.
            </b>
            <ul>
              {quote.conflicts.map((conflict) => (
                <li key={conflict.booking_id}>
                  {conflict.booking_code} · {conflict.customer_name} · {hhmm(conflict.start_time)}–
                  {hhmm(conflict.end_time)} ({STATUS_LABEL[conflict.status]})
                </li>
              ))}
            </ul>
            Hãy chọn khung giờ khác hoặc hủy đơn đang giữ chỗ trước.
          </div>
        )}
        {quoteError && <div className="ab-box ab-box--error" role="alert">{quoteError}</div>}

        <div className="ab-field">
          <span>Dịch vụ</span>
          <div className="ab-service-row">
            <select value={pickService} onChange={(event) => setPickService(event.target.value)} aria-label="Chọn dịch vụ">
              <option value="">Chọn dịch vụ (không bắt buộc)</option>
              {serviceOptions.map((item) => (
                <option key={item.service_id} value={item.service_id}>
                  {item.service_name} · {formatPrice(item.price)}/{item.unit}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={99}
              value={pickQty}
              onChange={(event) => setPickQty(event.target.value)}
              aria-label="Số lượng"
            />
            <button type="button" className="ab-btn" onClick={addService} disabled={!pickService}>
              Thêm
            </button>
          </div>
          {services.length > 0 && (
            <ul className="ab-service-list">
              {services.map((item) => {
                const info = serviceName(item.service_id)
                return (
                  <li key={item.service_id}>
                    <span>
                      {info?.service_name ?? `Dịch vụ #${item.service_id}`} × {item.quantity}
                      {info ? ` ${info.unit}` : ''}
                    </span>
                    <button
                      type="button"
                      aria-label={`Bỏ ${info?.service_name ?? 'dịch vụ'}`}
                      onClick={() => setServices((current) => current.filter((s) => s.service_id !== item.service_id))}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {quote?.available && (
          <p className="ab-sum">
            Tiền sân: {formatPrice(quote.pitch_total)} · Dịch vụ: {formatPrice(quote.services_total)} ·{' '}
            <b>Tổng: {formatPrice(quote.total_amount)}</b>
          </p>
        )}
        {quoting && <p className="ab-sum">Đang kiểm tra lịch và tính tiền...</p>}

        <label className="ab-field">
          <span>Thu tiền mặt tại quầy</span>
          <select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as 'full' | 'deposit')}>
            <option value="full">Thanh toán toàn bộ{quote?.cash_options ? ` (${formatPrice(quote.cash_options.full)})` : ''}</option>
            <option value="deposit">
              Chỉ thu cọc{quote?.cash_options ? ` (${formatPrice(quote.cash_options.deposit)})` : ''}
            </option>
          </select>
        </label>
        {quote?.available && (
          <small className="ab-hint">
            Nhân viên thu {formatPrice(cashDue)} tiền mặt.
            {paymentMode === 'deposit' ? ` Phần còn lại ${formatPrice((quote.total_amount ?? 0) - cashDue)} thu tại sân.` : ''}
          </small>
        )}

        <label className="ab-field">
          <span>Ghi chú (không bắt buộc)</span>
          <textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        {error && <Alert>{error}</Alert>}
        <Button type="submit" fullWidth disabled={!canSubmit} loading={submitting} loadingText="Đang tạo đơn...">
          Tạo đơn & ghi nhận thu tiền
        </Button>
        <small className="ab-hint">Đơn tạo tại quầy vào thẳng trạng thái Đã xác nhận vì đã thu tiền mặt.</small>
      </form>
    </section>
  )
}
