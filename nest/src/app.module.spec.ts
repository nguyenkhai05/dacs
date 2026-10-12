import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

// Kiểm tra toàn bộ phụ thuộc (DI) của ứng dụng khớp nhau: bắt lỗi kiểu
// "Nest can't resolve dependencies of ..." ngay khi chạy test, không cần MySQL thật.
describe('AppModule', () => {
  it('khởi tạo được toàn bộ module', async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_USER = 'test';
    process.env.DB_NAME = 'test';
    process.env.PAYMENT_SWEEP_ENABLED = 'false';

    const { AppModule } = await import('./app.module.js');
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error'],
    });

    expect(app).toBeDefined();
    await app.close();
  }, 60000);
});
