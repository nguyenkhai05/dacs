import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import './RequireRole.css'

interface RequireRoleProps {
  /** Chỉ cần có MỘT trong các vai trò này là được vào */
  roles: string[]
  children: ReactNode
}

/** Chặn trang theo vai trò. Chưa đăng nhập → /login?mode=admin; sai vai trò → trang báo không có quyền. */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, signOut } = useAuth()
  const location = useLocation()

  if (!user) {
    return (
      <Navigate
        to="/login?mode=admin"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  if (!user.roles.some((role) => roles.includes(role))) {
    return (
      <div className="admin-denied" role="alert">
        <h1>Bạn không có quyền truy cập</h1>
        <p>Tài khoản <strong>{user.full_name}</strong> không thuộc nhóm quản trị.</p>
        <div>
          <button type="button" onClick={signOut}>Đăng xuất để dùng tài khoản khác</button>
          <Link to="/">Về trang chủ</Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
