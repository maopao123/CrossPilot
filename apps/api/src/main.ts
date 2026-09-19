import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logger = new Logger('CrossPilotBootstrap');
  const app = await NestFactory.create(AppModule);

  // Support large image payloads (e.g. Base64 uploads up to 50MB)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Enable CORS
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global prefix /api/v1
  app.setGlobalPrefix('api/v1');

  // Support /api/health and /health redirects to /api/v1/health (Section 260)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/health', (_req: any, res: any) =>
    res.redirect(307, '/api/v1/health'),
  );
  httpAdapter.get('/health', (_req: any, res: any) =>
    res.redirect(307, '/api/v1/health'),
  );
  httpAdapter.get('/internal/metrics', (_req: any, res: any) =>
    res.redirect(307, '/api/v1/internal/metrics'),
  );
  httpAdapter.get('/metrics', (_req: any, res: any) =>
    res.redirect(307, '/api/v1/internal/metrics'),
  );

  const port = Number(process.env.PORT || process.env.API_PORT) || 3001;
  const server = await app.listen(port);

  // Prevent connection termination on long AI / Tool generation calls (5 min)
  if (server && typeof (server as any).setTimeout === 'function') {
    (server as any).setTimeout(300000);
    (server as any).headersTimeout = 305000;
    (server as any).requestTimeout = 300000;
    (server as any).keepAliveTimeout = 65000;
  }

  logger.log(`🚀 CrossPilot NestJS API running on: http://localhost:${port}`);
  logger.log(`🔍 Health Check available at: http://localhost:${port}/api/v1/health`);
}

bootstrap();
