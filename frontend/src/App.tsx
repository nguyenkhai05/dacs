import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './features/auth/RequireAuth'
import ComingSoonPage from './pages/ComingSoonPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'

// Bảng định tuyến: địa chỉ trên thanh URL → trang nào được vẽ
export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<ComingSoonPage title="Đăng ký" />} />
      <Route path="/forgot-password" element={<ComingSoonPage title="Quên mật khẩu" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
