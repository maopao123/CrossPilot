import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator.js';
import { SKIP_WORKSPACE_KEY } from '../src/common/decorators/skip-workspace.decorator.js';
import { WorkspaceGuard } from '../src/common/guards/workspace.guard.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { OrderService } from '../src/modules/order/order.service.js';
import { ProductService } from '../src/modules/product/product.service.js';
import { PurchaseService } from '../src/modules/purchase/purchase.service.js';
import { ToolCenterService } from '../src/modules/tool-center/tool-center.service.js';
import { ListingService } from '../src/modules/listing/listing.service.js';
import { ErrorCodes } from '@crosspilot/shared';

function workspaceGuardContext(overrides: {
  public?: boolean;
  skipWorkspace?: boolean;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  user?: { sub: string; workspaceId?: string };
}) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return !!overrides.public;
      if (key === SKIP_WORKSPACE_KEY) return !!overrides.skipWorkspace;
      return false;
    }),
  };
  const prisma = {
    workspaceMember: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const guard = new WorkspaceGuard(prisma as any, reflector as any);
  const request: any = {
    user: overrides.user || { sub: 'user-a' },
    headers: overrides.headers || {},
    params: overrides.params || {},
    query: {},
    body: {},
  };
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { guard, ctx, prisma, request, reflector };
}

describe('V91-020 WorkspaceGuard missing workspace id', () => {
  it('returns 403 WORKSPACE_ACCESS_DENIED when x-workspace-id is missing', async () => {
    const { guard, ctx, prisma } = workspaceGuardContext({});
    await expect(guard.canActivate(ctx as any)).rejects.toBeInstanceOf(ForbiddenException);
    try {
      await guard.canActivate(ctx as any);
    } catch (err) {
      const body = (err as ForbiddenException).getResponse() as any;
      expect(body.code).toBe(ErrorCodes.WORKSPACE_ACCESS_DENIED);
    }
    expect(prisma.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it('does not auto-select the first membership when header is absent', async () => {
    const { guard, ctx, prisma } = workspaceGuardContext({
      user: { sub: 'user-a', workspaceId: 'ws-from-jwt' },
    });
    prisma.workspaceMember.findFirst.mockResolvedValue({
      workspaceId: 'ws-first',
      userId: 'user-a',
    });
    await expect(guard.canActivate(ctx as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it('still allows SkipWorkspace endpoints without a header', async () => {
    const { guard, ctx, prisma } = workspaceGuardContext({ skipWorkspace: true });
    await expect(guard.canActivate(ctx as any)).resolves.toBe(true);
    expect(prisma.workspaceMember.findUnique).not.toHaveBeenCalled();
  });
});

describe('V91-015 tenant isolation on related resources', () => {
  it('does not read Workspace B SKU sellingPrice when creating an order in A', async () => {
    const foreignSku = {
      id: 'sku-b',
      workspaceId: 'ws-b',
      sellingPrice: 999.99,
    };
    const tx = {
      order: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      inventoryBalance: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      sku: {
        findUnique: jest.fn().mockResolvedValue(foreignSku),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      supplierSkuQuote: { findFirst: jest.fn() },
      profitDaily: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const orders = new OrderService(prisma as any);
    await expect(
      orders.createOrder('ws-a', {
        marketplaceId: 'mp-a',
        orderNumber: '114-1-1',
        items: [{ skuId: 'sku-b', quantity: 1, unitPrice: 10 }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.sku.findFirst).toHaveBeenCalledWith({
      where: { id: 'sku-b', workspaceId: 'ws-a' },
    });
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('does not bind a Workspace B product when creating a SKU in A', async () => {
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      sku: { create: jest.fn() },
      inventoryBalance: { upsert: jest.fn() },
    };
    const products = new ProductService(prisma as any);
    await expect(
      products.createSku('ws-a', {
        productId: 'prod-b',
        skuCode: 'X',
        variantName: 'x',
        sellingPrice: 1,
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sku.create).not.toHaveBeenCalled();
  });

  it('does not bind a Workspace B supplier when creating a PO in A', async () => {
    const prisma = {
      supplier: { findFirst: jest.fn().mockResolvedValue(null) },
      sku: { findFirst: jest.fn() },
      purchaseOrder: { create: jest.fn() },
    };
    const purchase = new PurchaseService(prisma as any);
    await expect(
      purchase.createPurchaseOrder('ws-a', {
        supplierId: 'sup-b',
        poNumber: 'PO-1',
        currencyCode: 'USD',
        items: [{ skuId: 'sku-a', quantity: 1, unitCost: 1 }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
  });
});

describe('V91-016 tool execution history is workspace scoped', () => {
  it('does not return other workspace executions when DB is empty or down', async () => {
    const prisma = {
      toolExecution: {
        findMany: jest.fn().mockRejectedValue(new Error('db down')),
      },
      workspaceMember: { findFirst: jest.fn() },
      agentTask: { create: jest.fn() },
    };
    const tools = new ToolCenterService(prisma as any);
    (tools as any).recentExecutions = [
      {
        id: 'run-b',
        toolId: 'finance.profit.calculate',
        toolName: 'profit',
        category: 'DATA',
        input: { secret: 'workspace-b' },
        output: { leaked: true },
        status: 'SUCCESS',
        durationMs: 1,
        traceId: 't',
        source: 'TOOL_CENTER',
        createdAt: new Date().toISOString(),
        workspaceId: 'ws-b',
      },
    ];
    const rows = await tools.listExecutions(20, 'ws-a');
    expect(rows).toEqual([]);
    expect(JSON.stringify(rows)).not.toContain('workspace-b');
  });
});

describe('V91-013 TransformInterceptor envelope', () => {
  const interceptor = new TransformInterceptor();

  function run(response: unknown, request: Record<string, unknown> = {}) {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          path: '/api/v1/tools/x/execute',
          url: '/api/v1/tools/x/execute',
          ...request,
        }),
      }),
    };
    return interceptor.intercept(ctx as any, {
      handle: () => of(response),
    } as any);
  }

  it('does not strip success/durationMs/error from tool results that already have data', async () => {
    const result = await firstValueFrom(
      run({
        success: true,
        data: { value: 1 },
        durationMs: 42,
        error: null,
        traceId: 'tr_1',
      }),
    );
    expect((result as any).data.success).toBe(true);
    expect((result as any).data.durationMs).toBe(42);
    expect((result as any).data.traceId).toBe('tr_1');
    expect((result as any).requestId).toBeDefined();
  });

  it('skips JSON wrapping for SSE Accept headers', async () => {
    const raw = { type: 'TASK_COMPLETE' };
    const result = await firstValueFrom(
      run(raw, {
        headers: { accept: 'text/event-stream' },
        path: '/api/v1/agent-tasks/stream',
        url: '/api/v1/agent-tasks/stream',
      }),
    );
    expect(result).toEqual(raw);
  });
});

describe('V91-014 listing generate skuId validation', () => {
  const prisma = {
    sku: { findFirst: jest.fn() },
  };
  const listing = new ListingService(prisma as any);

  it('returns 400 VALIDATION_ERROR when skuId is missing', async () => {
    await expect(listing.generateListing(undefined as any, 'ws-a')).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.VALIDATION_ERROR }),
    });
    expect(prisma.sku.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when skuId is blank', async () => {
    await expect(listing.generateListing('   ', 'ws-a')).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.VALIDATION_ERROR }),
    });
  });

  it('returns 404 when skuId is unknown or belongs to another workspace', async () => {
    prisma.sku.findFirst.mockResolvedValue(null);
    await expect(listing.generateListing('sku-b', 'ws-a')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.sku.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sku-b', workspaceId: 'ws-a' },
      }),
    );
  });
});

describe('V91-012 illegal PO receive maps to 409', () => {
  it('returns PURCHASE_INVALID_STATUS_TRANSITION for DRAFT -> RECEIVED', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: any) =>
        fn({
          purchaseOrder: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'po-1',
              poNumber: 'PO-1',
              status: 'DRAFT',
              workspaceId: 'ws-a',
              items: [{ skuId: 'sku-a', quantity: 1, receivedQuantity: 0 }],
            }),
          },
        }),
      ),
    };
    const purchase = new PurchaseService(prisma as any);
    try {
      await purchase.receivePurchaseOrder('ws-a', 'po-1', {
        items: [{ skuId: 'sku-a', receivedQuantity: 1 }],
      });
      throw new Error('expected conflict');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      const body = (err as ConflictException).getResponse() as any;
      expect(body.code).toBe(ErrorCodes.PURCHASE_INVALID_STATUS_TRANSITION);
      expect((err as ConflictException).getStatus()).toBe(409);
    }
  });
});
