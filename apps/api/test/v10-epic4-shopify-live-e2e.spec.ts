import { PrismaClient } from '@prisma/client';
import { ShopifyAdapter } from '@crosspilot/db';
import { createCommerceContext } from '@crosspilot/domain';
import { encryptSecret } from '../src/modules/commerce-store/credential-crypto.js';

const isLiveE2ERun =
  process.env.RUN_SHOPIFY_LIVE_E2E === '1' ||
  process.env.RUN_SHOPIFY_LIVE_E2E === 'true';

const describeSuite = isLiveE2ERun ? describe : describe.skip;

if (!isLiveE2ERun) {
  console.log(
    '⚠️ [NOT_RUN] Shopify Live GraphQL & Real PostgreSQL Full E2E skipped: set RUN_SHOPIFY_LIVE_E2E=1 to run.',
  );
}

describeSuite('A6: Shopify Live GraphQL & Real PostgreSQL Full E2E Suite', () => {
  jest.setTimeout(60000);

  let prisma: PrismaClient;
  let isConnected = false;

  const timestamp = Date.now();
  const testWorkspaceId = `ws_sh_live_${timestamp}`;
  const testStoreId = `store_sh_live_${timestamp}`;
  const testAccountId = `acc_sh_live_${timestamp}`;
  const testCredentialId = `cred_sh_live_${timestamp}`;

  const shop = process.env.SHOPIFY_SHOP || 'crosspilot-dev';
  const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  beforeAll(async () => {
    // 1. Validate required environment configurations
    if (!testDbUrl) {
      throw new Error(
        'RUN_SHOPIFY_LIVE_E2E=1 requires TEST_DATABASE_URL or DATABASE_URL in environment',
      );
    }
    if (!clientId || !clientSecret) {
      throw new Error(
        'RUN_SHOPIFY_LIVE_E2E=1 requires SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in environment',
      );
    }

    // 2. Establish live PostgreSQL connection
    prisma = new PrismaClient({
      datasources: { db: { url: testDbUrl } },
    });
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    isConnected = true;

    // 3. Create isolated Workspace in real DB
    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        name: 'Shopify Live E2E Workspace',
        slug: `slug-${testWorkspaceId}`,
      },
    });

    // 4. Create isolated Store in real DB
    await prisma.store.create({
      data: {
        id: testStoreId,
        workspaceId: testWorkspaceId,
        name: shop,
        platform: 'shopify',
        country: 'US',
        status: 'ACTIVE',
      },
    });

    // 5. Create CommerceAccount in real DB
    await prisma.commerceAccount.create({
      data: {
        id: testAccountId,
        workspaceId: testWorkspaceId,
        storeId: testStoreId,
        provider: 'shopify',
        region: 'NA',
        status: 'CONNECTED',
        defaultMarketplaceCode: shop,
      },
    });

    // 6. Encrypt live credentials using production AES-256-GCM and persist
    const encryptedPayload = encryptSecret(
      JSON.stringify({
        clientId,
        clientSecret,
        shop,
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
    if (prisma && isConnected) {
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

  it('1. performs live OAuth token exchange, queries Shopify Admin GraphQL API, and persists channel identities directly into PostgreSQL', async () => {
    // Instantiate real ShopifyAdapter without mocks (uses live HTTP transport & token exchanger)
    const adapter = new ShopifyAdapter(prisma, {
      persistIdentities: true,
    });

    const ctx = createCommerceContext(testWorkspaceId, testStoreId);

    // Live call to Shopify Admin API (2026-07)
    const products = await adapter.listProducts(ctx);

    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);

    // Direct PostgreSQL query: verify genuine persistence in channel_identities table
    const dbIdentities = await prisma.channelIdentity.findMany({
      where: { storeId: testStoreId },
    });

    expect(dbIdentities.length).toBeGreaterThan(0);

    // Verify entityType structure: must include 'product' and 'offer' rows
    const productRows = dbIdentities.filter((r) => r.entityType === 'product');
    const offerRows = dbIdentities.filter((r) => r.entityType === 'offer');

    expect(productRows.length).toBeGreaterThan(0);
    expect(offerRows.length).toBeGreaterThan(0);

    for (const row of dbIdentities) {
      expect(row.storeId).toBe(testStoreId);
      expect(row.platform).toBe('shopify');
      expect(row.entityId).toBeDefined();
      expect(row.externalId).toBeDefined();
    }
  });

  it('2. verifies real getProduct retrieval and confirms 1:1 match with persisted PostgreSQL channel identity', async () => {
    const adapter = new ShopifyAdapter(prisma, {
      persistIdentities: true,
    });

    const ctx = createCommerceContext(testWorkspaceId, testStoreId);

    // Find first product identity in DB
    const firstProductIdentity = await prisma.channelIdentity.findFirst({
      where: { storeId: testStoreId, entityType: 'product' },
    });

    expect(firstProductIdentity).not.toBeNull();
    const productGid = firstProductIdentity!.externalId;

    // Retrieve via ShopifyAdapter
    const product = await adapter.getProduct(ctx, productGid);

    expect(product).not.toBeNull();
    expect(product?.id).toBe(productGid);
    expect(product?.identities.length).toBeGreaterThan(0);
  });
});
