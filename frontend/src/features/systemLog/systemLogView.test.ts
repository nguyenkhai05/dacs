import { describe, expect, it } from 'vitest'
import { systemLogQuery } from './systemLogApi'
import {
  defaultRange,
  formatLogTime,
  formatLogTimeFull,
  pageWindow,
  toneOfValue,
  validateRange,
} from './systemLogView'

describe('formatLogTime', () => {
  it('đổi ISO (UTC) sang giờ Việt Nam', () => {
    expect(formatLogTime('2026-10-05T08:05:00.000Z')).toBe('05/10 · 15:05')
    expect(formatLogTimeFull('2026-10-05T08:05:00.000Z')).toBe('05/10/2026 15:05 (UTC+7)')
  })

  it('qua nửa đêm UTC thì sang ngày hôm sau ở Việt Nam', () => {
    expect(formatLogTime('2026-10-04T18:30:00.000Z')).toBe('05/10 · 01:30')
  })

  it('dữ liệu hỏng → "—"', () => {
    expect(formatLogTime('khong-phai-ngay')).toBe('—')
    expect(formatLogTimeFull('')).toBe('')
  })
})

describe('khoảng ngày', () => {
  it('mặc định từ đầu tháng đến hôm nay', () => {
    expect(defaultRange('2026-10-05')).toEqual({ from: '2026-10-01', to: '2026-10-05' })
  })

  it('báo lỗi khi từ > đến, cho phép để trống một đầu', () => {
    expect(validateRange('2026-10-06', '2026-10-05')).toBe('Ngày bắt đầu không được sau ngày kết thúc.')
    expect(validateRange('2026-10-05', '2026-10-05')).toBe('')
    expect(validateRange('', '2026-10-05')).toBe('')
    expect(validateRange('2026-10-05', '')).toBe('')
  })
})

describe('toneOfValue', () => {
  it('trạng thái booking và sân hiện nhãn màu', () => {
    expect(toneOfValue('booking', 'Đã xác nhận')).toBe('success')
    expect(toneOfValue('booking', 'Đã hủy')).toBe('danger')
    expect(toneOfValue('pitch', 'Bảo trì')).toBe('warning')
  })

  it('tiền, ghi chú, dòng giá không hiện nhãn', () => {
    expect(toneOfValue('booking', 'Cọc: 0 ₫')).toBeNull()
    expect(toneOfValue('price', 'Hoạt động')).toBeNull()
    expect(toneOfValue('pitch', '—')).toBeNull()
  })
})

describe('pageWindow', () => {
  it('ít trang thì hiện hết', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
    expect(pageWindow(1, 0)).toEqual([])
  })

  it('nhiều trang thì chỉ hiện 5 số quanh trang hiện tại', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(10, 20)).toEqual([8, 9, 10, 11, 12])
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20])
  })
})

describe('systemLogQuery', () => {
  it('bỏ qua tham số rỗng', () => {
    expect(systemLogQuery({ actorId: '', changeType: '', from: '', to: '', page: 1, limit: 10 })).toBe('page=1&limit=10')
  })

  it('đủ tham số theo tên backend', () => {
    const query = new URLSearchParams(
      systemLogQuery({ actorId: '7', changeType: 'price', from: '2026-10-01', to: '2026-10-05', page: 2, limit: 10 }),
    )
    expect(Object.fromEntries(query)).toEqual({
      actor_id: '7',
      change_type: 'price',
      from: '2026-10-01',
      to: '2026-10-05',
      page: '2',
      limit: '10',
    })
  })
})
