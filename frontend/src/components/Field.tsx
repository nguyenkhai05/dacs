import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import './Field.css'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  error?: string
  /** Phần tử đặt bên phải trong ô nhập, vd nút "Hiện/Ẩn" mật khẩu */
  endAdornment?: ReactNode
}

/** Nhãn + ô nhập + thông báo lỗi, đã gắn đúng thuộc tính truy cập (accessibility). */
export function Field({ label, error, endAdornment, ...inputProps }: FieldProps) {
  // useId tạo id duy nhất để <label htmlFor> trỏ đúng <input>
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className={`field__control${error ? ' field__control--error' : ''}`}>
        <input
          id={id}
          className="field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
        {endAdornment}
      </div>
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}
