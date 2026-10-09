import { apiFetch } from '../../lib/api'

export interface ForgotPasswordResponse {
  message: string
  expires_in_seconds: number
  resend_after_seconds: number
}

export interface ResetPasswordResponse {
  message: string
}

export function requestPasswordReset(identifier: string) {
  return apiFetch<ForgotPasswordResponse>('/auth/forgot-password', {
    method: 'POST',
    body: { identifier: identifier.trim() },
  })
}

export function resetPassword(
  identifier: string,
  otp: string,
  newPassword: string,
  confirmPassword: string,
) {
  return apiFetch<ResetPasswordResponse>('/auth/reset-password', {
    method: 'POST',
    body: { identifier: identifier.trim(), otp: otp.trim(), newPassword, confirmPassword },
  })
}
