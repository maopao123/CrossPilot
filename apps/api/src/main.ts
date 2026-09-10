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

  // Global prefix /api/v1, excluding /api/health to satisfy Section 260
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ai', 'api/health', 'api/health/ai'],
  });

  const port = Number(process.env.PORT || process.env.API_PORT) || 3001;
  await app.listen(port);
  logger.log(`🚀 CrossPilot NestJS API running on: http://localhost:${port}`);
  logger.log(`🔍 Health Check available at: http://localhost:${port}/api/v1/health`);
}

bootstrap();
