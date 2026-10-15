import { describe, expect, it } from 'vitest'
import type { Profile } from '../features/account/accountApi'
import {
  buildProfilePatch,
  formatMemberSince,
  profileToForm,
  roleLabel,
  validatePasswordChange,
  validateProfile,
} from './accountValidation'

const profile: Profile = {
  user_id: 1,
  full_name: 'Nguyễn Minh Anh',
  initials: 'MA',
  phone_number: '0912345678',
  email: 'minhanh@gmail.com',
  avatar_url: null,
  address: '25 Đường số 8',
  date_of_birth: '2002-08-12',
  roles: ['Customer'],
  created_at: '2026-09-03T10:00:00.000Z',
}

describe('validateProfile', () => {
  const TODAY = '2026-10-15'

  it('hồ sơ hợp lệ thì không có lỗi', () => {
    expect(validateProfile(profileToForm(profile), profile, TODAY)).toEqual({})
  })

  it('báo lỗi tên, số điện thoại, email sai', () => {
    const errors = validateProfile(
      { ...profileToForm(profile), fullName: '   ', phoneNumber: '12345', email: 'abc' },
      profile,
      TODAY,
    )
    expect(errors.fullName).toBe('Vui lòng nhập họ và tên')
    expect(errors.phoneNumber).toBe('Số điện thoại phải có 10–11 chữ số')
    expect(errors.email).toBe('Nhập email hợp lệ')
  })

  it('không cho xóa email đã có, nhưng cho để trống nếu trước đó chưa có', () => {
    const form = { ...profileToForm(profile), email: '' }
    expect(validateProfile(form, profile, TODAY).email).toBe('Email không được để trống')
    expect(validateProfile(form, { ...profile, email: null }, TODAY).email).toBeUndefined()
  })

  it('ngày sinh: cho phép trống, từ chối ngày không có thật / tương lai / trước 1900', () => {
    const base = profileToForm(profile)
    expect(validateProfile({ ...base, dateOfBirth: '' }, profile, TODAY).dateOfBirth).toBeUndefined()
    expect(validateProfile({ ...base, dateOfBirth: '2002-02-30' }, profile, TODAY).dateOfBirth).toBe('Ngày sinh không hợp lệ')
    expect(validateProfile({ ...base, dateOfBirth: '1899-12-31' }, profile, TODAY).dateOfBirth).toBe('Ngày sinh không hợp lệ')
    expect(validateProfile({ ...base, dateOfBirth: '2026-10-16' }, profile, TODAY).dateOfBirth).toBe('Ngày sinh không được ở tương lai')
  })

  it('địa chỉ tối đa 255 ký tự', () => {
    const errors = validateProfile({ ...profileToForm(profile), address: 'a'.repeat(256) }, profile, TODAY)
    expect(errors.address).toBe('Địa chỉ tối đa 255 ký tự')
  })
})

describe('buildProfilePatch', () => {
  it('không đổi gì thì patch rỗng', () => {
    expect(buildProfilePatch(profileToForm(profile), profile)).toEqual({})
  })

  it('chỉ gồm các trường đã đổi, đã cắt khoảng trắng', () => {
    const form = { ...profileToForm(profile), fullName: '  Trần Văn B  ', address: '45 Láng Hạ' }
    expect(buildProfilePatch(form, profile)).toEqual({ fullName: 'Trần Văn B', address: '45 Láng Hạ' })
  })

  it('xóa địa chỉ / ngày sinh gửi chuỗi rỗng', () => {
    const form = { ...profileToForm(profile), address: '', dateOfBirth: '' }
    expect(buildProfilePatch(form, profile)).toEqual({ address: '', dateOfBirth: '' })
  })

  it('không gửi email rỗng', () => {
    expect(buildProfilePatch({ ...profileToForm(profile), email: '' }, profile)).toEqual({})
  })
})

describe('validatePasswordChange', () => {
  const ok = { currentPassword: 'matkhaucu1', newPassword: 'matkhaumoi2', confirmNewPassword: 'matkhaumoi2' }

  it('hợp lệ thì không có lỗi', () => {
    expect(validatePasswordChange(ok)).toEqual({})
  })

  it('bỏ trống các ô', () => {
    const errors = validatePasswordChange({ currentPassword: '', newPassword: '', confirmNewPassword: '' })
    expect(errors.currentPassword).toBe('Vui lòng nhập mật khẩu hiện tại')
    expect(errors.newPassword).toBe('Vui lòng nhập mật khẩu mới')
    expect(errors.confirmNewPassword).toBe('Vui lòng nhập lại mật khẩu mới')
  })

  it('mật khẩu mới ngắn, quá dài (72 byte), trùng mật khẩu cũ, xác nhận không khớp', () => {
    expect(validatePasswordChange({ ...ok, newPassword: '1234567', confirmNewPassword: '1234567' }).newPassword)
      .toBe('Mật khẩu mới phải có ít nhất 8 ký tự')
    const long = 'a'.repeat(73)
    expect(validatePasswordChange({ ...ok, newPassword: long, confirmNewPassword: long }).newPassword)
      .toBe('Mật khẩu mới tối đa 72 byte')
    expect(validatePasswordChange({ ...ok, newPassword: ok.currentPassword, confirmNewPassword: ok.currentPassword }).newPassword)
      .toBe('Mật khẩu mới phải khác mật khẩu hiện tại')
    expect(validatePasswordChange({ ...ok, confirmNewPassword: 'khac-hoan-toan' }).confirmNewPassword)
      .toBe('Mật khẩu xác nhận không khớp')
  })
})

describe('formatMemberSince / roleLabel', () => {
  it('đổi sang tháng/năm theo giờ Việt Nam', () => {
    expect(formatMemberSince('2026-09-03T10:00:00.000Z')).toBe('09/2026')
    // 20:00 UTC ngày 31/8 đã là 03:00 ngày 1/9 ở Việt Nam
    expect(formatMemberSince('2026-08-31T20:00:00.000Z')).toBe('09/2026')
    expect(formatMemberSince('khong-phai-ngay')).toBe('')
  })

  it('nhãn vai trò tiếng Việt', () => {
    expect(roleLabel('Customer')).toBe('Khách hàng')
    expect(roleLabel('Admin')).toBe('Quản trị viên')
    expect(roleLabel('Khac')).toBe('Khac')
  })
})
