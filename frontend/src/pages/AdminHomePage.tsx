import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/useAuth'
import { apiFetch, isAbortError } from '../lib/api'
import './AdminHomePage.css'

interface AdminMe {
  user_id: number
  email: string | null
  roles: string[]
}

// Các màn quản trị sẽ làm tiếp (backend đã có API tương ứng)
const UPCOMING = [
  ['13', 'Tổng quan & báo cáo'],
  ['14', 'Đơn đặt & ma trận lịch sân'],
  ['15', 'Sân & bảng giá'],
  ['16', 'Dịch vụ đi kèm'],
  ['17', 'Thanh toán & hoàn cọc'],
  ['18', 'Người dùng & phân quyền'],
  ['19', 'Nhật ký hệ thống'],
] as const

/** Trang khởi đầu của khu vực quản trị (chỗ gắn các màn 13-19 sau này). */
export default function AdminHomePage() {
  const { user, token, signOut } = useAuth()
  const navigate = useNavigate()
  const [me, setMe] = useState<AdminMe | null>(null)
  const [error, setError] = useState('')

  // Xác nhận với server rằng token còn hiệu lực và đúng quyền quản trị
  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    apiFetch<AdminMe>('/auth/admin/me', { token, signal: controller.signal })
      .then(setMe)
      .catch((err) => {
        if (!isAbortError(err)) setError(err instanceof Error ? err.message : 'Không xác thực được phiên quản trị.')
      })
    return () => controller.abort()
  }, [token])

  return (
    <div className="adm-page">
      <header className="adm-header">
        <Logo />
        <span className="adm-badge">Quản trị</span>
        <div className="adm-header__right">
          <span>{user?.full_name}</span>
          <button type="button" onClick={() => { signOut(); navigate('/login?mode=admin') }}>Đăng xuất</button>
        </div>
      </header>

      <main className="adm-main">
        <h1>Xin chào, {user?.full_name}</h1>
        {error ? (
          <p className="adm-error" role="alert">{error}</p>
        ) : (
          <p className="adm-ok">
            {me ? `Phiên quản trị hợp lệ · vai trò: ${me.roles.join(', ')}` : 'Đang xác thực phiên quản trị...'}
          </p>
        )}

        <h2>Các màn hình quản trị</h2>
        <ul className="adm-grid">
          {UPCOMING.map(([no, name]) => (
            <li key={no}><b>{no}</b><span>{name}</span><small>Sắp có</small></li>
          ))}
        </ul>
        <p><Link to="/">← Về trang khách hàng</Link></p>
      </main>
    </div>
  )
}
