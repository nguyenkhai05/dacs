import type { RegisterValues } from '../features/auth/registerApi'

export type RegisterErrors = Partial<Record<keyof RegisterValues, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9]{10,11}$/

/**
 * Kiểm tra nhanh ở phía trình duyệt.
 * Backend vẫn kiểm tra lại toàn bộ dữ liệu khi nhận request.
 */
export function validateRegister(values: RegisterValues): RegisterErrors {
  const errors: RegisterErrors = {}
  const fullName = values.fullName.trim()
  const phoneNumber = values.phoneNumber.trim()
  const email = values.email.trim()

  if (!fullName) {
    errors.fullName = 'Vui lòng nhập họ và tên'
  } else if (fullName.length > 100) {
    errors.fullName = 'Họ và tên tối đa 100 ký tự'
  }

  if (!phoneNumber) {
    errors.phoneNumber = 'Vui lòng nhập số điện thoại'
  } else if (!PHONE_PATTERN.test(phoneNumber)) {
    errors.phoneNumber = 'Số điện thoại phải có 10–11 chữ số'
  }

  if (!email) {
    errors.email = 'Vui lòng nhập email'
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Nhập email hợp lệ'
  } else if (email.length > 254) {
    errors.email = 'Email tối đa 254 ký tự'
  }

  if (!values.password) {
    errors.password = 'Vui lòng nhập mật khẩu'
  } else if (values.password.length < 8) {
    errors.password = 'Mật khẩu phải có ít nhất 8 ký tự'
  } else if (new TextEncoder().encode(values.password).length > 72) {
    errors.password = 'Mật khẩu tối đa 72 byte'
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Vui lòng xác nhận mật khẩu'
  } else if (values.password !== values.confirmPassword) {
    errors.confirmPassword = 'Mật khẩu xác nhận không khớp'
  }

  if (!values.acceptedTerms) {
    errors.acceptedTerms = 'Bạn cần đồng ý với điều khoản sử dụng'
  }

  return errors
}
