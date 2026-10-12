import { apiFetch } from '../../lib/api'

export interface AuthUser {
  user_id: number
  full_name: string
  email: string | null
  roles: string[]
}

export interface LoginResponse {
  access_token: string
  user: AuthUser
}

/** POST /auth/login. identifier có thể là email hoặc số điện thoại. */
export function login(identifier: string, password: string) {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { identifier: identifier.trim(), password },
  })
}

/** POST /auth/admin/login: chỉ tài khoản Admin/Staff đăng nhập được (khách hàng bị từ chối 403). */
export function adminLogin(identifier: string, password: string) {
  return apiFetch<LoginResponse>('/auth/admin/login', {
    method: 'POST',
    body: { identifier: identifier.trim(), password },
  })
}

/** Các vai trò được vào khu vực quản trị (khớp ADMIN_PORTAL_ROLES ở backend). */
export const ADMIN_ROLES = ['Admin', 'Staff']

export function hasAdminRole(roles: string[] | undefined): boolean {
  return Boolean(roles?.some((role) => ADMIN_ROLES.includes(role)))
}
