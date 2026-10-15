import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { getInitials } from '../features/bookings/bookingView'
import { Logo } from './Logo'
import './SiteHeader.css'

interface SiteHeaderProps {
  /** Mục menu đang được chọn */
  active?: 'home' | 'pitches' | 'bookings' | 'account'
}

/** Thanh đầu trang dùng chung cho các màn của khách hàng. */
export function SiteHeader({ active }: SiteHeaderProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Đóng menu tài khoản khi bấm ra ngoài hoặc nhấn Escape
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

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
          {user ? (
            <Link to="/bookings" className={active === 'bookings' ? 'is-active' : undefined}>
              Lịch đặt của tôi
            </Link>
          ) : (
            <Link to="/#loi-ich">Về chúng tôi</Link>
          )}
        </nav>

        <div className="sh__actions">
          {user ? (
            <div className="sh__account" ref={menuRef}>
              <button
                type="button"
                className="sh__user"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="sh__avatar" aria-hidden="true">
                  {getInitials(user.full_name)}
                </span>
                <span className="sh__name">{user.full_name}</span>
                <span className="sh__chevron" aria-hidden="true">
                  ⌄
                </span>
              </button>
              {menuOpen && (
                <div className="sh__menu" role="menu">
                  <Link to="/account" role="menuitem" onClick={() => setMenuOpen(false)}>
                    Tài khoản của tôi
                  </Link>
                  <Link to="/bookings" role="menuitem" onClick={() => setMenuOpen(false)}>
                    Lịch đặt của tôi
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      signOut()
                      navigate('/login')
                    }}
                  >
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
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
