import { describe, expect, it } from 'vitest'
import { validateRegister } from './registerValidation'

const valid = {
  fullName: 'Nguyễn Văn B',
  phoneNumber: '0912345678',
  email: 'b@example.com',
  password: 'matkhau123',
  confirmPassword: 'matkhau123',
  acceptedTerms: true,
}

describe('validateRegister', () => {
  it('chấp nhận dữ liệu đăng ký hợp lệ', () => {
    expect(validateRegister(valid)).toEqual({})
  })

  it('bắt buộc đồng ý điều khoản', () => {
    expect(validateRegister({ ...valid, acceptedTerms: false })).toEqual({
      acceptedTerms: 'Bạn cần đồng ý với điều khoản sử dụng',
    })
  })

  it('kiểm tra mật khẩu tối thiểu 8 ký tự', () => {
    expect(validateRegister({ ...valid, password: '1234567', confirmPassword: '1234567' }).password).toBe(
      'Mật khẩu phải có ít nhất 8 ký tự',
    )
  })

  it('kiểm tra mật khẩu xác nhận', () => {
    expect(validateRegister({ ...valid, confirmPassword: 'khacnhau' }).confirmPassword).toBe(
      'Mật khẩu xác nhận không khớp',
    )
  })
})
