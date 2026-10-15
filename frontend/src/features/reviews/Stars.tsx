import { useRef } from 'react'
import type { KeyboardEvent } from 'react'

const STARS = [1, 2, 3, 4, 5]

interface StarsProps {
  /** Số sao tô màu (đã làm tròn), 0–5 */
  value: number
  /** Đọc cho trình đọc màn hình, vd "4,8 trên 5 sao" */
  label: string
}

/** Hàng sao chỉ để xem (không bấm được). */
export function Stars({ value, label }: StarsProps) {
  return (
    <span className="rv-stars" role="img" aria-label={label}>
      {STARS.map((star) => (
        <span key={star} className={star <= value ? 'is-on' : undefined} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}

interface StarInputProps {
  value: number
  onChange: (rating: number) => void
  disabled?: boolean
  /** id của phần tử đặt tên cho nhóm (nhãn "Chọn mức đánh giá") */
  labelledBy: string
}

/**
 * Chọn số sao: nhóm radio bàn phím được.
 * Tab vào nhóm, rồi dùng phím mũi tên để đổi số sao (giống radio thường).
 */
export function StarInput({ value, onChange, disabled = false, labelledBy }: StarInputProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function move(next: number) {
    const clamped = Math.min(5, Math.max(1, next))
    onChange(clamped)
    refs.current[clamped - 1]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      move((value || 0) + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      move((value || 2) - 1)
    }
  }

  return (
    <div className="rv-star-input" role="radiogroup" aria-labelledby={labelledBy}>
      {STARS.map((star) => (
        <button
          key={star}
          ref={(node) => {
            refs.current[star - 1] = node
          }}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} sao`}
          // Chỉ một nút nằm trong thứ tự Tab: nút đang chọn (hoặc nút đầu nếu chưa chọn)
          tabIndex={value === star || (value === 0 && star === 1) ? 0 : -1}
          disabled={disabled}
          className={star <= value ? 'is-on' : undefined}
          onClick={() => onChange(star)}
          onKeyDown={onKeyDown}
        >
          <span aria-hidden="true">★</span>
        </button>
      ))}
    </div>
  )
}
