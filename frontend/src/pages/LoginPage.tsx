import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import { adminLogin, hasAdminRole, login } from '../features/auth/authApi'
import { useAuth } from '../features/auth/useAuth'
import { ApiError } from '../lib/api'
import { validateLogin } from '../lib/validation'
import type { LoginErrors, LoginValues } from '../lib/validation'
import './LoginPage.css'

export default function LoginPage() {
  const { user, signIn } = useAuth()
  const location = useLocation()

  // Loại tài khoản đăng nhập: khách hàng hoặc quản trị (vào được bằng /login?mode=admin hoặc khi bị chuyển từ /admin)
  const initialState = location.state as { from?: string } | null
  const [mode, setMode] = useState<'customer' | 'admin'>(() =>
    new URLSearchParams(location.search).get('mode') === 'admin' || initialState?.from?.startsWith('/admin')
      ? 'admin'
      : 'customer',
  )
  const isAdminMode = mode === 'admin'

  // 1) STATE: mọi thứ giao diện cần "nhớ" giữa các lần vẽ lại
  const [values, setValues] = useState<LoginValues>({ identifier: '', password: '' })
  const [errors, setErrors] = useState<LoginErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)

  // Trang người dùng định vào trước khi bị chuyển sang /login (do RequireAuth gắn vào)
  const locationState = location.state as { from?: string; registered?: boolean } | null
  // Chỉ chấp nhận đường dẫn nội bộ (bắt đầu bằng 1 dấu "/") để tránh bị chuyển sang trang lạ
  const queryRedirect = new URLSearchParams(location.search).get('redirect')
  const safeQueryRedirect =
    queryRedirect && queryRedirect.startsWith('/') && !queryRedirect.startsWith('//')
      ? queryRedirect
      : null
  const redirectTo = locationState?.from ?? safeQueryRedirect ?? '/'

  // Đã đăng nhập rồi (hoặc vừa đăng nhập xong) → chuyển đi, không hiện form nữa.
  // Lưu ý: phải đặt SAU các lệnh useState (quy tắc của Hooks).
  // Quản trị: về /admin (hoặc trang /admin/... đang định vào). Khách hàng: về trang họ định vào.
  const adminFrom = locationState?.from?.startsWith('/admin') ? locationState.from : null
  const destination = isAdminMode ? (adminFrom ?? '/admin') : redirectTo
  // Ở chế độ quản trị mà đang đăng nhập bằng tài khoản khách → vẫn hiện form để đổi sang tài khoản quản trị
  if (user && (!isAdminMode || hasAdminRole(user.roles))) {
    return <Navigate to={destination} replace />
  }

  function switchMode(next: 'customer' | 'admin') {
    setMode(next)
    setServerError(null)
    setErrors({})
  }

  // 2) Input "có kiểm soát" (controlled): giá trị luôn lấy từ state
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    // Người dùng đang sửa → xóa lỗi cũ của ô đó và lỗi từ server
    setErrors((current) => ({ ...current, [name]: undefined }))
    setServerError(null)
  }

  // 3) Gửi form
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault() // chặn trình duyệt tải lại trang
    if (submitting) return

    const found = validateLogin(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return // còn lỗi → dừng, không gọi server

    setSubmitting(true)
    setServerError(null)
    try {
      const result = isAdminMode
        ? await adminLogin(values.identifier, values.password)
        : await login(values.identifier, values.password)
      // Lưu phiên → state của AuthProvider đổi → `user` có giá trị →
      // lần vẽ lại tiếp theo sẽ rơi vào <Navigate> ở trên.
      signIn({ token: result.access_token, user: result.user }, remember)
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : 'Đã có lỗi không mong muốn. Vui lòng thử lại.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="login">
        <div role="group" aria-label="Loại tài khoản" className="login__mode">
          <button type="button" aria-pressed={!isAdminMode} className={!isAdminMode ? 'is-active' : undefined} onClick={() => switchMode('customer')}>
            Khách hàng
          </button>
          <button type="button" aria-pressed={isAdminMode} className={isAdminMode ? 'is-active' : undefined} onClick={() => switchMode('admin')}>
            Quản trị
          </button>
        </div>

        <div>
          <h1 className="login__title">{isAdminMode ? 'Khu vực quản trị' : 'Chào mừng trở lại'}</h1>
          <p className="login__subtitle">
            {isAdminMode
              ? 'Dành cho quản trị viên và nhân viên sân. Tài khoản khách hàng không đăng nhập được ở đây.'
              : 'Đăng nhập để đặt sân và quản lý lịch đá của bạn.'}
          </p>
        </div>

        {/* noValidate: tắt hộp thoại lỗi mặc định của trình duyệt để dùng thông báo của mình */}
        {locationState?.registered && (
          <Alert variant="success">Đăng ký tài khoản thành công. Vui lòng đăng nhập để tiếp tục.</Alert>
        )}

        <form className="login__form" onSubmit={handleSubmit} noValidate>
          <Field
            label="Email hoặc số điện thoại"
            name="identifier"
            type="text"
            autoComplete="username"
            value={values.identifier}
            onChange={handleChange}
            error={errors.identifier}
          />

          <Field
            label="Mật khẩu"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={values.password}
            onChange={handleChange}
            error={errors.password}
            endAdornment={
              <button
                type="button"
                className="login__toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            }
          />

          <div className="login__options">
            <label className="login__remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Ghi nhớ đăng nhập
            </label>
            <Link to="/forgot-password">Quên mật khẩu?</Link>
          </div>

          {serverError && <Alert variant="error">{serverError}</Alert>}

          <Button type="submit" fullWidth loading={submitting} loadingText="Đang đăng nhập…">
            Đăng nhập
          </Button>
        </form>

        {!isAdminMode && (
          <p className="login__footer">
            Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
          </p>
        )}
      </div>
    </AuthLayout>
  )
}
