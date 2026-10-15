import { describe, expect, it } from 'vitest'
import {
  cancelLeadText,
  dateLabel,
  dayMonth,
  dayMonthOfDate,
  invoiceStatusLabel,
  isValidTransactionCode,
  ledgerTone,
  normalizeAccountNumber,
  formatSignedMoney,
  timeOfDay,
  validateAccount,
  vnDateTimeLocal,
  vnLocalToIso,
} from './paymentView'

describe('paymentView', () => {
  it('formatSignedMoney: tiền vào có dấu +, tiền hoàn có dấu −', () => {
    expect(formatSignedMoney(223000)).toBe('+223.000 đ')
    expect(formatSignedMoney(-222000)).toBe('−222.000 đ')
    expect(formatSignedMoney(0)).toBe('0 đ')
  })

  it('ledgerTone', () => {
    expect(ledgerTone('Successful')).toBe('success')
    expect(ledgerTone('Pending')).toBe('warning')
    expect(ledgerTone('Failed')).toBe('danger')
  })

  it('timeOfDay / dayMonth đổi sang giờ Việt Nam', () => {
    expect(timeOfDay('2026-10-05T08:03:00.000Z')).toBe('15:03')
    expect(dayMonth('2026-10-05T08:03:00.000Z')).toBe('05/10')
    expect(timeOfDay(null)).toBe('—')
    expect(timeOfDay('hỏng')).toBe('—')
    expect(dayMonth(null)).toBe('')
  })

  it('dayMonthOfDate / dateLabel', () => {
    expect(dayMonthOfDate('2026-10-05')).toBe('05/10')
    expect(dateLabel('2026-10-05')).toBe('05/10/2026')
  })

  it('cancelLeadText', () => {
    expect(cancelLeadText(24.6)).toBe('Hủy trước 24 giờ')
    expect(cancelLeadText(-1)).toBe('Hủy sau giờ bắt đầu')
    expect(cancelLeadText(null)).toBe('')
  })

  it('invoiceStatusLabel', () => {
    expect(invoiceStatusLabel('PartiallyRefunded')).toBe('Hoàn một phần')
  })

  it('vnDateTimeLocal và vnLocalToIso là hai chiều của nhau (UTC+7)', () => {
    expect(vnDateTimeLocal(new Date('2026-10-05T09:10:00.000Z'))).toBe('2026-10-05T16:10')
    expect(vnLocalToIso('2026-10-05T16:10')).toBe('2026-10-05T09:10:00.000Z')
    expect(vnLocalToIso('')).toBeUndefined()
    expect(vnLocalToIso('abc')).toBeUndefined()
  })

  it('validateAccount cùng quy tắc với backend', () => {
    expect(validateAccount({ bank_name: 'ACB', bank_account_number: '8888 7766 55', bank_account_name: 'TRAN QUOC HUY' })).toEqual({})
    const errors = validateAccount({ bank_name: '', bank_account_number: '12', bank_account_name: ' ' })
    expect(Object.keys(errors)).toHaveLength(3)
    expect(normalizeAccountNumber('8888-7766 55')).toBe('8888776655')
  })

  it('isValidTransactionCode', () => {
    expect(isValidTransactionCode('FT26100500123')).toBe(true)
    expect(isValidTransactionCode('ab')).toBe(false)
    expect(isValidTransactionCode('có dấu cách')).toBe(false)
  })
})
