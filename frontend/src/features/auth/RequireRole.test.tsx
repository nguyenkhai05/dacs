import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthContext } from './authContext'
import { RequireRole } from './RequireRole'

function LoginProbe() {
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return <div>login:{location.search}|{from}</div>
}

function setup(roles: string[] | null) {
  const user = roles ? { user_id: 1, full_name: 'Người Dùng', email: null, roles } : null
  return render(
    <AuthContext.Provider value={{ user, token: user ? 't' : null, signIn: () => {}, signOut: () => {}, updateUser: () => {} }}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<RequireRole roles={['Admin', 'Staff']}><div>khu quản trị</div></RequireRole>} />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('RequireRole', () => {
  it('chưa đăng nhập → /login?mode=admin và nhớ trang định vào', () => {
    setup(null)
    expect(screen.getByText(/^login:/)).toHaveTextContent('login:?mode=admin|/admin')
  })

  it('khách hàng → thông báo không có quyền, không thấy nội dung quản trị', () => {
    setup(['Customer'])
    expect(screen.getByRole('alert')).toHaveTextContent('Bạn không có quyền truy cập')
    expect(screen.queryByText('khu quản trị')).not.toBeInTheDocument()
  })

  it('Admin và Staff vào được', () => {
    setup(['Admin'])
    expect(screen.getByText('khu quản trị')).toBeInTheDocument()
  })
})
