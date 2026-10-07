import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from './Logo'
import './AuthLayout.css'

// Khung dùng chung cho các màn Đăng nhập / Đăng ký / Quên mật khẩu (màn 01–03):
// bên trái là khối thương hiệu, bên phải là nội dung riêng của từng màn (children).
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <header className="auth-header">
        <Link to="/" aria-label="Về trang chủ Đặt Sân Nhanh">
          <Logo />
        </Link>
      </header>

      <main className="auth-main">
        <div className="auth-card">
          <aside className="auth-hero">
            <h2 className="auth-hero__title">
              Một cuộc hẹn.
              <br />
              Trọn đam mê.
            </h2>
            <p className="auth-hero__text">
              Đặt sân bóng đá, cầu lông, pickleball chỉ trong vài bước. Giữ chỗ
              nhanh, thanh toán cọc qua mã QR.
            </p>
            <div className="auth-hero__photo" role="img" aria-label="Sân bóng cỏ nhân tạo" />
            <ul className="auth-hero__stats">
              <li>
                <strong>02</strong>
                <span>Sân đang mở</span>
              </li>
              <li>
                <strong>06–22h</strong>
                <span>Giờ hoạt động</span>
              </li>
              <li>
                <strong>30%</strong>
                <span>Cọc giữ chỗ</span>
              </li>
            </ul>
          </aside>

          <section className="auth-panel">{children}</section>
        </div>
      </main>
    </div>
  )
}
