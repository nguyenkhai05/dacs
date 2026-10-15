import { describe, expect, it } from 'vitest'
import {
  bookingStatus,
  formatHourRange,
  formatHours,
  formatMillions,
  formatPercent,
  formatVnd,
  netColumnTitle,
  pad2,
  toAnchorDate,
  toInputValue,
} from './dashboardUtils'

describe('định dạng số liệu', () => {
  it('pad2 luôn đủ 2 chữ số', () => {
    expect(pad2(3)).toBe('03')
    expect(pad2(18)).toBe('18')
  })

  it('formatVnd dùng dấu chấm ngăn cách và " đ"', () => {
    expect(formatVnd(5480000)).toBe('5.480.000 đ')
    expect(formatVnd(0)).toBe('0 đ')
  })

  it('formatMillions cho nhãn cột biểu đồ', () => {
    expect(formatMillions(4960000)).toBe('4,96 tr')
    expect(formatMillions(3820000)).toBe('3,82 tr')
    expect(formatMillions(0)).toBe('0')
  })

  it('formatPercent dùng dấu phẩy', () => {
    expect(formatPercent(68.75)).toBe('68,75%')
    expect(formatPercent(8.2)).toBe('8,2%')
  })

  it('formatHourRange gọn khi tròn giờ, đầy đủ khi lệch phút', () => {
    expect(formatHourRange('17:00', '18:00')).toBe('17–18h')
    expect(formatHourRange('17:30', '19:00')).toBe('17:30–19:00')
  })

  it('formatHours', () => {
    expect(formatHours(182)).toBe('182 giờ')
    expect(formatHours(4.5)).toBe('4,5 giờ')
  })
})

describe('trạng thái booking', () => {
  it('map nhãn tiếng Việt và màu', () => {
    expect(bookingStatus('Confirmed')).toEqual({ label: 'Đã xác nhận', tone: 'ok' })
    expect(bookingStatus('Pending')).toEqual({ label: 'Chờ cọc', tone: 'warn' })
    expect(bookingStatus('Lạ')).toEqual({ label: 'Lạ', tone: 'muted' })
  })
})

describe('kỳ báo cáo', () => {
  it('tiêu đề cột doanh thu theo kỳ', () => {
    expect(netColumnTitle('month', '2026-09-01')).toBe('Thuần tháng 09')
    expect(netColumnTitle('week', '2026-10-05')).toBe('Thuần tuần')
    expect(netColumnTitle('day', '2026-10-05')).toBe('Thuần ngày')
  })

  it('đổi qua lại giữa giá trị ô nhập và ngày mốc', () => {
    expect(toAnchorDate('month', '2026-09')).toBe('2026-09-01')
    expect(toAnchorDate('day', '2026-09-17')).toBe('2026-09-17')
    expect(toAnchorDate('month', '')).toBeNull()
    expect(toInputValue('month', '2026-09-17')).toBe('2026-09')
    expect(toInputValue('week', '2026-09-17')).toBe('2026-09-17')
  })
})
