import { useCallback, useEffect, useState } from 'react'
import { AdminLayout } from '../components/AdminLayout'
import { useAuth } from '../features/auth/useAuth'
import { BookingDetailPanel } from '../features/admin/BookingDetailPanel'
import { BookingSchedule } from '../features/admin/BookingSchedule'
import { CounterBookingForm, type CounterPrefill } from '../features/admin/CounterBookingForm'
import {
  checkIn,
  getBookingDetail,
  getSchedule,
  listBookings,
  type AdminBookingDetail,
  type AdminBookingItem,
  type AdminBookingList,
  type BookingStatus,
  type Schedule,
} from '../features/admin/adminBookingsApi'
import { apiFetch, isAbortError } from '../lib/api'
import { formatPrice, formatShortDate, isValidDateString, todayLocal } from '../lib/format'
import { PAYMENT_LABEL, STATUS_LABEL, STATUS_OPTIONS, hhmm } from '../lib/adminBookingLabels'
import './AdminBookingsPage.css'

const PAGE_SIZE = 7

interface PitchOption {
  pitch_id: number
  pitch_name: string
  status: string
}

type Notice = { kind: 'success' | 'error'; text: string } | null

/** Màn 14: Đơn đặt & lịch sân (Admin và Staff). */
export default function AdminBookingsPage() {
  const { token } = useAuth()
  const authToken = token ?? ''

  // Bộ lọc
  const [date, setDate] = useState(todayLocal())
  const [pitchId, setPitchId] = useState('')
  const [status, setStatus] = useState<BookingStatus | ''>('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('') // search sau khi đã chờ gõ xong
  const [page, setPage] = useState(1)

  // Dữ liệu
  const [pitches, setPitches] = useState<PitchOption[]>([])
  const [list, setList] = useState<AdminBookingList | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AdminBookingDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [prefill, setPrefill] = useState<CounterPrefill | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [reloadKey, setReloadKey] = useState(0) // tăng lên để tải lại bảng, lịch, chi tiết

  const reload = useCallback(() => setReloadKey((value) => value + 1), [])

  // Danh sách sân cho ô lọc và form đặt tại quầy
  useEffect(() => {
    const controller = new AbortController()
    apiFetch<PitchOption[]>('/pitches', { signal: controller.signal })
      .then(setPitches)
      .catch(() => {
        /* ô lọc vẫn dùng được với "Tất cả sân" */
      })
    return () => controller.abort()
  }, [])

  // Chờ người dùng gõ xong 350ms mới tìm, và về trang 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  // Bảng đơn
  useEffect(() => {
    if (!authToken || !isValidDateString(date)) return
    const controller = new AbortController()
    setListLoading(true)
    listBookings(
      { date, pitch_id: pitchId ? Number(pitchId) : undefined, status, q: query, page, limit: PAGE_SIZE },
      authToken,
      controller.signal,
    )
      .then((data) => {
        setList(data)
        setNotice((current) => (current?.kind === 'error' ? null : current))
      })
      .catch((error) => {
        if (!isAbortError(error)) setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không tải được danh sách đơn.' })
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false)
      })
    return () => controller.abort()
  }, [authToken, date, pitchId, status, query, page, reloadKey])

  // Lịch sân (chỉ phụ thuộc ngày)
  useEffect(() => {
    if (!authToken || !isValidDateString(date)) return
    const controller = new AbortController()
    setScheduleLoading(true)
    getSchedule(date, authToken, controller.signal)
      .then(setSchedule)
      .catch((error) => {
        if (!isAbortError(error)) setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không tải được lịch sân.' })
      })
      .finally(() => {
        if (!controller.signal.aborted) setScheduleLoading(false)
      })
    return () => controller.abort()
  }, [authToken, date, reloadKey])

  // Chi tiết đơn đang chọn
  useEffect(() => {
    if (!authToken || selectedId === null) {
      setDetail(null)
      return
    }
    const controller = new AbortController()
    setDetailLoading(true)
    getBookingDetail(selectedId, authToken, controller.signal)
      .then(setDetail)
      .catch((error) => {
        if (!isAbortError(error)) {
          setDetail(null)
          setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không tải được chi tiết đơn.' })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })
    return () => controller.abort()
  }, [authToken, selectedId, reloadKey])

  function selectBooking(id: number) {
    setSelectedId(id)
    document.getElementById('ab-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function changeFilter<T>(setter: (value: T) => void, value: T) {
    setter(value)
    setPage(1)
  }

  async function quickCheckIn(item: AdminBookingItem) {
    try {
      const result = await checkIn(item.booking_id, authToken)
      setNotice({ kind: 'success', text: result.message })
      reload()
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không check-in được.' })
    }
  }

  function pickFree(pitch: number, start: string, end: string) {
    setPrefill((current) => ({ nonce: (current?.nonce ?? 0) + 1, pitchId: pitch, date, startTime: start, endTime: end }))
    document.getElementById('ab-counter')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const items = list?.items ?? []
  const from = list && list.total > 0 ? (list.page - 1) * list.limit + 1 : 0
  const to = list ? Math.min(list.total, list.page * list.limit) : 0

  return (
    <AdminLayout breadcrumb="Đơn đặt & lịch sân">
      <div className="ab">
        <div className="ab-head">
          <div>
            <h1>Đơn đặt & lịch sân</h1>
            <p className="ab-sub">Theo dõi đơn, check-in, thu tiền mặt và tạo đặt tại quầy.</p>
          </div>
          <button
            type="button"
            className="ab-btn ab-btn--primary"
            onClick={() => document.getElementById('ab-counter')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            + Đặt tại quầy
          </button>
        </div>

        {notice && (
          <div className={`ab-notice ab-notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo">×</button>
          </div>
        )}

        <section className="ab-card" aria-label="Danh sách đơn">
          <div className="ab-filters">
            <label className="ab-field">
              <span>Ngày đá</span>
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  if (event.target.value) changeFilter(setDate, event.target.value)
                }}
              />
            </label>
            <label className="ab-field">
              <span>Sân</span>
              <select value={pitchId} onChange={(event) => changeFilter(setPitchId, event.target.value)}>
                <option value="">Tất cả sân</option>
                {pitches.map((pitch) => (
                  <option key={pitch.pitch_id} value={pitch.pitch_id}>{pitch.pitch_name}</option>
                ))}
              </select>
            </label>
            <label className="ab-field">
              <span>Trạng thái</span>
              <select value={status} onChange={(event) => changeFilter(setStatus, event.target.value as BookingStatus | '')}>
                <option value="">Tất cả trạng thái</option>
                {STATUS_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABEL[value]}
                    {list?.summary.by_status[value] ? ` (${list.summary.by_status[value]})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="ab-field">
              <span>Tên / số điện thoại / mã đơn</span>
              <input
                value={search}
                maxLength={100}
                placeholder="Nhập tên, SĐT hoặc DS..."
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          <div className="ab-tabs" role="tablist" aria-label="Chế độ xem">
            <a className="is-active" role="tab" aria-selected="true" href="#ab-table">Bảng</a>
            <a role="tab" aria-selected="false" href="#ab-schedule">Lịch</a>
          </div>

          <div className="ab-scroll" id="ab-table">
            <table className="ab-table" aria-busy={listLoading}>
              <thead>
                <tr>
                  <th scope="col">Mã / khách hàng</th>
                  <th scope="col">Sân / giờ</th>
                  <th scope="col">Tổng / đã thu</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="ab-empty">
                      {listLoading ? 'Đang tải danh sách đơn...' : 'Không có đơn nào khớp bộ lọc.'}
                    </td>
                  </tr>
                )}
                {items.map((item) => (
                  <tr key={item.booking_id} className={selectedId === item.booking_id ? 'is-selected' : undefined}>
                    <td>
                      <b>{item.booking_code}</b>
                      <small>{item.customer.full_name} · {item.customer.phone_number}</small>
                    </td>
                    <td>
                      <b>{item.pitch.pitch_name}</b>
                      <small>{hhmm(item.start_time)}–{hhmm(item.end_time)}</small>
                    </td>
                    <td>
                      <b>{formatPrice(item.total_amount)}</b>
                      <small>Đã thu {formatPrice(item.paid_amount)}</small>
                    </td>
                    <td>
                      <span className={`ab-chip ab-chip--${item.status}`}>{STATUS_LABEL[item.status]}</span>
                      <small>{PAYMENT_LABEL[item.payment_status]}</small>
                    </td>
                    <td className="ab-row-actions">
                      <button type="button" onClick={() => selectBooking(item.booking_id)}>Xem</button>
                      {item.actions.check_in.allowed && (
                        <button type="button" onClick={() => void quickCheckIn(item)}>Check-in</button>
                      )}
                      {item.actions.collect_cash.allowed && (
                        <button type="button" onClick={() => selectBooking(item.booking_id)}>Thu tiền</button>
                      )}
                      {item.actions.cancel.allowed && (
                        <button type="button" onClick={() => selectBooking(item.booking_id)}>Hủy</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ab-pager">
            <span>
              {list && list.total > 0
                ? `Hiển thị ${from}–${to} trong ${list.total} booking ngày ${formatShortDate(date)}`
                : `Không có booking ngày ${formatShortDate(date)}`}
            </span>
            <div>
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Trang trước">‹</button>
              <span>{list?.page ?? 1} / {list?.total_pages ?? 1}</span>
              <button
                type="button"
                disabled={!list || page >= list.total_pages}
                onClick={() => setPage((value) => value + 1)}
                aria-label="Trang sau"
              >
                ›
              </button>
            </div>
          </div>
          <p className="ab-hint">
            Check-in chỉ mở khi đơn đã đủ cọc và đúng ngày đá. Hoàn thành chỉ mở sau khi đã check-in, thu đủ tiền và trận kết thúc.
          </p>
        </section>

        <BookingSchedule
          schedule={schedule}
          loading={scheduleLoading}
          selectedId={selectedId}
          onSelectBooking={selectBooking}
          onPickFree={pickFree}
        />

        <div className="ab-bottom">
          <BookingDetailPanel
            detail={detail}
            loading={detailLoading}
            token={authToken}
            onChanged={(message) => {
              setNotice({ kind: 'success', text: message })
              reload()
            }}
            onError={(message) => setNotice({ kind: 'error', text: message })}
          />
          <CounterBookingForm
            token={authToken}
            pitches={pitches}
            defaultDate={date}
            prefill={prefill}
            onCreated={(bookingId, message) => {
              setNotice({ kind: 'success', text: message })
              setSelectedId(bookingId)
              reload()
            }}
          />
        </div>
      </div>
    </AdminLayout>
  )
}
