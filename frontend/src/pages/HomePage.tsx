import { Button } from '../components/Button'
import { useAuth } from '../features/auth/useAuth'

// Trang tạm sau khi đăng nhập, dùng để thấy kết quả. Sẽ thay bằng màn 04 (Trang chủ).
export default function HomePage() {
  const { user, signOut } = useAuth()

  return (
    <main style={{ maxWidth: 480, margin: '48px auto', padding: 16 }}>
      <h1>Xin chào, {user?.full_name}!</h1>
      <p style={{ margin: '12px 0' }}>Vai trò: {user?.roles.join(', ')}</p>
      <Button onClick={signOut}>Đăng xuất</Button>
    </main>
  )
}
