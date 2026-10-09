import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/useAuth'
import { apiFetch } from '../lib/api'
import './HomePage.css'

type PitchCategory = { category_id: number; category_name: string; description: string | null }
type PitchCard = {
  pitch_id: number
  pitch_name: string
  image_url: string | null
  surface_type: string
  category_id: number
  category_name: string
  price_from: number | null
  free_slots: number
  availability: 'Available' | 'Full'
}
type HomeResponse = { date: string; categories: PitchCategory[]; featured_pitches: PitchCard[] }
type SearchResponse = { date: string; page: number; total: number; total_pages: number; pitches: PitchCard[] }

const fallbackImages = [
  'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1000&q=85',
]

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function formatPrice(price: number | null) {
  if (price === null || !Number.isFinite(price)) return 'Liên hệ'
  return `${new Intl.NumberFormat('vi-VN').format(price)}đ`
}

export default function HomePage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [date, setDate] = useState(localDate)
  const [keyword, setKeyword] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [home, setHome] = useState<HomeResponse | null>(null)
  const [pitches, setPitches] = useState<PitchCard[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  const loadHome = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<HomeResponse>(`/home?date=${encodeURIComponent(date)}`)
      setHome(data)
      setPitches(data.featured_pitches ?? [])
      setHasSearched(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu trang chủ.')
      setHome(null)
      setPitches([])
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { void loadHome() }, [loadHome])

  const searchPitches = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSearching(true)
    setError('')
    const params = new URLSearchParams({ date, page: '1', limit: '12', sort: 'available' })
    if (keyword.trim()) params.set('q', keyword.trim())
    if (categoryId) params.set('category_id', categoryId)
    try {
      const result = await apiFetch<SearchResponse>(`/home/pitches?${params.toString()}`)
      setPitches(result.pitches ?? [])
      setHasSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tìm sân lúc này.')
    } finally {
      setIsSearching(false)
    }
  }

  const heading = useMemo(() => hasSearched ? 'Sân phù hợp với bạn' : 'Sân nổi bật hôm nay', [hasSearched])

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-header__inner">
          <Link to="/" className="home-brand" aria-label="Đặt Sân Nhanh - Trang chủ"><Logo /></Link>
          <nav className="home-nav" aria-label="Điều hướng chính">
            <a href="#tim-san">Tìm sân</a>
            <a href="#san-noi-bat">Sân nổi bật</a>
            <a href="#loi-ich">Về chúng tôi</a>
          </nav>
          <div className="home-header__actions">
            {user ? (
              <>
                <span className="home-user">Xin chào, {user.full_name}</span>
                <button className="home-button home-button--outline" onClick={() => { signOut(); navigate('/login') }}>Đăng xuất</button>
              </>
            ) : (
              <>
                <Link className="home-login" to="/login">Đăng nhập</Link>
                <Link className="home-button home-button--small" to="/register">Đăng ký</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="home-hero">
          <div className="home-hero__content">
            <span className="home-eyebrow"><span className="home-eyebrow__dot" /> ĐẶT SÂN NHANH · CHƠI BÓNG THẢ GA</span>
            <h1>Sân đẹp, giờ hợp.<br /><span>Đặt là sẵn sàng.</span></h1>
            <p>Tìm sân bóng phù hợp, xem giá rõ ràng và đặt lịch chỉ trong vài bước.</p>
            <div className="home-hero__perks"><span>✓ Giá minh bạch</span><span>✓ Xem ca trống</span><span>✓ Đặt sân dễ dàng</span></div>
          </div>
          <div className="home-hero__image" role="img" aria-label="Sân bóng xanh vào buổi chiều">
            <div className="home-hero__image-card"><span className="home-live-dot" /> Sẵn sàng cho trận đấu tiếp theo</div>
          </div>
          <div className="home-hero__shape" aria-hidden="true" />
        </section>

        <section className="home-search-wrap" id="tim-san" aria-label="Tìm kiếm sân bóng">
          <form className="home-search" onSubmit={searchPitches}>
            <label className="home-search__field home-search__keyword">
              <span className="home-field-icon" aria-hidden="true">⌕</span>
              <span className="home-search__label">Bạn muốn chơi ở đâu?</span>
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Nhập tên sân bóng..." />
            </label>
            <label className="home-search__field">
              <span className="home-field-icon" aria-hidden="true">▦</span>
              <span className="home-search__label">Ngày chơi</span>
              <input aria-label="Ngày chơi" type="date" min={localDate()} value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label className="home-search__field">
              <span className="home-field-icon" aria-hidden="true">⚽</span>
              <span className="home-search__label">Loại sân</span>
              <select aria-label="Loại sân" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Tất cả loại sân</option>
                {(home?.categories ?? []).map((category) => <option key={category.category_id} value={category.category_id}>{category.category_name}</option>)}
              </select>
            </label>
            <button className="home-button home-search__submit" type="submit" disabled={isSearching}>
              <span aria-hidden="true">⌕</span> {isSearching ? 'Đang tìm...' : 'Tìm sân ngay'}
            </button>
          </form>
        </section>

        <section className="home-section home-featured" id="san-noi-bat">
          <div className="home-section__heading">
            <div><span className="home-section__eyebrow">CHỌN SÂN, LÊN KÈO</span><h2>{heading}</h2><p>Khám phá sân bóng và mức giá theo ngày bạn muốn chơi.</p></div>
            <span className="home-result-count">{loading ? 'Đang tải...' : `${pitches.length} sân được hiển thị`}</span>
          </div>
          {error && <div className="home-alert" role="alert"><span>{error}</span><button onClick={() => void loadHome()}>Thử lại</button></div>}
          {loading ? (
            <div className="home-pitch-grid">{[1, 2, 3].map((item) => <div className="home-pitch-skeleton" key={item}><div /><span /><span /></div>)}</div>
          ) : pitches.length ? (
            <div className="home-pitch-grid">
              {pitches.map((pitch, index) => (
                <article className="home-pitch-card" key={pitch.pitch_id}>
                  <div className="home-pitch-card__image-wrap">
                    <img className="home-pitch-card__image" src={pitch.image_url || fallbackImages[index % fallbackImages.length]} alt={`Hình ảnh ${pitch.pitch_name}`} loading="lazy" onError={(event) => { event.currentTarget.src = fallbackImages[index % fallbackImages.length] }} />
                    <span className={`home-pitch-status ${pitch.availability === 'Available' ? 'is-available' : 'is-full'}`}>{pitch.availability === 'Available' ? 'Còn ca trống' : 'Đã kín ca'}</span>
                    <span className="home-pitch-card__number">SÂN #{pitch.pitch_id}</span>
                  </div>
                  <div className="home-pitch-card__body">
                    <div className="home-pitch-card__category">{pitch.category_name || 'Sân bóng'} <span>·</span> {pitch.surface_type || 'Mặt sân tiêu chuẩn'}</div>
                    <h3>{pitch.pitch_name}</h3>
                    <div className="home-pitch-card__availability"><span className="home-check">✓</span> {pitch.free_slots} khung giờ còn trống</div>
                    <div className="home-pitch-card__footer"><div><small>Giá từ</small><strong>{formatPrice(pitch.price_from)}<small>/giờ</small></strong></div><button type="button" className="home-card-action" onClick={() => { setKeyword(pitch.pitch_name); document.getElementById('tim-san')?.scrollIntoView({ behavior: 'smooth' }) }} aria-label={`Tìm sân ${pitch.pitch_name}`}>Xem sân <span>↗</span></button></div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="home-empty"><span className="home-empty__icon">⚽</span><h3>Chưa tìm thấy sân phù hợp</h3><p>Thử đổi ngày chơi hoặc từ khóa để xem thêm sân bóng nhé.</p><button className="home-button home-button--outline" onClick={() => { setKeyword(''); setCategoryId(''); void loadHome() }}>Xóa bộ lọc</button></div>
          )}
          {hasSearched && <button className="home-reset-search" onClick={() => { setKeyword(''); setCategoryId(''); void loadHome() }}>← Quay lại sân nổi bật</button>}
        </section>

        <section className="home-benefits" id="loi-ich">
          <div className="home-benefits__intro"><span className="home-section__eyebrow">VÌ SAO CHỌN CHÚNG TÔI?</span><h2>Ít tìm kiếm hơn.<br />Nhiều thời gian chơi hơn.</h2><p>Mọi thứ bạn cần để lên lịch cho trận bóng tiếp theo, gọn gàng trong một nơi.</p></div>
          <div className="home-benefit"><span className="home-benefit__icon">⌕</span><h3>Tìm sân nhanh</h3><p>Lọc theo ngày chơi và loại sân để tìm lựa chọn phù hợp.</p></div>
          <div className="home-benefit"><span className="home-benefit__icon">₫</span><h3>Giá rõ ràng</h3><p>Xem giá theo ngày, kể cả cuối tuần và ngày lễ.</p></div>
          <div className="home-benefit"><span className="home-benefit__icon">◷</span><h3>Chủ động thời gian</h3><p>Kiểm tra số khung giờ còn trống trước khi đặt sân.</p></div>
        </section>
        <section className="home-cta"><div><span className="home-section__eyebrow">TRẬN ĐẤU ĐANG CHỜ</span><h2>Sẵn sàng ra sân chưa?</h2><p>Tìm sân phù hợp và bắt đầu lên lịch cho đội của bạn.</p></div><a className="home-button home-button--light" href="#tim-san">Tìm sân ngay <span>→</span></a></section>
      </main>

      <footer className="home-footer"><div className="home-footer__top"><Logo /><span>Đặt sân dễ dàng. Trận đấu trọn vẹn.</span></div><div className="home-footer__bottom"><span>© {new Date().getFullYear()} Đặt Sân Nhanh</span><span>Được tạo cho những người yêu bóng đá ⚽</span><Link to="/forgot-password">Hỗ trợ tài khoản</Link></div></footer>
    </div>
  )
}
