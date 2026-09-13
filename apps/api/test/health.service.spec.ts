jest.mock('@crosspilot/integrations', () => ({
  RedisService: jest.fn().mockImplementation(() => ({
    healthCheck: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 2,
      message: 'Redis is responsive',
    }),
  })),
  MilvusVectorStore: jest.fn().mockImplementation(() => ({
    healthCheck: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 5,
      message: 'Milvus is healthy',
    }),
  })),
  SecretProvider: {
    getSecret: jest.fn().mockReturnValue(undefined),
  },
  getObjectStorageService: jest.fn().mockReturnValue({
    isEnabled: () => false,
  }),
}));


import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from '../src/modules/health/health.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return health check response structure', async () => {
    const res = await service.checkHealth();
    expect(res).toBeDefined();
    expect(res.services).toBeDefined();
    expect(res.services.api.status).toBe('up');
    expect(res.services.postgres.status).toBe('up');
    expect(res.services.redis.status).toBe('up');
    expect(res.services.milvus.status).toBe('up');
    expect(res.version).toBe('0.1.0');
  });

  it('should return AI health check response structure', async () => {
    const res = await service.checkAi();
    expect(res).toBeDefined();
    expect(res.provider).toBeDefined();
    expect(res.model).toBeDefined();
  });
});
