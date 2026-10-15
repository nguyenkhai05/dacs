import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert } from '../../components/Alert'
import { bookingStatus, formatHourRange } from '../dashboard/dashboardUtils'
import { useApiData } from '../dashboard/useApiData'
import {
  getCustomer,
  listCustomers,
  saveCustomerNote,
  setCustomerStatus,
  type CustomerDetail,
  type CustomerStatusFilter,
} from './adminUsersApi'
import {
  formatHistoryTime,
  historyLabel,
  pageWindow,
  paginationText,
  refundNote,
  shortDayMonth,
} from './adminUsersUtils'

type Notice = { kind: 'success' | 'error'; text: string } | null

const PAGE_SIZE = 10

/** Tab "Khách hàng": danh sách + chi tiết + ghi chú + khóa/mở khóa. */
export function CustomersTab({ token }: { token: string }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<CustomerStatusFilter>('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // Khách được bấm "Khóa"/"Mở khóa" ở bảng → ô lý do tự được focus
  const [focusReasonId, setFocusReasonId] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  // Chờ gõ xong 350ms mới tìm (cùng nhịp với màn Sân & bảng giá)
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const list = useApiData(
    (signal) => listCustomers(token, { q: query, status, page, limit: PAGE_SIZE }, signal),
    [token, query, status, page],
    Boolean(token),
  )
  const detail = useApiData(
    (signal) => getCustomer(token, selectedId as number, signal),
    [token, selectedId],
    Boolean(token) && selectedId !== null,
  )

  // Mở màn là hiện luôn chi tiết khách đầu tiên
  const firstId = list.data?.customers[0]?.user_id ?? null
  useEffect(() => {
    if (selectedId === null && firstId !== null) setSelectedId(firstId)
  }, [selectedId, firstId])

  const { reload: reloadList } = list
  const { reload: reloadDetail } = detail

  const refresh = useCallback(() => {
    reloadList()
    reloadDetail()
  }, [reloadList, reloadDetail])

  async function handleSaveNote(note: string): Promise<boolean> {
    if (selectedId === null) return false
    try {
      await saveCustomerNote(token, selectedId, note)
      setNotice({ kind: 'success', text: 'Đã lưu ghi chú.' })
      refresh()
      return true
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không lưu được ghi chú.' })
      return false
    }
  }

  async function handleChangeStatus(isActive: boolean, reason: string): Promise<boolean> {
    if (selectedId === null) return false
    try {
      await setCustomerStatus(token, selectedId, isActive, reason)
      setNotice({ kind: 'success', text: isActive ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.' })
      refresh()
      return true
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không đổi được trạng thái.' })
      return false
    }
  }

  function selectCustomer(id: number, focusReason: boolean) {
    setNotice(null)
    setSelectedId(id)
    setFocusReasonId(focusReason ? id : null)
  }

  const customers = list.data?.customers ?? []
  const pagination = list.data?.pagination
  const current = detail.data && detail.data.user_id === selectedId ? detail.data : null

  return (
    <div className="usr-stack">
      {notice && <Alert variant={notice.kind}>{notice.text}</Alert>}

      <section className="usr-card" aria-labelledby="customers-title">
        <h2 id="customers-title">Khách hàng</h2>

        <div className="usr-filters">
          <label>
            <span>Tìm khách hàng</span>
            <input
              type="search"
              value={search}
              placeholder="Nhập tên, số điện thoại hoặc email"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            <span>Tình trạng</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as CustomerStatusFilter)
                setPage(1)
              }}
            >
              <option value="">Tất cả</option>
              <option value="active">Hoạt động</option>
              <option value="locked">Đã khóa</option>
            </select>
          </label>
        </div>

        {list.error && (
          <Alert>
            {list.error} <button type="button" className="usr-link" onClick={list.reload}>Thử lại</button>
          </Alert>
        )}

        <div className={`usr-table-wrap${list.loading ? ' is-loading' : ''}`}>
          <table className="usr-table">
            <thead>
              <tr>
                <th scope="col">Khách hàng</th>
                <th scope="col">Số điện thoại</th>
                <th scope="col">Tổng booking</th>
                <th scope="col">Hủy / Không đến</th>
                <th scope="col">Tình trạng</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.data && customers.length === 0 && (
                <tr><td colSpan={6} className="usr-empty">Không tìm thấy khách hàng phù hợp.</td></tr>
              )}
              {customers.map((customer) => (
                <tr key={customer.user_id} className={customer.user_id === selectedId ? 'is-selected' : ''}>
                  <th scope="row">
                    {customer.full_name}
                    <small>{customer.email}</small>
                  </th>
                  <td>{customer.phone_number}</td>
                  <td>{customer.total_bookings}</td>
                  <td>{customer.cancelled_count} / {customer.no_show_count}</td>
                  <td>
                    {customer.is_active ? <span className="usr-badge usr-badge--ok">Hoạt động</span> : <span className="usr-muted">Đã khóa</span>}
                  </td>
                  <td className="usr-actions">
                    <button type="button" className="usr-link" onClick={() => selectCustomer(customer.user_id, false)}>
                      Xem<span className="usr-sr"> {customer.full_name}</span>
                    </button>
                    <span aria-hidden="true"> · </span>
                    <button type="button" className="usr-link" onClick={() => selectCustomer(customer.user_id, true)}>
                      {customer.is_active ? 'Khóa' : 'Mở khóa'}<span className="usr-sr"> {customer.full_name}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && (
          <div className="usr-pager">
            <span className="usr-muted">{paginationText(pagination)}</span>
            {pagination.total_pages > 1 && (
              <nav aria-label="Phân trang khách hàng">
                <button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
                {pageWindow(page, pagination.total_pages).map((number) => (
                  <button
                    key={number}
                    type="button"
                    aria-label={`Trang ${number}`}
                    aria-current={number === page ? 'page' : undefined}
                    className={number === page ? 'is-active' : ''}
                    onClick={() => setPage(number)}
                  >
                    {number}
                  </button>
                ))}
                <button type="button" aria-label="Trang sau" disabled={page >= pagination.total_pages} onClick={() => setPage(page + 1)}>›</button>
              </nav>
            )}
          </div>
        )}
      </section>

      <div className="usr-split">
        {selectedId === null ? (
          <section className="usr-card"><p className="usr-empty">Chọn một khách hàng để xem chi tiết.</p></section>
        ) : !current ? (
          <section className="usr-card">
            {detail.error ? (
              <Alert>{detail.error}</Alert>
            ) : (
              <p className="usr-muted" role="status">Đang tải chi tiết khách...</p>
            )}
          </section>
        ) : (
          <>
            <CustomerInfo detail={current} />
            <AccountPanel
              key={current.user_id}
              detail={current}
              focusReason={focusReasonId === current.user_id}
              onSaveNote={handleSaveNote}
              onChangeStatus={handleChangeStatus}
            />
          </>
        )}
      </div>
    </div>
  )
}

function CustomerInfo({ detail }: { detail: CustomerDetail }) {
  const note = refundNote(detail.recent_bookings)

  return (
    <section className="usr-card" aria-labelledby="detail-title">
      <h2 id="detail-title">Chi tiết khách · {detail.full_name}</h2>
      <p className="usr-muted">{detail.phone_number}{detail.email ? ` · ${detail.email}` : ''}</p>

      {detail.recent_bookings.length === 0 ? (
        <p className="usr-empty">Khách chưa có booking nào.</p>
      ) : (
        <div className="usr-table-wrap">
          <table className="usr-table usr-table--compact">
            <thead>
              <tr>
                <th scope="col">Booking / ngày</th>
                <th scope="col">Sân / giờ</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {detail.recent_bookings.map((booking) => {
                const state = bookingStatus(booking.status)
                return (
                  <tr key={booking.booking_id}>
                    <th scope="row">{booking.booking_code} · {shortDayMonth(booking.booking_date)}</th>
                    <td>{booking.pitch_name} · {formatHourRange(booking.start_time, booking.end_time)}</td>
                    <td><span className={`usr-badge usr-badge--${state.tone}`}>{state.label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {note && <p className="usr-muted usr-small">{note}</p>}
    </section>
  )
}

interface AccountPanelProps {
  detail: CustomerDetail
  focusReason: boolean
  onSaveNote: (note: string) => Promise<boolean>
  onChangeStatus: (isActive: boolean, reason: string) => Promise<boolean>
}

function AccountPanel({ detail, focusReason, onSaveNote, onChangeStatus }: AccountPanelProps) {
  // Bản nháp nằm ở đây (panel được tạo lại theo từng khách) nên tải lại dữ liệu không làm mất chữ đang gõ
  const [draft, setDraft] = useState(detail.note)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [busy, setBusy] = useState(false)
  const reasonRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusReason) reasonRef.current?.focus()
  }, [focusReason])

  async function saveNote() {
    setBusy(true)
    await onSaveNote(draft)
    setBusy(false)
  }

  async function changeStatus() {
    const nextActive = !detail.is_active
    if (!nextActive && !reason.trim()) {
      setReasonError('Vui lòng nhập lý do khóa tài khoản.')
      reasonRef.current?.focus()
      return
    }
    setReasonError('')
    setBusy(true)
    const ok = await onChangeStatus(nextActive, reason.trim())
    setBusy(false)
    if (ok) setReason('')
  }

  return (
    <section className="usr-card" aria-labelledby="account-title">
      <h2 id="account-title">Ghi chú &amp; trạng thái tài khoản</h2>

      <label className="usr-field">
        <span>Ghi chú nội bộ</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={draft}
          placeholder="Khách không nhìn thấy ghi chú này."
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>

      <div className="usr-buttons">
        <button type="button" className="usr-btn usr-btn--primary" onClick={saveNote} disabled={busy || draft.trim() === detail.note.trim()}>
          Lưu ghi chú
        </button>
        <button type="button" className="usr-btn" onClick={changeStatus} disabled={busy}>
          {detail.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
        </button>
      </div>

      <p className="usr-muted usr-small">
        Khóa ngăn đăng nhập và đặt mới, không xóa booking hay giao dịch. Mở khóa để khôi phục quyền truy cập.
        {detail.is_active && detail.upcoming_bookings > 0 &&
          ` Khách còn ${detail.upcoming_bookings} đơn sắp tới; khóa tài khoản không hủy các đơn này.`}
      </p>

      <label className="usr-field">
        <span>Lý do khóa / mở khóa</span>
        <input
          ref={reasonRef}
          type="text"
          maxLength={500}
          value={reason}
          placeholder="Nhập lý do hoặc thao tác"
          aria-invalid={reasonError ? true : undefined}
          onChange={(event) => {
            setReason(event.target.value)
            if (reasonError) setReasonError('')
          }}
        />
        {reasonError && <small className="usr-error" role="alert">{reasonError}</small>}
      </label>

      {detail.account_history.length > 0 && (
        <div className="usr-history">
          <h3>Lịch sử thao tác</h3>
          <ul>
            {detail.account_history.slice(0, 5).map((entry) => (
              <li key={entry.history_id}>
                <strong>{historyLabel(entry.action)}</strong>
                {entry.reason && <span> — {entry.reason}</span>}
                <small>
                  {formatHistoryTime(entry.created_at)}
                  {entry.performed_by_name ? ` · ${entry.performed_by_name}` : ''}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
