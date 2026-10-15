import { useState } from 'react'
import { AdminLayout } from '../components/AdminLayout'
import { CustomersTab } from '../features/admin/CustomersTab'
import { StaffTab } from '../features/admin/StaffTab'
import { useAuth } from '../features/auth/useAuth'
import './AdminUsersPage.css'

type Tab = 'customers' | 'staff'

/** Màn 18: Người dùng. Chỉ Admin (route được bọc RequireRole roles={['Admin']}). */
export default function AdminUsersPage() {
  const { token } = useAuth()
  const [tab, setTab] = useState<Tab>('customers')

  return (
    <AdminLayout breadcrumb="Người dùng">
      <div className="usr">
        <header className="usr-head">
          <h1>Người dùng</h1>
          <p className="usr-muted">Quản lý khách hàng và phân quyền nhân sự · Chỉ Admin có quyền truy cập.</p>
        </header>

        <div className="usr-tabs" role="tablist" aria-label="Nhóm người dùng">
          <button type="button" role="tab" aria-selected={tab === 'customers'} className={tab === 'customers' ? 'is-active' : ''} onClick={() => setTab('customers')}>
            Khách hàng
          </button>
          <button type="button" role="tab" aria-selected={tab === 'staff'} className={tab === 'staff' ? 'is-active' : ''} onClick={() => setTab('staff')}>
            Nhân viên &amp; vai trò
          </button>
        </div>

        <div role="tabpanel" aria-label={tab === 'customers' ? 'Khách hàng' : 'Nhân viên & vai trò'}>
          {tab === 'customers' ? <CustomersTab token={token ?? ''} /> : <StaffTab token={token ?? ''} />}
        </div>
      </div>
    </AdminLayout>
  )
}
