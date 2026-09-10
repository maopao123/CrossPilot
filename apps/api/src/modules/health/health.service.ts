import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService, MilvusVectorStore } from '@crosspilot/integrations';
import {
  HealthCheckResponse,
  AiHealthResponse,
  ServiceHealthItem,
  ServiceHealthStatus,
} from '@crosspilot/shared';

@Injectable()
export class HealthService {
  private redisService: RedisService;
  private milvusStore: MilvusVectorStore;

  constructor(private prisma: PrismaService) {
    this.redisService = new RedisService();
    this.milvusStore = new MilvusVectorStore();
  }

  async checkHealth(): Promise<HealthCheckResponse> {
    const apiHealth: ServiceHealthItem = {
      status: 'up',
      uptime: process.uptime(),
      message: 'NestJS API is running',
    };

    // Check Postgres
    const postgresHealth = await this.checkPostgres();

    // Check Redis
    const redisHealth = await this.redisService.healthCheck();

    // Check Milvus
    const milvusHealth = await this.milvusStore.healthCheck();

    let overallStatus: ServiceHealthStatus = 'ok';
    const anyDown = [postgresHealth, redisHealth, milvusHealth].some(
      (s) => s.status === 'down',
    );
    const anyDegraded = [postgresHealth, redisHealth, milvusHealth].some(
      (s) => s.status === 'degraded',
    );

    if (anyDown) {
      // In development or when external infra isn't reachable locally, report degraded
      overallStatus = 'degraded';
    } else if (anyDegraded) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      services: {
        api: apiHealth,
        postgres: postgresHealth,
        redis: redisHealth,
        milvus: milvusHealth,
      },
    };
  }

  async checkAi(): Promise<AiHealthResponse> {
    const provider = process.env.LLM_PROVIDER || 'openai';
    const model = process.env.LLM_MODEL || 'gpt-4o-mini';
    const hasKey = Boolean(process.env.LLM_API_KEY && process.env.LLM_API_KEY !== 'mock-key-for-development');

    return {
      status: hasKey ? 'up' : 'degraded',
      provider,
      model,
      timestamp: new Date().toISOString(),
      message: hasKey
        ? 'AI Provider configured'
        : 'AI Provider is using development mock/placeholder credentials',
    };
  }

  private async checkPostgres(): Promise<ServiceHealthItem> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'up',
        latencyMs: Date.now() - start,
        message: 'PostgreSQL database connected',
      };
    } catch (error: any) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: error?.message || 'Database connection error',
      };
    }
  }
}
