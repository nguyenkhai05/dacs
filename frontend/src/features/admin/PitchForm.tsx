import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { PITCH_STATUSES, PITCH_STATUS_LABEL } from '../../lib/adminPitchLabels'
import {
  changePitchStatus,
  createPitch,
  updatePitch,
  type AdminPitch,
  type PitchCategory,
  type PitchPayload,
  type PitchStatus,
} from './adminPitchesApi'

interface PitchFormProps {
  /** null = đang thêm sân mới */
  pitch: AdminPitch | null
  categories: PitchCategory[]
  /** Admin sửa được mọi thứ; Staff chỉ đổi được trạng thái sân */
  isAdmin: boolean
  token: string
  onSaved: (pitch: AdminPitch, message: string) => void
  onError: (message: string) => void
  onCancelCreate: () => void
}

const MAX_AMENITIES = 20

/** Ô "Chỉnh sửa · tên sân" / "Thêm sân mới". Component được gắn key theo sân nên tự đặt lại khi đổi sân. */
export function PitchForm({ pitch, categories, isAdmin, token, onSaved, onError, onCancelCreate }: PitchFormProps) {
  const creating = pitch === null
  const [name, setName] = useState(pitch?.pitch_name ?? '')
  const [categoryId, setCategoryId] = useState(String(pitch?.category_id ?? ''))
  const [surface, setSurface] = useState(pitch?.surface_type ?? 'Cỏ nhân tạo')
  const [status, setStatus] = useState<PitchStatus>(pitch?.status ?? 'Available')
  const [imageUrl, setImageUrl] = useState(pitch?.image_url ?? '')
  const [notes, setNotes] = useState(pitch?.notes ?? '')
  const [address, setAddress] = useState(pitch?.address ?? '')
  const [district, setDistrict] = useState(pitch?.district ?? '')
  const [amenities, setAmenities] = useState((pitch?.amenities ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Loại sân đang bị ẩn không cho gán thêm, trừ khi sân này đang thuộc loại đó
  const categoryOptions = categories.filter((item) => item.is_active || item.category_id === pitch?.category_id)
  const fieldsLocked = !isAdmin // Staff chỉ sửa được trạng thái
  const statusChanged = pitch !== null && status !== pitch.status
  const showMaintenanceWarning = statusChanged && status !== 'Available' && (pitch?.upcoming_bookings ?? 0) > 0

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError('')

    const fail = (message: string) => {
      setFormError(message)
      onError(message)
    }

    // Nhân viên: chỉ gọi API đổi trạng thái
    if (!isAdmin && pitch) {
      if (!statusChanged) return fail('Bạn chưa đổi trạng thái nào.')
      setSaving(true)
      try {
        const saved = await changePitchStatus(pitch.pitch_id, status, token)
        onSaved(saved, `Đã chuyển ${saved.pitch_name} sang "${PITCH_STATUS_LABEL[saved.status]}".`)
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Không đổi được trạng thái.')
      } finally {
        setSaving(false)
      }
      return
    }

    if (!name.trim()) return fail('Tên sân không được để trống.')
    if (!categoryId) return fail('Hãy chọn loại sân.')
    if (!surface.trim()) return fail('Mặt sân không được để trống.')
    const amenityList = amenities
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    if (amenityList.length > MAX_AMENITIES) return fail(`Tối đa ${MAX_AMENITIES} tiện ích.`)

    const payload: PitchPayload = {
      pitch_name: name.trim(),
      category_id: Number(categoryId),
      status,
      surface_type: surface.trim(),
      image_url: imageUrl.trim(),
      notes: notes.trim(),
      address: address.trim(),
      district: district.trim(),
      amenities: amenityList,
    }

    setSaving(true)
    try {
      const saved = creating ? await createPitch(payload, token) : await updatePitch(pitch.pitch_id, payload, token)
      onSaved(saved, creating ? `Đã thêm sân ${saved.pitch_name}.` : `Đã lưu thay đổi ${saved.pitch_name}.`)
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Không lưu được sân.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="ap-card" id="ap-edit" aria-label={creating ? 'Thêm sân' : 'Chỉnh sửa sân'}>
      <h2>{creating ? 'Thêm sân mới' : `Chỉnh sửa · ${pitch.pitch_name}`}</h2>
      {!isAdmin && (
        <p className="ap-note">Nhân viên chỉ được đổi trạng thái sân. Các thông tin khác do Admin chỉnh sửa.</p>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div className="ap-two">
          <label className="ap-field">
            <span>Tên sân</span>
            <input value={name} maxLength={100} disabled={fieldsLocked} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="ap-field">
            <span>Loại sân</span>
            <select value={categoryId} disabled={fieldsLocked} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Chọn loại sân</option>
              {categoryOptions.map((item) => (
                <option key={item.category_id} value={item.category_id}>
                  {item.category_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ap-two">
          <label className="ap-field">
            <span>Mặt sân</span>
            <input value={surface} maxLength={50} disabled={fieldsLocked} onChange={(e) => setSurface(e.target.value)} />
          </label>
          <label className="ap-field">
            <span>Trạng thái</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as PitchStatus)}>
              {PITCH_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {PITCH_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="ap-field">
          <span>URL ảnh sân</span>
          <input
            value={imageUrl}
            maxLength={500}
            disabled={fieldsLocked}
            placeholder="https://..."
            onChange={(e) => setImageUrl(e.target.value)}
          />
          <small>Dán URL ảnh hợp lệ; ảnh được dùng ở danh sách và chi tiết sân.</small>
        </label>
        <label className="ap-field">
          <span>Ghi chú</span>
          <textarea rows={3} maxLength={2000} disabled={fieldsLocked} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="ap-two">
          <label className="ap-field">
            <span>Địa chỉ</span>
            <input value={address} maxLength={255} disabled={fieldsLocked} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="ap-field">
            <span>Quận / huyện</span>
            <input value={district} maxLength={100} disabled={fieldsLocked} onChange={(e) => setDistrict(e.target.value)} />
          </label>
        </div>
        <label className="ap-field">
          <span>Tiện ích</span>
          <input
            value={amenities}
            disabled={fieldsLocked}
            placeholder="Đèn LED, Bãi đỗ xe, Nước uống (cách nhau bằng dấu phẩy)"
            onChange={(e) => setAmenities(e.target.value)}
          />
        </label>

        {showMaintenanceWarning && pitch && (
          <div className="ap-box ap-box--warn" role="alert">
            <b>Cảnh báo khi chuyển sang {PITCH_STATUS_LABEL[status]}</b>
            <p>
              {pitch.pitch_name} còn {pitch.upcoming_bookings} booking tương lai. Hệ thống sẽ không cho đổi trạng thái
              cho tới khi các đơn này được xử lý (hủy hoặc đổi sân); không tự động hủy booking.
            </p>
          </div>
        )}
        {formError && (
          <div className="ap-box ap-box--error" role="alert">
            {formError}
          </div>
        )}

        <div className="ap-actions">
          <Button type="submit" loading={saving} loadingText="Đang lưu...">
            {creating ? 'Tạo sân' : 'Lưu thay đổi sân'}
          </Button>
          {creating && (
            <button type="button" className="ap-btn" onClick={onCancelCreate}>
              Hủy
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
