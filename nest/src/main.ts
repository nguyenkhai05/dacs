import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { AppModule } from './app.module.js';

// CORS_ORIGIN: danh sách origin được phép, cách nhau bằng dấu phẩy.
// Mặc định cho phép Vite (5173) và Next/CRA (3001) khi phát triển local.
function parseOrigins(raw: string | undefined): string[] {
  const value = raw?.trim() || 'http://localhost:5173,http://localhost:3001';
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: parseOrigins(process.env.CORS_ORIGIN),
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

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
