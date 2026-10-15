import { describe, expect, it } from 'vitest'
import type { RecentBooking } from './adminUsersApi'
import {
  EMPTY_STAFF_FORM,
  formatHistoryTime,
  historyLabel,
  pageWindow,
  paginationText,
  refundNote,
  shortDayMonth,
  toCreateStaffInput,
  validateStaffForm,
} from './adminUsersUtils'

const booking = (over: Partial<RecentBooking>): RecentBooking => ({
  booking_id: 1,
  booking_code: 'DS261008',
  booking_date: '2026-10-08',
  start_time: '18:00',
  end_time: '20:00',
  pitch_name: 'Binh An 01',
  status: 'Cancelled',
  services_count: 0,
  refund_amount: 0,
  refund_pending_amount: 0,
  refunded_at: null,
  ...over,
})

describe('phân trang', () => {
  it('paginationText', () => {
    expect(paginationText({ page: 1, limit: 4, total: 126, total_pages: 32, from: 1, to: 4 })).toBe(
      'Hiển thị 1–4 trong 126 khách hàng',
    )
    expect(paginationText({ page: 1, limit: 10, total: 0, total_pages: 1, from: 0, to: 0 })).toBe(
      'Không có khách hàng nào',
    )
  })

  it('pageWindow giữ trang hiện tại trong khung và không vượt tổng số trang', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
    expect(pageWindow(1, 32)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(10, 32)).toEqual([8, 9, 10, 11, 12])
    expect(pageWindow(32, 32)).toEqual([28, 29, 30, 31, 32])
    expect(pageWindow(1, 0)).toEqual([1])
  })
})

describe('định dạng thời gian', () => {
  it('shortDayMonth', () => {
    expect(shortDayMonth('2026-10-07')).toBe('07/10')
  })

  it('formatHistoryTime đổi UTC sang giờ Việt Nam', () => {
    expect(formatHistoryTime('2026-10-07T11:20:00.000Z')).toBe('07/10 18:20')
    expect(formatHistoryTime('không phải ngày')).toBe('')
  })

  it('historyLabel', () => {
    expect(historyLabel('Lock')).toBe('Khóa tài khoản')
    expect(historyLabel('RevokeAdmin')).toBe('Thu hồi quyền Admin')
    expect(historyLabel('Khác')).toBe('Khác')
  })
})

describe('refundNote', () => {
  it('đơn hủy đã hoàn cọc', () => {
    const note = refundNote([booking({ refund_amount: 222000, refunded_at: '2026-10-03T03:00:00.000Z' })])
    expect(note).toBe('DS261008 hủy 08/10, hoàn cọc 222.000 đ ngày 03/10.')
  })

  it('đơn hủy đang chờ hoàn', () => {
    expect(refundNote([booking({ refund_pending_amount: 100000 })])).toBe(
      'DS261008 hủy 08/10, đang chờ hoàn cọc 100.000 đ.',
    )
  })

  it('không có đơn hủy có hoàn cọc → rỗng', () => {
    expect(refundNote([booking({ status: 'Completed' }), booking({})])).toBe('')
  })
})

describe('form tạo nhân viên', () => {
  it('bắt buộc họ tên và email hợp lệ', () => {
    expect(validateStaffForm(EMPTY_STAFF_FORM)).toMatchObject({
      full_name: expect.any(String),
      email: expect.any(String),
    })
    expect(validateStaffForm({ ...EMPTY_STAFF_FORM, full_name: 'A', email: 'sai' }).email).toBe('Email không hợp lệ.')
  })

  it('mã nhân viên và SĐT là tùy chọn nhưng nếu nhập phải đúng định dạng', () => {
    const ok = { ...EMPTY_STAFF_FORM, full_name: 'A', email: 'a@b.com' }
    expect(validateStaffForm(ok)).toEqual({})
    expect(validateStaffForm({ ...ok, employee_code: 'N V' }).employee_code).toBeDefined()
    expect(validateStaffForm({ ...ok, phone_number: '123' }).phone_number).toBeDefined()
    expect(validateStaffForm({ ...ok, employee_code: 'NV004', phone_number: '0912345678' })).toEqual({})
  })

  it('toCreateStaffInput bỏ trường tùy chọn để trống và cắt khoảng trắng', () => {
    expect(toCreateStaffInput({ ...EMPTY_STAFF_FORM, full_name: ' A ', email: ' a@b.com ', role: 'Admin' })).toEqual({
      full_name: 'A',
      email: 'a@b.com',
      role: 'Admin',
    })
    expect(
      toCreateStaffInput({ ...EMPTY_STAFF_FORM, full_name: 'A', email: 'a@b.com', employee_code: 'NV004', position: 'Trực sân' }),
    ).toMatchObject({ employee_code: 'NV004', position: 'Trực sân' })
  })
})
