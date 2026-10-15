import type { ChangePasswordValues, Profile, ProfilePatch } from '../features/account/accountApi'
import { isValidDateString, todayLocal } from './format'

// Kiểm tra nhanh ở trình duyệt; backend vẫn kiểm tra lại toàn bộ.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9]{10,11}$/

/** Giá trị đang nhập trong form "Thông tin cá nhân" (tất cả là chuỗi). */
export interface ProfileForm {
  fullName: string
  phoneNumber: string
  email: string
  dateOfBirth: string
  address: string
}

export type ProfileErrors = Partial<Record<keyof ProfileForm, string>>

export function profileToForm(profile: Profile): ProfileForm {
  return {
    fullName: profile.full_name,
    phoneNumber: profile.phone_number,
    email: profile.email ?? '',
    dateOfBirth: profile.date_of_birth ?? '',
    address: profile.address ?? '',
  }
}

export function validateProfile(form: ProfileForm, original: Profile, today = todayLocal()): ProfileErrors {
  const errors: ProfileErrors = {}
  const fullName = form.fullName.trim()
  const phoneNumber = form.phoneNumber.trim()
  const email = form.email.trim()

  if (!fullName) errors.fullName = 'Vui lòng nhập họ và tên'
  else if (fullName.length > 100) errors.fullName = 'Họ và tên tối đa 100 ký tự'

  if (!phoneNumber) errors.phoneNumber = 'Vui lòng nhập số điện thoại'
  else if (!PHONE_PATTERN.test(phoneNumber)) errors.phoneNumber = 'Số điện thoại phải có 10–11 chữ số'

  if (!email) {
    // Tài khoản tạo tại quầy có thể chưa có email: cho để trống nếu trước đó cũng trống
    if (original.email) errors.email = 'Email không được để trống'
  } else if (!EMAIL_PATTERN.test(email)) errors.email = 'Nhập email hợp lệ'
  else if (email.length > 254) errors.email = 'Email tối đa 254 ký tự'

  if (form.dateOfBirth) {
    if (!isValidDateString(form.dateOfBirth) || form.dateOfBirth < '1900-01-01') {
      errors.dateOfBirth = 'Ngày sinh không hợp lệ'
    } else if (form.dateOfBirth > today) {
      errors.dateOfBirth = 'Ngày sinh không được ở tương lai'
    }
  }

  if (form.address.trim().length > 255) errors.address = 'Địa chỉ tối đa 255 ký tự'

  return errors
}

/** Chỉ trả về các trường thật sự thay đổi so với hồ sơ hiện tại. */
export function buildProfilePatch(form: ProfileForm, original: Profile): ProfilePatch {
  const patch: ProfilePatch = {}
  const current = profileToForm(original)

  if (form.fullName.trim() !== current.fullName) patch.fullName = form.fullName.trim()
  if (form.phoneNumber.trim() !== current.phoneNumber) patch.phoneNumber = form.phoneNumber.trim()
  if (form.email.trim() !== current.email && form.email.trim()) patch.email = form.email.trim()
  if (form.dateOfBirth !== current.dateOfBirth) patch.dateOfBirth = form.dateOfBirth
  if (form.address.trim() !== current.address.trim()) patch.address = form.address.trim()

  return patch
}

export type PasswordErrors = Partial<Record<keyof ChangePasswordValues, string>>

export function validatePasswordChange(values: ChangePasswordValues): PasswordErrors {
  const errors: PasswordErrors = {}

  if (!values.currentPassword) errors.currentPassword = 'Vui lòng nhập mật khẩu hiện tại'

  if (!values.newPassword) errors.newPassword = 'Vui lòng nhập mật khẩu mới'
  else if (values.newPassword.length < 8) errors.newPassword = 'Mật khẩu mới phải có ít nhất 8 ký tự'
  else if (new TextEncoder().encode(values.newPassword).length > 72) errors.newPassword = 'Mật khẩu mới tối đa 72 byte'
  else if (values.newPassword === values.currentPassword) errors.newPassword = 'Mật khẩu mới phải khác mật khẩu hiện tại'

  if (!values.confirmNewPassword) errors.confirmNewPassword = 'Vui lòng nhập lại mật khẩu mới'
  else if (values.newPassword !== values.confirmNewPassword) errors.confirmNewPassword = 'Mật khẩu xác nhận không khớp'

  return errors
}

const ROLE_LABELS: Record<string, string> = {
  Customer: 'Khách hàng',
  Staff: 'Nhân viên',
  Admin: 'Quản trị viên',
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}

/** "2026-09-03T10:00:00.000Z" → "09/2026" (giờ Việt Nam). Giá trị hỏng → ''. */
export function formatMemberSince(createdAt: string): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date)
  const month = parts.find((part) => part.type === 'month')?.value
  const year = parts.find((part) => part.type === 'year')?.value
  return month && year ? `${month}/${year}` : ''
}
