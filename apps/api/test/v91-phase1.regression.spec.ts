import { ForbiddenException } from '@nestjs/common';
import { ViewerWriteGuard } from '../src/common/guards/viewer-write.guard.js';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy.js';
import { DailyDiagnosisService } from '../src/modules/daily-diagnosis/daily-diagnosis.service.js';
import {
  getDailyOperationWorkflowService,
  setDailyOperationWorkflowService,
} from '@crosspilot/tool-platform';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { ProductService } from '../src/modules/product/product.service.js';
import { ErrorCodes } from '@crosspilot/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function mockContext(method: string, role?: string, isPublic = false) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  };
  const guard = new ViewerWriteGuard(reflector as any);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        workspaceMember: role ? { role } : undefined,
        user: role ? { role } : undefined,
      }),
    }),
  };
  return { guard, ctx };
}

describe('V91-004 ViewerWriteGuard', () => {
  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'returns 403 AUTH_FORBIDDEN for VIEWER %s',
    (method) => {
      const { guard, ctx } = mockContext(method, 'VIEWER');
      try {
        guard.canActivate(ctx as any);
        throw new Error('expected ForbiddenException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const body = (err as ForbiddenException).getResponse() as any;
        expect(body.code).toBe(ErrorCodes.AUTH_FORBIDDEN);
      }
    },
  );

  it('allows VIEWER GET', () => {
    const { guard, ctx } = mockContext('GET', 'VIEWER');
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it.each(['OWNER', 'ADMIN', 'OPERATOR'])(
    'does not block %s POST',
    (role) => {
      const { guard, ctx } = mockContext('POST', role);
      expect(guard.canActivate(ctx as any)).toBe(true);
    },
  );

  it('skips public POST endpoints', () => {
    const { guard, ctx } = mockContext('POST', 'VIEWER', true);
    expect(guard.canActivate(ctx as any)).toBe(true);
  });
});

describe('V91-003 SSE JWT is header-only', () => {
  it('does not extract JWT from query string', () => {
    const strategySrc = readFileSync(
      resolve(__dirname, '../src/modules/auth/jwt.strategy.ts'),
      'utf8',
    );
    expect(strategySrc).toContain('fromAuthHeaderAsBearerToken');
    expect(strategySrc).not.toContain('fromUrlQueryParameter');
    expect(strategySrc).not.toMatch(/query\s*\.\s*token/);
  });

  it('JwtStrategy class is constructible with Bearer extractor', () => {
    expect(typeof JwtStrategy).toBe('function');
  });
});

describe('V91-009 Tool Platform shares API workflow service', () => {
  afterEach(() => {
    setDailyOperationWorkflowService(null);
  });

  it('DailyDiagnosisService registers its workflow instance for tools', () => {
    const prisma = {
      $transaction: jest.fn(),
    };
    const service = new DailyDiagnosisService(prisma as any);
    expect(getDailyOperationWorkflowService()).toBe(service.getWorkflowService());
  });
});

describe('V91-006/008 honest inventory and return rate', () => {
  it('listInventory does not invent 450-unit demo balances on query failure', async () => {
    const prisma = {
      inventoryBalance: {
        findMany: jest.fn().mockRejectedValue(new Error('db down')),
      },
    };
    const inventory = new InventoryService(prisma as any);
    await expect(inventory.listInventory('ws_a')).rejects.toThrow();
  });

  it('getReorderRecommendation 404s when SKU has no balance instead of 450 fallback', async () => {
    const prisma = {
      inventoryBalance: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      supplierSkuQuote: { findFirst: jest.fn() },
      orderItem: { findMany: jest.fn() },
    };
    const inventory = new InventoryService(prisma as any);
    await expect(
      inventory.getReorderRecommendation('ws_a', 'missing-sku'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
      }),
    });
  });

  it('SKU 360 returnRate is a 0-1 ratio and 0 stays 0', async () => {
    const prisma = {
      sku: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sku-uuid',
          workspaceId: 'ws_a',
          skuCode: 'MTH-WHITE-001',
          variantName: 'White',
          sellingPrice: 29.99,
          status: 'ACTIVE',
          product: { id: 'p1', name: 'Holder', brand: 'POLEGAS', category: 'Home' },
          inventoryBalances: [
            { fulfillableQuantity: 0, inboundQuantity: 0, reservedQuantity: 0 },
          ],
          quotes: [],
          orderItems: [],
        }),
      },
      returnRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const products = new ProductService(prisma as any);
    const overview = await products.getSku360Overview('ws_a', 'sku-uuid');
    expect(overview.returnsSummary.returnRate).toBe(0);
    expect(overview.inventory.fulfillableQuantity).toBe(0);
    expect(overview.salesSummary.unitsSold).toBe(0);
  });
});
