import { describe, expect, it } from 'vitest'
import { fakeJwt, sampleUser } from '../../test/helpers'
import { clearSession, isTokenExpired, loadSession, saveSession } from './storage'

describe('isTokenExpired', () => {
  it('false với token còn hạn, true với token đã hết hạn', () => {
    expect(isTokenExpired(fakeJwt(3600))).toBe(false)
    expect(isTokenExpired(fakeJwt(-10))).toBe(true)
  })

  it('true với token hỏng', () => {
    expect(isTokenExpired('khong-phai-jwt')).toBe(true)
    expect(isTokenExpired('a.%%%.c')).toBe(true)
    expect(isTokenExpired('')).toBe(true)
  })
})

describe('session storage', () => {
  const session = () => ({ token: fakeJwt(), user: sampleUser })

  it('ghi nhớ đăng nhập → lưu ở localStorage', () => {
    saveSession(session(), true)

    expect(localStorage.getItem('dsn_session')).not.toBeNull()
    expect(sessionStorage.getItem('dsn_session')).toBeNull()
    expect(loadSession()?.user.full_name).toBe('Nguyễn Minh Anh')
  })

  it('không ghi nhớ → lưu ở sessionStorage', () => {
    saveSession(session(), false)

    expect(sessionStorage.getItem('dsn_session')).not.toBeNull()
    expect(localStorage.getItem('dsn_session')).toBeNull()
    expect(loadSession()).not.toBeNull()
  })

  it('đổi kiểu lưu thì dọn dữ liệu ở chỗ cũ', () => {
    saveSession(session(), true)
    saveSession(session(), false)

    expect(localStorage.getItem('dsn_session')).toBeNull()
  })

  it('clearSession xóa ở cả hai nơi', () => {
    saveSession(session(), true)
    clearSession()

    expect(loadSession()).toBeNull()
  })

  it('bỏ qua và dọn dữ liệu hỏng', () => {
    localStorage.setItem('dsn_session', '{không phải json')

    expect(loadSession()).toBeNull()
    expect(localStorage.getItem('dsn_session')).toBeNull()
  })

  it('bỏ qua phiên có token đã hết hạn', () => {
    saveSession({ token: fakeJwt(-60), user: sampleUser }, true)

    expect(loadSession()).toBeNull()
    expect(localStorage.getItem('dsn_session')).toBeNull()
  })

  it('bỏ qua dữ liệu sai cấu trúc', () => {
    localStorage.setItem('dsn_session', JSON.stringify({ token: 123 }))

    expect(loadSession()).toBeNull()
  })
})
