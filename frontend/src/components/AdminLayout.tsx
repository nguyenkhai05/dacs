import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { formatVnDateTime } from '../lib/format'
import { Logo } from './Logo'
import './AdminLayout.css'

interface NavItem {
  id: string
  label: string
  /** Chưa có `to` = màn hình chưa làm → hiện mờ "Sắp có". Làm xong màn nào thì điền `to` ở đây. */
  to?: string
  /** Chỉ Admin thấy (nhân viên không quản lý người dùng và vai trò) */
  adminOnly?: boolean
  icon: string
}

export const ADMIN_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Tổng quan & báo cáo', to: '/admin', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  { id: 'bookings', label: 'Đơn đặt & lịch sân', to: '/admin/bookings', icon: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4' },
  { id: 'pitches', label: 'Sân & bảng giá', to: '/admin/pitches', icon: 'M3 6h18v12H3zM12 6v12M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0' },
  { id: 'services', label: 'Dịch vụ', icon: 'M12 3l8 4v10l-8 4-8-4V7zM12 12l8-5M12 12v9M12 12L4 7' },
  { id: 'payments', label: 'Thanh toán & hoàn cọc', to: '/admin/payments', icon: 'M3 6h18v12H3zM3 10h18M7 15h4' },
  { id: 'users', label: 'Người dùng', to: '/admin/users', adminOnly: true, icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M17 11a2.5 2.5 0 1 0 0-5M18 15c2 .5 3 2 3 5' },
  { id: 'logs', label: 'Nhật ký hệ thống', icon: 'M12 7v5l3 2M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4' },
]

/** Đường dẫn của một màn quản trị (undefined nếu màn đó chưa làm). */
export const adminRoute = (id: string): string | undefined => ADMIN_NAV.find((item) => item.id === id)?.to

interface AdminLayoutProps {
  /** Tên màn hình hiện trong "Quản trị / ..." */
  breadcrumb: string
  children: ReactNode
}

/** Khung chung của mọi màn quản trị: thanh bên + thanh trên. */
export function AdminLayout({ breadcrumb, children }: AdminLayoutProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const isAdmin = Boolean(user?.roles.includes('Admin'))
  const roleLabel = isAdmin ? 'Admin' : 'Nhân viên'

  return (
    <div className="adl">
      <aside className="adl-sidebar">
        <div className="adl-brand"><Logo /></div>

        <nav aria-label="Menu quản trị">
          <p className="adl-sidebar__title">Không gian quản lý</p>
          <ul className="adl-nav">
            {ADMIN_NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
              <li key={item.id}>
                {item.to ? (
                  <NavLink to={item.to} end className={({ isActive }) => `adl-nav__item${isActive ? ' is-active' : ''}`}>
                    <NavIcon path={item.icon} />
                    {item.label}
                  </NavLink>
                ) : (
                  <span className="adl-nav__item is-disabled" aria-disabled="true" title="Sắp có">
                    <NavIcon path={item.icon} />
                    {item.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="adl-role">
          <strong>Vai trò: {roleLabel}</strong>
          <p>Nhân viên dùng cùng giao diện, không có quyền quản lý người dùng và vai trò.</p>
        </div>

        <p className="adl-sidebar__foot">Đặt Sân Nhanh / Quản trị</p>
      </aside>

      <div className="adl-body">
        <header className="adl-topbar">
          <p className="adl-breadcrumb">Quản trị / {breadcrumb}</p>
          <div className="adl-topbar__right">
            <time dateTime={now.toISOString()}>{formatVnDateTime(now)}</time>
            <span className="adl-pill">{roleLabel}</span>
            <strong>{user?.full_name}</strong>
            <button
              type="button"
              className="adl-logout"
              onClick={() => {
                signOut()
                navigate('/login?mode=admin')
              }}
            >
              Đăng xuất
            </button>
          </div>
        </header>

        <main className="adl-main">{children}</main>
      </div>
    </div>
  )
}

function NavIcon({ path }: { path: string }) {
  return (
    <svg className="adl-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
