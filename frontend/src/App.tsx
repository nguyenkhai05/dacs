import { Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import PitchListPage from './pages/PitchListPage'
import PitchDetailPage from './pages/PitchDetailPage'
import BookingPage from './pages/BookingPage'
import PaymentPage from './pages/PaymentPage'
import MyBookingsPage from './pages/MyBookingsPage'
import ComingSoonPage from './pages/ComingSoonPage'
import AccountPage from './pages/AccountPage'
import ReviewsPage from './pages/ReviewsPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { RequireRole } from './features/auth/RequireRole'
import { ADMIN_ROLES } from './features/auth/authApi'
import AdminDashboardPage from './pages/AdminDashboardPage'

// Bảng định tuyến: địa chỉ trên thanh URL → trang nào được vẽ
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/pitches" element={<PitchListPage />} />
      <Route path="/pitches/:id" element={<PitchDetailPage />} />
      <Route path="/pitches/:id/reviews" element={<ReviewsPage />} />
      <Route path="/booking" element={<RequireAuth><BookingPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireRole roles={ADMIN_ROLES}><AdminDashboardPage /></RequireRole>} />
      <Route path="/bookings" element={<RequireAuth><MyBookingsPage /></RequireAuth>} />
      {/* Màn 10 (chi tiết booking) chưa làm: trang tạm để nút "Xem chi tiết" không bị hỏng */}
      <Route path="/bookings/:bookingId" element={<RequireAuth><ComingSoonPage title="Chi tiết đặt sân" backTo="/bookings" backLabel="← Quay lại lịch đặt của tôi" /></RequireAuth>} />
      <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
      <Route path="/payment/:bookingId" element={<RequireAuth><PaymentPage /></RequireAuth>} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
