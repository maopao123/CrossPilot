import {
  ensureStoreBoundAccount,
  platformFromProvider,
  storeLabelForProvider,
} from '@crosspilot/db';
import { ErrorCodes } from '@crosspilot/shared';

function memoryPrisma() {
  const stores: any[] = [];
  const accounts: any[] = [];
  return {
    stores,
    accounts,
    store: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `store_${stores.length + 1}`, ...data };
        stores.push(row);
        return row;
      }),
    },
    commerceAccount: {
      findFirst: jest.fn(async ({ where }: any) => {
        return (
          accounts.find((row) => {
            if (where.workspaceId && row.workspaceId !== where.workspaceId) return false;
            if (where.provider && row.provider !== where.provider) return false;
            if (where.region && row.region !== where.region) return false;
            return true;
          }) || null
        );
      }),
      create: jest.fn(async ({ data }: any) => {
        if (accounts.some((row) => row.storeId === data.storeId)) {
          throw new Error('unique storeId');
        }
        const row = { id: `acct_${accounts.length + 1}`, ...data };
        accounts.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = accounts.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
  };
}

describe('V10 Epic 1 store foundation', () => {
  it('maps simulator providers to distinct simulator platform labels', () => {
    expect(platformFromProvider('simulator-amazon')).toBe('simulator');
    expect(platformFromProvider('simulator-shopify')).toBe('simulator');
    expect(storeLabelForProvider('simulator-amazon').name).toBe('Simulator Amazon');
    expect(storeLabelForProvider('simulator-shopify').name).toBe('Simulator Shopify');
    expect(storeLabelForProvider('amazon', 'NA').name).toBe('Amazon US');
    expect(storeLabelForProvider('amazon', 'EU').name).toBe('Amazon EU');
  });

  it('keeps simulator-amazon and simulator-shopify as two stores', async () => {
    const prisma = memoryPrisma();
    const amazon = await ensureStoreBoundAccount(prisma as any, {
      workspaceId: 'ws-1',
      provider: 'simulator-amazon',
    });
    const shopify = await ensureStoreBoundAccount(prisma as any, {
      workspaceId: 'ws-1',
      provider: 'simulator-shopify',
    });
    expect(amazon.storeId).not.toBe(shopify.storeId);
    expect(prisma.stores).toHaveLength(2);
    expect(prisma.stores.map((s) => s.name).sort()).toEqual(['Simulator Amazon', 'Simulator Shopify']);
  });

  it('allows Amazon US, Amazon EU, Shopify A and Shopify B in one workspace', async () => {
    const prisma = memoryPrisma();
    const us = await ensureStoreBoundAccount(prisma as any, {
      workspaceId: 'ws-1',
      provider: 'amazon',
      region: 'NA',
    });
    const eu = await ensureStoreBoundAccount(prisma as any, {
      workspaceId: 'ws-1',
      provider: 'amazon',
      region: 'EU',
    });
    const shopA = await ensureStoreBoundAccount(prisma as any, {
      workspaceId: 'ws-1',
      provider: 'shopify',
    });
    // second shopify: helper finds first shopify without region discriminator.
    // create explicitly to prove unique is storeId, not workspace+provider
    const storeB = await prisma.store.create({
      data: { workspaceId: 'ws-1', name: 'Shopify Store B', platform: 'shopify', country: 'GB', status: 'ACTIVE' },
    });
    const shopB = await prisma.commerceAccount.create({
      data: {
        workspaceId: 'ws-1',
        storeId: storeB.id,
        provider: 'shopify',
        region: 'EU',
        status: 'CONNECTED',
      },
    });
    expect(new Set([us.storeId, eu.storeId, shopA.storeId, shopB.storeId]).size).toBe(4);
    expect(prisma.accounts.filter((a) => a.provider === 'amazon')).toHaveLength(2);
    expect(prisma.accounts.filter((a) => a.provider === 'shopify')).toHaveLength(2);
  });

  it('does not add amazonId or shopifyId onto Store', () => {
    const prisma = memoryPrisma();
    return ensureStoreBoundAccount(prisma as any, { workspaceId: 'ws-1', provider: 'amazon' }).then(() => {
      expect(prisma.stores[0].amazonId).toBeUndefined();
      expect(prisma.stores[0].shopifyId).toBeUndefined();
      expect(prisma.stores[0].platform).toBe('amazon');
    });
  });
});

describe('V10 Epic 1 does not disturb V9.3 action codes', () => {
  it('keeps action invalid-state code stable', () => {
    expect(ErrorCodes.ACTION_INVALID_STATE).toBe('ACTION_INVALID_STATE');
    expect(ErrorCodes.RECOMMENDATION_INVALID_STATE).toBe('RECOMMENDATION_INVALID_STATE');
  });
});
