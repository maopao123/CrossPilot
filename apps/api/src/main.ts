import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('CrossPilotBootstrap');
  const app = await NestFactory.create(AppModule);

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

  const port = Number(process.env.PORT || process.env.API_PORT) || 3001;
  await app.listen(port);
  logger.log(`🚀 CrossPilot NestJS API running on: http://localhost:${port}`);
  logger.log(`🔍 Health Check available at: http://localhost:${port}/api/v1/health`);
}

bootstrap();
