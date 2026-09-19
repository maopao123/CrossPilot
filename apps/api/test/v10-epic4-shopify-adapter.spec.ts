import { ErrorCodes } from '@crosspilot/shared';
import { CommercePortError, createCommerceContext } from '@crosspilot/domain';
import {
  ShopifyAdapter,
  resolveCommerceAdapter,
  resolveCommerceAdapterForStore,
  type ShopifyGraphQLTransport,
  type ShopifyGraphQLResponse,
} from '@crosspilot/db';

function memoryShopifyPrisma(
  overrides: {
    withCredential?: boolean;
    brokenCredential?: boolean;
    noStore?: boolean;
    wrongPlatform?: boolean;
  } = {},
) {
  const stores = [
    {
      id: 'store_sh1',
      workspaceId: 'ws-1',
      name: 'crosspilot-dev',
      platform: overrides.wrongPlatform ? 'amazon' : 'shopify',
      country: 'US',
      status: 'ACTIVE',
    },
  ];
  const accounts = [
    {
      id: 'acct_sh1',
      workspaceId: 'ws-1',
      storeId: 'store_sh1',
      provider: 'shopify',
      region: 'NA',
      status: 'CONNECTED',
      defaultMarketplaceCode: 'crosspilot-dev',
    },
  ];
  const identityWrites: Array<Record<string, unknown>> = [];

  return {
    identityWrites,
    store: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (overrides.noStore) return null;
        return stores.find((row) => row.id === where.id) || null;
      }),
    },
    commerceAccount: {
      findUnique: jest.fn(async ({ where }: any) =>
        accounts.find((row) => row.storeId === where.storeId) || null,
      ),
    },
    providerCredential: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (overrides.withCredential === false) return null;
        if (overrides.brokenCredential) {
          return {
            accountId: where.accountId_kind.accountId,
            kind: where.accountId_kind.kind,
            payloadEnc: 'broken-payload',
          };
        }
        return {
          accountId: where.accountId_kind.accountId,
          kind: where.accountId_kind.kind,
          payloadEnc: JSON.stringify({
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            shop: 'crosspilot-dev',
          }),
        };
      }),
    },
    channelIdentity: {
      upsert: jest.fn(async ({ create }: any) => {
        identityWrites.push(create);
        return create;
      }),
    },
  };
}

const mockGraphQLProductsResponse: ShopifyGraphQLResponse = {
  data: {
    products: {
      nodes: [
        {
          id: 'gid://shopify/Product/15299021275500',
          title: 'The Inventory Not Tracked Snowboard',
          handle: 'the-inventory-not-tracked-snowboard',
          status: 'ACTIVE',
          productType: 'snowboard',
          variants: {
            nodes: [
              {
                id: 'gid://shopify/ProductVariant/54443961713004',
                title: 'Default Title',
                sku: 'sku-untracked-1',
                price: '949.95',
                inventoryItem: {
                  id: 'gid://shopify/InventoryItem/55646041375084',
                },
              },
            ],
          },
        },
      ],
    },
  },
};

const mockGraphQLOrdersResponse: ShopifyGraphQLResponse = {
  data: {
    orders: {
      nodes: [
        {
          id: 'gid://shopify/Order/10001',
          name: '#1001',
          createdAt: '2026-09-01T12:00:00Z',
          displayFinancialStatus: 'PAID',
          displayFulfillmentStatus: 'FULFILLED',
          currentTotalPriceSet: {
            shopMoney: {
              amount: '949.95',
              currencyCode: 'USD',
            },
          },
          lineItems: {
            nodes: [
              {
                id: 'gid://shopify/LineItem/2001',
                title: 'The Inventory Not Tracked Snowboard',
                quantity: 1,
                originalUnitPriceSet: {
                  shopMoney: {
                    amount: '949.95',
                    currencyCode: 'USD',
                  },
                },
                variant: {
                  id: 'gid://shopify/ProductVariant/54443961713004',
                  sku: 'sku-untracked-1',
                },
              },
            ],
          },
        },
      ],
    },
  },
};

const mockGraphQLInventoryResponse: ShopifyGraphQLResponse = {
  data: {
    productVariant: {
      id: 'gid://shopify/ProductVariant/54443961713004',
      inventoryItem: {
        id: 'gid://shopify/InventoryItem/55646041375084',
        inventoryLevels: {
          nodes: [
            {
              quantities: [
                { name: 'available', quantity: 42 },
                { name: 'incoming', quantity: 15 },
                { name: 'reserved', quantity: 3 },
              ],
            },
          ],
        },
      },
    },
  },
};

function createMockAdapter(
  prisma: any,
  transportOverrides?: Partial<ShopifyGraphQLTransport>,
  optionsOverrides: any = {},
) {
  const transport: ShopifyGraphQLTransport = {
    execute: jest.fn(async (_shop, _token, query: string) => {
      if (query.includes('ListProducts')) {
        return mockGraphQLProductsResponse;
      }
      if (query.includes('ListOrders')) {
        return mockGraphQLOrdersResponse;
      }
      if (query.includes('GetVariantInventory') || query.includes('SearchVariantInventory')) {
        return mockGraphQLInventoryResponse;
      }
      if (query.includes('GetProductVariant')) {
        return {
          data: {
            productVariant: {
              id: 'gid://shopify/ProductVariant/54443961713004',
              title: 'Default Title',
              sku: 'sku-untracked-1',
              price: '949.95',
              product: {
                id: 'gid://shopify/Product/15299021275500',
                title: 'The Inventory Not Tracked Snowboard',
                handle: 'the-inventory-not-tracked-snowboard',
                status: 'ACTIVE',
                productType: 'snowboard',
              },
            },
          },
        };
      }
      return { data: {} };
    }),
    ...transportOverrides,
  };

  return new ShopifyAdapter(prisma, {
    transport,
    exchangeToken: jest.fn(async () => ({
      accessToken: 'shpat_test_access_token',
      expiresIn: 86400,
    })),
    decryptCredential: (enc) => enc,
    ...optionsOverrides,
  });
}

describe('V10 Epic 4 ShopifyAdapter', () => {
  beforeEach(() => {
    ShopifyAdapter.clearTokenCache();
  });

  it('resolves shopify adapter from resolveCommerceAdapter and resolveCommerceAdapterForStore', async () => {
    const prisma = memoryShopifyPrisma();
    const adapter = resolveCommerceAdapter(prisma, 'shopify');
    expect(adapter).toBeInstanceOf(ShopifyAdapter);
    expect(adapter.platform).toBe('shopify');
    expect(adapter.getCapabilities()).toMatchObject({
      supportedActions: [],
      executionMode: 'live',
      dataFreshness: 'real-time',
    });

    const byStore = await resolveCommerceAdapterForStore(prisma, 'store_sh1');
    expect(byStore).toBeInstanceOf(ShopifyAdapter);
  });

  it('maps Products GraphQL to CanonicalProduct with Product GID and Variant GID in identities', async () => {
    const prisma = memoryShopifyPrisma();
    const adapter = createMockAdapter(prisma);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const products = await adapter.listProducts(ctx);
    expect(products).toHaveLength(1);
    const product = products[0];

    expect(product).toMatchObject({
      id: 'gid://shopify/ProductVariant/54443961713004',
      workspaceId: 'ws-1',
      storeId: 'store_sh1',
      platform: 'shopify',
      title: 'The Inventory Not Tracked Snowboard',
      sku: 'sku-untracked-1',
      category: 'snowboard',
      price: 949.95,
      cost: null,
    });

    // Verify identities contain both Product GID and Variant GID
    expect(product.identities).toEqual([
      { type: 'shopify_product_id', id: 'gid://shopify/Product/15299021275500' },
      { type: 'shopify_variant_id', id: 'gid://shopify/ProductVariant/54443961713004' },
      { type: 'shopify_sku', id: 'sku-untracked-1' },
    ]);

    // Invariant: CanonicalProduct must NOT have shopifyId or shopifyVariantId columns
    expect((product as any).shopifyId).toBeUndefined();
    expect((product as any).shopifyVariantId).toBeUndefined();
  });

  it('projects Product GID, Variant GID, and SKU into ChannelIdentity on catalog read', async () => {
    const prisma = memoryShopifyPrisma();
    const adapter = createMockAdapter(prisma);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    await adapter.listProducts(ctx);
    expect(prisma.channelIdentity.upsert).toHaveBeenCalled();

    const writes = prisma.identityWrites;
    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          storeId: 'store_sh1',
          platform: 'shopify',
          entityType: 'offer',
          entityId: 'gid://shopify/ProductVariant/54443961713004',
          externalId: 'gid://shopify/Product/15299021275500',
        }),
        expect.objectContaining({
          storeId: 'store_sh1',
          platform: 'shopify',
          entityType: 'offer',
          entityId: 'gid://shopify/ProductVariant/54443961713004',
          externalId: 'gid://shopify/ProductVariant/54443961713004',
        }),
        expect.objectContaining({
          storeId: 'store_sh1',
          platform: 'shopify',
          entityType: 'offer',
          entityId: 'gid://shopify/ProductVariant/54443961713004',
          externalId: 'sku-untracked-1',
        }),
      ]),
    );
  });

  it('getProduct retrieves a single CanonicalProduct by variant GID', async () => {
    const prisma = memoryShopifyPrisma();
    const adapter = createMockAdapter(prisma);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const product = await adapter.getProduct(ctx, 'gid://shopify/ProductVariant/54443961713004');
    expect(product).not.toBeNull();
    expect(product?.id).toBe('gid://shopify/ProductVariant/54443961713004');
    expect(product?.price).toBe(949.95);
    expect(product?.identities).toEqual([
      { type: 'shopify_product_id', id: 'gid://shopify/Product/15299021275500' },
      { type: 'shopify_variant_id', id: 'gid://shopify/ProductVariant/54443961713004' },
      { type: 'shopify_sku', id: 'sku-untracked-1' },
    ]);
  });

  it('getProduct returns null when product or variant is not found', async () => {
    const prisma = memoryShopifyPrisma();
    const adapter = createMockAdapter(prisma, {
      execute: jest.fn(async () => ({ data: { productVariant: null } })) as any,
    });
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const product = await adapter.getProduct(ctx, 'gid://shopify/ProductVariant/99999999');
    expect(product).toBeNull();
  });

  it('maps Orders GraphQL to CanonicalOrder', async () => {
    const prisma = memoryShopifyPrisma();
    const adapter = createMockAdapter(prisma);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const orders = await adapter.listOrders(ctx, { limit: 10 });
    expect(orders).toHaveLength(1);
    const order = orders[0];

    expect(order).toMatchObject({
      id: 'gid://shopify/Order/10001',
      storeId: 'store_sh1',
      platform: 'shopify',
      externalOrderId: '#1001',
      amount: 949.95,
      currency: 'USD',
      status: 'PAID',
      createdAt: '2026-09-01T12:00:00.000Z',
    });
    expect(order.items).toEqual([
      {
        offerId: 'gid://shopify/ProductVariant/54443961713004',
        quantity: 1,
        unitPrice: 949.95,
      },
    ]);
  });

  it('maps Inventory GraphQL to CanonicalInventory', async () => {
    const prisma = memoryShopifyPrisma();
    const adapter = createMockAdapter(prisma);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const inventory = await adapter.getInventory(ctx, 'gid://shopify/ProductVariant/54443961713004');
    expect(inventory).toEqual({
      offerId: 'gid://shopify/ProductVariant/54443961713004',
      storeId: 'store_sh1',
      available: 42,
      reserved: 3,
      inbound: 15,
      daysOfStock: null,
    });
  });

  it('throws AUTH_REQUIRED when credentials are missing or corrupted', async () => {
    const noCredPrisma = memoryShopifyPrisma({ withCredential: false });
    const adapter = createMockAdapter(noCredPrisma);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    await expect(adapter.listProducts(ctx)).rejects.toMatchObject({
      code: ErrorCodes.AUTH_REQUIRED,
    });
    await expect(adapter.listOrders(ctx)).rejects.toMatchObject({
      code: ErrorCodes.AUTH_REQUIRED,
    });
    await expect(adapter.getInventory(ctx, 'offer-1')).rejects.toMatchObject({
      code: ErrorCodes.AUTH_REQUIRED,
    });

    const brokenCredPrisma = memoryShopifyPrisma({ brokenCredential: true });
    const brokenAdapter = createMockAdapter(brokenCredPrisma);
    await expect(brokenAdapter.listProducts(ctx)).rejects.toMatchObject({
      code: ErrorCodes.AUTH_REQUIRED,
    });
  });

  it('throws RESOURCE_NOT_FOUND when store is not in workspace', async () => {
    const prisma = memoryShopifyPrisma();
    const adapter = createMockAdapter(prisma);
    const wrongCtx = createCommerceContext('ws-2', 'store_sh1', 'trace_test');

    await expect(adapter.listProducts(wrongCtx)).rejects.toMatchObject({
      code: ErrorCodes.RESOURCE_NOT_FOUND,
    });
  });

  it('throws PROVIDER_UNAVAILABLE when store platform is not shopify', async () => {
    const prisma = memoryShopifyPrisma({ wrongPlatform: true });
    const adapter = createMockAdapter(prisma);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    await expect(adapter.listProducts(ctx)).rejects.toMatchObject({
      code: ErrorCodes.PROVIDER_UNAVAILABLE,
    });
  });

  it('handles 429 rate limits with PROVIDER_RATE_LIMIT and retryable: true', async () => {
    const prisma = memoryShopifyPrisma();
    const rateLimitedTransport: ShopifyGraphQLTransport = {
      execute: jest.fn(async () => {
        throw new CommercePortError('PROVIDER_RATE_LIMIT', 'Shopify rate limit exceeded', true);
      }),
    };
    const adapter = createMockAdapter(prisma, rateLimitedTransport);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    await expect(adapter.listProducts(ctx)).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMIT',
      retryable: true,
    });
  });

  it('handles GraphQL errors with COMMERCE_PORT_ERROR', async () => {
    const prisma = memoryShopifyPrisma();
    const errorTransport: ShopifyGraphQLTransport = {
      execute: jest.fn(async () => ({
        errors: [{ message: 'Field "unknownField" not found on type Product' }],
      })) as any,
    };
    const adapter = createMockAdapter(prisma, errorTransport);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    await expect(adapter.listProducts(ctx)).rejects.toMatchObject({
      code: 'COMMERCE_PORT_ERROR',
      retryable: false,
    });
  });

  it('keeps campaigns and profit reads empty and write ports WRITE_FORBIDDEN', async () => {
    const prisma = memoryShopifyPrisma();
    const adapter = createMockAdapter(prisma);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    await expect(adapter.getCampaigns(ctx)).resolves.toEqual([]);
    await expect(adapter.getDailyProfit(ctx)).resolves.toEqual([]);

    await expect(adapter.updateProduct(ctx, { price: 100 })).resolves.toMatchObject({
      ok: false,
      code: ErrorCodes.WRITE_FORBIDDEN,
    });
    await expect(
      adapter.decreaseBid(ctx, { campaignId: 'camp-1' }, 10),
    ).resolves.toMatchObject({
      ok: false,
      code: ErrorCodes.WRITE_FORBIDDEN,
    });
  });

  it('caches access tokens in memory and avoids redundant exchanges', async () => {
    const prisma = memoryShopifyPrisma();
    const mockExchanger = jest.fn(async () => ({
      accessToken: 'shpat_cached_token',
      expiresIn: 86400,
    }));
    const adapter = createMockAdapter(prisma, undefined, { exchangeToken: mockExchanger });
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    await adapter.listProducts(ctx);
    await adapter.listOrders(ctx);
    await adapter.getInventory(ctx, 'gid://shopify/ProductVariant/54443961713004');

    // Only 1 token exchange call should have occurred
    expect(mockExchanger).toHaveBeenCalledTimes(1);
  });
});
