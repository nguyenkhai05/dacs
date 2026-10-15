import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { createService, updateService, type AdminService } from './adminServicesApi'
import {
  MAX_NAME,
  MAX_UNIT,
  buildServicePayload,
  groupNumber,
  parseWholeNumber,
  toFormValues,
} from './adminServicesUtils'

interface ServiceFormProps {
  /** null = đang thêm dịch vụ mới */
  service: AdminService | null
  /** Chỉ Admin được thêm/sửa; nhân viên chỉ xem (các ô bị khóa) */
  isAdmin: boolean
  token: string
  onSaved: (service: AdminService, message: string) => void
  onError: (message: string) => void
  /** "Hủy sửa": bỏ các thay đổi chưa lưu */
  onCancel: () => void
}

/** Ô "Chỉnh sửa · tên dịch vụ" / "Thêm dịch vụ". Được gắn key theo dịch vụ nên tự đặt lại khi đổi dịch vụ. */
export function ServiceForm({ service, isAdmin, token, onSaved, onError, onCancel }: ServiceFormProps) {
  const creating = service === null
  const [values, setValues] = useState(() => toFormValues(service))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  // Giá hiện "10.000" cho dễ đọc khi rời ô; đang gõ thì để nguyên để không nhảy con trỏ
  function formatPriceOnBlur() {
    const parsed = parseWholeNumber(values.price)
    if (parsed !== null) set('price', groupNumber(parsed))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isAdmin) return
    setFormError('')

    const built = buildServicePayload(values, service)

    if (!built.ok) {
      setFormError(built.error)
      onError(built.error)
      return
    }

    setSaving(true)
    try {
      const saved = service
        ? await updateService(service.service_id, built.changes, token)
        : await createService(built.payload, token)
      onSaved(saved, creating ? `Đã thêm dịch vụ ${saved.service_name}.` : `Đã lưu dịch vụ ${saved.service_name}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không lưu được dịch vụ. Vui lòng thử lại.'
      setFormError(message)
      onError(message)
    } finally {
      setSaving(false)
    }
  }

  const locked = !isAdmin || saving

  return (
    <section className="sv-card sv-form" id="sv-edit" aria-label={creating ? 'Thêm dịch vụ' : 'Chỉnh sửa dịch vụ'}>
      <h2>{creating ? 'Thêm dịch vụ' : `${isAdmin ? 'Chỉnh sửa' : 'Chi tiết'} · ${service.service_name}`}</h2>

      {!isAdmin && <p className="sv-note">Chỉ Admin được thêm hoặc chỉnh sửa dịch vụ. Bạn đang xem ở chế độ chỉ đọc.</p>}

      <form onSubmit={handleSubmit} noValidate>
        <label className="sv-field">
          <span>Tên dịch vụ</span>
          <input
            value={values.name}
            maxLength={MAX_NAME}
            disabled={locked}
            onChange={(event) => set('name', event.target.value)}
          />
        </label>

        <div className="sv-two">
          <label className="sv-field">
            <span>Đơn vị</span>
            <input
              value={values.unit}
              maxLength={MAX_UNIT}
              disabled={locked}
              placeholder="chai, chiếc, quả..."
              onChange={(event) => set('unit', event.target.value)}
            />
          </label>

          <label className="sv-field">
            <span>Giá bán</span>
            <span className="sv-money">
              <input
                value={values.price}
                inputMode="numeric"
                disabled={locked}
                placeholder="0"
                onChange={(event) => set('price', event.target.value)}
                onBlur={formatPriceOnBlur}
              />
            </span>
          </label>
        </div>

        <label className="sv-field">
          <span>Số lượng tồn kho</span>
          <input
            value={values.stock}
            inputMode="numeric"
            disabled={locked}
            placeholder="0"
            onChange={(event) => set('stock', event.target.value)}
          />
          <small>Không âm; cập nhật số lượng thực tế có thể phục vụ.</small>
        </label>

        <label className="sv-field">
          <span>Ngưỡng cảnh báo sắp hết</span>
          <input
            value={values.threshold}
            inputMode="numeric"
            disabled={locked}
            onChange={(event) => set('threshold', event.target.value)}
          />
          <small>Báo “sắp hết” khi tồn kho thấp hơn số này.</small>
        </label>

        <label className="sv-field">
          <span>Trạng thái</span>
          <select
            value={values.active ? 'active' : 'inactive'}
            disabled={locked}
            onChange={(event) => set('active', event.target.value === 'active')}
          >
            <option value="active">Hoạt động</option>
            <option value="inactive">Ngừng hoạt động</option>
          </select>
        </label>

        {formError && (
          <p className="sv-error" role="alert">
            {formError}
          </p>
        )}

        {isAdmin && (
          <div className="sv-actions">
            <Button type="submit" loading={saving} loadingText="Đang lưu...">
              Lưu dịch vụ
            </Button>
            <button type="button" className="sv-btn" disabled={saving} onClick={onCancel}>
              Hủy sửa
            </button>
          </div>
        )}
      </form>

      <p className="sv-note">
        Không cho khách chọn quá tồn kho. Đơn Chờ cọc chưa trừ kho; khi xác nhận sẽ kiểm tra tồn kho lại.
      </p>
    </section>
  )
}
