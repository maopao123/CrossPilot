const { encryptProviderCredential } = require('../packages/integrations/dist/index.js');
const { ShopifyAdapter } = require('../packages/db/dist/index.js');
const { createCommerceContext } = require('../packages/domain/dist/index.js');

async function main() {
  const shop = process.env.SHOPIFY_SHOP || 'crosspilot-dev';
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET in environment');
    process.exit(1);
  }

  // Encrypt payload using production-standard AES-256-GCM
  const payloadRaw = JSON.stringify({
    clientId,
    clientSecret,
    shop,
  });
  const payloadEnc = encryptProviderCredential(payloadRaw);

  const stores = [
    {
      id: 'store_live_sh1',
      workspaceId: 'ws_live',
      name: shop,
      platform: 'shopify',
      country: 'US',
      status: 'ACTIVE',
    },
  ];
  const accounts = [
    {
      id: 'acct_live_sh1',
      workspaceId: 'ws_live',
      storeId: 'store_live_sh1',
      provider: 'shopify',
      defaultMarketplaceCode: shop,
      status: 'CONNECTED',
    },
  ];
  const credentials = [
    {
      accountId: 'acct_live_sh1',
      kind: 'SHOPIFY_CLIENT_CREDENTIALS',
      payloadEnc,
    },
  ];
  const identityWrites = [];

  const prismaMock = {
    store: {
      findUnique: async ({ where }) => stores.find((s) => s.id === where.id) || null,
    },
    commerceAccount: {
      findUnique: async ({ where }) => accounts.find((a) => a.storeId === where.storeId) || null,
    },
    providerCredential: {
      findUnique: async ({ where }) =>
        credentials.find(
          (c) =>
            c.accountId === where.accountId_kind.accountId &&
            c.kind === where.accountId_kind.kind,
        ) || null,
    },
    channelIdentity: {
      upsert: async ({ create }) => {
        identityWrites.push(create);
        return create;
      },
    },
  };

  const adapter = new ShopifyAdapter(prismaMock);
  const ctx = createCommerceContext('ws_live', 'store_live_sh1', 'trace_live_gate_a');

  console.log('--- 1. Testing listProducts() ---');
  const products = await adapter.listProducts(ctx);
  console.log(`Fetched ${products.length} products successfully.`);
  if (products.length === 0) {
    throw new Error('Expected at least 1 product from crosspilot-dev');
  }

  const firstProduct = products[0];
  console.log('Sample CanonicalProduct:', JSON.stringify({
    id: firstProduct.id,
    title: firstProduct.title,
    sku: firstProduct.sku,
    price: firstProduct.price,
    identities: firstProduct.identities,
  }, null, 2));

  console.log('\n--- 2. Testing getProduct() ---');
  const singleProduct = await adapter.getProduct(ctx, firstProduct.id);
  console.log('Single product lookup:', singleProduct ? `Found: ${singleProduct.title}` : 'Not found');
  if (!singleProduct) {
    throw new Error(`Failed to lookup product by offerId=${firstProduct.id}`);
  }

  console.log('\n--- 3. Testing listOrders() ---');
  const orders = await adapter.listOrders(ctx, { limit: 5 });
  console.log(`Fetched ${orders.length} orders successfully.`);

  console.log('\n--- 4. Testing getInventory() ---');
  const inventory = await adapter.getInventory(ctx, firstProduct.id);
  console.log('Sample CanonicalInventory:', JSON.stringify(inventory, null, 2));
  if (!inventory) {
    throw new Error(`Failed to lookup inventory for offerId=${firstProduct.id}`);
  }

  console.log('\n--- 5. Channel Identity Projections ---');
  console.log(`Total identities projected into ChannelIdentity: ${identityWrites.length}`);

  console.log('\n--- 6. Write Forbidden Checks ---');
  const updateRes = await adapter.updateProduct(ctx, { price: 100 });
  const bidRes = await adapter.decreaseBid(ctx, { campaignId: 'c1' }, 10);
  console.log('updateProduct forbidden:', updateRes.code === 'WRITE_FORBIDDEN');
  console.log('decreaseBid forbidden:', bidRes.code === 'WRITE_FORBIDDEN');

  console.log('\n=== Gate A Verification PASSED! ===');
}

main().catch((err) => {
  console.error('Gate A verification FAILED:', err);
  process.exit(1);
});
