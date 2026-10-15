import { describe, expect, it } from 'vitest'
import {
  activityText,
  formatActivityTime,
  formatDuration,
  formatMoney,
  formatNextSlot,
  formatTimeRange,
  getInitials,
  padCount,
  statusView,
  upcomingBreakdown,
} from './bookingView'
import type { BookingListItem } from './myBookingsApi'

const item = (status: BookingListItem['status']) => ({ status }) as BookingListItem

describe('bookingView', () => {
  it('statusView: dịch trạng thái sang tiếng Việt, trạng thái lạ giữ nguyên', () => {
    expect(statusView('Pending')).toEqual({ label: 'Chờ cọc', tone: 'warning' })
    expect(statusView('Confirmed').label).toBe('Đã xác nhận')
    expect(statusView('Abc').label).toBe('Abc')
  })

  it('formatMoney có dấu cách trước chữ đ', () => {
    expect(formatMoney(740000)).toBe('740.000 đ')
    expect(formatMoney(0)).toBe('0 đ')
  })

  it('padCount luôn đủ 2 chữ số', () => {
    expect(padCount(3)).toBe('03')
    expect(padCount(12)).toBe('12')
    expect(padCount(-1)).toBe('00')
  })

  it('formatTimeRange / formatDuration / formatNextSlot', () => {
    expect(formatTimeRange('18:00:00', '20:00:00')).toBe('18:00–20:00')
    expect(formatDuration('18:00:00', '20:00:00')).toBe('2 giờ')
    expect(formatDuration('18:00:00', '19:30:00')).toBe('1,5 giờ')
    expect(formatNextSlot('2026-10-07', '18:00:00')).toBe('07/10 · 18:00')
  })

  it('formatActivityTime đổi sang giờ Việt Nam', () => {
    // 08:03 UTC = 15:03 giờ Việt Nam
    expect(formatActivityTime('2026-10-05T08:03:00.000Z')).toBe('05/10 · 15:03')
    expect(formatActivityTime('không phải ngày')).toBe('')
  })

  it('activityText mô tả từng loại hoạt động', () => {
    const base = { at: '', booking_id: 1, booking_code: 'DS1', note: null }
    expect(activityText({ ...base, type: 'deposit_paid', amount: 222000 })).toBe('Đã nhận cọc 222.000 đ')
    expect(activityText({ ...base, type: 'refund_Successful', amount: 100000 })).toBe('Đã hoàn cọc 100.000 đ')
    expect(activityText({ ...base, type: 'status_Completed', amount: null })).toBe('Hoàn thành trận đấu')
    expect(activityText({ ...base, type: 'khac', amount: null })).toBe('Cập nhật đơn đặt sân')
  })

  it('upcomingBreakdown', () => {
    expect(upcomingBreakdown([item('Confirmed'), item('Confirmed'), item('Pending')])).toBe('2 đã xác nhận · 1 chờ cọc')
    expect(upcomingBreakdown([item('Pending')])).toBe('1 chờ cọc')
    expect(upcomingBreakdown([])).toBe('')
  })

  it('getInitials lấy 2 chữ cuối', () => {
    expect(getInitials('Minh Anh')).toBe('MA')
    expect(getInitials('Nguyễn Văn Khải')).toBe('VK')
    expect(getInitials('An')).toBe('A')
    expect(getInitials('   ')).toBe('?')
  })
})
