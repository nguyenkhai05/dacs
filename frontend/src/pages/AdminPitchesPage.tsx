import { useCallback, useEffect, useState } from 'react'
import { AdminLayout } from '../components/AdminLayout'
import { useAuth } from '../features/auth/useAuth'
import { CategoryPricePanel } from '../features/admin/CategoryPricePanel'
import { PitchForm } from '../features/admin/PitchForm'
import {
  listCategories,
  listPitches,
  type AdminPitch,
  type AdminPitchList,
  type PitchCategory,
  type PitchStatus,
} from '../features/admin/adminPitchesApi'
import { isAbortError } from '../lib/api'
import { PITCH_STATUSES, PITCH_STATUS_LABEL } from '../lib/adminPitchLabels'
import './AdminPitchesPage.css'

type Notice = { kind: 'success' | 'error'; text: string } | null

const STATUS_CLASS: Record<PitchStatus, string> = {
  Available: 'ok',
  Maintenance: 'warn',
  Inactive: 'off',
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Màn 15: Sân & bảng giá. Admin sửa được tất cả; Staff chỉ xem và đổi trạng thái sân. */
export default function AdminPitchesPage() {
  const { token, user } = useAuth()
  const authToken = token ?? ''
  const isAdmin = Boolean(user?.roles.includes('Admin'))

  const [status, setStatus] = useState<PitchStatus | ''>('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [list, setList] = useState<AdminPitchList | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [categories, setCategories] = useState<PitchCategory[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  // 'new' = đang thêm sân mới; null = chưa chọn sân nào
  const [editing, setEditing] = useState<AdminPitch | 'new' | null>(null)
  const [formVersion, setFormVersion] = useState(0)
  const [notice, setNotice] = useState<Notice>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((value) => value + 1), [])

  // Chờ gõ xong 350ms mới tìm
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!authToken) return
    const controller = new AbortController()
    setListLoading(true)
    listPitches(authToken, { status, q: query }, controller.signal)
      .then(setList)
      .catch((error) => {
        if (!isAbortError(error)) {
          setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không tải được danh sách sân.' })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false)
      })
    return () => controller.abort()
  }, [authToken, status, query, reloadKey])

  useEffect(() => {
    if (!authToken) return
    const controller = new AbortController()
    setCategoriesLoading(true)
    listCategories(authToken, controller.signal)
      .then(setCategories)
      .catch((error) => {
        if (!isAbortError(error)) {
          setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không tải được loại sân.' })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCategoriesLoading(false)
      })
    return () => controller.abort()
  }, [authToken, reloadKey])

  const pitches = list?.pitches ?? []

  // Mở sẵn sân đầu tiên khi tải xong lần đầu
  useEffect(() => {
    if (editing === null && pitches.length > 0) setEditing(pitches[0])
  }, [editing, pitches])

  // Lấy bản mới nhất của sân đang sửa từ danh sách (số booking sắp tới có thể đã đổi)
  const currentPitch = editing && editing !== 'new' ? (pitches.find((p) => p.pitch_id === editing.pitch_id) ?? editing) : null

  function selectPitch(pitch: AdminPitch) {
    setEditing(pitch)
    setFormVersion((value) => value + 1)
    scrollTo('ap-edit')
  }

  return (
    <AdminLayout breadcrumb="Sân & bảng giá">
      <div className="ap">
        <div className="ap-head">
          <div>
            <h1>Sân & bảng giá</h1>
            <p className="ap-sub">Quản lý thông tin sân, danh mục và giá thuê theo giờ.</p>
          </div>
          {isAdmin && (
            <button
              type="button"
              className="ap-btn ap-btn--primary"
              onClick={() => {
                setEditing('new')
                setFormVersion((value) => value + 1)
                scrollTo('ap-edit')
              }}
            >
              + Thêm sân
            </button>
          )}
        </div>

        <div className="ap-tabs" aria-label="Chuyển nhanh">
          <a className="is-active" href="#ap-list">Danh sách sân</a>
          <a href="#ap-pricing">Loại sân & bảng giá</a>
        </div>

        {notice && (
          <div className={`ap-notice ap-notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo">×</button>
          </div>
        )}

        <section className="ap-card" id="ap-list" aria-label="Danh sách sân">
          <h2>Danh sách sân</h2>
          <div className="ap-filters">
            <label className="ap-field">
              <span>Tìm theo tên sân</span>
              <input value={search} maxLength={100} placeholder="Vd: Bình An" onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label className="ap-field">
              <span>Trạng thái</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as PitchStatus | '')}>
                <option value="">Tất cả ({list?.summary.total ?? 0})</option>
                {PITCH_STATUSES.map((value) => {
                  const count = list
                    ? { Available: list.summary.available, Maintenance: list.summary.maintenance, Inactive: list.summary.inactive }[value]
                    : 0
                  return (
                    <option key={value} value={value}>
                      {PITCH_STATUS_LABEL[value]} ({count})
                    </option>
                  )
                })}
              </select>
            </label>
          </div>

          <div className="ap-scroll">
            <table className="ap-table" aria-busy={listLoading}>
              <thead>
                <tr>
                  <th scope="col">Tên sân</th>
                  <th scope="col">Loại sân</th>
                  <th scope="col">Mặt sân</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pitches.length === 0 && (
                  <tr>
                    <td colSpan={5} className="ap-empty">
                      {listLoading ? 'Đang tải danh sách sân...' : 'Không có sân nào khớp bộ lọc.'}
                    </td>
                  </tr>
                )}
                {pitches.map((pitch) => {
                  const isCurrent = currentPitch?.pitch_id === pitch.pitch_id
                  return (
                    <tr key={pitch.pitch_id} className={isCurrent ? 'is-selected' : undefined}>
                      <td>
                        <b>{pitch.pitch_name}</b>
                        {!pitch.has_pricing && <small className="ap-warn-text">Chưa có khung giá</small>}
                      </td>
                      <td>{pitch.category_name ?? '—'}</td>
                      <td>{pitch.surface_type ?? '—'}</td>
                      <td>
                        <span className={`ap-chip ap-chip--${STATUS_CLASS[pitch.status]}`}>{PITCH_STATUS_LABEL[pitch.status]}</span>
                        {pitch.upcoming_bookings > 0 && <small>{pitch.upcoming_bookings} booking sắp tới</small>}
                      </td>
                      <td className="ap-row-actions">
                        {isCurrent ? (
                          <span>Đang chỉnh sửa</span>
                        ) : (
                          <button type="button" onClick={() => selectPitch(pitch)}>
                            {isAdmin ? 'Chỉnh sửa' : 'Xem / đổi trạng thái'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="ap-note">
            Sân có lịch sử không được xóa. Chuyển sang "Ngừng hoạt động" để ngăn booking mới.
          </p>
        </section>

        <div className="ap-bottom">
          {editing === 'new' ? (
            <PitchForm
              key={`new-${formVersion}`}
              pitch={null}
              categories={categories}
              isAdmin={isAdmin}
              token={authToken}
              onSaved={(saved, message) => {
                setNotice({ kind: 'success', text: message })
                setEditing(saved)
                setFormVersion((value) => value + 1)
                reload()
              }}
              onError={(message) => setNotice({ kind: 'error', text: message })}
              onCancelCreate={() => setEditing(pitches[0] ?? null)}
            />
          ) : currentPitch ? (
            <PitchForm
              key={`${currentPitch.pitch_id}-${formVersion}`}
              pitch={currentPitch}
              categories={categories}
              isAdmin={isAdmin}
              token={authToken}
              onSaved={(saved, message) => {
                setNotice({ kind: 'success', text: message })
                setEditing(saved)
                setFormVersion((value) => value + 1)
                reload()
              }}
              onError={(message) => setNotice({ kind: 'error', text: message })}
              onCancelCreate={() => undefined}
            />
          ) : (
            <section className="ap-card" id="ap-edit" aria-label="Chỉnh sửa sân">
              <h2>Chỉnh sửa sân</h2>
              <p className="ap-empty">{listLoading ? 'Đang tải...' : 'Chọn một sân trong danh sách để chỉnh sửa.'}</p>
            </section>
          )}

          <CategoryPricePanel
            categories={categories}
            loading={categoriesLoading}
            isAdmin={isAdmin}
            token={authToken}
            onChanged={(message) => {
              setNotice({ kind: 'success', text: message })
              reload()
            }}
            onError={(message) => setNotice({ kind: 'error', text: message })}
          />
        </div>
      </div>
    </AdminLayout>
  )
}
