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
          entityType: 'product',
          entityId: 'gid://shopify/Product/15299021275500',
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

  it('multi-variant identity mapping: 1 Product with 2 Variants preserves distinct ChannelIdentities without last-write-wins', async () => {
    const multiVariantData = {
      data: {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: 'gid://shopify/Product/100',
              title: 'Multi Variant T-Shirt',
              handle: 'multi-variant-t-shirt',
              status: 'ACTIVE',
              productType: 'Apparel',
              variants: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    id: 'gid://shopify/ProductVariant/101',
                    title: 'Red / Small',
                    sku: 'TSHIRT-RED-S',
                    price: '19.99',
                    inventoryItem: { id: 'gid://shopify/InventoryItem/201' },
                  },
                  {
                    id: 'gid://shopify/ProductVariant/102',
                    title: 'Blue / Medium',
                    sku: 'TSHIRT-BLUE-M',
                    price: '24.99',
                    inventoryItem: { id: 'gid://shopify/InventoryItem/202' },
                  },
                ],
              },
            },
          ],
        },
      },
    };

    const prisma = memoryShopifyPrisma();
    const adapter = createMockAdapter(prisma, {
      execute: jest.fn(async () => multiVariantData) as any,
    });
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const products = await adapter.listProducts(ctx);
    expect(products.length).toBe(2);

    const writes = prisma.identityWrites;
    // Must contain Product GID with entityType=product
    const productWrites = writes.filter((w: any) => w.externalId === 'gid://shopify/Product/100');
    expect(productWrites.length).toBeGreaterThanOrEqual(1);
    expect(productWrites[0].entityType).toBe('product');
    expect(productWrites[0].entityId).toBe('gid://shopify/Product/100');

    // Must contain Variant 101 with entityType=offer pointing to Variant 101
    const v1Write = writes.find((w: any) => w.externalId === 'gid://shopify/ProductVariant/101');
    expect(v1Write).toBeDefined();
    expect(v1Write?.entityType).toBe('offer');
    expect(v1Write?.entityId).toBe('gid://shopify/ProductVariant/101');

    // Must contain Variant 102 with entityType=offer pointing to Variant 102
    const v2Write = writes.find((w: any) => w.externalId === 'gid://shopify/ProductVariant/102');
    expect(v2Write).toBeDefined();
    expect(v2Write?.entityType).toBe('offer');
    expect(v2Write?.entityId).toBe('gid://shopify/ProductVariant/102');

    // Distinct SKU identities
    const sku1Write = writes.find((w: any) => w.externalId === 'TSHIRT-RED-S');
    const sku2Write = writes.find((w: any) => w.externalId === 'TSHIRT-BLUE-M');
    expect(sku1Write?.entityId).toBe('gid://shopify/ProductVariant/101');
    expect(sku2Write?.entityId).toBe('gid://shopify/ProductVariant/102');
  });

  it('getProduct by Product GID returns CanonicalProduct with Product GID and matching ChannelIdentity semantics', async () => {
    const singleProductNode = {
      data: {
        product: {
          id: 'gid://shopify/Product/100',
          title: 'Multi Variant T-Shirt',
          handle: 'multi-variant-t-shirt',
          status: 'ACTIVE',
          productType: 'Apparel',
          variants: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: 'gid://shopify/ProductVariant/101',
                title: 'Red / Small',
                sku: 'TSHIRT-RED-S',
                price: '19.99',
              },
            ],
          },
        },
      },
    };

    const prisma = memoryShopifyPrisma();
    const adapter = createMockAdapter(prisma, {
      execute: jest.fn(async () => singleProductNode) as any,
    });
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const product = await adapter.getProduct(ctx, 'gid://shopify/Product/100');
    expect(product).not.toBeNull();
    expect(product?.id).toBe('gid://shopify/Product/100');
    expect(product?.title).toBe('Multi Variant T-Shirt');
  });

  it('rejects invalid or arbitrary external shop hostnames to protect access token', async () => {
    const prisma = memoryShopifyPrisma();
    // Configure store with arbitrary external host
    (prisma.store.findUnique as jest.Mock).mockResolvedValue({
      id: 'store_evil',
      workspaceId: 'ws-1',
      platform: 'shopify',
      name: 'evil.com',
    });
    (prisma.commerceAccount.findUnique as jest.Mock).mockResolvedValue({
      id: 'acct_evil',
      storeId: 'store_evil',
      defaultMarketplaceCode: 'https://evil.com',
    });
    (prisma.providerCredential.findUnique as jest.Mock).mockResolvedValue({
      accountId: 'acct_evil',
      kind: 'SHOPIFY_CLIENT_CREDENTIALS',
      payloadEnc: JSON.stringify({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        shop: 'evil.com',
      }),
    });

    const adapter = createMockAdapter(prisma);
    const ctx = createCommerceContext('ws-1', 'store_evil', 'trace_test');

    await expect(adapter.listProducts(ctx)).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
    });
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

  it('P1 Finding 2: maps Inventory GraphQL with realistic Shopify fields (available, on_hand, committed) without double counting', async () => {
    const prisma = memoryShopifyPrisma();
    const realisticInventoryTransport: ShopifyGraphQLTransport = {
      execute: jest.fn(async () => ({
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
                      { name: 'on_hand', quantity: 45 },
                      { name: 'committed', quantity: 3 },
                      { name: 'incoming', quantity: 15 },
                    ],
                  },
                  {
                    // Second location: only has on_hand and reserved
                    quantities: [
                      { name: 'on_hand', quantity: 20 },
                      { name: 'reserved', quantity: 2 },
                      { name: 'incoming', quantity: 5 },
                    ],
                  },
                ],
              },
            },
          },
        },
      })) as any,
    };

    const adapter = createMockAdapter(prisma, realisticInventoryTransport);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const inv = await adapter.getInventory(ctx, 'gid://shopify/ProductVariant/54443961713004');
    expect(inv).not.toBeNull();
    // First location: available 42 (not 42+45=87), reserved 3. Second location: available 20, reserved 2.
    expect(inv?.available).toBe(62);
    expect(inv?.reserved).toBe(5);
    expect(inv?.inbound).toBe(20);
  });

  it('P1 Finding 3: getProduct and getInventory propagate upstream AUTH_REQUIRED, PROVIDER_RATE_LIMIT, and COMMERCE_PORT_ERROR', async () => {
    const prisma = memoryShopifyPrisma();
    const errorsToTest = [
      new CommercePortError(ErrorCodes.AUTH_REQUIRED, 'Shopify access token expired', false),
      new CommercePortError('PROVIDER_RATE_LIMIT', 'Shopify rate limit exceeded', true),
      new CommercePortError('COMMERCE_PORT_ERROR', 'Internal GraphQL capability error', false),
    ];

    for (const error of errorsToTest) {
      const errorTransport: ShopifyGraphQLTransport = {
        execute: jest.fn(async () => {
          throw error;
        }),
      };
      const adapter = createMockAdapter(prisma, errorTransport);
      const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

      // 1. getProduct by GID
      await expect(adapter.getProduct(ctx, 'gid://shopify/ProductVariant/12345')).rejects.toMatchObject({
        code: error.code,
      });

      // 2. getProduct by SKU
      await expect(adapter.getProduct(ctx, 'SKU-TEST-001')).rejects.toMatchObject({
        code: error.code,
      });

      // 3. getInventory by GID
      await expect(adapter.getInventory(ctx, 'gid://shopify/ProductVariant/12345')).rejects.toMatchObject({
        code: error.code,
      });

      // 4. getInventory by SKU
      await expect(adapter.getInventory(ctx, 'SKU-TEST-001')).rejects.toMatchObject({
        code: error.code,
      });
    }
  });

  it('P1 Finding 4: GraphQL errors with data present throw appropriate errors and never return empty array silently', async () => {
    const prisma = memoryShopifyPrisma();

    // 1. Access denied error with data.products = null
    const authErrorTransport: ShopifyGraphQLTransport = {
      execute: jest.fn(async () => ({
        data: { products: null },
        errors: [{ message: 'Access denied for products field', extensions: { code: 'ACCESS_DENIED' } }],
      })) as any,
    };
    const authAdapter = createMockAdapter(prisma, authErrorTransport);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    await expect(authAdapter.listProducts(ctx)).rejects.toMatchObject({
      code: ErrorCodes.AUTH_REQUIRED,
    });

    // 2. Throttled error with data.orders = null
    const throttledTransport: ShopifyGraphQLTransport = {
      execute: jest.fn(async () => ({
        data: { orders: null },
        errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
      })) as any,
    };
    const throttledAdapter = createMockAdapter(prisma, throttledTransport);

    await expect(throttledAdapter.listOrders(ctx)).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMIT',
      retryable: true,
    });
  });

  it('P2 Finding 6: listProducts paginates across 51 products and nested variants', async () => {
    const prisma = memoryShopifyPrisma();

    // Mock 50 products on page 1, 1 product on page 2 with 21 variants
    const page1Products = Array.from({ length: 50 }, (_, i) => ({
      id: `gid://shopify/Product/${1000 + i}`,
      title: `Product ${i + 1}`,
      handle: `product-${i + 1}`,
      status: 'ACTIVE',
      productType: 'test',
      variants: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            id: `gid://shopify/ProductVariant/${2000 + i}`,
            title: `Variant ${i + 1}`,
            sku: `SKU-${i + 1}`,
            price: '19.99',
            inventoryItem: { id: `gid://shopify/InventoryItem/${3000 + i}` },
          },
        ],
      },
    }));

    const product51Variants = Array.from({ length: 21 }, (_, i) => ({
      id: `gid://shopify/ProductVariant/${5000 + i}`,
      title: `MultiVariant ${i + 1}`,
      sku: `MULTI-SKU-${i + 1}`,
      price: '29.99',
      inventoryItem: { id: `gid://shopify/InventoryItem/${6000 + i}` },
    }));

    const paginatedTransport: ShopifyGraphQLTransport = {
      execute: jest.fn(async (_shop, _token, query: string, variables: any) => {
        if (query.includes('ListProducts')) {
          if (!variables?.after) {
            return {
              data: {
                products: {
                  pageInfo: { hasNextPage: true, endCursor: 'cursor_page_1' },
                  nodes: page1Products,
                },
              },
            };
          }
          if (variables?.after === 'cursor_page_1') {
            return {
              data: {
                products: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      id: 'gid://shopify/Product/9999',
                      title: '51st Product with 21 variants',
                      handle: 'product-51',
                      status: 'ACTIVE',
                      productType: 'test',
                      variants: {
                        pageInfo: { hasNextPage: false, endCursor: null },
                        nodes: product51Variants,
                      },
                    },
                  ],
                },
              },
            };
          }
        }
        return { data: {} };
      }) as any,
    };

    const adapter = createMockAdapter(prisma, paginatedTransport);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const products = await adapter.listProducts(ctx);
    // 50 products from page 1 + 21 variants from product 51 = 71 CanonicalProducts
    expect(products.length).toBe(71);
    expect(paginatedTransport.execute).toHaveBeenCalledTimes(2);
  });

  it('P2 Finding 6: getInventory paginates across 11 inventory locations', async () => {
    const prisma = memoryShopifyPrisma();

    // 10 locations in initial response, hasNextPage = true, 1 location in second page
    const initialLevels = Array.from({ length: 10 }, (_, i) => ({
      quantities: [{ name: 'available', quantity: 5 }],
    }));
    const additionalLevels = [{ quantities: [{ name: 'available', quantity: 10 }] }];

    const paginatedInventoryTransport: ShopifyGraphQLTransport = {
      execute: jest.fn(async (_shop, _token, query: string) => {
        if (query.includes('GetVariantInventory')) {
          return {
            data: {
              productVariant: {
                id: 'gid://shopify/ProductVariant/54443961713004',
                inventoryItem: {
                  id: 'gid://shopify/InventoryItem/55646041375084',
                  inventoryLevels: {
                    pageInfo: { hasNextPage: true, endCursor: 'cur_loc_10' },
                    nodes: initialLevels,
                  },
                },
              },
            },
          };
        }
        if (query.includes('GetMoreInventoryLevels')) {
          return {
            data: {
              inventoryItem: {
                id: 'gid://shopify/InventoryItem/55646041375084',
                inventoryLevels: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: additionalLevels,
                },
              },
            },
          };
        }
        return { data: {} };
      }) as any,
    };

    const adapter = createMockAdapter(prisma, paginatedInventoryTransport);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const inv = await adapter.getInventory(ctx, 'gid://shopify/ProductVariant/54443961713004');
    expect(inv).not.toBeNull();
    // 10 locations * 5 + 1 location * 10 = 60
    expect(inv?.available).toBe(60);
    expect(paginatedInventoryTransport.execute).toHaveBeenCalledTimes(2);
  });

  it('P2 Finding 7: listOrders applies from/to date filters and paginates until limit is satisfied', async () => {
    const prisma = memoryShopifyPrisma();
    let capturedQueryFilter: string | undefined;

    const fromDate = new Date('2026-09-01T00:00:00.000Z');
    const toDate = new Date('2026-09-10T23:59:59.000Z');

    const ordersTransport: ShopifyGraphQLTransport = {
      execute: jest.fn(async (_shop, _token, _graphql: string, variables: any) => {
        capturedQueryFilter = variables?.query;
        if (!variables?.after) {
          // Page 1: contains 1 order with PENDING status
          return {
            data: {
              orders: {
                pageInfo: { hasNextPage: true, endCursor: 'order_cur_1' },
                nodes: [
                  {
                    id: 'gid://shopify/Order/101',
                    name: '#101',
                    createdAt: '2026-09-02T10:00:00Z',
                    displayFinancialStatus: 'PENDING',
                    currentTotalPriceSet: { shopMoney: { amount: '50.00', currencyCode: 'USD' } },
                    lineItems: { nodes: [] },
                  },
                ],
              },
            },
          };
        }
        if (variables?.after === 'order_cur_1') {
          // Page 2: contains 1 order with PAID status
          return {
            data: {
              orders: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    id: 'gid://shopify/Order/102',
                    name: '#102',
                    createdAt: '2026-09-05T12:00:00Z',
                    displayFinancialStatus: 'PAID',
                    currentTotalPriceSet: { shopMoney: { amount: '120.00', currencyCode: 'USD' } },
                    lineItems: { nodes: [] },
                  },
                ],
              },
            },
          };
        }
        return { data: {} };
      }) as any,
    };

    const adapter = createMockAdapter(prisma, ordersTransport);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const orders = await adapter.listOrders(ctx, {
      from: fromDate,
      to: toDate,
      status: 'PAID',
      limit: 1,
    });

    // 1. Verify query string includes both from and to
    expect(capturedQueryFilter).toContain(`created_at:>=${fromDate.toISOString()}`);
    expect(capturedQueryFilter).toContain(`created_at:<=${toDate.toISOString()}`);

    // 2. Verify pagination continued to Page 2 to satisfy limit: 1 for status: 'PAID'
    expect(orders.length).toBe(1);
    expect(orders[0].id).toBe('gid://shopify/Order/102');
    expect(orders[0].status).toBe('PAID');
    expect(ordersTransport.execute).toHaveBeenCalledTimes(2);
  });

  it('Regression R2-3: getInventory correctly sums committed and reserved inventory without overwriting reserved when committed is 0', async () => {
    const prisma = memoryShopifyPrisma();

    const inventoryTransport: ShopifyGraphQLTransport = {
      execute: jest.fn(async () => ({
        data: {
          productVariant: {
            id: 'gid://shopify/ProductVariant/54443961713004',
            inventoryItem: {
              inventoryLevels: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    // Location 1: committed=0, reserved=5 (Shopify normal output when committed bucket is present with 0)
                    // Must NOT wipe reserved to 0!
                    quantities: [
                      { name: 'available', quantity: 42 },
                      { name: 'on_hand', quantity: 47 },
                      { name: 'committed', quantity: 0 },
                      { name: 'reserved', quantity: 5 },
                      { name: 'incoming', quantity: 10 },
                    ],
                  },
                  {
                    // Location 2: committed=3, reserved=2 (both non-overlapping buckets present)
                    // Must sum to 5 reserved!
                    quantities: [
                      { name: 'available', quantity: 15 },
                      { name: 'committed', quantity: 3 },
                      { name: 'reserved', quantity: 2 },
                      { name: 'incoming', quantity: 4 },
                    ],
                  },
                ],
              },
            },
          },
        },
      })) as any,
    };

    const adapter = createMockAdapter(prisma, inventoryTransport);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    const inv = await adapter.getInventory(ctx, 'gid://shopify/ProductVariant/54443961713004');
    expect(inv).not.toBeNull();
    // Available: Location 1 (42, not 42+47=89) + Location 2 (15) = 57
    expect(inv?.available).toBe(57);
    // Reserved: Location 1 (0 + 5 = 5) + Location 2 (3 + 2 = 5) = 10
    expect(inv?.reserved).toBe(10);
    // Inbound: Location 1 (10) + Location 2 (4) = 14
    expect(inv?.inbound).toBe(14);
  });

  it('Regression R2-4: listOrders with limit: 0 returns empty array immediately without making API calls', async () => {
    const prisma = memoryShopifyPrisma();

    const ordersTransport: ShopifyGraphQLTransport = {
      execute: jest.fn(async () => ({
        data: {
          orders: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: 'gid://shopify/Order/201',
                name: '#201',
                createdAt: '2026-09-02T10:00:00Z',
                displayFinancialStatus: 'PAID',
                currentTotalPriceSet: { shopMoney: { amount: '50.00', currencyCode: 'USD' } },
                lineItems: { nodes: [] },
              },
              {
                id: 'gid://shopify/Order/202',
                name: '#202',
                createdAt: '2026-09-03T10:00:00Z',
                displayFinancialStatus: 'PAID',
                currentTotalPriceSet: { shopMoney: { amount: '75.00', currencyCode: 'USD' } },
                lineItems: { nodes: [] },
              },
            ],
          },
        },
      })) as any,
    };

    const adapter = createMockAdapter(prisma, ordersTransport);
    const ctx = createCommerceContext('ws-1', 'store_sh1', 'trace_test');

    // 1. limit: 0 must return [] immediately without executing GraphQL request
    const zeroOrders = await adapter.listOrders(ctx, { limit: 0 });
    expect(zeroOrders).toEqual([]);
    expect(ordersTransport.execute).not.toHaveBeenCalled();

    // 2. limit: 1 returns exactly 1 order
    const oneOrder = await adapter.listOrders(ctx, { limit: 1 });
    expect(oneOrder.length).toBe(1);
    expect(ordersTransport.execute).toHaveBeenCalledTimes(1);

    // 3. no limit returns all orders
    const allOrders = await adapter.listOrders(ctx, {});
    expect(allOrders.length).toBe(2);
  });
});
