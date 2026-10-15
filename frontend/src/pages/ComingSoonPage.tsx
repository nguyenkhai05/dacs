import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'

interface ComingSoonPageProps {
  title: string
  /** Liên kết quay lại. Mặc định về trang đăng nhập (dùng cho Đăng ký, Quên mật khẩu). */
  backTo?: string
  backLabel?: string
}

// Trang tạm cho các màn chưa làm để các liên kết không bị hỏng.
export default function ComingSoonPage({
  title,
  backTo = '/login',
  backLabel = '← Quay lại đăng nhập',
}: ComingSoonPageProps) {
  return (
    <AuthLayout>
      <h1>{title}</h1>
      <p style={{ margin: '12px 0' }}>Màn hình này sẽ được làm ở bước tiếp theo.</p>
      <Link to={backTo}>{backLabel}</Link>
    </AuthLayout>
  )
}
