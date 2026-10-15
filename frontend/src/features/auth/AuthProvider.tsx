import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from './authContext'
import { clearSession, loadSession, saveSession, updateStoredUser } from './storage'
import type { Session } from './storage'
import type { AuthUser } from './authApi'

export function AuthProvider({ children }: { children: ReactNode }) {
  // Truyền HÀM vào useState: chỉ đọc storage một lần khi mở trang
  const [session, setSession] = useState<Session | null>(() => loadSession())

  const signIn = useCallback((next: Session, remember: boolean) => {
    saveSession(next, remember)
    setSession(next)
  }, [])

  const signOut = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  const updateUser = useCallback((user: AuthUser) => {
    updateStoredUser(user)
    setSession((current) => (current ? { ...current, user } : current))
  }, [])

  // useMemo giữ nguyên "đối tượng value" giữa các lần render,
  // tránh làm mọi component dùng context bị render lại không cần thiết
  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      signIn,
      signOut,
      updateUser,
    }),
    [session, signIn, signOut, updateUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
