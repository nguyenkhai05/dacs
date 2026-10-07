// Kiểm tra dữ liệu nhập ở phía trình duyệt để báo lỗi NGAY, không cần chờ server.
// Đây chỉ là tiện ích cho người dùng: backend vẫn kiểm tra lại, vì client có thể bị qua mặt.

export interface LoginValues {
  identifier: string
  password: string
}

export type LoginErrors = Partial<Record<keyof LoginValues, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9]{10,11}$/ // khớp quy tắc đăng ký ở backend

export function validateLogin(values: LoginValues): LoginErrors {
  const errors: LoginErrors = {}
  const identifier = values.identifier.trim()

  if (!identifier) {
    errors.identifier = 'Vui lòng nhập email hoặc số điện thoại'
  } else if (!EMAIL_PATTERN.test(identifier) && !PHONE_PATTERN.test(identifier)) {
    errors.identifier = 'Nhập email hợp lệ hoặc số điện thoại 10–11 chữ số'
  }

  // Khi đăng nhập KHÔNG kiểm tra độ dài tối thiểu: tài khoản cũ có thể có mật khẩu ngắn hơn
  if (!values.password) {
    errors.password = 'Vui lòng nhập mật khẩu'
  }

  return errors
}
