import { Link } from 'react-router-dom'
import './SiteFooter.css'

/** Chân trang dùng chung cho các màn của khách hàng. */
export function SiteFooter() {
  return (
    <footer className="sf">
      <div className="sf__inner">
        <span>© {new Date().getFullYear()} Đặt Sân Nhanh • Kết nối đam mê sân cỏ</span>
        <span className="sf__links">
          <Link to="/#quy-dinh">Quy định đặt sân</Link>
          <span aria-hidden="true">·</span>
          <span>0901 234 567</span>
          <span aria-hidden="true">·</span>
          <span>Giờ Việt Nam (UTC+7)</span>
        </span>
      </div>
    </footer>
  )
}
