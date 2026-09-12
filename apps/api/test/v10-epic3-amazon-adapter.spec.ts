import { ErrorCodes } from '@crosspilot/shared';
import { CommercePortError, createCommerceContext } from '@crosspilot/domain';
import { MockAmazonProvider } from '@crosspilot/integrations';
import {
  AmazonAdapter,
  resolveCommerceAdapter,
  resolveCommerceAdapterForStore,
} from '@crosspilot/db';

function memoryPrisma(overrides: { withCredential?: boolean; sellingPartnerId?: string | null } = {}) {
  const stores = [
    {
      id: 'store_az1',
      workspaceId: 'ws-1',
      name: 'Amazon US',
      platform: 'amazon',
      country: 'US',
      status: 'ACTIVE',
    },
    {
      id: 'store_sim',
      workspaceId: 'ws-1',
      name: 'Simulator Amazon',
      platform: 'simulator',
      country: 'US',
      status: 'ACTIVE',
    },
  ];
  const accounts = [
    {
      id: 'acct_az1',
      workspaceId: 'ws-1',
      storeId: 'store_az1',
      provider: 'amazon',
      sellingPartnerId: overrides.sellingPartnerId === undefined ? 'A1EXAMPLE' : overrides.sellingPartnerId,
      region: 'NA',
      status: 'CONNECTED',
      defaultMarketplaceCode: 'AMAZON_US',
    },
  ];
  const identityWrites: Array<Record<string, unknown>> = [];
  return {
    identityWrites,
    store: {
      findUnique: jest.fn(async ({ where }: any) => stores.find((row) => row.id === where.id) || null),
    },
    commerceAccount: {
      findUnique: jest.fn(async ({ where }: any) => accounts.find((row) => row.storeId === where.storeId) || null),
    },
    providerCredential: {
      findUnique: jest.fn(async ({ where }: any) =>
        overrides.withCredential === false
          ? null
          : { accountId: where.accountId_kind.accountId, kind: 'LWA_REFRESH', payloadEnc: 'RT-1' },
      ),
    },
    channelIdentity: {
      upsert: jest.fn(async ({ create }: any) => {
        identityWrites.push(create);
        return create;
      }),
    },
  };
}

function mockTransportAdapter(prisma: any) {
  return new AmazonAdapter(prisma, {
    transport: new MockAmazonProvider(),
    exchangeToken: async () => ({ accessToken: 'test-access-token' }),
    decryptCredential: (enc) => `decrypted:${enc}`,
  });
}

describe('V10 Epic 3 AmazonAdapter', () => {
  it('resolves amazon adapter and keeps shopify unavailable', async () => {
    const prisma = memoryPrisma();
    const adapter = resolveCommerceAdapter(prisma, 'amazon');
    expect(adapter).toBeInstanceOf(AmazonAdapter);
    expect(adapter.platform).toBe('amazon');
    expect(() => resolveCommerceAdapter(prisma, 'shopify')).toThrow(CommercePortError);
    try {
      resolveCommerceAdapter(prisma, 'shopify');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as CommercePortError).code).toBe(ErrorCodes.PROVIDER_UNAVAILABLE);
    }
    const byStore = await resolveCommerceAdapterForStore(prisma, 'store_az1');
    expect(byStore).toBeInstanceOf(AmazonAdapter);
  });

  it('maps mock listings to CanonicalProduct with identities, no asin on body', async () => {
    const prisma = memoryPrisma();
    const adapter = mockTransportAdapter(prisma);
    const products = await adapter.listProducts(createCommerceContext('ws-1', 'store_az1', 't1'));
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      id: 'MTH-WHITE-001',
      workspaceId: 'ws-1',
      storeId: 'store_az1',
      platform: 'amazon',
      sku: 'MTH-WHITE-001',
      title: 'Marble Toothbrush Holder White',
      price: 29.99,
    });
    expect(products[0].identities).toEqual([
      { type: 'asin', id: 'B0C7M8W101' },
      { type: 'amazon_sku', id: 'MTH-WHITE-001' },
    ]);
    expect((products[0] as { asin?: string }).asin).toBeUndefined();
  });

  it('projects asin into ChannelIdentity during catalog read', async () => {
    const prisma = memoryPrisma();
    const adapter = mockTransportAdapter(prisma);
    await adapter.listProducts(createCommerceContext('ws-1', 'store_az1', 't1'));
    expect(prisma.channelIdentity.upsert).toHaveBeenCalled();
    const asinRow = prisma.identityWrites.find((row: any) => row.externalId === 'B0C7M8W101');
    expect(asinRow).toMatchObject({
      storeId: 'store_az1',
      platform: 'amazon',
      entityType: 'offer',
      entityId: 'MTH-WHITE-001',
      externalId: 'B0C7M8W101',
    });
  });

  it('maps mock orders and inventory to canonical shapes', async () => {
    const prisma = memoryPrisma();
    const adapter = mockTransportAdapter(prisma);
    const ctx = createCommerceContext('ws-1', 'store_az1', 't1');

    const orders = await adapter.listOrders(ctx, { limit: 10 });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      id: '114-0000001-0000001',
      externalOrderId: '114-0000001-0000001',
      storeId: 'store_az1',
      platform: 'amazon',
      amount: 29.99,
      currency: 'USD',
      status: 'Shipped',
    });
    expect(orders[0].items).toEqual([{ offerId: 'MTH-WHITE-001', quantity: 1, unitPrice: 29.99 }]);
    expect(orders[0].createdAt).toBe('2026-09-01T12:00:00.000Z');

    const inv = await adapter.getInventory(ctx, 'MTH-WHITE-001');
    expect(inv).toEqual({
      offerId: 'MTH-WHITE-001',
      storeId: 'store_az1',
      available: 42,
      reserved: 2,
      inbound: 10,
      daysOfStock: null,
    });
    const miss = await adapter.getInventory(ctx, 'NOPE-001');
    expect(miss).toBeNull();
  });

  it('requires a LWA refresh token with an explicit AUTH_REQUIRED failure', async () => {
    const prisma = memoryPrisma({ withCredential: false });
    const adapter = new AmazonAdapter(prisma, { transport: new MockAmazonProvider() });
    const ctx = createCommerceContext('ws-1', 'store_az1', 't1');
    await expect(adapter.listProducts(ctx)).rejects.toMatchObject({
      code: ErrorCodes.AUTH_REQUIRED,
    });
    await expect(adapter.listOrders(ctx)).rejects.toMatchObject({ code: ErrorCodes.AUTH_REQUIRED });
  });

  it('requires sellingPartnerId for listing reads', async () => {
    const prisma = memoryPrisma({ sellingPartnerId: null });
    const adapter = mockTransportAdapter(prisma);
    await expect(
      adapter.listProducts(createCommerceContext('ws-1', 'store_az1', 't1')),
    ).rejects.toMatchObject({ code: ErrorCodes.AUTH_REQUIRED });
  });

  it('binds store to workspace and platform before reading', async () => {
    const prisma = memoryPrisma();
    const adapter = mockTransportAdapter(prisma);
    await expect(
      adapter.listProducts(createCommerceContext('ws-2', 'store_az1', 't1')),
    ).rejects.toMatchObject({ code: ErrorCodes.RESOURCE_NOT_FOUND });
    await expect(
      adapter.listProducts(createCommerceContext('ws-1', 'store_sim', 't1')),
    ).rejects.toMatchObject({ code: ErrorCodes.PROVIDER_UNAVAILABLE });
  });

  it('maps provider failures to explicit port errors, rate limit retryable', async () => {
    const prisma = memoryPrisma();
    const failing = {
      execute: jest.fn(async () => ({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'too many requests', retryable: true },
      })),
    };
    const adapter = new AmazonAdapter(prisma, {
      transport: failing as any,
      exchangeToken: async () => ({ accessToken: 't' }),
      decryptCredential: (enc) => enc,
    });
    const ctx = createCommerceContext('ws-1', 'store_az1', 't1');
    await expect(adapter.listOrders(ctx)).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMIT',
      retryable: true,
    });
    failing.execute.mockResolvedValueOnce({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'token rejected', retryable: false },
    });
    await expect(adapter.listOrders(ctx)).rejects.toMatchObject({
      code: ErrorCodes.AUTH_REQUIRED,
      retryable: false,
    });
  });

  it('keeps ads and profit reads empty and write ports WRITE_FORBIDDEN', async () => {
    const prisma = memoryPrisma();
    const adapter = mockTransportAdapter(prisma);
    const ctx = createCommerceContext('ws-1', 'store_az1', 't1');
    await expect(adapter.getCampaigns(ctx)).resolves.toEqual([]);
    await expect(adapter.getDailyProfit(ctx)).resolves.toEqual([]);
    await expect(adapter.updateProduct(ctx, { price: 1 })).resolves.toMatchObject({
      ok: false,
      code: ErrorCodes.WRITE_FORBIDDEN,
    });
    await expect(adapter.decreaseBid(ctx, { campaignId: 'camp-1' }, 20)).resolves.toMatchObject({
      ok: false,
      code: ErrorCodes.WRITE_FORBIDDEN,
    });
  });
});
