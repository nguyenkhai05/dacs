/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true để truy cập được từ ngoài container / WSL (Dev Container, Docker)
    host: true,
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Test không kiểm tra giao diện nên bỏ qua việc xử lý file CSS cho nhanh
    css: false,
  },
})
