import { describe, expect, it } from 'vitest'
import {
  barPercent,
  formatAverage,
  formatReviewDate,
  pageWindow,
  ratingLabel,
  visibleRange,
} from './reviewsUtils'

describe('ratingLabel', () => {
  it('đặt tên cho từng mức sao', () => {
    expect(ratingLabel(5)).toBe('Rất hài lòng')
    expect(ratingLabel(3)).toBe('Bình thường')
    expect(ratingLabel(1)).toBe('Rất không hài lòng')
  })

  it('ngoài 1–5 thì rỗng', () => {
    expect(ratingLabel(0)).toBe('')
    expect(ratingLabel(6)).toBe('')
  })
})

describe('formatAverage', () => {
  it('dùng dấu phẩy và luôn có 1 chữ số thập phân', () => {
    expect(formatAverage(4.8)).toBe('4,8')
    expect(formatAverage(5)).toBe('5,0')
    expect(formatAverage(0)).toBe('0,0')
  })
})

describe('formatReviewDate', () => {
  it('đổi theo giờ Việt Nam (UTC+7), không lệch ngày', () => {
    // 20:00 UTC ngày 2/10 = 03:00 ngày 3/10 giờ Việt Nam
    expect(formatReviewDate('2026-10-02T20:00:00.000Z')).toBe('03/10/2026')
  })

  it('dữ liệu hỏng thì rỗng', () => {
    expect(formatReviewDate('không phải ngày')).toBe('')
  })
})

describe('barPercent', () => {
  it('tính phần trăm theo tổng, làm tròn', () => {
    expect(barPercent(20, 24)).toBe(83)
    expect(barPercent(1, 24)).toBe(4)
  })

  it('không chia cho 0', () => {
    expect(barPercent(0, 0)).toBe(0)
    expect(barPercent(5, 0)).toBe(0)
  })
})

describe('visibleRange', () => {
  it('khoảng mục đang hiển thị', () => {
    expect(visibleRange(1, 5, 24)).toEqual([1, 5])
    expect(visibleRange(5, 5, 24)).toEqual([21, 24])
  })

  it('không có mục nào', () => {
    expect(visibleRange(1, 5, 0)).toEqual([0, 0])
  })
})

describe('pageWindow', () => {
  it('ôm quanh trang hiện tại', () => {
    expect(pageWindow(5, 10)).toEqual([3, 4, 5, 6, 7])
  })

  it('không vượt đầu/cuối', () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(10, 10)).toEqual([6, 7, 8, 9, 10])
  })

  it('ít trang hơn cửa sổ thì chỉ hiện đủ số trang', () => {
    expect(pageWindow(1, 2)).toEqual([1, 2])
    expect(pageWindow(1, 1)).toEqual([1])
  })
})
