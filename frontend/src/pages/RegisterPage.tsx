import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import { register } from '../features/auth/registerApi'
import type { RegisterValues } from '../features/auth/registerApi'
import { ApiError } from '../lib/api'
import { validateRegister } from '../lib/registerValidation'
import type { RegisterErrors } from '../lib/registerValidation'
import './RegisterPage.css'

const INITIAL_VALUES: RegisterValues = {
  fullName: '',
  phoneNumber: '',
  email: '',
  password: '',
  confirmPassword: '',
  acceptedTerms: false,
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState<RegisterValues>(INITIAL_VALUES)
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  function clearFieldError(name: keyof RegisterValues) {
    setErrors((current) => ({ ...current, [name]: undefined }))
    setServerError(null)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target
    const field = name as keyof RegisterValues
    setValues((current) => ({ ...current, [field]: value }))
    clearFieldError(field)
  }

  function handleTermsChange(event: ChangeEvent<HTMLInputElement>) {
    setValues((current) => ({ ...current, acceptedTerms: event.target.checked }))
    clearFieldError('acceptedTerms')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const found = validateRegister(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    setServerError(null)

    try {
      await register(values)
      navigate('/login', {
        replace: true,
        state: { registered: true },
      })
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.message
          : 'Đã có lỗi không mong muốn. Vui lòng thử lại.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="register">
        <div>
          <h1 className="register__title">Tạo tài khoản</h1>
          <p className="register__subtitle">
            Đăng ký để đặt sân nhanh chóng và quản lý lịch đá của bạn.
          </p>
        </div>

        <form className="register__form" onSubmit={handleSubmit} noValidate>
          <Field
            label="Họ và tên"
            name="fullName"
            type="text"
            autoComplete="name"
            placeholder="Nguyễn Văn A"
            value={values.fullName}
            onChange={handleChange}
            error={errors.fullName}
          />

          <div className="register__grid">
            <Field
              label="Số điện thoại"
              name="phoneNumber"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="0901234567"
              value={values.phoneNumber}
              onChange={handleChange}
              error={errors.phoneNumber}
            />

            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="ban@example.com"
              value={values.email}
              onChange={handleChange}
              error={errors.email}
            />
          </div>

          <Field
            label="Mật khẩu"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Ít nhất 8 ký tự"
            value={values.password}
            onChange={handleChange}
            error={errors.password}
            endAdornment={
              <button
                type="button"
                className="register__toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            }
          />

          <Field
            label="Xác nhận mật khẩu"
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            value={values.confirmPassword}
            onChange={handleChange}
            error={errors.confirmPassword}
            endAdornment={
              <button
                type="button"
                className="register__toggle"
                onClick={() => setShowConfirmPassword((current) => !current)}
                aria-pressed={showConfirmPassword}
                aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
              >
                {showConfirmPassword ? 'Ẩn' : 'Hiện'}
              </button>
            }
          />

          <div className="register__terms-wrap">
            <label className={`register__terms${errors.acceptedTerms ? ' register__terms--error' : ''}`}>
              <input
                type="checkbox"
                checked={values.acceptedTerms}
                onChange={handleTermsChange}
              />
              <span>
                Tôi đồng ý với <span className="register__terms-link">Điều khoản sử dụng</span> và{' '}
                <span className="register__terms-link">Chính sách bảo mật</span>.
              </span>
            </label>
            {errors.acceptedTerms && (
              <p className="register__terms-error">{errors.acceptedTerms}</p>
            )}
          </div>

          {serverError && <Alert variant="error">{serverError}</Alert>}

          <Button type="submit" fullWidth loading={submitting} loadingText="Đang tạo tài khoản…">
            Đăng ký
          </Button>
        </form>

        <p className="register__footer">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </div>
    </AuthLayout>
  )
}
