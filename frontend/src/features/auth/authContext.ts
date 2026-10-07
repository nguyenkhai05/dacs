import { createContext } from 'react'
import type { AuthUser } from './authApi'
import type { Session } from './storage'

export interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  signIn: (session: Session, remember: boolean) => void
  signOut: () => void
}

// Tách createContext ra file riêng (không chứa component) để Vite "hot reload" hoạt động ổn định
export const AuthContext = createContext<AuthContextValue | null>(null)
