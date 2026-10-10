import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/useAuth'
import { apiFetch } from '../lib/api'
import './PitchListPage.css'

type PitchCategory = { category_id: number; category_name: string; description: string | null }
type PitchCard = {
  pitch_id: number
  pitch_name: string
  image_url: string | null
  surface_type: string
  district?: string | null
  category_id: number
  category_name: string
  price_from: number | null
  free_slots: number
  availability: 'Available' | 'Full'
}
type HomeResponse = { categories: PitchCategory[] }
type SearchResponse = {
  page: number
  limit: number
  total: number
  total_pages: number
  pitches: PitchCard[]
}
type Filters = {
  q: string
  date: string
  categoryId: string
  district: string
  minPrice: string
  maxPrice: string
  amenities: string[]
  sort: 'available' | 'price_asc' | 'price_desc'
}
const AMENITIES = ['Đèn chiếu sáng', 'Wifi', 'Nước uống', 'Bãi giữ xe']
const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=900&q=85',
]
function todayLocal() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function price(value: number | null) {
  return value == null || !Number.isFinite(value) ? 'Liên hệ' : `${new Intl.NumberFormat('vi-VN').format(value)}đ`
}
const initialFilters = (): Filters => ({
  q: '', date: todayLocal(), categoryId: '', district: '',
  minPrice: '', maxPrice: '', amenities: [], sort: 'available',
})

export default function PitchListPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => {
    const initial = initialFilters()
    return {
      ...initial,
      q: searchParams.get('q') ?? '',
      date: searchParams.get('date') ?? initial.date,
      categoryId: searchParams.get('category_id') ?? '',
    }
  })
  const [categories, setCategories] = useState<PitchCategory[]>([])
  const [result, setResult] = useState<SearchResponse>({ page: 1, limit: 9, total: 0, total_pages: 1, pitches: [] })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<HomeResponse>(`/home?date=${encodeURIComponent(filters.date)}`)
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]))
  }, [filters.date])

  const runSearch = useCallback(async (nextPage = 1, nextFilters = filters) => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({
      date: nextFilters.date,
      page: String(nextPage),
      limit: '9',
      sort: nextFilters.sort,
    })
    if (nextFilters.q.trim()) params.set('q', nextFilters.q.trim())
    if (nextFilters.categoryId) params.set('category_id', nextFilters.categoryId)
    if (nextFilters.district.trim()) params.set('district', nextFilters.district.trim())
    if (nextFilters.minPrice !== '') params.set('min_price', nextFilters.minPrice)
    if (nextFilters.maxPrice !== '') params.set('max_price', nextFilters.maxPrice)
    if (nextFilters.amenities.length) params.set('amenities', nextFilters.amenities.join(','))
    try {
      const data = await apiFetch<SearchResponse>(`/home/pitches?${params.toString()}`)
      setResult(data)
      setPage(data.page)
      setSearchParams(params, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách sân.')
      setResult({ page: 1, limit: 9, total: 0, total_pages: 1, pitches: [] })
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }, [filters, setSearchParams])

  useEffect(() => { void runSearch(1, filters) }, []) // tải danh sách lần đầu

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }
  const toggleAmenity = (amenity: string) => {
    update('amenities', filters.amenities.includes(amenity)
      ? filters.amenities.filter((item) => item !== amenity)
      : [...filters.amenities, amenity])
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (filters.minPrice && filters.maxPrice && Number(filters.minPrice) > Number(filters.maxPrice)) {
      setError('Giá tối thiểu không được lớn hơn giá tối đa.')
      return
    }
    setSearching(true)
    void runSearch(1, filters)
  }
  const clearFilters = () => {
    const clean = initialFilters()
    setFilters(clean)
    setPage(1)
    setSearching(true)
    void runSearch(1, clean)
  }
  const pages = useMemo(() => Array.from({ length: result.total_pages }, (_, i) => i + 1), [result.total_pages])

  return (
    <div className="pitch-list-page">
      <header className="pl-header">
        <div className="pl-header__inner">
          <Link to="/" className="pl-brand" aria-label="Đặt Sân Nhanh - Trang chủ"><Logo /></Link>
          <nav className="pl-nav" aria-label="Điều hướng chính">
            <Link to="/">Trang chủ</Link><Link className="is-active" to="/pitches">Tìm sân</Link><a href="/#loi-ich">Về chúng tôi</a>
          </nav>
          <div className="pl-header__actions">
            {user ? <><span className="pl-greeting">Xin chào, {user.full_name}</span><button className="pl-auth-button pl-auth-button--outline" onClick={signOut}>Đăng xuất</button></> :
              <><Link className="pl-login" to="/login">Đăng nhập</Link><Link className="pl-auth-button" to="/register">Đăng ký</Link></>}
          </div>
        </div>
      </header>

      <main className="pl-main">
        <div className="pl-breadcrumb"><Link to="/">Trang chủ</Link><span>›</span><span>Tìm sân</span></div>
        <section className="pl-intro">
          <div><span className="pl-eyebrow">TÌM SÂN PHÙ HỢP</span><h1>Danh sách sân</h1><p>Lọc theo khu vực, loại sân, giá thuê và tiện ích để tìm nơi chơi phù hợp với đội của bạn.</p></div>
          <div className="pl-intro__note"><span>✓</span> Giá tham khảo theo ngày chơi đã chọn</div>
        </section>

        <form className="pl-searchbar" onSubmit={submit}>
          <label className="pl-searchbar__field"><span>⌕</span><div><small>Tên sân</small><input value={filters.q} onChange={(e) => update('q', e.target.value)} placeholder="Ví dụ: Sân Bình An" /></div></label>
          <label className="pl-searchbar__field"><span>▦</span><div><small>Ngày chơi</small><input type="date" min={todayLocal()} value={filters.date} onChange={(e) => update('date', e.target.value)} required /></div></label>
          <button className="pl-primary-button" type="submit" disabled={searching}>{searching ? 'Đang tìm…' : 'Tìm sân'} <span>→</span></button>
        </form>

        <div className="pl-content">
          <aside className="pl-filters">
            <div className="pl-filters__heading"><div><span className="pl-filter-icon">☷</span><h2>Bộ lọc</h2></div><button type="button" onClick={clearFilters}>Xóa tất cả</button></div>
            <div className="pl-filter-group"><label className="pl-filter-title" htmlFor="pl-district">Địa điểm / Quận huyện</label><input id="pl-district" className="pl-control" value={filters.district} onChange={(e) => update('district', e.target.value)} placeholder="Nhập tên quận / huyện" /><p className="pl-hint">Nhập đúng tên quận/huyện trong dữ liệu sân.</p></div>
            <div className="pl-filter-group"><label className="pl-filter-title" htmlFor="pl-category">Loại sân / Quy mô</label><select id="pl-category" className="pl-control" value={filters.categoryId} onChange={(e) => update('categoryId', e.target.value)}><option value="">Tất cả loại sân</option>{categories.map((category) => <option key={category.category_id} value={category.category_id}>{category.category_name}</option>)}</select></div>
            <div className="pl-filter-group"><p className="pl-filter-title">Khoảng giá (đ/giờ)</p><div className="pl-price-inputs"><label><span>Từ</span><input className="pl-control" type="number" min="0" step="10000" value={filters.minPrice} onChange={(e) => update('minPrice', e.target.value)} placeholder="0" /></label><span className="pl-price-dash">—</span><label><span>Đến</span><input className="pl-control" type="number" min="0" step="10000" value={filters.maxPrice} onChange={(e) => update('maxPrice', e.target.value)} placeholder="Không giới hạn" /></label></div><div className="pl-price-presets"><button type="button" onClick={() => { update('minPrice', ''); update('maxPrice', '200000') }}>Dưới 200k</button><button type="button" onClick={() => { update('minPrice', '200000'); update('maxPrice', '500000') }}>200k–500k</button></div></div>
            <div className="pl-filter-group"><p className="pl-filter-title">Tiện ích đi kèm</p><div className="pl-checkboxes">{AMENITIES.map((amenity) => <label key={amenity}><input type="checkbox" checked={filters.amenities.includes(amenity)} onChange={() => toggleAmenity(amenity)} /><span className="pl-custom-check">✓</span><span>{amenity}</span></label>)}</div></div>
            <button className="pl-primary-button pl-filter-submit" type="button" disabled={searching} onClick={() => { setSearching(true); void runSearch(1, filters) }}>Áp dụng bộ lọc <span>→</span></button>
          </aside>

          <section className="pl-results" aria-label="Kết quả tìm sân">
            <div className="pl-results__top"><div><h2>Sân thể thao phù hợp</h2><p>{loading ? 'Đang tải danh sách sân…' : `Tìm thấy ${new Intl.NumberFormat('vi-VN').format(result.total)} sân phù hợp`}</p></div><label className="pl-sort"><span>Sắp xếp:</span><select value={filters.sort} onChange={(e) => { const sort = e.target.value as Filters['sort']; update('sort', sort); const next = { ...filters, sort }; setSearching(true); void runSearch(1, next) }}><option value="available">Còn sân trước</option><option value="price_asc">Giá thấp đến cao</option><option value="price_desc">Giá cao đến thấp</option></select></label></div>

            {error && <div className="pl-error" role="alert"><span>{error}</span><button type="button" onClick={() => { setSearching(true); void runSearch(page, filters) }}>Thử lại</button></div>}
            {loading ? <div className="pl-grid">{[1, 2, 3, 4, 5, 6].map((n) => <div className="pl-skeleton" key={n}><div className="pl-skeleton__image" /><div className="pl-skeleton__line" /><div className="pl-skeleton__line short" /></div>)}</div> :
              result.pitches.length ? <div className="pl-grid">{result.pitches.map((pitch, index) => <article className="pl-card" key={pitch.pitch_id}>
                <div className="pl-card__image-wrap"><img src={pitch.image_url || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]} alt={`Hình ảnh ${pitch.pitch_name}`} loading="lazy" onError={(event) => { event.currentTarget.src = FALLBACK_IMAGES[index % FALLBACK_IMAGES.length] }} /><span className={`pl-status ${pitch.availability === 'Available' ? 'available' : 'full'}`}>{pitch.availability === 'Available' ? 'Còn ca trống' : 'Đã kín ca'}</span><button className="pl-favorite" type="button" aria-label={`Lưu ${pitch.pitch_name}`} title="Tính năng yêu thích sẽ được bổ sung">♡</button></div>
                <div className="pl-card__body"><div className="pl-card__meta">{pitch.category_name || 'Sân thể thao'} <span>·</span> {pitch.surface_type || 'Mặt sân tiêu chuẩn'}</div><h3>{pitch.pitch_name}</h3><p className="pl-card__location"><span>⌖</span>{pitch.district || 'Địa điểm đang cập nhật'}</p><div className="pl-card__availability"><span>✓</span>{pitch.free_slots} khung giờ còn trống</div><div className="pl-card__footer"><div><small>Giá từ</small><strong>{price(pitch.price_from)}<small>/giờ</small></strong></div><button type="button" className="pl-detail-button" onClick={() => navigate(`/pitches/${pitch.pitch_id}?date=${encodeURIComponent(filters.date)}`)}>Xem chi tiết <span>↗</span></button></div></div>
              </article>)}</div> : <div className="pl-empty"><span>⚽</span><h3>Chưa tìm thấy sân phù hợp</h3><p>Hãy thử đổi ngày chơi hoặc nới rộng bộ lọc để xem thêm kết quả.</p><button type="button" className="pl-primary-button" onClick={clearFilters}>Xóa bộ lọc</button></div>}

            {!loading && result.total_pages > 1 && <nav className="pl-pagination" aria-label="Phân trang"><button type="button" disabled={page <= 1} onClick={() => { setSearching(true); void runSearch(page - 1) }}>← Trước</button>{pages.map((number) => <button type="button" key={number} className={number === page ? 'active' : ''} aria-current={number === page ? 'page' : undefined} onClick={() => { setSearching(true); void runSearch(number) }}>{number}</button>)}<button type="button" disabled={page >= result.total_pages} onClick={() => { setSearching(true); void runSearch(page + 1) }}>Sau →</button></nav>}
          </section>
        </div>
      </main>
      <footer className="pl-footer"><div><Logo /><span>Đặt sân dễ dàng. Trận đấu trọn vẹn.</span></div><p>© {new Date().getFullYear()} Đặt Sân Nhanh</p></footer>
    </div>
  )
}
