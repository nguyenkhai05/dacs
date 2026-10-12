import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { mapDbError } from './common/db-error.util.js';
import { DatabaseService } from './database/database.service.js';

// CORS_ORIGIN: danh sách origin được phép, cách nhau bằng dấu phẩy.
// Mặc định cho phép Vite (5173) và Next/CRA (3001) khi phát triển local.
function parseOrigins(raw: string | undefined): string[] {
  const value = raw?.trim() || 'http://localhost:5173,http://localhost:3001';
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// Khi phát triển, Vite có thể tự đổi cổng (5174, 5175...) hoặc được mở bằng 127.0.0.1.
// Cho phép mọi localhost/127.0.0.1 ở chế độ không-production để khỏi bị chặn CORS.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

async function checkDatabase(app: { get: <T>(t: new (...a: never[]) => T) => T }) {
  const logger = new Logger('Startup');
  try {
    const database = app.get(DatabaseService);
    const roles = await database.query<{ role_name: string }[]>(
      'SELECT role_name FROM roles',
    );
    const names = roles.map((r) => r.role_name);
    const missing = ['Admin', 'Staff', 'Customer'].filter((r) => !names.includes(r));
    if (missing.length > 0) {
      logger.warn(
        `Bảng roles thiếu: ${missing.join(', ')}. Đăng ký tài khoản sẽ lỗi cho đến khi chạy lại phần INSERT roles trong football_pitch_db.sql.`,
      );
    } else {
      logger.log('Đã kết nối MySQL, dữ liệu vai trò đầy đủ.');
    }
  } catch (error) {
    const mapped = mapDbError(error);
    logger.error(
      mapped?.message ??
        `Không đọc được CSDL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowed = parseOrigins(process.env.CORS_ORIGIN);
  const isProduction = process.env.NODE_ENV === 'production';

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true); // Postman, curl, server-to-server
      if (allowed.includes(origin)) return callback(null, true);
      if (!isProduction && LOCAL_ORIGIN.test(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ?? 3000;
  // 0.0.0.0 để Dev Container / WSL chuyển cổng được.
  await app.listen(port, '0.0.0.0');
  new Logger('Startup').log(`Backend chạy tại http://localhost:${port} (kiểm tra: /health)`);

  await checkDatabase(app);
}

await bootstrap();
