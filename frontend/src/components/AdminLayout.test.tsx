import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '../features/auth/authContext'
import { AdminLayout } from './AdminLayout'

function setup(roles: string[]) {
  const user = { user_id: 1, full_name: 'Trần Hoàng', email: null, roles }
  return render(
    <AuthContext.Provider value={{ user, token: 't', signIn: () => {}, signOut: () => {}, updateUser: () => {} }}>
      <MemoryRouter initialEntries={['/admin']}>
        <AdminLayout breadcrumb="Tổng quan & báo cáo"><p>nội dung</p></AdminLayout>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('AdminLayout', () => {
  it('Admin thấy menu Người dùng và vai trò Admin', () => {
    setup(['Admin', 'Staff'])
    expect(screen.getByText('Người dùng')).toBeInTheDocument()
    expect(screen.getByText('Vai trò: Admin')).toBeInTheDocument()
    expect(screen.getByText('Quản trị / Tổng quan & báo cáo')).toBeInTheDocument()
    expect(screen.getByText('nội dung')).toBeInTheDocument()
  })

  it('nhân viên KHÔNG thấy menu Người dùng', () => {
    setup(['Staff'])
    expect(screen.queryByText('Người dùng')).not.toBeInTheDocument()
    expect(screen.getByText('Vai trò: Nhân viên')).toBeInTheDocument()
  })

  it('mọi màn đã có route đều là liên kết (kể cả Nhật ký hệ thống)', () => {
    setup(['Admin'])
    expect(screen.getByRole('link', { name: 'Tổng quan & báo cáo' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: 'Dịch vụ' })).toHaveAttribute('href', '/admin/services')
    expect(screen.getByRole('link', { name: 'Nhật ký hệ thống' })).toHaveAttribute('href', '/admin/logs')
    expect(screen.queryByTitle('Sắp có')).not.toBeInTheDocument()
  })

  it('nhân viên vẫn thấy menu Nhật ký hệ thống', () => {
    setup(['Staff'])
    expect(screen.getByRole('link', { name: 'Nhật ký hệ thống' })).toBeInTheDocument()
  })
})
