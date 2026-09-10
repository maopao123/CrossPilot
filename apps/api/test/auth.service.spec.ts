import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;

  beforeEach(async () => {
    prisma = {
      marketplace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'mp_001',
          code: 'AMAZON_US',
          name: 'Amazon US',
        }),
        create: jest.fn().mockResolvedValue({
          id: 'mp_001',
          code: 'AMAZON_US',
        }),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ws_demo',
          name: 'CrossPilot Demo',
          slug: 'crosspilot-demo',
        }),
        create: jest.fn(),
      },
      workspaceMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'mem_001',
          workspaceId: 'ws_demo',
          userId: 'usr_demo',
          role: 'OWNER',
        }),
        create: jest.fn(),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock_jwt_token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should support demoLogin successfully', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'usr_demo',
      email: 'demo@crosspilot.com',
      name: 'CrossPilot Demo User',
      status: 'ACTIVE',
    });

    const result = await service.demoLogin('OWNER');
    expect(result).toBeDefined();
    expect(result.token).toBe('mock_jwt_token');
    expect(result.user.email).toBe('demo@crosspilot.com');
    expect(result.activeWorkspace?.slug).toBe('crosspilot-demo');
  });
});
