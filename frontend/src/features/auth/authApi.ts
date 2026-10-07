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
