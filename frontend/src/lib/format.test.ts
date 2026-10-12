import { describe, expect, it } from 'vitest'
import {
  formatPrice,
  formatShortDate,
  formatTime,
  isValidDateString,
  toMinutes,
  todayLocal,
} from './format'

describe('format', () => {
  it('formatPrice định dạng tiền Việt, không hợp lệ → Liên hệ', () => {
    expect(formatPrice(200000)).toBe('200.000đ')
    expect(formatPrice('350000.00')).toBe('350.000đ')
    expect(formatPrice(null)).toBe('Liên hệ')
    expect(formatPrice('abc')).toBe('Liên hệ')
  })

  it('formatTime cắt giây', () => {
    expect(formatTime('18:00:00')).toBe('18:00')
  })

  it('toMinutes đổi giờ sang phút', () => {
    expect(toMinutes('18:30')).toBe(1110)
    expect(toMinutes('06:00:00')).toBe(360)
  })

  it('formatShortDate đảo thứ tự ngày', () => {
    expect(formatShortDate('2026-10-12')).toBe('12/10/2026')
  })

  it('todayLocal trả đúng dạng YYYY-MM-DD', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('isValidDateString loại bỏ ngày không có thật', () => {
    expect(isValidDateString('2026-10-12')).toBe(true)
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('12/10/2026')).toBe(false)
    expect(isValidDateString(null)).toBe(false)
  })
})
