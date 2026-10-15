import { describe, expect, it } from 'vitest'
import type { AdminService } from './adminServicesApi'
import {
  buildServicePayload,
  lowStockSummary,
  parseWholeNumber,
  stockCell,
  toFormValues,
} from './adminServicesUtils'

const water: AdminService = {
  service_id: 1,
  service_name: 'Nước suối',
  unit: 'chai',
  price: 10000,
  stock_quantity: 120,
  low_stock_threshold: 10,
  is_active: true,
  is_low_stock: false,
}

describe('parseWholeNumber', () => {
  it('đọc số có dấu phân cách hàng nghìn và đơn vị tiền', () => {
    expect(parseWholeNumber('10.000')).toBe(10000)
    expect(parseWholeNumber('10000')).toBe(10000)
    expect(parseWholeNumber(' 1.234.567 đ ')).toBe(1234567)
    expect(parseWholeNumber('10,000')).toBe(10000)
    expect(parseWholeNumber('0')).toBe(0)
  })

  it('từ chối rỗng, số âm, số thập phân và chữ', () => {
    expect(parseWholeNumber('')).toBeNull()
    expect(parseWholeNumber('-5')).toBeNull()
    expect(parseWholeNumber('10.5')).toBeNull()
    expect(parseWholeNumber('1.2345')).toBeNull()
    expect(parseWholeNumber('abc')).toBeNull()
  })
})

describe('toFormValues', () => {
  it('form thêm mới: ngưỡng mặc định 10, đang hoạt động', () => {
    expect(toFormValues(null)).toEqual({ name: '', unit: '', price: '', stock: '', threshold: '10', active: true })
  })

  it('form sửa: giá hiện có dấu chấm hàng nghìn', () => {
    expect(toFormValues(water)).toMatchObject({ name: 'Nước suối', price: '10.000', stock: '120', active: true })
  })
})

describe('buildServicePayload', () => {
  it('thêm mới: gửi đủ các trường, đã cắt khoảng trắng', () => {
    const built = buildServicePayload(
      { name: '  Khăn lạnh ', unit: ' gói ', price: '5.000', stock: '40', threshold: '10', active: true },
      null,
    )
    expect(built).toEqual({
      ok: true,
      payload: { service_name: 'Khăn lạnh', unit: 'gói', price: 5000, stock_quantity: 40, low_stock_threshold: 10, is_active: true },
      changes: { service_name: 'Khăn lạnh', unit: 'gói', price: 5000, stock_quantity: 40, low_stock_threshold: 10, is_active: true },
    })
  })

  it('sửa: chỉ gửi trường thật sự đổi', () => {
    const built = buildServicePayload({ ...toFormValues(water), price: '12.000', stock: '100' }, water)
    expect(built.ok && built.changes).toEqual({ price: 12000, stock_quantity: 100 })
  })

  it('sửa: chuyển Ngừng hoạt động', () => {
    const built = buildServicePayload({ ...toFormValues(water), active: false }, water)
    expect(built.ok && built.changes).toEqual({ is_active: false })
  })

  it('sửa mà không đổi gì thì báo lỗi', () => {
    expect(buildServicePayload(toFormValues(water), water)).toEqual({
      ok: false,
      error: 'Bạn chưa thay đổi thông tin nào.',
    })
  })

  it.each([
    [{ name: ' ' }, 'Tên dịch vụ không được để trống.'],
    [{ unit: '' }, 'Đơn vị không được để trống.'],
    [{ unit: 'x'.repeat(21) }, 'Đơn vị tối đa 20 ký tự.'],
    [{ price: '-1' }, 'Giá bán phải là số nguyên không âm.'],
    [{ price: '100.000.000' }, 'Giá bán tối đa 99.999.999 đ.'],
    [{ stock: '' }, 'Số lượng tồn kho phải là số nguyên không âm.'],
    [{ stock: '1.000.001' }, 'Số lượng tồn kho tối đa 1.000.000.'],
    [{ threshold: 'abc' }, 'Ngưỡng cảnh báo phải là số nguyên không âm.'],
  ])('báo lỗi khi form sai %j', (override, message) => {
    const built = buildServicePayload({ ...toFormValues(water), ...override }, null)
    expect(built).toEqual({ ok: false, error: message })
  })
})

describe('hiển thị tồn kho', () => {
  it('stockCell: sắp hết thì thêm "· thấp"', () => {
    expect(stockCell({ stock_quantity: 120, is_low_stock: false })).toBe('120')
    expect(stockCell({ stock_quantity: 4, is_low_stock: true })).toBe('4 · thấp')
  })

  it('lowStockSummary: không có / một / nhiều dịch vụ sắp hết', () => {
    const towel = { ...water, service_name: 'Khăn lạnh', unit: 'gói', stock_quantity: 4, is_low_stock: true }
    expect(lowStockSummary([])).toBe('Tồn kho đang đủ')
    expect(lowStockSummary([towel])).toBe('Khăn lạnh · còn 4 gói')
    expect(lowStockSummary([towel, { ...towel, service_id: 9 }, { ...towel, service_id: 10 }])).toBe(
      'Khăn lạnh · còn 4 gói · và 2 dịch vụ khác',
    )
  })
})
