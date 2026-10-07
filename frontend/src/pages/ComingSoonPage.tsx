import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'

// Trang tạm cho các màn chưa làm (Đăng ký, Quên mật khẩu) để các liên kết không bị hỏng.
export default function ComingSoonPage({ title }: { title: string }) {
  return (
    <AuthLayout>
      <h1>{title}</h1>
      <p style={{ margin: '12px 0' }}>Màn hình này sẽ được làm ở bước tiếp theo.</p>
      <Link to="/login">← Quay lại đăng nhập</Link>
    </AuthLayout>
  )
}
