'use strict';

const assert = require('assert');
const {
  STORE_CAPABILITIES,
  AMAZON_PROVIDER_ID,
  MOCK_AMAZON_PROVIDER_ID,
  isAmazonReadAllowed,
  assertAmazonReadOnly,
  mapParticipations,
  mapOrders,
  mapInventorySummaries,
  MOCK_AMAZON_FIXTURES,
  MockAmazonProvider,
  AmazonProvider,
  createDefaultIntegrationGateway,
  SecretProvider,
} = require('../dist/index.js');

async function main() {
  assert.strictEqual(isAmazonReadAllowed('GET', '/sellers/v1/marketplaceParticipations'), true);
  assert.strictEqual(isAmazonReadAllowed('GET', '/fba/inventory/v1/summaries'), true);
  assert.strictEqual(isAmazonReadAllowed('POST', '/listings/2021-08-01/items/A/SKU'), false);
  assert.strictEqual(isAmazonReadAllowed('DELETE', '/listings/2021-08-01/items/A/SKU'), false);
  try {
    assertAmazonReadOnly('PUT', '/listings/2021-08-01/items/A/SKU');
    assert.fail('write should throw');
  } catch (err) {
    assert.strictEqual(err.code, 'WRITE_FORBIDDEN');
  }

  const parts = mapParticipations(MOCK_AMAZON_FIXTURES.participations);
  assert.strictEqual(parts[0].marketplaceId, 'ATVPDKIKX0DER');
  const orders = mapOrders(MOCK_AMAZON_FIXTURES.orders);
  assert.strictEqual(orders[0].amazonOrderId, '114-0000001-0000001');
  const inv = mapInventorySummaries(MOCK_AMAZON_FIXTURES.inventory);
  assert.strictEqual(inv[0].fulfillableQuantity, 42);

  const mock = new MockAmazonProvider();
  const ctx = { workspaceId: 'ws-1', traceId: 't-1' };
  const listingRes = await mock.execute(
    STORE_CAPABILITIES.listingsSearch,
    {
      capabilityId: STORE_CAPABILITIES.listingsSearch,
      providerId: MOCK_AMAZON_PROVIDER_ID,
      transport: 'NATIVE',
      enabled: true,
      priority: 10,
    },
    {},
    ctx,
  );
  assert.strictEqual(listingRes.success, true);
  assert.strictEqual(listingRes.data[0].sellerSku, 'MTH-WHITE-001');

  const live = new AmazonProvider();
  const authRes = await live.execute(
    STORE_CAPABILITIES.participations,
    {
      capabilityId: STORE_CAPABILITIES.participations,
      providerId: AMAZON_PROVIDER_ID,
      transport: 'HTTP',
      enabled: true,
      priority: 100,
    },
    {},
    ctx,
  );
  assert.strictEqual(authRes.success, false);
  assert.strictEqual(authRes.error.code, 'AUTH_REQUIRED');

  const listingLive = await live.execute(
    STORE_CAPABILITIES.listingsSearch,
    {
      capabilityId: STORE_CAPABILITIES.listingsSearch,
      providerId: AMAZON_PROVIDER_ID,
      transport: 'HTTP',
      enabled: true,
      priority: 100,
    },
    {},
    { ...ctx, metadata: { amazonAccessToken: 'Atza|test' } },
  );
  assert.strictEqual(listingLive.success, false);
  assert.ok(listingLive.error && listingLive.error.code);

  SecretProvider.clearOverrides();
  const bundle = createDefaultIntegrationGateway();
  const routed = await bundle.gateway.executeCapability(
    STORE_CAPABILITIES.inventorySummaries,
    {},
    ctx,
  );
  assert.strictEqual(routed.success, true);
  assert.strictEqual(routed.providerId, MOCK_AMAZON_PROVIDER_ID);

  if (!process.env.AMAZON_LWA_REFRESH_TOKEN) {
    console.log('LIVE_NOT_RUN');
  }

  console.log('EPIC4_AMAZON_STORE_TESTS_PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
