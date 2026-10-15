import { useEffect, useState } from 'react'
import { Alert } from '../components/Alert'
import { AdminLayout } from '../components/AdminLayout'
import { useAuth } from '../features/auth/useAuth'
import { ServiceForm } from '../features/admin/ServiceForm'
import { listServices, type AdminService } from '../features/admin/adminServicesApi'
import { lowStockSummary, stockCell } from '../features/admin/adminServicesUtils'
import { formatVnd, pad2 } from '../features/dashboard/dashboardUtils'
import { useApiData } from '../features/dashboard/useApiData'
import './AdminServicesPage.css'

type Notice = { kind: 'success' | 'error'; text: string } | null

// Chỉ hiện chi tiết tối đa ngần này cảnh báo, còn lại gom thành một dòng
const MAX_WARNINGS = 3

/** Màn 16: Dịch vụ đi kèm. Admin thêm/sửa; Staff chỉ xem. */
export default function AdminServicesPage() {
  const { token, user } = useAuth()
  const authToken = token ?? ''
  const isAdmin = Boolean(user?.roles.includes('Admin'))

  const list = useApiData((signal) => listServices(authToken, signal), [authToken], Boolean(authToken))
  const [notice, setNotice] = useState<Notice>(null)
  // 'new' = đang thêm; null = chưa chọn dịch vụ nào
  const [editing, setEditing] = useState<AdminService | 'new' | null>(null)
  const [formVersion, setFormVersion] = useState(0)

  const services = list.data?.services ?? []
  const summary = list.data?.summary

  // Mở sẵn dịch vụ đầu tiên khi tải xong lần đầu (giống màn Sân & bảng giá)
  useEffect(() => {
    if (editing === null && services.length > 0) setEditing(services[0])
  }, [editing, services])

  // Dịch vụ đang mở trong form (dùng để tô sáng dòng tương ứng trong bảng)
  const selectedId = editing && editing !== 'new' ? editing.service_id : null

  function select(service: AdminService) {
    setEditing(service)
    setFormVersion((value) => value + 1)
    document.getElementById('sv-edit')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function startCreate() {
    setEditing('new')
    setFormVersion((value) => value + 1)
    document.getElementById('sv-edit')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleSaved(saved: AdminService, message: string) {
    setNotice({ kind: 'success', text: message })
    setEditing(saved)
    setFormVersion((value) => value + 1)
    list.reload()
  }

  function handleCancel() {
    // Sửa: bỏ thay đổi chưa lưu. Thêm mới: quay về dịch vụ đầu tiên (nếu có)
    if (editing === 'new') setEditing(services[0] ?? null)
    setFormVersion((value) => value + 1)
  }

  const lowItems = summary?.low_stock_items ?? []
  const shownWarnings = lowItems.slice(0, MAX_WARNINGS)

  return (
    <AdminLayout breadcrumb="Dịch vụ">
      <div className="sv">
        <div className="sv-head">
          <div>
            <h1>Dịch vụ đi kèm</h1>
            <p className="sv-sub">Giữ đủ nước, áo và bóng cho mỗi đội bóng.</p>
          </div>
          {isAdmin && (
            <button type="button" className="sv-btn sv-btn--primary" onClick={startCreate}>
              + Thêm dịch vụ
            </button>
          )}
        </div>

        {notice && (
          <div className={`sv-notice sv-notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo">
              ×
            </button>
          </div>
        )}

        {list.error && (
          <Alert>
            {list.error}{' '}
            <button type="button" className="sv-link" onClick={list.reload}>
              Thử lại
            </button>
          </Alert>
        )}

        <div className="sv-kpis">
          <section className="sv-card sv-kpi" aria-label="Dịch vụ hoạt động">
            <h2>Dịch vụ hoạt động</h2>
            <strong className="sv-kpi__value sv-kpi__value--ok">{summary ? pad2(summary.active) : '—'}</strong>
            <small>{summary ? `Trong ${summary.total} dịch vụ đã tạo` : ' '}</small>
          </section>

          <section className="sv-card sv-kpi" aria-label="Cần bổ sung kho">
            <h2>Cần bổ sung kho</h2>
            <strong className="sv-kpi__value sv-kpi__value--warn">{summary ? pad2(summary.low_stock) : '—'}</strong>
            <small>{summary ? lowStockSummary(lowItems) : ' '}</small>
          </section>

          <section className="sv-card sv-kpi" aria-label="Quy tắc tồn kho">
            <h2>Quy tắc tồn kho</h2>
            <strong className="sv-kpi__rule">Giảm khi Đã xác nhận</strong>
            <small>Tự khôi phục số lượng khi đơn bị hủy</small>
          </section>
        </div>

        <div className="sv-grid">
          <section className="sv-card" aria-labelledby="sv-list-title">
            <h2 id="sv-list-title">Danh sách dịch vụ</h2>

            <div className="sv-scroll">
              <table className="sv-table" aria-busy={list.loading}>
                <thead>
                  <tr>
                    <th scope="col">Tên / đơn vị</th>
                    <th scope="col">Đơn giá</th>
                    <th scope="col">Tồn kho</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {services.length === 0 && (
                    <tr>
                      <td colSpan={5} className="sv-empty">
                        {list.loading ? 'Đang tải dịch vụ...' : 'Chưa có dịch vụ nào.'}
                      </td>
                    </tr>
                  )}
                  {services.map((service) => {
                    const selected = selectedId === service.service_id
                    return (
                      <tr key={service.service_id} className={selected ? 'is-selected' : undefined}>
                        <th scope="row">
                          {service.service_name} / {service.unit}
                        </th>
                        <td>{formatVnd(service.price)}</td>
                        <td className={service.is_low_stock ? 'sv-low' : undefined}>{stockCell(service)}</td>
                        <td>
                          <span className={`sv-chip sv-chip--${service.is_active ? 'ok' : 'off'}`}>
                            {service.is_active ? 'Hoạt động' : 'Ngừng hoạt động'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="sv-row-action"
                            aria-label={`${isAdmin ? 'Sửa' : 'Xem'} ${service.service_name}`}
                            onClick={() => select(service)}
                          >
                            {isAdmin ? 'Sửa' : 'Xem'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {shownWarnings.map((item) => (
              <div key={item.service_id} className="sv-warning" role="status">
                <strong>{item.service_name} sắp hết</strong>
                <p>
                  Còn {item.stock_quantity} {item.unit}, dưới ngưỡng cảnh báo {item.low_stock_threshold}. Bổ sung tồn kho
                  trước khung giờ cao điểm.
                </p>
              </div>
            ))}
            {lowItems.length > MAX_WARNINGS && (
              <p className="sv-note">Và {lowItems.length - MAX_WARNINGS} dịch vụ khác đang dưới ngưỡng cảnh báo.</p>
            )}

            <p className="sv-note">
              Dịch vụ đã được sử dụng không xóa; tắt Hoạt động để ngừng bán. Giá và số lượng trên đơn cũ được giữ nguyên.
            </p>
          </section>

          {editing !== null && (
            <ServiceForm
              key={`${editing === 'new' ? 'new' : editing.service_id}:${formVersion}`}
              service={editing === 'new' ? null : editing}
              isAdmin={isAdmin}
              token={authToken}
              onSaved={handleSaved}
              onError={(text) => setNotice({ kind: 'error', text })}
              onCancel={handleCancel}
            />
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
