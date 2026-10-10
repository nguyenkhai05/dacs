import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/useAuth'
import { apiFetch } from '../lib/api'
import './BookingPage.css'

type ServiceItem = {
  service_id: number
  service_name: string
  unit: string
  price: number | string
  stock_quantity: number
  is_active: number
}
type Pitch = { pitch_id: number; pitch_name: string; category_name?: string | null; status: string }
type QuoteLine = { service_id: number; service_name: string; unit: string; quantity: number; unit_price: number; line_total: number }
type Quote = {
  pitch_id: number; booking_date: string; start_time: string; end_time: string
  services: QuoteLine[]; pitch_total?: number; total_pitch_price?: number
  services_total?: number; total_amount?: number; total?: number; deposit_amount?: number; deposit_percent?: number
  remaining_amount?: number; amount_due?: number
}
type CreatedBooking = { message: string; booking: { booking_id: number; booking_code: string; status: string; hold_minutes?: number; total?: number; deposit_amount?: number; amount_due?: number } }

const todayLocal = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}
const money = (value: number | string | null | undefined) =>
  value == null || !Number.isFinite(Number(value)) ? '—' : `${new Intl.NumberFormat('vi-VN').format(Number(value))}đ`
const time = (value: string) => value?.slice(0,5) || ''
const formatDate = (value: string) => {
  if (!value) return '—'
  const [y,m,d] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(y,m-1,d))
}

export default function BookingPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const pitchId = params.get('pitch_id') || ''
  const date = params.get('date') || todayLocal()
  const startTime = time(params.get('start_time') || '')
  const endTime = time(params.get('end_time') || '')
  const [pitch, setPitch] = useState<Pitch | null>(null)
  const [services, setServices] = useState<ServiceItem[]>([])
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [quoteError, setQuoteError] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [created, setCreated] = useState<CreatedBooking['booking'] | null>(null)

  const selectedServices = useMemo(() => services
    .filter((service) => (quantities[service.service_id] || 0) > 0)
    .map((service) => ({ service_id: service.service_id, quantity: quantities[service.service_id] })), [services, quantities])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      try {
        if (!/^\d+$/.test(pitchId) || !date || !startTime || !endTime) {
          throw new Error('Thông tin sân hoặc khung giờ chưa đầy đủ. Vui lòng quay lại trang chi tiết sân để chọn giờ.')
        }
        const [pitchData, serviceData] = await Promise.all([
          apiFetch<Pitch>(`/pitches/${encodeURIComponent(pitchId)}`),
          apiFetch<ServiceItem[]>('/services'),
        ])
        if (!cancelled) { setPitch(pitchData); setServices(Array.isArray(serviceData) ? serviceData : []) }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không thể tải thông tin đặt sân.')
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [pitchId, date, startTime, endTime])

  const getQuote = useCallback(async () => {
    if (!pitchId || !startTime || !endTime) return
    setQuoteError('')
    try {
      const result = await apiFetch<Quote>('/bookings/quote', {
        method: 'POST',
        body: { pitch_id: Number(pitchId), booking_date: date, start_time: startTime, end_time: endTime, services: selectedServices },
      })
      setQuote(result)
    } catch (e) {
      setQuote(null)
      setQuoteError(e instanceof Error ? e.message : 'Không thể tính tạm tính.')
    }
  }, [pitchId, date, startTime, endTime, selectedServices])

  useEffect(() => {
    if (!loading && pitch) void getQuote()
  }, [loading, pitch, getQuote])

  const pitchPrice = Number(quote?.pitch_total ?? quote?.total_pitch_price ?? 0)
  const serviceTotal = Number(quote?.services_total ?? quote?.services?.reduce((sum, line) => sum + Number(line.line_total || 0), 0) ?? 0)
  const grandTotal = Number(quote?.total_amount ?? quote?.total ?? pitchPrice + serviceTotal)
  const deposit = Number(quote?.deposit_amount ?? quote?.amount_due ?? 0)
  const remaining = Number(quote?.remaining_amount ?? Math.max(0, grandTotal - deposit))

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !token) {
      navigate(`/login?redirect=${encodeURIComponent(`/booking?${params.toString()}`)}`)
      return
    }
    setSubmitting(true); setError('')
    try {
      const result = await apiFetch<CreatedBooking>('/bookings', {
        method: 'POST', token,
        body: {
          pitch_id: Number(pitchId), booking_date: date, start_time: startTime, end_time: endTime,
          services: selectedServices, customer_note: note.trim() || undefined,
        },
      })
      setCreated(result.booking)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Đặt sân chưa thành công. Vui lòng thử lại.')
    } finally { setSubmitting(false) }
  }

  if (loading) return <div className="bk-page"><div className="bk-state"><span className="bk-spinner" />Đang tải thông tin đặt sân...</div></div>

  if (created) return (
    <div className="bk-page">
      <header className="bk-header"><Link to="/" className="bk-logo"><Logo /></Link></header>
      <main className="bk-main"><section className="bk-success">
        <span className="bk-success__icon">✓</span><p className="bk-eyebrow">ĐẶT SÂN THÀNH CÔNG</p>
        <h1>Đơn đặt sân đã được tạo!</h1><p>Đơn đang ở trạng thái chờ xử lý. Hãy lưu lại mã đơn để theo dõi.</p>
        <div className="bk-code"><span>Mã đơn đặt sân</span><strong>{created.booking_code || `#${created.booking_id}`}</strong><button type="button" onClick={() => void navigator.clipboard?.writeText(created.booking_code || String(created.booking_id))}>Sao chép mã</button></div>
        {created.hold_minutes ? <p className="bk-note">Vui lòng hoàn tất bước thanh toán trong khoảng {created.hold_minutes} phút theo hướng dẫn của hệ thống.</p> : null}
        <div className="bk-success__actions"><Link to="/">Về trang chủ</Link><button type="button" onClick={() => navigate('/booking-history')}>Xem đơn đặt sân</button></div>
      </section></main>
    </div>
  )

  return (
    <div className="bk-page">
      <header className="bk-header"><div className="bk-header__inner">
        <Link to="/" className="bk-logo" aria-label="Đặt Sân Nhanh"><Logo /></Link>
        <nav><Link to="/">Trang chủ</Link><Link className="is-active" to="/pitches">Tìm sân</Link><a href="/#loi-ich">Về chúng tôi</a></nav>
        <div className="bk-account">{user ? <span>Xin chào, {user.full_name}</span> : <Link to="/login">Đăng nhập</Link>}</div>
      </div></header>
      <main className="bk-main">
        <div className="bk-breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><Link to="/pitches">Danh sách sân</Link><span>›</span><Link to={`/pitches/${pitchId}?date=${encodeURIComponent(date)}`}>Chi tiết sân</Link><span>›</span><strong>Đặt sân</strong></div>
        <div className="bk-heading"><div><p className="bk-eyebrow">BƯỚC 1 / 3</p><h1>Hoàn tất đặt sân</h1><p>Kiểm tra thông tin trận đấu và chọn dịch vụ đi kèm nếu bạn cần.</p></div><div className="bk-steps"><span className="active">1 <small>Đặt sân</small></span><i /><span>2 <small>Thanh toán</small></span><i /><span>3 <small>Hoàn tất</small></span></div></div>
        {error && <div className="bk-alert" role="alert"><span>!</span><div><strong>Chưa thể tiếp tục</strong><p>{error}</p><Link to={`/pitches/${pitchId}?date=${encodeURIComponent(date)}`}>Quay lại chọn sân / giờ</Link></div></div>}
        {pitch && <form className="bk-layout" onSubmit={submitBooking}>
          <div className="bk-primary">
            <section className="bk-panel">
              <div className="bk-panel__heading"><span className="bk-icon">▦</span><div><h2>Thông tin đặt sân</h2><p>Thông tin được lấy từ khung giờ bạn đã chọn</p></div></div>
              <div className="bk-field-grid">
                <label className="bk-field"><span>Sân bóng</span><input value={pitch.pitch_name} readOnly /></label>
                <label className="bk-field"><span>Loại sân</span><input value={pitch.category_name || 'Sân bóng đá'} readOnly /></label>
                <label className="bk-field"><span>Ngày chơi</span><input value={formatDate(date)} readOnly /></label>
                <label className="bk-field"><span>Khung giờ</span><input value={`${startTime} – ${endTime}`} readOnly /></label>
              </div>
              <div className="bk-readonly-note"><span>✓</span> Vui lòng kiểm tra ngày và giờ. Muốn thay đổi, hãy quay lại trang chi tiết sân.</div>
            </section>

            <section className="bk-panel">
              <div className="bk-panel__heading"><span className="bk-icon">＋</span><div><h2>Dịch vụ đi kèm</h2><p>Tùy chọn thêm dịch vụ để trận đấu thuận tiện hơn</p></div><span className="bk-optional">Không bắt buộc</span></div>
              {services.length === 0 ? <div className="bk-empty-services">Hiện chưa có dịch vụ nào đang được cung cấp.</div> : <div className="bk-services">
                {services.map((service, index) => {
                  const qty = quantities[service.service_id] || 0
                  const available = Number(service.stock_quantity) || 0
                  return <article className={`bk-service ${qty ? 'selected' : ''}`} key={service.service_id}>
                    <div className="bk-service__symbol">{['⚽','💧','👕','🦺','💡'][index % 5]}</div>
                    <div className="bk-service__info"><strong>{service.service_name}</strong><span>{money(service.price)} / {service.unit}</span><small>{available > 0 ? `Còn ${available} ${service.unit}` : 'Tạm hết hàng'}</small></div>
                    <div className="bk-quantity" aria-label={`Số lượng ${service.service_name}`}><button type="button" aria-label={`Giảm ${service.service_name}`} disabled={qty <= 0} onClick={() => setQuantities((old) => ({...old, [service.service_id]: Math.max(0, qty - 1)}))}>−</button><output>{qty}</output><button type="button" aria-label={`Tăng ${service.service_name}`} disabled={qty >= Math.min(99, available)} onClick={() => setQuantities((old) => ({...old, [service.service_id]: Math.min(99, available, qty + 1)}))}>+</button></div>
                  </article>
                })}
              </div>}
            </section>

            <section className="bk-panel">
              <div className="bk-panel__heading"><span className="bk-icon">✎</span><div><h2>Ghi chú cho sân</h2><p>Thông tin thêm bạn muốn gửi cho quản lý sân</p></div></div>
              <label className="bk-field"><span>Ghi chú (không bắt buộc)</span><textarea rows={3} maxLength={5000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Chúng tôi cần chuẩn bị thêm bóng..." /></label><small className="bk-character-count">{note.length}/5000 ký tự</small>
            </section>
          </div>

          <aside className="bk-summary">
            <div className="bk-summary__top"><span>TÓM TẮT ĐẶT SÂN</span><h2>{pitch.pitch_name}</h2><p>{formatDate(date)} · {startTime} – {endTime}</p></div>
            <div className="bk-summary__body">
              <div className="bk-price-line"><span>Tiền thuê sân</span><strong>{quote ? money(pitchPrice) : 'Đang tính...'}</strong></div>
              {selectedServices.map((item) => {
                const service = services.find((s) => s.service_id === item.service_id)
                return service ? <div className="bk-price-line" key={item.service_id}><span>{service.service_name} × {item.quantity}</span><strong>{money(Number(service.price) * item.quantity)}</strong></div> : null
              })}
              <div className="bk-price-line"><span>Dịch vụ đi kèm</span><strong>{quote ? money(serviceTotal) : 'Đang tính...'}</strong></div>
              {quoteError && <div className="bk-quote-error" role="alert">{quoteError}<button type="button" onClick={() => void getQuote()}>Tính lại</button></div>}
              <div className="bk-total"><span>Tổng tạm tính</span><strong>{quote ? money(grandTotal) : '—'}</strong></div>
              <div className="bk-deposit"><div><span>Tiền cọc dự kiến</span><strong>{quote ? money(deposit) : '—'}</strong></div><small>Số tiền cuối cùng được backend xác nhận khi tạo đơn.</small></div>
              {quote && <div className="bk-remaining"><span>Còn lại sau khi cọc</span><strong>{money(remaining)}</strong></div>}
              <button className="bk-submit" type="submit" disabled={submitting || !quote || Boolean(quoteError) || !pitchId || pitch.status !== 'Available'}>{submitting ? 'Đang tạo đơn...' : user ? 'Xác nhận đặt sân' : 'Đăng nhập để đặt sân'} <span>→</span></button>
              {!user && <p className="bk-login-note">Bạn cần đăng nhập để tạo đơn đặt sân.</p>}
              <p className="bk-terms">Bằng việc xác nhận, bạn đồng ý với chính sách đặt sân và hủy sân của hệ thống.</p>
              <div className="bk-safe"><span>✓</span><p><strong>Thông tin minh bạch</strong><br/>Giá sân và dịch vụ được tính lại từ hệ thống trước khi tạo đơn.</p></div>
            </div>
          </aside>
        </form>}
      </main>
      <footer className="bk-footer"><Logo /><span>Đặt sân dễ dàng. Trận đấu trọn vẹn.</span><small>© {new Date().getFullYear()} Đặt Sân Nhanh</small></footer>
    </div>
  )
}
