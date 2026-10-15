import type { ReactNode } from 'react'
import type { Schedule, ScheduleCell } from './adminBookingsApi'
import { STATUS_LABEL, hhmm } from '../../lib/adminBookingLabels'

interface BookingScheduleProps {
  schedule: Schedule | null
  loading: boolean
  selectedId: number | null
  onSelectBooking: (bookingId: number) => void
  /** Bấm ô trống → điền sẵn vào form "Tạo booking tại quầy" */
  onPickFree: (pitchId: number, startTime: string, endTime: string) => void
}

/** Gộp các ô liên tiếp thuộc cùng một đơn thành một ô rộng (colSpan). */
function mergeCells(cells: ScheduleCell[]): { cell: ScheduleCell; span: number }[] {
  const merged: { cell: ScheduleCell; span: number }[] = []
  for (const cell of cells) {
    const last = merged[merged.length - 1]
    if (
      last &&
      cell.state === 'booked' &&
      last.cell.state === 'booked' &&
      cell.booking &&
      last.cell.booking?.booking_id === cell.booking.booking_id
    ) {
      last.span += 1
    } else {
      merged.push({ cell, span: 1 })
    }
  }
  return merged
}

const LEGEND: [string, string][] = [
  ['Pending', 'Chờ cọc'],
  ['Confirmed', 'Đã xác nhận'],
  ['CheckedIn', 'Đã check-in'],
  ['Completed', 'Hoàn thành'],
  ['NoShow', 'Không đến'],
]

/** Chế độ Lịch: lưới sân × giờ, xem nhanh ô nào trống / đã có đơn. */
export function BookingSchedule({ schedule, loading, selectedId, onSelectBooking, onPickFree }: BookingScheduleProps) {
  let body: ReactNode

  if (!schedule) {
    body = <p className="ab-empty">{loading ? 'Đang tải lịch sân...' : 'Chưa có dữ liệu lịch.'}</p>
  } else if (schedule.pitches.length === 0) {
    body = <p className="ab-empty">Chưa có sân nào để hiển thị.</p>
  } else {
    body = (
      <div className="ab-scroll">
        <table className="ab-grid">
          <thead>
            <tr>
              <th scope="col">Sân / Giờ</th>
              {schedule.hours.map((hour) => (
                <th key={hour.start_time} scope="col">
                  {hour.start_time}–{hour.end_time}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.pitches.map((pitch) => (
              <tr key={pitch.pitch_id}>
                <th scope="row">{pitch.pitch_name}</th>
                {mergeCells(pitch.cells).map(({ cell, span }) => {
                  const key = `${pitch.pitch_id}-${cell.start_time}`
                  if (cell.state === 'booked' && cell.booking) {
                    const booking = cell.booking
                    return (
                      <td key={key} colSpan={span}>
                        <button
                          type="button"
                          className={`ab-cell ab-cell--${booking.status}${selectedId === booking.booking_id ? ' is-selected' : ''}`}
                          onClick={() => onSelectBooking(booking.booking_id)}
                          title={`${booking.booking_code} · ${booking.customer_name} · ${STATUS_LABEL[booking.status]}`}
                        >
                          <b>{booking.customer_name}</b>
                          <small>
                            {STATUS_LABEL[booking.status]}
                            {cell.extra_bookings > 0 ? ` · +${cell.extra_bookings}` : ''}
                          </small>
                        </button>
                      </td>
                    )
                  }
                  if (cell.state === 'free') {
                    return (
                      <td key={key}>
                        <button
                          type="button"
                          className="ab-cell ab-cell--free"
                          onClick={() => onPickFree(pitch.pitch_id, cell.start_time, cell.end_time)}
                        >
                          + Đặt tại quầy
                        </button>
                      </td>
                    )
                  }
                  const text =
                    cell.state === 'past' ? 'Đã qua' : cell.state === 'closed' ? 'Chưa mở bán' : 'Bảo trì'
                  return (
                    <td key={key}>
                      <span className={`ab-cell ab-cell--${cell.state}`}>{text}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <section className="ab-card" id="ab-schedule" aria-label="Lịch sân">
      <h2>Chế độ Lịch</h2>
      <p className="ab-sub">
        Xem theo từng sân và từng giờ
        {schedule ? ` (${hhmm(schedule.window.from)}–${hhmm(schedule.window.to)})` : ''}. Bấm ô trống để đặt tại quầy,
        bấm ô có đơn để xem chi tiết.
      </p>
      {body}
      <div className="ab-legend" aria-label="Chú thích">
        {LEGEND.map(([status, label]) => (
          <span key={status} className={`ab-chip ab-chip--${status}`}>
            {label}
          </span>
        ))}
      </div>
    </section>
  )
}
