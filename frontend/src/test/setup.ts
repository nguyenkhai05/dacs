import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sau mỗi test: gỡ component đã render và xóa dữ liệu lưu trữ để các test không ảnh hưởng nhau
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})
