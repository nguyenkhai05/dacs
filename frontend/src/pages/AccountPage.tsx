import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import { Logo } from '../components/Logo'
import { SiteHeader } from '../components/SiteHeader'
import {
  changePassword,
  getProfile,
  updateProfile,
} from '../features/account/accountApi'
import type { ChangePasswordValues, Profile } from '../features/account/accountApi'
import { useAuth } from '../features/auth/useAuth'
import {
  buildProfilePatch,
  formatMemberSince,
  profileToForm,
  roleLabel,
  validatePasswordChange,
  validateProfile,
} from '../lib/accountValidation'
import type { PasswordErrors, ProfileErrors, ProfileForm } from '../lib/accountValidation'
import { ApiError, isAbortError } from '../lib/api'
import { todayLocal } from '../lib/format'
import './AccountPage.css'

type Notice = { type: 'success' | 'error'; text: string } | null

const EMPTY_PASSWORDS: ChangePasswordValues = {
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
}

// Màn 11 - Tài khoản của tôi: xem/sửa hồ sơ và đổi mật khẩu của chính người đăng nhập.
export default function AccountPage() {
  const { token, user, signOut, updateUser } = useAuth()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [form, setForm] = useState<ProfileForm | null>(null)
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [profileNotice, setProfileNotice] = useState<Notice>(null)
  const [saving, setSaving] = useState(false)

  const [passwords, setPasswords] = useState<ChangePasswordValues>(EMPTY_PASSWORDS)
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({})
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null)
  const [changing, setChanging] = useState(false)

  // Token hết hạn / tài khoản bị khóa (401) → xóa phiên; RequireAuth sẽ đưa về /login
  const messageFor = (error: unknown): string => {
    if (error instanceof ApiError) {
      if (error.status === 401) signOut()
      return error.message
    }
    return 'Có lỗi xảy ra. Vui lòng thử lại.'
  }

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    setLoadError('')

    getProfile(token, controller.signal)
      .then((data) => {
        setProfile(data)
        setForm(profileToForm(data))
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        if (error instanceof ApiError && error.status === 401) signOut()
        setLoadError(error instanceof ApiError ? error.message : 'Không tải được thông tin tài khoản.')
      })

    return () => controller.abort()
    // signOut ổn định (useCallback); reloadKey dùng cho nút "Thử lại"
  }, [token, reloadKey, signOut])

  const setField = (field: keyof ProfileForm, value: string) => {
    setForm((current) => (current ? { ...current, [field]: value } : current))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setProfileNotice(null)
  }

  const setPasswordField = (field: keyof ChangePasswordValues, value: string) => {
    setPasswords((current) => ({ ...current, [field]: value }))
    setPasswordErrors((current) => ({ ...current, [field]: undefined }))
    setPasswordNotice(null)
  }

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile || !form || !token || saving) return

    const found = validateProfile(form, profile)
    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    const patch = buildProfilePatch(form, profile)
    if (Object.keys(patch).length === 0) {
      setProfileNotice({ type: 'success', text: 'Thông tin chưa có thay đổi nào.' })
      return
    }

    setSaving(true)
    setProfileNotice(null)
    try {
      const result = await updateProfile(token, patch)
      setProfile(result.profile)
      setForm(profileToForm(result.profile))
      // Cập nhật tên/email trên thanh đầu trang và trong phiên đã lưu
      if (user) {
        updateUser({ ...user, full_name: result.profile.full_name, email: result.profile.email })
      }
      setProfileNotice({ type: 'success', text: result.message })
    } catch (error) {
      setProfileNotice({ type: 'error', text: messageFor(error) })
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!token || changing) return

    const found = validatePasswordChange(passwords)
    setPasswordErrors(found)
    if (Object.values(found).some(Boolean)) return

    setChanging(true)
    setPasswordNotice(null)
    try {
      const result = await changePassword(token, passwords)
      setPasswords(EMPTY_PASSWORDS)
      setPasswordNotice({ type: 'success', text: result.message })
    } catch (error) {
      // Giữ nguyên các ô đã nhập để người dùng sửa lại (vd nhập sai mật khẩu hiện tại)
      setPasswordNotice({ type: 'error', text: messageFor(error) })
    } finally {
      setChanging(false)
    }
  }

  const memberSince = profile ? formatMemberSince(profile.created_at) : ''

  return (
    <div className="acc-page">
      <SiteHeader active="account" />

      <main className="acc-main">
        <h1>Tài khoản của tôi</h1>
        <p className="acc-subtitle">Cập nhật thông tin cá nhân và giữ tài khoản của bạn an toàn.</p>

        {loadError ? (
          <div className="acc-state">
            <Alert>{loadError}</Alert>
            <Button onClick={() => setReloadKey((key) => key + 1)}>Thử lại</Button>
          </div>
        ) : !profile || !form ? (
          <p className="acc-state" role="status">
            Đang tải thông tin tài khoản...
          </p>
        ) : (
          <div className="acc-layout">
            <aside className="acc-card acc-profile" aria-label="Tóm tắt tài khoản">
              <div className="acc-avatar" aria-hidden="true">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="acc-avatar__img" />
                ) : (
                  profile.initials
                )}
              </div>
              <h2>{profile.full_name}</h2>
              {memberSince && <p className="acc-muted">Thành viên từ tháng {memberSince}</p>}
              <ul className="acc-roles">
                {profile.roles.map((role) => (
                  <li key={role}>{roleLabel(role)}</li>
                ))}
              </ul>
              <nav className="acc-nav" aria-label="Mục trong trang">
                <a href="#thong-tin-ca-nhan">Thông tin cá nhân</a>
                <a href="#bao-mat-tai-khoan">Bảo mật tài khoản</a>
              </nav>
            </aside>

            <div className="acc-forms">
              <section className="acc-card" id="thong-tin-ca-nhan" aria-labelledby="acc-info-title">
                <h2 id="acc-info-title">Thông tin cá nhân</h2>
                <form onSubmit={handleProfileSubmit} noValidate>
                  <div className="acc-grid">
                    <Field
                      label="Họ và tên"
                      value={form.fullName}
                      onChange={(e) => setField('fullName', e.target.value)}
                      error={errors.fullName}
                      autoComplete="name"
                      maxLength={100}
                    />
                    <div>
                      <Field
                        label="Số điện thoại"
                        value={form.phoneNumber}
                        onChange={(e) => setField('phoneNumber', e.target.value)}
                        error={errors.phoneNumber}
                        inputMode="numeric"
                        autoComplete="tel"
                      />
                      <p className="acc-hint">10–11 chữ số</p>
                    </div>
                    <Field
                      label="Email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setField('email', e.target.value)}
                      error={errors.email}
                      autoComplete="email"
                    />
                    <Field
                      label="Ngày sinh"
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => setField('dateOfBirth', e.target.value)}
                      error={errors.dateOfBirth}
                      min="1900-01-01"
                      max={todayLocal()}
                    />
                    <div className="acc-grid__full">
                      <Field
                        label="Địa chỉ"
                        value={form.address}
                        onChange={(e) => setField('address', e.target.value)}
                        error={errors.address}
                        autoComplete="street-address"
                        maxLength={255}
                      />
                    </div>
                  </div>
                  {profileNotice && <Alert variant={profileNotice.type}>{profileNotice.text}</Alert>}
                  <Button type="submit" loading={saving} loadingText="Đang lưu...">
                    Lưu thông tin
                  </Button>
                </form>
              </section>

              <section className="acc-card" id="bao-mat-tai-khoan" aria-labelledby="acc-password-title">
                <h2 id="acc-password-title">Đổi mật khẩu</h2>
                <form onSubmit={handlePasswordSubmit} noValidate>
                  <div className="acc-grid">
                    <div className="acc-grid__full">
                      <Field
                        label="Mật khẩu hiện tại"
                        type="password"
                        value={passwords.currentPassword}
                        onChange={(e) => setPasswordField('currentPassword', e.target.value)}
                        error={passwordErrors.currentPassword}
                        autoComplete="current-password"
                      />
                    </div>
                    <Field
                      label="Mật khẩu mới"
                      type="password"
                      value={passwords.newPassword}
                      onChange={(e) => setPasswordField('newPassword', e.target.value)}
                      error={passwordErrors.newPassword}
                      placeholder="Nhập mật khẩu mới"
                      autoComplete="new-password"
                    />
                    <Field
                      label="Xác nhận mật khẩu mới"
                      type="password"
                      value={passwords.confirmNewPassword}
                      onChange={(e) => setPasswordField('confirmNewPassword', e.target.value)}
                      error={passwordErrors.confirmNewPassword}
                      placeholder="Nhập lại mật khẩu mới"
                      autoComplete="new-password"
                    />
                  </div>
                  <p className="acc-hint">
                    Tối thiểu 8 ký tự, nên gồm chữ và số; không dùng lại mật khẩu cũ.
                  </p>
                  {passwordNotice && <Alert variant={passwordNotice.type}>{passwordNotice.text}</Alert>}
                  <Button type="submit" loading={changing} loadingText="Đang cập nhật...">
                    Cập nhật mật khẩu
                  </Button>
                </form>
              </section>
            </div>
          </div>
        )}
      </main>

      <footer className="acc-footer">
        <span>
          <Logo />
        </span>
        <small>© {new Date().getFullYear()} Đặt Sân Nhanh · Kết nối đam mê sân cỏ</small>
        <small>Giờ Việt Nam (UTC+7)</small>
      </footer>
    </div>
  )
}
