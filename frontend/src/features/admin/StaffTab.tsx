import { useState, type FormEvent } from 'react'
import { Alert } from '../../components/Alert'
import { useApiData } from '../dashboard/useApiData'
import {
  changeStaffRole,
  createStaff,
  listStaff,
  resendStaffInvite,
  type StaffItem,
  type StaffRole,
} from './adminUsersApi'
import {
  EMPTY_STAFF_FORM,
  ROLE_OPTIONS,
  toCreateStaffInput,
  validateStaffForm,
  type StaffFormErrors,
  type StaffFormValues,
} from './adminUsersUtils'

type Notice = { kind: 'success' | 'error'; text: string } | null

/** Tab "Nhân viên & vai trò": danh sách, cấp/thu hồi Admin, tạo tài khoản nhân viên. */
export function StaffTab({ token }: { token: string }) {
  const list = useApiData((signal) => listStaff(token, signal), [token], Boolean(token))
  const [notice, setNotice] = useState<Notice>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const [values, setValues] = useState<StaffFormValues>(EMPTY_STAFF_FORM)
  const [errors, setErrors] = useState<StaffFormErrors>({})
  const [creating, setCreating] = useState(false)

  const staff = list.data?.staff ?? []

  async function changeRole(member: StaffItem, role: StaffRole) {
    const question =
      role === 'Admin'
        ? `Cấp quyền Admin cho ${member.full_name}? Người này sẽ quản lý được người dùng và phân quyền.`
        : `Thu hồi quyền Admin của ${member.full_name}? Người này vẫn là nhân viên.`
    if (!window.confirm(question)) return

    setBusyId(member.user_id)
    setNotice(null)
    try {
      await changeStaffRole(token, member.user_id, role)
      setNotice({
        kind: 'success',
        text: role === 'Admin' ? `Đã cấp Admin cho ${member.full_name}.` : `Đã thu hồi quyền Admin của ${member.full_name}.`,
      })
      list.reload()
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không đổi được vai trò.' })
    } finally {
      setBusyId(null)
    }
  }

  async function resendInvite(member: StaffItem) {
    setBusyId(member.user_id)
    setNotice(null)
    try {
      const result = await resendStaffInvite(token, member.user_id)
      setNotice(
        result.email_sent
          ? { kind: 'success', text: `Đã gửi lại email hướng dẫn tới ${member.email}.` }
          : { kind: 'error', text: 'Chưa gửi được email. Kiểm tra cấu hình SMTP rồi thử lại.' },
      )
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không gửi được email.' })
    } finally {
      setBusyId(null)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found = validateStaffForm(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setCreating(true)
    setNotice(null)
    try {
      const created = await createStaff(token, toCreateStaffInput(values))
      setNotice(
        created.email_sent
          ? { kind: 'success', text: `Đã tạo tài khoản ${created.full_name} (${created.employee_code}). Email hướng dẫn đặt mật khẩu đã được gửi.` }
          : { kind: 'error', text: `Đã tạo tài khoản ${created.full_name} (${created.employee_code}) nhưng chưa gửi được email. Dùng "Gửi lại email" trong danh sách khi đã cấu hình SMTP.` },
      )
      setValues(EMPTY_STAFF_FORM)
      list.reload()
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không tạo được tài khoản.' })
    } finally {
      setCreating(false)
    }
  }

  const set = <K extends keyof StaffFormValues>(key: K, value: StaffFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  return (
    <div className="usr-stack">
      {notice && <Alert variant={notice.kind}>{notice.text}</Alert>}

      <section className="usr-card" aria-labelledby="staff-title">
        <h2 id="staff-title">Nhân viên &amp; vai trò</h2>
        <p className="usr-muted">Nội dung nằm trong cùng màn hình Người dùng.</p>

        <div className="usr-staff-grid">
          <div>
            {list.error && (
              <Alert>
                {list.error} <button type="button" className="usr-link" onClick={list.reload}>Thử lại</button>
              </Alert>
            )}

            <div className={`usr-table-wrap${list.loading ? ' is-loading' : ''}`}>
              <table className="usr-table">
                <thead>
                  <tr>
                    <th scope="col">Mã / họ tên</th>
                    <th scope="col">Vị trí</th>
                    <th scope="col">Vai trò</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data && staff.length === 0 && (
                    <tr><td colSpan={4} className="usr-empty">Chưa có nhân viên nào.</td></tr>
                  )}
                  {staff.map((member) => (
                    <tr key={member.user_id}>
                      <th scope="row">
                        {member.employee_code ? `${member.employee_code} · ` : ''}{member.full_name}
                        {!member.is_active && <small>Tài khoản đang bị khóa</small>}
                      </th>
                      <td>{member.position ?? '—'}</td>
                      <td>{member.role_label}</td>
                      <td className="usr-actions">
                        {member.is_last_admin && <span className="usr-muted">Admin cuối cùng</span>}
                        {member.can_grant_admin && (
                          <button type="button" className="usr-link" disabled={busyId === member.user_id} onClick={() => changeRole(member, 'Admin')}>
                            Cấp Admin<span className="usr-sr"> cho {member.full_name}</span>
                          </button>
                        )}
                        {member.can_revoke_admin && (
                          <button type="button" className="usr-link usr-link--danger" disabled={busyId === member.user_id} onClick={() => changeRole(member, 'Staff')}>
                            Thu hồi<span className="usr-sr"> Admin của {member.full_name}</span>
                          </button>
                        )}
                        {member.is_active && member.email && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <button type="button" className="usr-link" disabled={busyId === member.user_id} onClick={() => resendInvite(member)}>
                              Gửi lại email<span className="usr-sr"> cho {member.full_name}</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="usr-warning" role="note">
              <strong>Bảo vệ Admin cuối cùng</strong>
              <p>
                Không thể thu hồi quyền hoặc khóa Admin cuối cùng. Nhân viên không được quản lý người dùng và phân quyền;
                cùng sử dụng giao diện quản trị theo menu được cấp.
              </p>
            </div>
          </div>

          <form className="usr-form" onSubmit={submit} noValidate aria-label="Tạo tài khoản nhân viên">
            <label className="usr-field">
              <span>Họ tên nhân viên mới</span>
              <input
                type="text"
                value={values.full_name}
                placeholder="Nhập họ tên"
                maxLength={100}
                aria-invalid={errors.full_name ? true : undefined}
                onChange={(event) => set('full_name', event.target.value)}
              />
              {errors.full_name && <small className="usr-error">{errors.full_name}</small>}
            </label>

            <div className="usr-form__row">
              <label className="usr-field">
                <span>Mã nhân viên</span>
                <input
                  type="text"
                  value={values.employee_code}
                  placeholder="Tự sinh (vd NV004)"
                  maxLength={20}
                  aria-invalid={errors.employee_code ? true : undefined}
                  onChange={(event) => set('employee_code', event.target.value)}
                />
                {errors.employee_code && <small className="usr-error">{errors.employee_code}</small>}
              </label>
              <label className="usr-field">
                <span>Vị trí</span>
                <input
                  type="text"
                  value={values.position}
                  placeholder="Trực sân"
                  maxLength={100}
                  onChange={(event) => set('position', event.target.value)}
                />
              </label>
            </div>

            <label className="usr-field">
              <span>Email đăng nhập</span>
              <input
                type="email"
                value={values.email}
                placeholder="Nhập email"
                maxLength={254}
                aria-invalid={errors.email ? true : undefined}
                onChange={(event) => set('email', event.target.value)}
              />
              {errors.email && <small className="usr-error">{errors.email}</small>}
            </label>

            <label className="usr-field">
              <span>Số điện thoại (tùy chọn)</span>
              <input
                type="tel"
                value={values.phone_number}
                placeholder="0901234567"
                inputMode="numeric"
                aria-invalid={errors.phone_number ? true : undefined}
                onChange={(event) => set('phone_number', event.target.value)}
              />
              {errors.phone_number && <small className="usr-error">{errors.phone_number}</small>}
            </label>

            <label className="usr-field">
              <span>Vai trò được cấp</span>
              <select value={values.role} onChange={(event) => set('role', event.target.value as StaffRole)}>
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <button type="submit" className="usr-btn usr-btn--primary" disabled={creating}>
              {creating ? 'Đang tạo...' : 'Tạo tài khoản nhân viên'}
            </button>
            <p className="usr-muted usr-small">
              Gửi hướng dẫn đặt mật khẩu qua email. Admin có thể cấp hoặc thu hồi vai trò trong danh sách.
            </p>
          </form>
        </div>
      </section>
    </div>
  )
}
