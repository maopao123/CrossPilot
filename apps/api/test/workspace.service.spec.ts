import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceService } from '../src/modules/workspace/workspace.service.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      workspaceMember: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      marketplace: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WorkspaceService>(WorkspaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return current workspace matching Section 79 spec', async () => {
    prisma.workspaceMember.findFirst.mockResolvedValue({
      id: 'mem_001',
      role: 'OWNER',
      workspace: {
        id: 'ws_001',
        name: 'CrossPilot Demo',
        slug: 'crosspilot-demo',
        defaultMarketplace: {
          code: 'AMAZON_US',
        },
      },
    });

    const res = await service.getCurrentWorkspace('usr_001');
    expect(res).toBeDefined();
    expect(res.id).toBe('ws_001');
    expect(res.name).toBe('CrossPilot Demo');
    expect(res.defaultMarketplace).toBe('AMAZON_US');
  });
});
