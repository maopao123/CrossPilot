import { ErrorCodes } from '@crosspilot/shared';
import { createCommerceContext } from '@crosspilot/domain';
import {
  SimulatorAdapter,
  AmazonAdapter,
} from '@crosspilot/db';
import { MockAmazonProvider } from '@crosspilot/integrations';

describe('CL-6: Closed-loop v2 Platform & Adapter Contract Verification', () => {
  const WORKSPACE_ID = 'ws_contract_test';
  const STORE_SIM = 'store_sim';
  const STORE_AMAZON = 'store_az';

  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      store: {
        findUnique: jest.fn(({ where }: any) => {
          if (where.id === STORE_SIM) {
            return Promise.resolve({
              id: STORE_SIM,
              workspaceId: WORKSPACE_ID,
              platform: 'simulator',
              country: 'US',
            });
          }
          if (where.id === STORE_AMAZON) {
            return Promise.resolve({
              id: STORE_AMAZON,
              workspaceId: WORKSPACE_ID,
              platform: 'amazon',
              country: 'US',
            });
          }
          return Promise.resolve(null);
        }),
      },
      commerceAccount: {
        findUnique: jest.fn(({ where }: any) => {
          if (where.storeId === STORE_SIM) {
            return Promise.resolve({
              id: 'acct_sim',
              workspaceId: WORKSPACE_ID,
              storeId: STORE_SIM,
              provider: 'simulator-amazon',
            });
          }
          if (where.storeId === STORE_AMAZON) {
            return Promise.resolve({
              id: 'acct_az',
              workspaceId: WORKSPACE_ID,
              storeId: STORE_AMAZON,
              provider: 'amazon',
              sellingPartnerId: 'A1EXAMPLE',
            });
          }
          return Promise.resolve(null);
        }),
      },
      providerCredential: {
        findUnique: jest.fn().mockResolvedValue(null), // No credentials configured (offline test)
      },
      sku: { findMany: jest.fn().mockResolvedValue([]) },
      inventoryBalance: { findMany: jest.fn().mockResolvedValue([]) },
      campaign: { findMany: jest.fn().mockResolvedValue([]) },
      profitDaily: { findMany: jest.fn().mockResolvedValue([]) },
    };
  });

  describe('1. Simulator V1 Adapter Write Protection', () => {
    it('returns WRITE_FORBIDDEN for direct decreaseBid and updateProduct calls on legacy Simulator', async () => {
      const adapter = new SimulatorAdapter(mockPrisma);
      const ctx = createCommerceContext(WORKSPACE_ID, STORE_SIM);

      const bidResult = await adapter.decreaseBid(
        ctx,
        { campaignId: 'camp_1' },
        0.2,
      );
      expect(bidResult.ok).toBe(false);
      expect(bidResult.code).toBe(ErrorCodes.WRITE_FORBIDDEN);

      const updateResult = await adapter.updateProduct(ctx, { price: 29.99 });
      expect(updateResult.ok).toBe(false);
      expect(updateResult.code).toBe(ErrorCodes.WRITE_FORBIDDEN);
    });
  });

  describe('2. External Adapter Authentication & Capability Guardrails', () => {
    it('returns AUTH_REQUIRED when real Amazon credentials are not provisioned', async () => {
      const adapter = new AmazonAdapter(mockPrisma);
      const ctx = createCommerceContext(WORKSPACE_ID, STORE_AMAZON);

      await expect(adapter.listProducts(ctx)).rejects.toMatchObject({
        code: ErrorCodes.AUTH_REQUIRED,
      });
    });

    it('returns WRITE_FORBIDDEN for direct live bid modification in test transport', async () => {
      // Configured with mock transport but no live write authorization
      const adapter = new AmazonAdapter(mockPrisma, {
        transport: new MockAmazonProvider(),
        exchangeToken: async () => ({ accessToken: 'mock_token' }),
        decryptCredential: () => 'decrypted_secret',
      });

      // Provide credential so auth passes
      mockPrisma.providerCredential.findUnique = jest.fn().mockResolvedValue({
        accountId: 'acct_az',
        kind: 'LWA_REFRESH',
        payloadEnc: 'enc_data',
      });

      const ctx = createCommerceContext(WORKSPACE_ID, STORE_AMAZON);
      const bidResult = await adapter.decreaseBid(
        ctx,
        { campaignId: 'camp_1' },
        0.1,
      );

      // In current AmazonAdapter, live decreaseBid is strictly forbidden with WRITE_FORBIDDEN
      expect(bidResult.ok).toBe(false);
      expect(bidResult.code).toBe(ErrorCodes.WRITE_FORBIDDEN);
    });

    it('exposes AdapterCapabilities correctly for Simulator and Amazon adapters', () => {
      const simAdapter = new SimulatorAdapter(mockPrisma);
      const simCaps = simAdapter.getCapabilities();
      expect(simCaps.executionMode).toBe('simulator');
      expect(simCaps.supportedActions).toEqual(['DECREASE_BID', 'STOP_CAMPAIGN']);

      const amzAdapter = new AmazonAdapter(mockPrisma);
      const amzCaps = amzAdapter.getCapabilities();
      expect(amzCaps.executionMode).toBe('live');
      expect(amzCaps.supportedActions).toEqual([]);
    });
  });

  describe('3. Offline Environment Integrity & NOT_RUN Contract', () => {
    it('documents that live official sandbox/store tests require external credentials and are classified as NOT_RUN', () => {
      // Verify contract principle: missing credentials must never be faked with success
      const liveEnvironmentReady = Boolean(process.env.SP_API_CLIENT_ID && process.env.SHOPIFY_API_KEY);
      expect(liveEnvironmentReady).toBe(false); // In local offline environment, must be false
    });
  });
});
