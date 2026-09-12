import { ErrorCodes } from '@crosspilot/shared';
import {
  createCommerceContext,
  writeForbiddenResult,
  type CanonicalProduct,
  type CommerceAdapter,
} from '../src/commerce-ports/index.js';

function forbiddenAdapter(): CommerceAdapter {
  const forbid = async (operation: string) => writeForbiddenResult(operation);
  return {
    platform: 'simulator',
    listProducts: async () => [],
    getProduct: async () => null,
    updateProduct: async () => forbid('updateProduct'),
    listOrders: async () => [],
    getInventory: async () => null,
    getCampaigns: async () => [],
    decreaseBid: async () => forbid('decreaseBid'),
    getDailyProfit: async () => [],
  };
}

describe('V10 Epic 2 commerce ports', () => {
  it('requires workspaceId, storeId and traceId on CommerceContext', () => {
    const ctx = createCommerceContext('ws-1', 'store-1', 'trace-1');
    expect(ctx).toEqual({ workspaceId: 'ws-1', storeId: 'store-1', traceId: 'trace-1' });
    expect((ctx as { marketplace?: string }).marketplace).toBeUndefined();
  });

  it('keeps write ports WRITE_FORBIDDEN by default', async () => {
    const adapter = forbiddenAdapter();
    const ctx = createCommerceContext('ws-1', 'store-1');
    const productWrite = await adapter.updateProduct(ctx, { price: 9.99 });
    const bidWrite = await adapter.decreaseBid(ctx, { campaignId: 'c1' }, 20);
    expect(productWrite).toMatchObject({ ok: false, code: ErrorCodes.WRITE_FORBIDDEN, retryable: false });
    expect(bidWrite).toMatchObject({ ok: false, code: ErrorCodes.WRITE_FORBIDDEN, retryable: false });
  });

  it('puts platform identities on the read projection, not on CanonicalProduct as asin/shopifyId columns', () => {
    const product: CanonicalProduct = {
      id: 'sku-1',
      workspaceId: 'ws-1',
      storeId: 'store-1',
      platform: 'simulator',
      title: 'Holder',
      sku: 'MTH-WHITE-001',
      category: 'Bath',
      price: 28.99,
      cost: null,
      identities: [{ type: 'asin', id: 'B0EXAMPLE' }],
    };
    expect(product.identities[0]).toEqual({ type: 'asin', id: 'B0EXAMPLE' });
    expect((product as { asin?: string }).asin).toBeUndefined();
    expect((product as { shopifyId?: string }).shopifyId).toBeUndefined();
  });
});
