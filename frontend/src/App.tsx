import { Navigate, Route, Routes } from 'react-router-dom'
import ComingSoonPage from './pages/ComingSoonPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import PitchListPage from './pages/PitchListPage'
import PitchDetailPage from './pages/PitchDetailPage'

// Bảng định tuyến: địa chỉ trên thanh URL → trang nào được vẽ
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/pitches" element={<PitchListPage />} />
      <Route path="/pitches/:id" element={<PitchDetailPage />} />
      <Route path="/booking" element={<ComingSoonPage title="Đặt sân và dịch vụ đi kèm" />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
