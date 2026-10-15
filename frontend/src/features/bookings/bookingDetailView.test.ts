import { describe, expect, it } from 'vitest'
import { makeDetail } from './bookingFixtures'
import {
  buildTimeline,
  cancelNotice,
  cancelReasonOf,
  costRows,
  depositNotice,
  formatCountdown,
  formatDayTime,
  formatDuration,
  formatHours,
  money,
  normalizeAccountName,
  parseCancelReason,
  paymentChip,
  policyTiers,
  summarizeRefunds,
  validateRefundForm,
} from './bookingDetailView'

describe('định dạng', () => {
  it('tiền có dấu cách trước chữ đ', () => {
    expect(money(300000)).toBe('300.000 đ')
    expect(money(0)).toBe('0 đ')
    expect(money(1234.4)).toBe('1.234 đ')
  })

  it('ngày giờ theo giờ Việt Nam (UTC+7)', () => {
    expect(formatDayTime('2026-10-05T08:03:00.000Z')).toBe('05/10 · 15:03')
    // 20:30 UTC ngày 05 đã là 03:30 ngày 06 ở Việt Nam
    expect(formatDayTime('2026-10-05T20:30:00.000Z')).toBe('06/10 · 03:30')
  })

  it('thời lượng còn lại đọc được', () => {
    expect(formatDuration(51)).toBe('2 ngày 3 giờ')
    expect(formatDuration(48)).toBe('2 ngày')
    expect(formatDuration(5.5)).toBe('5 giờ 30 phút')
    expect(formatDuration(3)).toBe('3 giờ')
    expect(formatDuration(0.25)).toBe('15 phút')
    expect(formatDuration(0)).toBe('đã đến giờ đá')
    expect(formatDuration(-3)).toBe('đã đến giờ đá')
  })

  it('số giờ và đồng hồ đếm ngược', () => {
    expect(formatHours(1)).toBe('1 giờ')
    expect(formatHours(1.5)).toBe('1,5 giờ')
    expect(formatCountdown(872)).toBe('14:32')
    expect(formatCountdown(0)).toBe('00:00')
    expect(formatCountdown(-5)).toBe('00:00')
  })
})

describe('paymentChip / depositNotice', () => {
  it('nhãn thanh toán theo số đã trả', () => {
    expect(paymentChip(makeDetail())?.label).toBe('Thanh toán một phần')

    const full = makeDetail()
    full.amounts = { ...full.amounts, paid: 740000, remaining: 0 }
    expect(paymentChip(full)).toEqual({ label: 'Đã thanh toán đủ', tone: 'success' })

    const none = makeDetail({ status: 'Pending' })
    none.amounts = { ...none.amounts, paid: 0, remaining: 740000 }
    expect(paymentChip(none)).toEqual({ label: 'Chưa thanh toán', tone: 'warning' })
  })

  it('đơn đã hủy / không đến không hiện nhãn thanh toán và khung cọc', () => {
    expect(paymentChip(makeDetail({ status: 'Cancelled' }))).toBeNull()
    expect(depositNotice(makeDetail({ status: 'NoShow' }))).toBeNull()
  })

  it('khung cọc đúng như thiết kế', () => {
    expect(depositNotice(makeDetail())).toEqual({
      tone: 'success',
      title: 'Đã cọc 222.000 đ',
      body: 'Còn lại 518.000 đ trả bằng tiền mặt tại sân. Vui lòng đến trước 10 phút để check-in.',
    })
  })

  it('đơn chờ cọc nhắc thời gian giữ chỗ; đơn đã thu đủ báo đã thanh toán đủ', () => {
    const pending = makeDetail({ status: 'Pending' })
    pending.amounts = { ...pending.amounts, paid: 0, remaining: 740000 }
    expect(depositNotice(pending)?.title).toBe('Chưa đóng cọc')
    expect(depositNotice(pending)?.body).toContain('15 phút')

    const done = makeDetail({ status: 'Completed' })
    done.amounts = { ...done.amounts, paid: 740000, remaining: 0 }
    expect(depositNotice(done)).toEqual({ tone: 'success', title: 'Đã thanh toán đủ 740.000 đ', body: null })
  })

  it('đã check-in thì không nhắc "đến trước 10 phút"', () => {
    expect(depositNotice(makeDetail({ status: 'CheckedIn' }))?.body).not.toContain('10 phút')
  })
})

describe('costRows', () => {
  it('tách tiền sân theo khung giá và liệt kê dịch vụ', () => {
    expect(costRows(makeDetail())).toEqual([
      { key: 'pitch-18:00', item: 'Sân · 18:00–19:00', quantity: '1 giờ × 300.000 đ', amount: 300000 },
      { key: 'pitch-19:00', item: 'Sân · 19:00–20:00', quantity: '1 giờ × 350.000 đ', amount: 350000 },
      { key: 'service-1', item: 'Nước suối', quantity: '6 chai × 10.000 đ', amount: 60000 },
      { key: 'service-2', item: 'Áo bib', quantity: '10 chiếc × 3.000 đ', amount: 30000 },
    ])
  })

  it('bảng giá đã đổi (pitch_lines = null) thì gộp một dòng theo số tiền đã chốt', () => {
    const rows = costRows(makeDetail({ pitch_lines: null, services: [] }))

    expect(rows).toEqual([
      { key: 'pitch', item: 'Sân · 18:00–20:00', quantity: '2 giờ', amount: 650000 },
    ])
  })
})

describe('buildTimeline', () => {
  it('đơn đã xác nhận: 2 bước đã xong + 2 bước sắp tới', () => {
    const items = buildTimeline(makeDetail())

    expect(items.map((i) => [i.title, i.done])).toEqual([
      ['Tạo đơn', true],
      ['Đã xác nhận', true],
      ['Check-in tại sân', false],
      ['Thu tiền mặt & hoàn thành', false],
    ])
    expect(items[0]).toMatchObject({ time: '05/10 · 15:00', note: 'Chờ cọc · Giữ chỗ 15 phút' })
    expect(items[1]).toMatchObject({ time: '05/10 · 15:03', note: 'Nhận đủ 222.000 đ qua VietQR' })
    expect(items[2]).toMatchObject({ time: '07/10 · 18:00' })
    expect(items[3]).toMatchObject({ time: 'Sau trận' })
  })

  it('đơn chờ cọc có thêm bước thanh toán', () => {
    const detail = makeDetail({
      status: 'Pending',
      history: [{ old_status: null, new_status: 'Pending', reason: 'Tao booking', changed_at: '2026-10-05T08:00:00.000Z' }],
      payments: [],
    })

    expect(buildTimeline(detail).map((i) => i.title)).toEqual([
      'Tạo đơn',
      'Thanh toán cọc qua VietQR',
      'Check-in tại sân',
      'Thu tiền mặt & hoàn thành',
    ])
  })

  it('đơn đặt tại quầy: bước đầu là "Đặt tại quầy", ghi chú không lặp lại chữ đó', () => {
    const detail = makeDetail({
      history: [
        { old_status: null, new_status: 'Confirmed', reason: 'Đặt tại quầy (thu cọc tiền mặt)', changed_at: '2026-10-05T08:00:00.000Z' },
      ],
    })

    expect(buildTimeline(detail)[0]).toMatchObject({
      title: 'Đặt tại quầy',
      note: 'Thu cọc tiền mặt',
    })

    const plain = makeDetail({
      history: [{ old_status: null, new_status: 'Confirmed', reason: 'Đặt tại quầy', changed_at: '2026-10-05T08:00:00.000Z' }],
    })
    expect(buildTimeline(plain)[0].note).toBeNull()
  })

  it('đơn đã hủy / hoàn thành không còn bước sắp tới', () => {
    const cancelled = makeDetail({
      status: 'Cancelled',
      history: [
        { old_status: null, new_status: 'Pending', reason: 'Tao booking', changed_at: '2026-10-05T08:00:00.000Z' },
        { old_status: 'Pending', new_status: 'Confirmed', reason: null, changed_at: '2026-10-05T08:03:00.000Z' },
        { old_status: 'Confirmed', new_status: 'Cancelled', reason: 'Đội thay đổi kế hoạch', changed_at: '2026-10-05T08:10:00.000Z' },
      ],
    })
    const items = buildTimeline(cancelled)

    expect(items.every((i) => i.done)).toBe(true)
    expect(items[2]).toMatchObject({ title: 'Đã hủy', note: 'Đội thay đổi kế hoạch' })
    expect(cancelReasonOf(cancelled)).toEqual({ by: 'other', text: 'Đội thay đổi kế hoạch' })
  })

  it('đơn đã check-in chỉ còn bước cuối', () => {
    const detail = makeDetail({
      status: 'CheckedIn',
      history: [
        { old_status: null, new_status: 'Pending', reason: 'Tao booking', changed_at: '2026-10-05T08:00:00.000Z' },
        { old_status: 'Pending', new_status: 'Confirmed', reason: null, changed_at: '2026-10-05T08:03:00.000Z' },
        { old_status: 'Confirmed', new_status: 'CheckedIn', reason: 'Check-in tại quầy', changed_at: '2026-10-07T10:55:00.000Z' },
      ],
    })

    expect(buildTimeline(detail).filter((i) => !i.done).map((i) => i.title)).toEqual(['Thu tiền mặt & hoàn thành'])
  })
})

describe('parseCancelReason', () => {
  it('tách người hủy và lý do theo định dạng backend ghi', () => {
    expect(parseCancelReason('Khách hủy đơn: Đội thay đổi kế hoạch')).toEqual({ by: 'customer', text: 'Đội thay đổi kế hoạch' })
    expect(parseCancelReason('Khách hủy đơn')).toEqual({ by: 'customer', text: null })
    expect(parseCancelReason('Nhân viên hủy đơn: Sân bảo trì đột xuất')).toEqual({ by: 'staff', text: 'Sân bảo trì đột xuất' })
    expect(parseCancelReason('Hết hạn giữ chỗ')).toEqual({ by: 'other', text: 'Hết hạn giữ chỗ' })
    expect(parseCancelReason(null)).toEqual({ by: 'other', text: null })
  })

  it('tiến trình: khách hủy chỉ hiện lý do; nhân viên hủy ghi rõ người hủy', () => {
    const history = (reason: string) => [
      { old_status: null, new_status: 'Pending', reason: 'Tao booking', changed_at: '2026-10-05T08:00:00.000Z' },
      { old_status: 'Pending', new_status: 'Cancelled', reason, changed_at: '2026-10-05T08:10:00.000Z' },
    ]

    expect(buildTimeline(makeDetail({ status: 'Cancelled', history: history('Khách hủy đơn: Bận việc') }))[1].note).toBe('Bận việc')
    expect(buildTimeline(makeDetail({ status: 'Cancelled', history: history('Khách hủy đơn') }))[1].note).toBeNull()
    expect(buildTimeline(makeDetail({ status: 'Cancelled', history: history('Nhân viên hủy đơn: Sân bảo trì') }))[1].note).toBe('Nhân viên hủy: Sân bảo trì')
  })
})

describe('chính sách hủy', () => {
  it('hai mức (hoàn 100% / không hoàn) khi không có mức hoàn một phần', () => {
    const tiers = policyTiers({ full_hours: 24, partial_hours: 12, partial_percent: 0 })

    expect(tiers.map((t) => [t.title, t.tone])).toEqual([
      ['Trước giờ đá ≥ 24 giờ', 'success'],
      ['Trước giờ đá < 24 giờ', 'warning'],
    ])
  })

  it('ba mức khi có hoàn một phần (mặc định 24h / 12h / 50%)', () => {
    const tiers = policyTiers({ full_hours: 24, partial_hours: 12, partial_percent: 50 })

    expect(tiers.map((t) => t.title)).toEqual([
      'Trước giờ đá ≥ 24 giờ',
      'Trước giờ đá 12–24 giờ',
      'Trước giờ đá < 12 giờ',
    ])
    expect(tiers[1].text).toBe('Hoàn 50% tiền cọc đã nhận.')
  })

  it('thông báo hủy lúc này: được hoàn / một phần / không hoàn / chưa cọc / không hủy được', () => {
    const now = Date.parse('2026-10-05T08:10:00.000Z')
    const base = makeDetail().cancellation

    const full = cancelNotice(base, 222000, now)
    expect(full).toMatchObject({ tone: 'success', title: 'Hủy lúc này: được hoàn 222.000 đ' })
    expect(full.body).toContain('Hiện tại 05/10/2026 · 15:10; còn 2 ngày 3 giờ trước giờ đá.')

    expect(
      cancelNotice({ ...base, refund_percent: 50, refund_amount: 111000 }, 222000, now).title,
    ).toBe('Hủy lúc này: được hoàn 111.000 đ (50%)')

    expect(cancelNotice({ ...base, refund_percent: 0, refund_amount: 0 }, 222000, now).tone).toBe('warning')
    expect(cancelNotice(base, 0, now).title).toContain('chưa đóng cọc')
    expect(cancelNotice({ ...base, can_cancel: false, reason: 'Đã quá giờ bắt đầu, không thể hủy' }, 222000, now)).toMatchObject({
      tone: 'neutral',
      body: 'Đã quá giờ bắt đầu, không thể hủy',
    })
  })
})

describe('khoản hoàn cọc', () => {
  const refund = (patch: object) => ({
    refund_id: 1,
    amount: 222000,
    reason: null,
    status: 'Pending' as const,
    created_at: '2026-10-05T08:10:00.000Z',
    processed_at: null,
    bank_name: null,
    bank_account_number: null,
    bank_account_name: null,
    failure_reason: null,
    ...patch,
  })

  it('không có khoản hoàn thì null', () => {
    expect(summarizeRefunds([])).toBeNull()
  })

  it('ưu tiên khoản đang chờ, rồi khoản lỗi, rồi đã xong', () => {
    expect(summarizeRefunds([refund({})])?.kind).toBe('pending')
    expect(summarizeRefunds([refund({ status: 'Failed', failure_reason: 'Sai số tài khoản' })])).toMatchObject({
      kind: 'failed',
      failureReason: 'Sai số tài khoản',
    })
    expect(summarizeRefunds([refund({ status: 'Successful' })])?.kind).toBe('done')
    expect(
      summarizeRefunds([refund({ refund_id: 1, status: 'Successful' }), refund({ refund_id: 2, amount: 1000 })]),
    ).toMatchObject({ kind: 'pending', total: 223000 })
  })
})

describe('form tài khoản nhận hoàn', () => {
  it('đổi tên có dấu thành không dấu viết hoa', () => {
    expect(normalizeAccountName('  Nguyễn  Minh Anh ')).toBe('NGUYEN MINH ANH')
    expect(normalizeAccountName('Đặng Thị Đào')).toBe('DANG THI DAO')
  })

  it('kiểm tra từng ô', () => {
    expect(validateRefundForm({ bank_name: 'ACB', bank_account_number: '1234 567 890', bank_account_name: 'Nguyễn Minh Anh' })).toEqual({})

    const errors = validateRefundForm({ bank_name: 'A', bank_account_number: '12ab', bank_account_name: ' ' })
    expect(Object.keys(errors).sort()).toEqual(['bank_account_name', 'bank_account_number', 'bank_name'])
  })
})
