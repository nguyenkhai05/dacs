import { apiFetch } from '../../lib/api'

/** Dữ liệu GET /users/me (màn 11 - Tài khoản của tôi). */
export interface Profile {
  user_id: number
  full_name: string
  initials: string
  phone_number: string
  email: string | null
  avatar_url: string | null
  /** null nếu chưa nhập hoặc tài khoản không có hồ sơ khách hàng */
  address: string | null
  /** 'YYYY-MM-DD' hoặc null */
  date_of_birth: string | null
  roles: string[]
  created_at: string
}

/** Chỉ gửi những trường muốn đổi; trường nào không gửi sẽ được giữ nguyên. */
export interface ProfilePatch {
  fullName?: string
  phoneNumber?: string
  email?: string
  address?: string // '' = xóa địa chỉ
  dateOfBirth?: string // '' = xóa ngày sinh
}

export interface UpdateProfileResponse {
  message: string
  profile: Profile
}

export interface ChangePasswordValues {
  currentPassword: string
  newPassword: string
  confirmNewPassword: string
}

/** GET /users/me */
export function getProfile(token: string, signal?: AbortSignal) {
  return apiFetch<Profile>('/users/me', { token, signal })
}

/** PATCH /users/me */
export function updateProfile(token: string, patch: ProfilePatch) {
  return apiFetch<UpdateProfileResponse>('/users/me', { method: 'PATCH', token, body: patch })
}

/** PATCH /users/me/password */
export function changePassword(token: string, values: ChangePasswordValues) {
  return apiFetch<{ message: string }>('/users/me/password', {
    method: 'PATCH',
    token,
    body: values,
  })
}
