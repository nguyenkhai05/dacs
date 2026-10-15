import { useMemo, useState, type FormEvent } from 'react'
import { formatPrice, toMinutes } from '../../lib/format'
import { DAY_TYPES, DAY_TYPE_LABEL } from '../../lib/adminPitchLabels'
import {
  createCategory,
  createPriceSlot,
  deletePriceSlot,
  updateCategory,
  updatePriceSlot,
  type DayType,
  type PitchCategory,
  type PriceSlot,
} from './adminPitchesApi'

interface CategoryPricePanelProps {
  categories: PitchCategory[]
  loading: boolean
  isAdmin: boolean
  token: string
  /** Gọi sau khi lưu thành công để trang tải lại dữ liệu */
  onChanged: (message: string) => void
  onError: (message: string) => void
}

const MAX_PRICE = 99_999_999

interface SlotDraft {
  day_type: DayType
  start_time: string
  end_time: string
  price: string
}

const EMPTY_DRAFT: SlotDraft = { day_type: 'All', start_time: '', end_time: '', price: '' }

/** Ô "Loại sân & bảng giá": danh mục loại sân + khung giá theo giờ của loại đang chọn. */
export function CategoryPricePanel({ categories, loading, isAdmin, token, onChanged, onError }: CategoryPricePanelProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [categoryForm, setCategoryForm] = useState<'add' | 'edit' | null>(null)
  const [catName, setCatName] = useState('')
  const [catDesc, setCatDesc] = useState('')
  const [catActive, setCatActive] = useState(true)
  const [newSlot, setNewSlot] = useState<SlotDraft>(EMPTY_DRAFT)
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<SlotDraft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)

  // Chưa chọn (hoặc loại đã chọn không còn) → lấy loại đầu tiên
  const selected = useMemo(
    () => categories.find((item) => item.category_id === selectedId) ?? categories[0] ?? null,
    [categories, selectedId],
  )

  async function run(task: () => Promise<unknown>, successMessage: string): Promise<boolean> {
    setBusy(true)
    try {
      await task()
      onChanged(successMessage)
      return true
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Không thực hiện được thao tác.')
      return false
    } finally {
      setBusy(false)
    }
  }

  function openCategoryForm(mode: 'add' | 'edit') {
    setCategoryForm(mode)
    if (mode === 'edit' && selected) {
      setCatName(selected.category_name)
      setCatDesc(selected.description ?? '')
      setCatActive(selected.is_active)
    } else {
      setCatName('')
      setCatDesc('')
      setCatActive(true)
    }
  }

  async function submitCategory(event: FormEvent) {
    event.preventDefault()
    if (!catName.trim()) {
      onError('Tên loại sân không được để trống.')
      return
    }
    const ok =
      categoryForm === 'edit' && selected
        ? await run(
            () =>
              updateCategory(
                selected.category_id,
                { category_name: catName.trim(), description: catDesc.trim(), is_active: catActive },
                token,
              ),
            `Đã lưu loại sân ${catName.trim()}.`,
          )
        : await run(
            () => createCategory({ category_name: catName.trim(), description: catDesc.trim() || undefined }, token),
            `Đã thêm loại sân ${catName.trim()}.`,
          )
    if (ok) setCategoryForm(null)
  }

  /** Kiểm tra form khung giá; trả về dữ liệu gửi lên hoặc null nếu sai (đã báo lỗi). */
  function readDraft(draft: SlotDraft) {
    if (!draft.start_time || !draft.end_time) {
      onError('Nhập giờ bắt đầu và giờ kết thúc.')
      return null
    }
    if (toMinutes(draft.end_time) <= toMinutes(draft.start_time)) {
      onError('Giờ kết thúc phải sau giờ bắt đầu.')
      return null
    }
    const price = Number(draft.price)
    if (draft.price === '' || !Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
      onError(`Giá phải từ 0 đến ${formatPrice(MAX_PRICE)}.`)
      return null
    }
    return {
      day_type: draft.day_type,
      start_time: draft.start_time,
      end_time: draft.end_time,
      price_per_hour: price,
    }
  }

  async function addSlot(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    const payload = readDraft(newSlot)
    if (!payload) return
    const ok = await run(
      () => createPriceSlot(selected.category_id, payload, token),
      `Đã thêm khung giá ${payload.start_time}–${payload.end_time}.`,
    )
    if (ok) setNewSlot(EMPTY_DRAFT)
  }

  function startEdit(slot: PriceSlot) {
    setEditingSlotId(slot.price_slot_id)
    setEditDraft({
      day_type: slot.day_type,
      start_time: slot.start_time,
      end_time: slot.end_time,
      price: String(slot.price_per_hour),
    })
  }

  async function saveEdit(slotId: number) {
    const payload = readDraft(editDraft)
    if (!payload) return
    const ok = await run(() => updatePriceSlot(slotId, payload, token), 'Đã lưu khung giá. Giá mới chỉ áp dụng cho đơn đặt sau này.')
    if (ok) setEditingSlotId(null)
  }

  function removeSlot(slot: PriceSlot) {
    if (!window.confirm(`Xóa khung giá ${slot.start_time}–${slot.end_time} (${DAY_TYPE_LABEL[slot.day_type]})?`)) return
    void run(() => deletePriceSlot(slot.price_slot_id, token), 'Đã xóa khung giá.')
  }

  // ----- Kiểm tra phủ giờ
  const coverage = (() => {
    if (!selected || selected.price_slots.length === 0) return null
    const from = selected.price_slots.reduce((min, s) => (s.start_time < min ? s.start_time : min), '99:99')
    const to = selected.price_slots.reduce((max, s) => (s.end_time > max ? s.end_time : max), '00:00')
    const gaps = (['Weekday', 'Weekend', 'Holiday'] as const).flatMap((key) =>
      (selected.price_gaps[key] ?? []).map((gap) => `${DAY_TYPE_LABEL[key]} ${gap.start_time}–${gap.end_time}`),
    )
    return { from, to, gaps }
  })()

  return (
    <section className="ap-card" id="ap-pricing" aria-label="Loại sân và bảng giá">
      <h2>Loại sân & bảng giá</h2>

      <div className="ap-cat-bar">
        <label className="ap-field">
          <span>Danh mục loại sân</span>
          <select
            value={selected?.category_id ?? ''}
            onChange={(e) => {
              setSelectedId(Number(e.target.value))
              setEditingSlotId(null)
              setCategoryForm(null)
            }}
            disabled={categories.length === 0}
          >
            {categories.map((item) => (
              <option key={item.category_id} value={item.category_id}>
                {item.category_name}
                {item.is_active ? '' : ' (đang ẩn)'}
              </option>
            ))}
          </select>
        </label>
        {isAdmin && (
          <div className="ap-actions">
            <button type="button" className="ap-btn" onClick={() => openCategoryForm('add')}>
              + Thêm loại
            </button>
            <button type="button" className="ap-btn" disabled={!selected} onClick={() => openCategoryForm('edit')}>
              Sửa loại
            </button>
          </div>
        )}
      </div>

      {categoryForm && (
        <form className="ap-inline-form" onSubmit={submitCategory} noValidate>
          <b>{categoryForm === 'edit' ? 'Sửa loại sân' : 'Thêm loại sân'}</b>
          <label className="ap-field">
            <span>Tên loại sân</span>
            <input value={catName} maxLength={100} placeholder="Vd: 5 người" onChange={(e) => setCatName(e.target.value)} />
          </label>
          <label className="ap-field">
            <span>Mô tả</span>
            <input value={catDesc} maxLength={1000} placeholder="Vd: 20 × 40 m" onChange={(e) => setCatDesc(e.target.value)} />
          </label>
          {categoryForm === 'edit' && (
            <label className="ap-check">
              <input type="checkbox" checked={catActive} onChange={(e) => setCatActive(e.target.checked)} />
              Đang sử dụng (bỏ chọn để ẩn loại sân này khỏi việc gán sân mới)
            </label>
          )}
          <div className="ap-actions">
            <button type="submit" className="ap-btn ap-btn--primary" disabled={busy}>
              Lưu loại sân
            </button>
            <button type="button" className="ap-btn" onClick={() => setCategoryForm(null)}>
              Hủy
            </button>
          </div>
        </form>
      )}

      <div className="ap-scroll">
        <table className="ap-table">
          <thead>
            <tr>
              <th scope="col">Loại sân</th>
              <th scope="col">Mô tả</th>
              <th scope="col">Số sân</th>
              <th scope="col">Tình trạng</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="ap-empty">
                  {loading ? 'Đang tải...' : 'Chưa có loại sân nào.'}
                </td>
              </tr>
            )}
            {categories.map((item) => (
              <tr
                key={item.category_id}
                className={selected?.category_id === item.category_id ? 'is-selected' : undefined}
                onClick={() => setSelectedId(item.category_id)}
              >
                <td><b>{item.category_name}</b></td>
                <td>{item.description || '—'}</td>
                <td>{item.pitch_count}</td>
                <td>{item.is_active ? 'Đang sử dụng' : 'Đang ẩn'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <>
          <h3>Khung giá · {selected.category_name}</h3>
          <div className="ap-scroll">
            <table className="ap-table">
              <thead>
                <tr>
                  <th scope="col">Áp dụng</th>
                  <th scope="col">Giờ bắt đầu</th>
                  <th scope="col">Giờ kết thúc</th>
                  <th scope="col">Giá / giờ</th>
                  {isAdmin && <th scope="col">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {selected.price_slots.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="ap-empty">
                      Loại sân này chưa có khung giá nên khách chưa đặt được.
                    </td>
                  </tr>
                )}
                {selected.price_slots.map((slot) =>
                  editingSlotId === slot.price_slot_id ? (
                    <tr key={slot.price_slot_id} className="is-editing">
                      <td>
                        <DayTypeSelect value={editDraft.day_type} onChange={(v) => setEditDraft({ ...editDraft, day_type: v })} />
                      </td>
                      <td>
                        <input type="time" step={1800} value={editDraft.start_time} onChange={(e) => setEditDraft({ ...editDraft, start_time: e.target.value })} aria-label="Giờ bắt đầu" />
                      </td>
                      <td>
                        <input type="time" step={1800} value={editDraft.end_time} onChange={(e) => setEditDraft({ ...editDraft, end_time: e.target.value })} aria-label="Giờ kết thúc" />
                      </td>
                      <td>
                        <input type="number" min={0} max={MAX_PRICE} step={1000} value={editDraft.price} onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })} aria-label="Giá mỗi giờ" />
                      </td>
                      <td className="ap-row-actions">
                        <button type="button" disabled={busy} onClick={() => void saveEdit(slot.price_slot_id)}>Lưu</button>
                        <button type="button" onClick={() => setEditingSlotId(null)}>Hủy</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={slot.price_slot_id}>
                      <td>{DAY_TYPE_LABEL[slot.day_type]}</td>
                      <td><b>{slot.start_time}</b></td>
                      <td>{slot.end_time}</td>
                      <td>{formatPrice(slot.price_per_hour)}</td>
                      {isAdmin && (
                        <td className="ap-row-actions">
                          <button type="button" onClick={() => startEdit(slot)}>Sửa</button>
                          <button type="button" onClick={() => removeSlot(slot)}>Xóa</button>
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {isAdmin && (
            <form className="ap-slot-form" onSubmit={addSlot} noValidate>
              <DayTypeSelect value={newSlot.day_type} onChange={(v) => setNewSlot({ ...newSlot, day_type: v })} />
              <input type="time" step={1800} value={newSlot.start_time} onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })} aria-label="Giờ bắt đầu" />
              <input type="time" step={1800} value={newSlot.end_time} onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value })} aria-label="Giờ kết thúc" />
              <input type="number" min={0} max={MAX_PRICE} step={1000} placeholder="Giá / giờ (đ)" value={newSlot.price} onChange={(e) => setNewSlot({ ...newSlot, price: e.target.value })} aria-label="Giá mỗi giờ" />
              <button type="submit" className="ap-btn" disabled={busy}>+ Thêm khung giá</button>
            </form>
          )}

          {coverage && coverage.gaps.length === 0 && (
            <div className="ap-box ap-box--ok">
              <b>Đủ {coverage.from}–{coverage.to}, không có khoảng trống khung giá</b>
              <p>Các dải giá phải liền nhau và phủ toàn bộ giờ mở cửa.</p>
            </div>
          )}
          {coverage && coverage.gaps.length > 0 && (
            <div className="ap-box ap-box--warn" role="alert">
              <b>Còn khoảng giờ chưa có giá</b>
              <p>{coverage.gaps.join(' · ')}. Khách không đặt được các khung giờ này.</p>
            </div>
          )}
          <p className="ap-note">
            Booking đã tạo giữ giá cũ; giá mới chỉ áp dụng cho đơn phát sinh sau khi lưu. Mỗi dòng được lưu ngay khi bấm
            Lưu, Thêm hoặc Xóa.
          </p>
        </>
      )}
    </section>
  )
}

function DayTypeSelect({ value, onChange }: { value: DayType; onChange: (value: DayType) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as DayType)} aria-label="Áp dụng cho">
      {DAY_TYPES.map((item) => (
        <option key={item} value={item}>
          {DAY_TYPE_LABEL[item]}
        </option>
      ))}
    </select>
  )
}
