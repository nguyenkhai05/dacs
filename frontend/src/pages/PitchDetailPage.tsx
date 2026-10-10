import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/useAuth'
import { apiFetch } from '../lib/api'
import './PitchDetailPage.css'

type PitchDetail = {
  pitch_id: number
  pitch_name: string
  category_id: number | null
  category_name: string | null
  status: string
  notes: string | null
}
type AvailabilitySlot = {
  start_time: string
  end_time: string
  price_per_hour: number | string
  available: boolean
}
type AvailabilityResponse = {
  pitch_id: number
  pitch_name: string
  category_id: number
  booking_date: string
  pricing_day_type: string | null
  is_holiday: boolean | number
  total_slots: number
  available_slots: number
  slots: AvailabilitySlot[]
}
type PitchCard = {
  pitch_id: number
  pitch_name: string
  image_url: string | null
  surface_type: string
  district?: string | null
  category_name: string
  price_from: number | null
}
type SearchResponse = { pitches: PitchCard[] }

const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1400&q=85',
  'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=1400&q=85',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1400&q=85',
]

function todayLocal() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function formatPrice(value: number | string | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return 'Liên hệ'
  return `${new Intl.NumberFormat('vi-VN').format(Number(value))}đ`
}
function formatDate(value: string) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day))
}
function formatTime(value: string) { return value.slice(0, 5) }

export default function PitchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [searchParams] = useSearchParams()
  const [date, setDate] = useState(searchParams.get('date') || todayLocal())
  const [pitch, setPitch] = useState<PitchDetail | null>(null)
  const [card, setCard] = useState<PitchCard | null>(null)
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [loadingPitch, setLoadingPitch] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [error, setError] = useState('')
  const [slotError, setSlotError] = useState('')
  const [imageIndex, setImageIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function loadPitch() {
      setLoadingPitch(true)
      setError('')
      try {
        const detail = await apiFetch<PitchDetail>(`/pitches/${encodeURIComponent(id || '')}`)
        if (cancelled) return
        setPitch(detail)
        // API trang chủ cung cấp thêm ảnh và địa điểm khi dữ liệu có sẵn.
        try {
          const extras = await apiFetch<SearchResponse>(`/home/pitches?date=${encodeURIComponent(date)}&page=1&limit=50&sort=available`)
          if (!cancelled) setCard(extras.pitches?.find((item) => item.pitch_id === detail.pitch_id) ?? null)
        } catch {
          if (!cancelled) setCard(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không thể tải thông tin sân.')
      } finally {
        if (!cancelled) setLoadingPitch(false)
      }
    }
    if (id && /^\d+$/.test(id)) void loadPitch()
    else { setError('Đường dẫn sân không hợp lệ.'); setLoadingPitch(false) }
    return () => { cancelled = true }
  }, [id, date])

  const loadAvailability = useCallback(async () => {
    if (!id || !/^\d+$/.test(id)) return
    setLoadingSlots(true)
    setSlotError('')
    setSelectedSlot(null)
    try {
      const data = await apiFetch<AvailabilityResponse>(`/bookings/availability?pitch_id=${encodeURIComponent(id)}&date=${encodeURIComponent(date)}`)
      setAvailability(data)
    } catch (err) {
      setAvailability(null)
      setSlotError(err instanceof Error ? err.message : 'Không thể tải lịch trống của sân.')
    } finally {
      setLoadingSlots(false)
    }
  }, [id, date])

  useEffect(() => { void loadAvailability() }, [loadAvailability])

  const images = useMemo(() => [card?.image_url || FALLBACK_IMAGES[Number(id || 0) % FALLBACK_IMAGES.length], ...FALLBACK_IMAGES].filter(Boolean), [card?.image_url, id])
  const total = selectedSlot ? Number(selectedSlot.price_per_hour) : 0
  const availableCount = availability?.available_slots ?? 0

  const continueBooking = () => {
    if (!selectedSlot || !pitch) return
    const params = new URLSearchParams({
      pitch_id: String(pitch.pitch_id),
      date,
      start_time: formatTime(selectedSlot.start_time),
      end_time: formatTime(selectedSlot.end_time),
    })
    navigate(`/booking?${params.toString()}`)
  }

  if (loadingPitch) return <div className="pd-page"><div className="pd-loading-page"><span className="pd-spinner" /><p>Đang tải thông tin sân...</p></div></div>
  if (error || !pitch) return (
    <div className="pd-page">
      <header className="pd-header"><Link to="/" className="pd-brand"><Logo /></Link><Link to="/pitches" className="pd-back-link">← Danh sách sân</Link></header>
      <main className="pd-main"><div className="pd-error-page"><span>!</span><h1>Không tải được thông tin sân</h1><p>{error || 'Không tìm thấy sân này.'}</p><div><button type="button" onClick={() => window.location.reload()}>Thử lại</button><Link to="/pitches">Quay lại danh sách sân</Link></div></div></main>
    </div>
  )

  const statusLabel = pitch.status === 'Available' ? 'Đang hoạt động' : pitch.status === 'Maintenance' ? 'Đang bảo trì' : 'Tạm ngừng hoạt động'

  return (
    <div className="pd-page">
      <header className="pd-header">
        <div className="pd-header__inner">
          <Link to="/" className="pd-brand" aria-label="Đặt Sân Nhanh - Trang chủ"><Logo /></Link>
          <nav className="pd-nav" aria-label="Điều hướng chính"><Link to="/">Trang chủ</Link><Link className="active" to="/pitches">Tìm sân</Link><a href="/#loi-ich">Về chúng tôi</a></nav>
          <div className="pd-header__actions">{user ? <><span>Xin chào, {user.full_name}</span><button type="button" onClick={signOut}>Đăng xuất</button></> : <><Link to="/login">Đăng nhập</Link><Link className="pd-register" to="/register">Đăng ký</Link></>}</div>
        </div>
      </header>

      <main className="pd-main">
        <div className="pd-breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><Link to="/pitches">Danh sách sân</Link><span>›</span><span>{pitch.pitch_name}</span></div>

        <section className="pd-title-row">
          <div><span className="pd-eyebrow">THÔNG TIN SÂN</span><h1>{pitch.pitch_name}</h1><div className="pd-subtitle"><span className="pd-location-icon">⌖</span>{card?.district || 'Địa điểm chi tiết đang cập nhật'} <span className="pd-dot">·</span>{card?.category_name || pitch.category_name || 'Sân thể thao'} <span className="pd-dot">·</span><span className={`pd-status ${pitch.status === 'Available' ? 'is-open' : 'is-closed'}`}>{statusLabel}</span></div></div>
          <Link className="pd-outline-button" to={`/pitches?date=${encodeURIComponent(date)}`}>← Quay lại danh sách</Link>
        </section>

        <section className="pd-gallery" aria-label="Hình ảnh sân">
          <div className="pd-gallery__main"><img src={images[imageIndex] || FALLBACK_IMAGES[0]} alt={`Hình ảnh ${pitch.pitch_name}`} onError={(event) => { event.currentTarget.src = FALLBACK_IMAGES[0] }} /><span className="pd-photo-label"><span>▧</span> Hình ảnh sân</span></div>
          <div className="pd-gallery__side">{images.slice(1, 3).map((src, index) => <button key={src} type="button" className="pd-gallery__thumb" onClick={() => setImageIndex(index + 1)} aria-label={`Xem ảnh ${index + 2}`}><img src={src} alt={`${pitch.pitch_name} - ảnh ${index + 2}`} onError={(event) => { event.currentTarget.src = FALLBACK_IMAGES[(index + 1) % FALLBACK_IMAGES.length] }} /></button>)}</div>
        </section>

        <div className="pd-layout">
          <div className="pd-primary-column">
            <section className="pd-panel pd-overview">
              <div className="pd-panel-heading"><div><span className="pd-section-icon">⚽</span><div><h2>Tổng quan sân</h2><p>Thông tin cơ bản trước khi bạn chọn giờ chơi</p></div></div><span className="pd-pitch-id">Mã sân #{pitch.pitch_id}</span></div>
              <div className="pd-info-grid"><div className="pd-info-item"><span className="pd-info-icon">⚽</span><div><small>Loại sân</small><strong>{card?.category_name || pitch.category_name || 'Đang cập nhật'}</strong></div></div><div className="pd-info-item"><span className="pd-info-icon">▤</span><div><small>Mặt sân</small><strong>{card?.surface_type || 'Đang cập nhật'}</strong></div></div><div className="pd-info-item"><span className="pd-info-icon">⌖</span><div><small>Khu vực</small><strong>{card?.district || 'Đang cập nhật'}</strong></div></div><div className="pd-info-item"><span className="pd-info-icon">◷</span><div><small>Trạng thái</small><strong>{statusLabel}</strong></div></div></div>
              <div className="pd-description"><h3>Giới thiệu</h3><p>{pitch.notes?.trim() || `Chào mừng bạn đến với ${pitch.pitch_name}. Hãy chọn ngày và khung giờ bên dưới để kiểm tra lịch trống và giá thuê sân.`}</p></div>
              <div className="pd-amenities"><h3>Tiện ích</h3><p>Thông tin tiện ích chi tiết chưa được cung cấp trong dữ liệu sân hiện tại.</p></div>
            </section>

            <section className="pd-panel pd-schedule" id="lich-trong">
              <div className="pd-panel-heading"><div><span className="pd-section-icon">▦</span><div><h2>Lịch trống & bảng giá</h2><p>Chọn ngày chơi rồi chọn một khung giờ còn trống</p></div></div></div>
              <div className="pd-date-row"><label htmlFor="pd-date">Ngày bạn muốn chơi</label><input id="pd-date" type="date" min={todayLocal()} value={date} onChange={(event) => setDate(event.target.value)} /><span className="pd-date-caption">{formatDate(date)}</span></div>
              <div className="pd-slot-legend"><span><i className="free" /> Còn trống</span><span><i className="chosen" /> Đang chọn</span><span><i className="busy" /> Đã đặt / Không khả dụng</span></div>
              {slotError && <div className="pd-inline-error" role="alert"><span>{slotError}</span><button type="button" onClick={() => void loadAvailability()}>Thử lại</button></div>}
              {loadingSlots ? <div className="pd-slot-loading"><span className="pd-spinner" />Đang tải lịch trống và giá...</div> : availability ? <>
                <div className="pd-availability-summary"><span><strong>{availableCount}</strong> khung giờ còn trống</span><span>{availability.total_slots} khung giờ trong ngày</span></div>
                {availability.slots.length ? <div className="pd-slot-grid">{availability.slots.map((slot) => {
                  const chosen = selectedSlot?.start_time === slot.start_time && selectedSlot?.end_time === slot.end_time
                  return <button key={`${slot.start_time}-${slot.end_time}`} type="button" disabled={!slot.available} className={`pd-slot ${slot.available ? 'is-free' : 'is-busy'} ${chosen ? 'is-selected' : ''}`} onClick={() => setSelectedSlot(slot)} aria-pressed={chosen}><span className="pd-slot__time">{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</span><strong>{formatPrice(slot.price_per_hour)}</strong><small>{chosen ? 'Đang chọn' : slot.available ? 'Còn trống' : 'Không khả dụng'}</small></button>
                })}</div> : <div className="pd-no-slots"><span>◷</span><strong>Chưa có khung giờ được cấu hình</strong><p>Ngày này hiện chưa có bảng giá để hiển thị lịch đặt sân.</p></div>}
                {availability.is_holiday ? <p className="pd-pricing-note">Ngày bạn chọn được hệ thống xác định là ngày lễ; giá đã áp dụng theo cấu hình của backend.</p> : availability.pricing_day_type && <p className="pd-pricing-note">Bảng giá đang áp dụng: {availability.pricing_day_type === 'Weekday' ? 'Ngày thường' : availability.pricing_day_type === 'Weekend' ? 'Cuối tuần' : availability.pricing_day_type}.</p>}
              </> : null}
            </section>
          </div>

          <aside className="pd-booking-card">
            <div className="pd-booking-card__top"><span>GIÁ THUÊ THEO LỊCH</span><h2>{selectedSlot ? formatPrice(selectedSlot.price_per_hour) : availability?.slots.length ? `Từ ${formatPrice(Math.min(...availability.slots.map((slot) => Number(slot.price_per_hour))))}` : 'Chưa có giá'}</h2><small>/ giờ</small></div>
            <div className="pd-booking-card__details"><div><span>Ngày chơi</span><strong>{date.split('-').reverse().join('/')}</strong></div><div><span>Khung giờ</span><strong>{selectedSlot ? `${formatTime(selectedSlot.start_time)} – ${formatTime(selectedSlot.end_time)}` : 'Chưa chọn giờ'}</strong></div><div><span>Tiền sân tạm tính</span><strong>{selectedSlot ? formatPrice(total) : '—'}</strong></div></div>
            {selectedSlot && <div className="pd-selected-message">✓ Bạn đã chọn khung giờ. Giá cuối cùng sẽ được xác nhận ở bước đặt sân.</div>}
            <button className="pd-book-button" type="button" disabled={!selectedSlot || pitch.status !== 'Available'} onClick={continueBooking}>Đặt sân ngay <span>→</span></button>
            <p className="pd-booking-help">Bạn sẽ kiểm tra lại thông tin trước khi xác nhận đặt sân.</p>
            <div className="pd-trust-note"><span>✓</span><p><strong>Giá rõ ràng</strong><br />Giá theo khung giờ được tải từ hệ thống.</p></div>
            <div className="pd-trust-note"><span>◷</span><p><strong>Lịch trống cập nhật</strong><br />Khung giờ đã qua hoặc đã đặt sẽ không thể chọn.</p></div>
          </aside>
        </div>
      </main>
      <footer className="pd-footer"><div><Logo /><span>Đặt sân dễ dàng. Trận đấu trọn vẹn.</span></div><p>© {new Date().getFullYear()} Đặt Sân Nhanh</p></footer>
    </div>
  )
}
