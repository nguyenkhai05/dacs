import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { AdminLayout, adminRoute } from '../components/AdminLayout'
import { useAuth } from '../features/auth/useAuth'
import { useApiData } from '../features/dashboard/useApiData'
import { fetchLogActors, fetchSystemLogs } from '../features/systemLog/systemLogApi'
import type { ChangeType, SystemLogItem } from '../features/systemLog/systemLogApi'
import {
  CHANGE_TYPE_OPTIONS,
  defaultRange,
  formatLogTime,
  formatLogTimeFull,
  pageWindow,
  toneOfValue,
  validateRange,
} from '../features/systemLog/systemLogView'
import { todayLocal } from '../lib/format'
import './AdminSystemLogsPage.css'

const PAGE_SIZE = 10

/** Màn 19: Nhật ký hệ thống (chỉ đọc). Admin và Staff đều xem được. */
export default function AdminSystemLogsPage() {
  const { token } = useAuth()

  const [actorId, setActorId] = useState('')
  const [changeType, setChangeType] = useState<ChangeType | ''>('')
  const [range, setRange] = useState(() => defaultRange(todayLocal()))
  const [page, setPage] = useState(1)

  const rangeError = validateRange(range.from, range.to)

  const logs = useApiData(
    (signal) => fetchSystemLogs({ actorId, changeType, from: range.from, to: range.to, page, limit: PAGE_SIZE }, token, signal),
    [actorId, changeType, range.from, range.to, page, token],
    !rangeError,
  )
  // Danh sách người thao tác chỉ để đổ vào ô lọc: lỗi ở đây không chặn việc xem nhật ký
  const actors = useApiData((signal) => fetchLogActors(token, signal), [token])

  const data = rangeError ? null : logs.data
  const items = data?.items ?? []
  const from = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0
  const to = data && data.total > 0 ? from + items.length - 1 : 0

  const resetPage = () => setPage(1)

  return (
    <AdminLayout breadcrumb="Nhật ký hệ thống">
      <div className="sl">
        <header>
          <h1>Nhật ký hệ thống</h1>
          <p className="sl-sub">Theo dõi ai đã thay đổi booking, sân và giá — không chỉnh sửa bản ghi.</p>
        </header>

        <aside className="sl-info" aria-label="Chế độ chỉ đọc">
          <strong>Chế độ chỉ đọc</strong>
          <p>
            Giá trị cũ và mới được giữ cùng người thực hiện và thời gian (Asia/Ho_Chi_Minh). Lịch sử không có thao tác sửa hoặc xóa.
          </p>
        </aside>

        <section className="sl-card" aria-labelledby="sl-list-title">
          <h2 id="sl-list-title" className="sl-visually-hidden">
            Danh sách thay đổi
          </h2>

          <div className="sl-filters">
            <label className="sl-field">
              <span>Người thực hiện</span>
              <select
                value={actorId}
                onChange={(event) => {
                  setActorId(event.target.value)
                  resetPage()
                }}
              >
                <option value="">Tất cả người dùng</option>
                {(actors.data ?? []).map((actor) => (
                  <option key={actor.user_id} value={String(actor.user_id)}>
                    {actor.display_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="sl-field">
              <span>Loại thay đổi</span>
              <select
                value={changeType}
                onChange={(event) => {
                  setChangeType(event.target.value as ChangeType | '')
                  resetPage()
                }}
              >
                <option value="">Booking / Sân / Giá</option>
                {CHANGE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="sl-field sl-range">
              <legend>Khoảng ngày</legend>
              <div className="sl-range__inputs">
                <input
                  type="date"
                  aria-label="Từ ngày"
                  value={range.from}
                  max={range.to || undefined}
                  aria-invalid={Boolean(rangeError)}
                  onChange={(event) => {
                    setRange((current) => ({ ...current, from: event.target.value }))
                    resetPage()
                  }}
                />
                <span aria-hidden="true">–</span>
                <input
                  type="date"
                  aria-label="Đến ngày"
                  value={range.to}
                  min={range.from || undefined}
                  aria-invalid={Boolean(rangeError)}
                  onChange={(event) => {
                    setRange((current) => ({ ...current, to: event.target.value }))
                    resetPage()
                  }}
                />
              </div>
            </fieldset>
          </div>

          {rangeError && (
            <p className="sl-error" role="alert">
              {rangeError}
            </p>
          )}

          {!rangeError && logs.error && (
            <div className="sl-error-box">
              <Alert>{logs.error}</Alert>
              <button type="button" className="sl-btn" onClick={logs.reload}>
                Thử lại
              </button>
            </div>
          )}

          {!rangeError && !logs.error && !data && logs.loading && <p className="sl-empty">Đang tải nhật ký…</p>}

          {!rangeError && !logs.error && data && items.length === 0 && !logs.loading && (
            <p className="sl-empty">Không có thay đổi nào trong khoảng này với bộ lọc đã chọn.</p>
          )}

          {!rangeError && !logs.error && data && items.length > 0 && (
            <div className={`sl-scroll${logs.loading ? ' is-loading' : ''}`} aria-busy={logs.loading}>
              <table className="sl-table">
                <thead>
                  <tr>
                    <th scope="col">Thời gian</th>
                    <th scope="col">Người thực hiện</th>
                    <th scope="col">Đối tượng / thao tác</th>
                    <th scope="col">Giá trị cũ</th>
                    <th scope="col">Giá trị mới</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="sl-time">
                        <time dateTime={item.changed_at} title={formatLogTimeFull(item.changed_at)}>
                          {formatLogTime(item.changed_at)}
                        </time>
                      </td>
                      <td className="sl-actor">{item.actor.display_name}</td>
                      <td>
                        <span className="sl-target">{item.target}</span>
                        <small>{item.action}</small>
                      </td>
                      <td>
                        <LogValue item={item} value={item.old_value} />
                      </td>
                      <td>
                        <LogValue item={item} value={item.new_value} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!rangeError && !logs.error && data && data.total > 0 && (
            <nav className="sl-pager" aria-label="Phân trang nhật ký">
              <span>
                Hiển thị {from}–{to} trong {data.total} thay đổi
              </span>
              <div className="sl-pager__buttons">
                <button type="button" aria-label="Trang trước" disabled={data.page <= 1 || logs.loading} onClick={() => setPage(data.page - 1)}>
                  ‹
                </button>
                {pageWindow(data.page, data.total_pages).map((number) => (
                  <button
                    key={number}
                    type="button"
                    aria-label={`Trang ${number}`}
                    aria-current={number === data.page ? 'page' : undefined}
                    className={number === data.page ? 'is-current' : undefined}
                    disabled={number === data.page || logs.loading}
                    onClick={() => setPage(number)}
                  >
                    {number}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Trang sau"
                  disabled={data.page >= data.total_pages || logs.loading}
                  onClick={() => setPage(data.page + 1)}
                >
                  ›
                </button>
              </div>
            </nav>
          )}
        </section>

        <p className="sl-note">
          Lịch sử booking, sân và giá được hợp nhất tại đây. Các khoản thu và hoàn tiền xem thêm ở{' '}
          <Link to={adminRoute('payments') ?? '/admin/payments'}>Thanh toán &amp; hoàn cọc</Link>.
        </p>
      </div>
    </AdminLayout>
  )
}

/** Giá trị cũ / mới: trạng thái đã biết hiện thành nhãn màu, còn lại là chữ thường. */
function LogValue({ item, value }: { item: SystemLogItem; value: string }) {
  const tone = toneOfValue(item.change_type, value)
  if (tone) return <span className={`sl-badge sl-badge--${tone}`}>{value}</span>
  return <span className={value === '—' ? 'sl-dash' : undefined}>{value}</span>
}
