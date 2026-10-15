import { createContext } from 'react'
import type { AuthUser } from './authApi'
import type { Session } from './storage'

export interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  signIn: (session: Session, remember: boolean) => void
  signOut: () => void
  /** Cập nhật tên/email hiển thị sau khi người dùng sửa hồ sơ (không đổi token). */
  updateUser: (user: AuthUser) => void
}

// Tách createContext ra file riêng (không chứa component) để Vite "hot reload" hoạt động ổn định
export const AuthContext = createContext<AuthContextValue | null>(null)
