import { ErrorCodes } from '@crosspilot/shared';
import { CommercePortError, createCommerceContext } from '@crosspilot/domain';
import {
  AmazonAdapter,
  resolveCommerceAdapter,
  SimulatorAdapter,
  simulatorChannelFromProvider,
} from '@crosspilot/db';

function memoryPrisma() {
  const stores = [
    {
      id: 'store_amz',
      workspaceId: 'ws-1',
      name: 'Simulator Amazon',
      platform: 'simulator',
      country: 'US',
      status: 'ACTIVE',
    },
    {
      id: 'store_shop',
      workspaceId: 'ws-1',
      name: 'Simulator Shopify',
      platform: 'simulator',
      country: 'US',
      status: 'ACTIVE',
    },
  ];
  const accounts = [
    { id: 'acct_amz', workspaceId: 'ws-1', storeId: 'store_amz', provider: 'simulator-amazon' },
    { id: 'acct_shop', workspaceId: 'ws-1', storeId: 'store_shop', provider: 'simulator-shopify' },
  ];
  const skus = [
    {
      id: 'sku-1',
      workspaceId: 'ws-1',
      skuCode: 'MTH-WHITE-001',
      asin: 'B0EXAMPLE',
      sellingPrice: 28.99,
      variantName: 'White',
      product: { name: 'Marble holder', category: 'Bath' },
    },
  ];
  const orders = [
    {
      id: 'ord-amz',
      workspaceId: 'ws-1',
      sourceProvider: 'simulator',
      sourceAccountId: 'acct_amz',
      externalOrderId: 'SIM-20260901-0001',
      orderNumber: 'SIM-20260901-0001',
      totalAmount: 28.99,
      currencyCode: 'USD',
      status: 'SHIPPED',
      orderedAt: new Date('2026-09-01T12:00:00.000Z'),
      items: [{ skuId: 'sku-1', quantity: 1, unitPrice: 28.99 }],
    },
    {
      id: 'ord-shop',
      workspaceId: 'ws-1',
      sourceProvider: 'simulator',
      sourceAccountId: 'acct_shop',
      externalOrderId: 'SIM-20260901-0002',
      orderNumber: 'SIM-20260901-0002',
      totalAmount: 28.99,
      currencyCode: 'USD',
      status: 'SHIPPED',
      orderedAt: new Date('2026-09-01T13:00:00.000Z'),
      items: [{ skuId: 'sku-1', quantity: 1, unitPrice: 28.99 }],
    },
  ];
  return {
    store: {
      findUnique: jest.fn(async ({ where }: any) => stores.find((row) => row.id === where.id) || null),
    },
    commerceAccount: {
      findUnique: jest.fn(async ({ where }: any) => accounts.find((row) => row.storeId === where.storeId) || null),
    },
    sku: {
      findMany: jest.fn(async () => skus),
      findFirst: jest.fn(async ({ where }: any) => skus.find((row) => row.id === where.id) || null),
    },
    order: {
      findMany: jest.fn(async ({ where }: any) =>
        orders.filter((row) => {
          if (where.sourceAccountId && row.sourceAccountId !== where.sourceAccountId) return false;
          if (where.sourceProvider && row.sourceProvider !== where.sourceProvider) return false;
          return true;
        }),
      ),
    },
    inventoryBalance: {
      findFirst: jest.fn(async () => ({
        fulfillableQuantity: 480,
        reservedQuantity: 2,
        inboundQuantity: 40,
      })),
    },
    inventorySnapshot: {
      findFirst: jest.fn(async () => ({ daysCover: 18 })),
    },
    campaign: {
      findFirst: jest.fn(async () => ({ id: 'camp-1', name: 'SIM - Sponsored Products - Simulator Catalog' })),
    },
    adMetricDaily: {
      findMany: jest.fn(async () => [{ spend: 45.52, impressions: 1000, clicks: 40, orders: 4, sales: 100 }]),
    },
    profitDaily: {
      findMany: jest.fn(async () => [
        {
          skuId: 'sku-1',
          date: new Date('2026-09-01T00:00:00.000Z'),
          revenue: 100,
          cogs: 20,
          adsCost: 10,
          amazonFees: 8,
          fbaFee: 4.5,
          returnLoss: 0,
          otherCosts: 0,
          netProfit: 57.5,
          margin: 0.575,
        },
      ]),
    },
  };
}

describe('V10 Epic 2 SimulatorAdapter', () => {
  it('maps simulator providers to amazon/shopify channels without merging stores', () => {
    expect(simulatorChannelFromProvider('simulator-amazon')).toBe('amazon');
    expect(simulatorChannelFromProvider('simulator-shopify')).toBe('shopify');
  });

  it('resolves simulator and amazon; shopify stays unavailable until Epic 4', () => {
    const prisma = memoryPrisma();
    expect(resolveCommerceAdapter(prisma, 'simulator')).toBeInstanceOf(SimulatorAdapter);
    expect(resolveCommerceAdapter(prisma, 'amazon')).toBeInstanceOf(AmazonAdapter);
    try {
      resolveCommerceAdapter(prisma, 'shopify');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CommercePortError);
      expect((err as CommercePortError).code).toBe(ErrorCodes.PROVIDER_UNAVAILABLE);
    }
  });

  it('lists catalog with identities, not Store.amazonId/shopifyId', async () => {
    const prisma = memoryPrisma();
    const adapter = new SimulatorAdapter(prisma);
    const products = await adapter.listProducts(createCommerceContext('ws-1', 'store_amz', 't1'));
    expect(products).toHaveLength(1);
    expect(products[0].identities).toEqual([
      { type: 'asin', id: 'B0EXAMPLE' },
      { type: 'amazon_sku', id: 'MTH-WHITE-001' },
    ]);
    expect((products[0] as { asin?: string }).asin).toBeUndefined();
    const store = await prisma.store.findUnique({ where: { id: 'store_amz' } });
    expect(store).toBeTruthy();
    expect((store as Record<string, unknown>).amazonId).toBeUndefined();
    expect((store as Record<string, unknown>).shopifyId).toBeUndefined();
  });

  it('keeps amazon and shopify simulator orders on different stores', async () => {
    const prisma = memoryPrisma();
    const adapter = new SimulatorAdapter(prisma);
    const amazonOrders = await adapter.listOrders(createCommerceContext('ws-1', 'store_amz'));
    const shopifyOrders = await adapter.listOrders(createCommerceContext('ws-1', 'store_shop'));
    expect(amazonOrders.map((row) => row.id)).toEqual(['ord-amz']);
    expect(shopifyOrders.map((row) => row.id)).toEqual(['ord-shop']);
  });

  it('reads inventory and amazon-store campaigns; shopify-store ads stay empty', async () => {
    const prisma = memoryPrisma();
    const adapter = new SimulatorAdapter(prisma);
    const inv = await adapter.getInventory(createCommerceContext('ws-1', 'store_amz'), 'sku-1');
    expect(inv).toMatchObject({ available: 480, reserved: 2, inbound: 40, daysOfStock: 18 });
    const amazonAds = await adapter.getCampaigns(createCommerceContext('ws-1', 'store_amz'));
    expect(amazonAds).toHaveLength(1);
    expect(amazonAds[0].acos).toBe(0.4552);
    expect(amazonAds[0].roas).toBe(2.1968);
    const shopifyAds = await adapter.getCampaigns(createCommerceContext('ws-1', 'store_shop'));
    expect(shopifyAds).toEqual([]);
  });

  it('maps profit fees without promoting amazonFees onto CanonicalProfit', async () => {
    const prisma = memoryPrisma();
    const adapter = new SimulatorAdapter(prisma);
    const rows = await adapter.getDailyProfit(createCommerceContext('ws-1', 'store_amz'));
    expect(rows[0]).toMatchObject({
      offerId: 'sku-1',
      revenue: 100,
      advertisingCost: 10,
      fees: 12.5,
      profit: 57.5,
    });
    expect((rows[0] as { amazonFees?: number }).amazonFees).toBeUndefined();
    expect((rows[0] as { fbaFee?: number }).fbaFee).toBeUndefined();
  });

  it('keeps write ports WRITE_FORBIDDEN', async () => {
    const adapter = new SimulatorAdapter(memoryPrisma());
    const ctx = createCommerceContext('ws-1', 'store_amz');
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
