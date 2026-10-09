import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { AuthLayout } from '../components/AuthLayout'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import { requestPasswordReset, resetPassword } from '../features/auth/passwordResetApi'
import { ApiError } from '../lib/api'
import './ForgotPasswordPage.css'

type Step = 'request' | 'reset' | 'success'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('request')
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  async function handleRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    const value = identifier.trim()
    if (!value) {
      setError('Vui lòng nhập email hoặc số điện thoại.')
      return
    }
    if (value.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Email chưa đúng định dạng.')
      return
    }
    if (!value.includes('@') && !/^[0-9+\s().-]{9,16}$/.test(value)) {
      setError('Vui lòng nhập email hoặc số điện thoại hợp lệ.')
      return
    }

    setLoading(true)
    try {
      const result = await requestPasswordReset(value)
      setNotice(result.message || 'Nếu tài khoản tồn tại và có email, mã OTP đã được gửi. Vui lòng kiểm tra hộp thư.')
      setStep('reset')
      setResendSeconds(result.resend_after_seconds || 60)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Không gửi được mã xác thực. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Mã OTP phải gồm đúng 6 chữ số.')
      return
    }
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.')
      return
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setError('Mật khẩu mới quá dài. Vui lòng dùng tối đa 72 byte.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.')
      return
    }

    setLoading(true)
    try {
      const result = await resetPassword(identifier, otp, newPassword, confirmPassword)
      setNotice(result.message || 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.')
      setStep('success')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Không đặt lại được mật khẩu. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendSeconds > 0 || loading) return
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      const result = await requestPasswordReset(identifier)
      setNotice(result.message || 'Nếu tài khoản tồn tại và có email, mã OTP đã được gửi.')
      setResendSeconds(result.resend_after_seconds || 60)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Không gửi lại được mã. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="forgot">
        <div className="forgot__eyebrow">HỖ TRỢ TÀI KHOẢN</div>
        <h1 className="forgot__title">
          {step === 'request' && 'Quên mật khẩu?'}
          {step === 'reset' && 'Đặt lại mật khẩu'}
          {step === 'success' && 'Đổi mật khẩu thành công'}
        </h1>
        <p className="forgot__subtitle">
          {step === 'request' && 'Đừng lo! Hãy nhập email hoặc số điện thoại đã đăng ký để nhận mã xác thực.'}
          {step === 'reset' && <>Nhập mã OTP đã gửi đến email của bạn và tạo mật khẩu mới cho tài khoản <strong>{identifier}</strong>.</>}
          {step === 'success' && 'Mật khẩu của bạn đã được cập nhật. Hãy đăng nhập để tiếp tục đặt sân.'}
        </p>

        {step === 'request' && (
          <form className="forgot__form" onSubmit={handleRequestOtp} noValidate>
            <Field
              label="Email hoặc số điện thoại"
              name="identifier"
              type="text"
              autoComplete="username"
              placeholder="vd: ban@email.com"
              value={identifier}
              onChange={(event) => { setIdentifier(event.target.value); setError(null) }}
              required
            />
            {error && <Alert variant="error">{error}</Alert>}
            <Button type="submit" fullWidth loading={loading} loadingText="Đang gửi mã…">Gửi mã xác thực</Button>
          </form>
        )}

        {step === 'reset' && (
          <form className="forgot__form" onSubmit={handleResetPassword} noValidate>
            <Field
              label="Mã OTP (6 chữ số)"
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Nhập mã trong email"
              maxLength={6}
              value={otp}
              onChange={(event) => { setOtp(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
              required
            />
            <Field
              label="Mật khẩu mới"
              name="newPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Ít nhất 8 ký tự"
              value={newPassword}
              onChange={(event) => { setNewPassword(event.target.value); setError(null) }}
              endAdornment={<button type="button" className="forgot__toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPassword ? 'Ẩn' : 'Hiện'}</button>}
              required
            />
            <Field
              label="Xác nhận mật khẩu mới"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
              value={confirmPassword}
              onChange={(event) => { setConfirmPassword(event.target.value); setError(null) }}
              endAdornment={<button type="button" className="forgot__toggle" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}>{showConfirmPassword ? 'Ẩn' : 'Hiện'}</button>}
              required
            />
            {notice && <Alert variant="success">{notice}</Alert>}
            {error && <Alert variant="error">{error}</Alert>}
            <Button type="submit" fullWidth loading={loading} loadingText="Đang cập nhật…">Đặt lại mật khẩu</Button>
            <button type="button" className="forgot__resend" disabled={loading || resendSeconds > 0} onClick={handleResend}>
              {resendSeconds > 0 ? `Gửi lại mã sau ${resendSeconds} giây` : 'Gửi lại mã OTP'}
            </button>
            <button type="button" className="forgot__back" onClick={() => { setStep('request'); setError(null); setNotice(null) }}>← Đổi email / số điện thoại</button>
          </form>
        )}

        {step === 'success' && (
          <div className="forgot__success">
            <div className="forgot__success-icon" aria-hidden="true">✓</div>
            {notice && <Alert variant="success">{notice}</Alert>}
            <Button type="button" fullWidth onClick={() => navigate('/login', { replace: true })}>Đến trang đăng nhập</Button>
          </div>
        )}

        <p className="forgot__footer"><Link to="/login">← Quay lại đăng nhập</Link></p>
      </div>
    </AuthLayout>
  )
}
