import type { ButtonHTMLAttributes } from 'react'
import './Button.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** true → khóa nút và hiện loadingText, chặn bấm nhiều lần */
  loading?: boolean
  loadingText?: string
  fullWidth?: boolean
}

export function Button({
  loading = false,
  loadingText,
  fullWidth = false,
  type = 'button', // mặc định "button" để không vô tình submit form
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn${fullWidth ? ' btn--full' : ''}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (loadingText ?? children) : children}
    </button>
  )
}
