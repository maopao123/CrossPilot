import { PrismaClient } from '@prisma/client';
import {
  ShopifyAdapter,
  type ShopifyGraphQLTransport,
  type ShopifyGraphQLResponse,
} from '@crosspilot/db';
import { createCommerceContext } from '@crosspilot/domain';
import { encryptSecret } from '../src/modules/commerce-store/credential-crypto.js';

const targetDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:Pgsql456%40@127.0.0.1:15432/crosspilot?schema=public';

describe('A5: ShopifyAdapter Real PostgreSQL Integration & ChannelIdentity Persistence', () => {
  let prisma: PrismaClient;
  let isDbAvailable = false;

  const timestamp = Date.now();
  const testWorkspaceId = `ws_sh_db_${timestamp}`;
  const testStoreId = `store_sh_db_${timestamp}`;
  const testAccountId = `acc_sh_db_${timestamp}`;
  const testCredentialId = `cred_sh_db_${timestamp}`;

  const PRODUCT_GID = 'gid://shopify/Product/9876543210';
  const VARIANT_1_GID = 'gid://shopify/ProductVariant/111111';
  const VARIANT_2_GID = 'gid://shopify/ProductVariant/222222';
  const SKU_1 = 'SNOW-154-BLK';
  const SKU_2 = 'SNOW-158-BLU';

  const mockProductNode = {
    id: PRODUCT_GID,
    title: 'Snowboard Pro Multi-Variant',
    handle: 'snowboard-pro-multi',
    status: 'ACTIVE',
    productType: 'Snowboards',
    variants: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          id: VARIANT_1_GID,
          title: '154cm / Matte Black',
          sku: SKU_1,
          price: '599.99',
          inventoryItem: { id: 'gid://shopify/InventoryItem/88801' },
        },
        {
          id: VARIANT_2_GID,
          title: '158cm / Cyan Blue',
          sku: SKU_2,
          price: '629.99',
          inventoryItem: { id: 'gid://shopify/InventoryItem/88802' },
        },
      ],
    },
  };

  const mockTransport: ShopifyGraphQLTransport = {
    execute: jest.fn(async (_shop: string, _token: string, query: string, variables?: Record<string, unknown>) => {
      if (query.includes('ListProducts')) {
        return {
          data: {
            products: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [mockProductNode],
            },
          },
        } as ShopifyGraphQLResponse<any>;
      }
      if (query.includes('GetProduct($id: ID!)')) {
        return {
          data: {
            product: mockProductNode,
          },
        } as ShopifyGraphQLResponse<any>;
      }
      if (query.includes('GetProductVariant($id: ID!)')) {
        const id = variables?.id;
        const matched = mockProductNode.variants.nodes.find((v) => v.id === id);
        return {
          data: {
            productVariant: matched
              ? {
                  ...matched,
                  product: {
                    id: mockProductNode.id,
                    title: mockProductNode.title,
                    handle: mockProductNode.handle,
                    status: mockProductNode.status,
                    productType: mockProductNode.productType,
                  },
                }
              : null,
          },
        } as ShopifyGraphQLResponse<any>;
      }
      return { data: {} };
    }),
  };

  const mockExchangeToken = jest.fn(async () => ({
    accessToken: 'shpat_test_mock_token_for_db_integration',
    expiresIn: 3600,
  }));

  beforeAll(async () => {
    try {
      prisma = new PrismaClient({
        datasources: { db: { url: targetDbUrl } },
      });
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      isDbAvailable = true;
    } catch (err: any) {
      console.warn(`⚠️ [NOT_RUN] PostgreSQL not available at ${targetDbUrl}:`, err?.message);
      isDbAvailable = false;
      return;
    }

    // 1. Create isolated Workspace
    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        name: 'Shopify DB Integration Workspace',
        slug: `slug-${testWorkspaceId}`,
      },
    });

    // 2. Create isolated Store
    await prisma.store.create({
      data: {
        id: testStoreId,
        workspaceId: testWorkspaceId,
        name: 'crosspilot-dev',
        platform: 'shopify',
        country: 'US',
        status: 'ACTIVE',
      },
    });

    // 3. Create CommerceAccount
    await prisma.commerceAccount.create({
      data: {
        id: testAccountId,
        workspaceId: testWorkspaceId,
        storeId: testStoreId,
        provider: 'shopify',
        region: 'NA',
        status: 'CONNECTED',
        defaultMarketplaceCode: 'crosspilot-dev',
      },
    });

    // 4. Create encrypted ProviderCredential using real credential crypto service
    const encryptedPayload = encryptSecret(
      JSON.stringify({
        clientId: process.env.SHOPIFY_CLIENT_ID || 'dummy_test_shopify_client_id',
        clientSecret: process.env.SHOPIFY_CLIENT_SECRET || 'dummy_test_shopify_client_secret',
        shop: 'crosspilot-dev',
      }),
    );

    await prisma.providerCredential.create({
      data: {
        id: testCredentialId,
        accountId: testAccountId,
        kind: 'SHOPIFY_CLIENT_CREDENTIALS',
        payloadEnc: encryptedPayload,
      },
    });
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      try {
        await prisma.channelIdentity.deleteMany({ where: { storeId: testStoreId } });
        await prisma.providerCredential.deleteMany({ where: { id: testCredentialId } });
        await prisma.commerceAccount.deleteMany({ where: { id: testAccountId } });
        await prisma.store.deleteMany({ where: { id: testStoreId } });
        await prisma.workspace.deleteMany({ where: { id: testWorkspaceId } });
      } catch (err: any) {
        console.error('Teardown cleanup error:', err);
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it('1. syncs multi-variant Shopify product into real PostgreSQL channel_identities table without overwriting', async () => {
    if (!isDbAvailable) {
      console.log('Skipping test: DB not reachable');
      return;
    }

    const adapter = new ShopifyAdapter(prisma, {
      transport: mockTransport,
      exchangeToken: mockExchangeToken,
      persistIdentities: true,
    });

    const ctx = createCommerceContext(testWorkspaceId, testStoreId);

    const products = await adapter.listProducts(ctx);
    expect(products.length).toBe(2);

    // Directly query PostgreSQL channel_identities table via Prisma
    const identitiesInDb = await prisma.channelIdentity.findMany({
      where: { storeId: testStoreId },
      orderBy: [{ entityType: 'asc' }, { externalId: 'asc' }],
    });

    // Assert exactly 5 identities persisted:
    // 1 Product identity (entityType: 'product', externalId: PRODUCT_GID, entityId: PRODUCT_GID)
    // 2 Variant identities (entityType: 'offer', externalId: VARIANT_GID, entityId: VARIANT_GID)
    // 2 SKU identities (entityType: 'offer', externalId: SKU, entityId: VARIANT_GID)
    expect(identitiesInDb.length).toBe(5);

    // Product GID identity
    const productIdentity = identitiesInDb.find((r) => r.entityType === 'product');
    expect(productIdentity).toBeDefined();
    expect(productIdentity?.externalId).toBe(PRODUCT_GID);
    expect(productIdentity?.entityId).toBe(PRODUCT_GID);
    expect(productIdentity?.platform).toBe('shopify');

    // Variant 1 identities
    const v1VariantRow = identitiesInDb.find(
      (r) => r.entityType === 'offer' && r.externalId === VARIANT_1_GID,
    );
    expect(v1VariantRow).toBeDefined();
    expect(v1VariantRow?.entityId).toBe(VARIANT_1_GID);

    const v1SkuRow = identitiesInDb.find((r) => r.entityType === 'offer' && r.externalId === SKU_1);
    expect(v1SkuRow).toBeDefined();
    expect(v1SkuRow?.entityId).toBe(VARIANT_1_GID);

    // Variant 2 identities (must NOT overwrite Variant 1)
    const v2VariantRow = identitiesInDb.find(
      (r) => r.entityType === 'offer' && r.externalId === VARIANT_2_GID,
    );
    expect(v2VariantRow).toBeDefined();
    expect(v2VariantRow?.entityId).toBe(VARIANT_2_GID);

    const v2SkuRow = identitiesInDb.find((r) => r.entityType === 'offer' && r.externalId === SKU_2);
    expect(v2SkuRow).toBeDefined();
    expect(v2SkuRow?.entityId).toBe(VARIANT_2_GID);
  });

  it('2. retrieves CanonicalProduct by Product GID and aligns id with ChannelIdentity.entityId', async () => {
    if (!isDbAvailable) {
      console.log('Skipping test: DB not reachable');
      return;
    }

    const adapter = new ShopifyAdapter(prisma, {
      transport: mockTransport,
      exchangeToken: mockExchangeToken,
      persistIdentities: true,
    });

    const ctx = createCommerceContext(testWorkspaceId, testStoreId);

    const product = await adapter.getProduct(ctx, PRODUCT_GID);
    expect(product).not.toBeNull();
    expect(product?.id).toBe(PRODUCT_GID);
    expect(product?.title).toBe('Snowboard Pro Multi-Variant');

    // Query DB for product identity and verify 1:1 match
    const productDbIdentity = await prisma.channelIdentity.findUnique({
      where: {
        storeId_platform_entityType_externalId: {
          storeId: testStoreId,
          platform: 'shopify',
          entityType: 'product',
          externalId: PRODUCT_GID,
        },
      },
    });

    expect(productDbIdentity).not.toBeNull();
    expect(productDbIdentity?.entityId).toBe(product?.id);
  });

  it('3. proves idempotency: re-running listProducts updates safely without row duplication', async () => {
    if (!isDbAvailable) {
      console.log('Skipping test: DB not reachable');
      return;
    }

    const adapter = new ShopifyAdapter(prisma, {
      transport: mockTransport,
      exchangeToken: mockExchangeToken,
      persistIdentities: true,
    });

    const ctx = createCommerceContext(testWorkspaceId, testStoreId);

    // Run again
    await adapter.listProducts(ctx);

    const identitiesCount = await prisma.channelIdentity.count({
      where: { storeId: testStoreId },
    });

    expect(identitiesCount).toBe(5);
  });
});
