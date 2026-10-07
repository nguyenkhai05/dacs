import { describe, expect, it } from 'vitest'
import { validateLogin } from './validation'

describe('validateLogin', () => {
  it('chấp nhận email hợp lệ', () => {
    expect(validateLogin({ identifier: 'anh@example.com', password: 'x' })).toEqual({})
  })

  it('chấp nhận số điện thoại 10–11 chữ số', () => {
    expect(validateLogin({ identifier: '0901234567', password: 'x' })).toEqual({})
    expect(validateLogin({ identifier: '09012345678', password: 'x' })).toEqual({})
  })

  it('bỏ khoảng trắng thừa ở đầu và cuối', () => {
    expect(validateLogin({ identifier: '  anh@example.com  ', password: 'x' })).toEqual({})
  })

  it('báo lỗi khi để trống cả hai ô', () => {
    expect(validateLogin({ identifier: '', password: '' })).toEqual({
      identifier: 'Vui lòng nhập email hoặc số điện thoại',
      password: 'Vui lòng nhập mật khẩu',
    })
  })

  it('chỉ có khoảng trắng cũng coi là trống', () => {
    expect(validateLogin({ identifier: '   ', password: 'x' }).identifier).toBe(
      'Vui lòng nhập email hoặc số điện thoại',
    )
  })

  it.each(['abc', 'anh@', '@example.com', '12345', '090123456789', '09012abc45'])(
    'báo lỗi định dạng với "%s"',
    (identifier) => {
      expect(validateLogin({ identifier, password: 'x' }).identifier).toBe(
        'Nhập email hợp lệ hoặc số điện thoại 10–11 chữ số',
      )
    },
  )

  it('không bắt buộc mật khẩu dài tối thiểu khi đăng nhập', () => {
    expect(validateLogin({ identifier: 'anh@example.com', password: '1' })).toEqual({})
  })
})
