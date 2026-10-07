import type { ReactNode } from 'react'
import './Alert.css'

interface AlertProps {
  variant?: 'error' | 'success'
  children: ReactNode
}

// role="alert" để trình đọc màn hình đọc to thông báo ngay khi nó xuất hiện
export function Alert({ variant = 'error', children }: AlertProps) {
  return (
    <div className={`alert alert--${variant}`} role="alert">
      {children}
    </div>
  )
}
