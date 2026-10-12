import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { Logo } from './Logo'
import './SiteHeader.css'

interface SiteHeaderProps {
  /** Mục menu đang được chọn */
  active?: 'home' | 'pitches'
}

/** Thanh đầu trang dùng chung cho các màn của khách hàng (trước đây mỗi trang tự viết một bản). */
export function SiteHeader({ active }: SiteHeaderProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="sh">
      <div className="sh__inner">
        <Link to="/" className="sh__brand" aria-label="Đặt Sân Nhanh - Trang chủ">
          <Logo />
        </Link>

        <nav className="sh__nav" aria-label="Điều hướng chính">
          <Link to="/" className={active === 'home' ? 'is-active' : undefined}>
            Trang chủ
          </Link>
          <Link to="/pitches" className={active === 'pitches' ? 'is-active' : undefined}>
            Tìm sân
          </Link>
          <Link to="/#loi-ich">Về chúng tôi</Link>
        </nav>

        <div className="sh__actions">
          {user ? (
            <>
              <span className="sh__greeting">Xin chào, {user.full_name}</span>
              <button
                type="button"
                className="sh__button sh__button--outline"
                onClick={() => {
                  signOut()
                  navigate('/login')
                }}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="sh__login">
                Đăng nhập
              </Link>
              <Link to="/register" className="sh__button">
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
