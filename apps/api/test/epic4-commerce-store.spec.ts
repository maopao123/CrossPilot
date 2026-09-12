import { ErrorCodes } from '@crosspilot/shared';
import { assertAmazonReadOnly, isAmazonReadAllowed, STORE_CAPABILITIES } from '@crosspilot/integrations';
import {
  assertAmazonCredentialKeyForEnvironment,
  decryptSecret,
  encryptSecret,
  signOAuthState,
  verifyOAuthState,
} from '../src/modules/commerce-store/credential-crypto';
import { CommerceStoreService } from '../src/modules/commerce-store/commerce-store.service';
import { StoreSku360DataSource } from '../src/modules/commerce-store/store-sku360-data-source';

describe('Epic 4 production encryption key', () => {
  it('fails closed in production without AMAZON_CREDENTIAL_ENCRYPTION_KEY', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevKey = process.env.AMAZON_CREDENTIAL_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    delete process.env.AMAZON_CREDENTIAL_ENCRYPTION_KEY;
    try {
      expect(() => assertAmazonCredentialKeyForEnvironment()).toThrow(/AMAZON_CREDENTIAL_ENCRYPTION_KEY/);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevKey === undefined) delete process.env.AMAZON_CREDENTIAL_ENCRYPTION_KEY;
      else process.env.AMAZON_CREDENTIAL_ENCRYPTION_KEY = prevKey;
    }
  });
});

describe('Epic 4 credential crypto', () => {
  it('round-trips secrets and never returns plaintext equality accidentally', () => {
    const enc = encryptSecret('Atzr|refresh-token-value');
    expect(enc).not.toContain('Atzr');
    expect(decryptSecret(enc)).toBe('Atzr|refresh-token-value');
  });

  it('signs and verifies oauth state', () => {
    const state = signOAuthState({ workspaceId: 'ws-1', userId: 'u-1' });
    expect(verifyOAuthState(state).workspaceId).toBe('ws-1');
    expect(() => verifyOAuthState(state + 'x')).toThrow();
  });
});

describe('Epic 4 read-only allowlist', () => {
  it('allows documented GET operations only', () => {
    expect(isAmazonReadAllowed('GET', '/orders/2026-01-01/orders')).toBe(true);
    expect(isAmazonReadAllowed('PUT', '/listings/2021-08-01/items/A/SKU')).toBe(false);
    expect(() => assertAmazonReadOnly('DELETE', '/fba/inventory/v1/summaries')).toThrow();
  });
});

describe('Epic 4 commerce store service', () => {
  it('lists empty accounts without Amazon env', async () => {
    const prisma: any = {
      commerceAccount: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new CommerceStoreService(prisma);
    const result = await svc.listAccounts('ws-1');
    expect(result.accounts).toEqual([]);
    expect(result.amazonConfigured).toBe(Boolean(process.env.AMAZON_LWA_CLIENT_ID));
  });

  it('blocks VIEWER from sync', async () => {
    const svc = new CommerceStoreService({} as any);
    await expect(svc.sync('ws-1', 'VIEWER', { useMock: true })).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.AUTH_FORBIDDEN }),
    });
  });

  it('rejects sync without Amazon credential and without explicit mock', async () => {
    const prisma: any = {
      commerceAccount: {
        upsert: jest.fn().mockResolvedValue({ id: 'acc-1' }),
      },
      providerCredential: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = new CommerceStoreService(prisma);
    await expect(svc.sync('ws-1', 'OWNER', {})).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.AUTH_REQUIRED }),
    });
  });

  it('rejects explicit mock sync in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const prisma: any = {
      commerceAccount: { upsert: jest.fn().mockResolvedValue({ id: 'acc-1' }) },
      providerCredential: { findUnique: jest.fn().mockResolvedValue({ payloadEnc: 'x' }) },
    };
    const svc = new CommerceStoreService(prisma);
    try {
      await expect(svc.sync('ws-1', 'OWNER', { useMock: true })).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.WRITE_FORBIDDEN }),
      });
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('mock sync writes listings and inventory through prisma', async () => {
    const sku = { id: 'sku-1', skuCode: 'MTH-WHITE-001', sellingPrice: 29.99 };
    const prisma: any = {
      commerceAccount: {
        upsert: jest.fn().mockResolvedValue({ id: 'acc-1', sellingPartnerId: null, region: 'NA' }),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'acc-1', region: 'NA' }),
      },
      providerCredential: { findUnique: jest.fn().mockResolvedValue(null) },
      syncRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn(),
      },
      marketplace: { findUnique: jest.fn().mockResolvedValue({ id: 'mkt-us' }) },
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'p-1' }),
      },
      sku: {
        upsert: jest.fn().mockResolvedValue(sku),
        findUnique: jest.fn().mockResolvedValue(sku),
        findFirst: jest.fn().mockResolvedValue(sku),
      },
      order: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      inventoryBalance: { upsert: jest.fn() },
    };
    const svc = new CommerceStoreService(prisma);
    const result = await svc.sync('ws-1', 'OWNER', {
      capability: STORE_CAPABILITIES.listingsSearch,
      useMock: true,
    });
    expect(result.useMock).toBe(true);
    expect(result.runs[0].status).toBe('COMPLETED');
    expect(prisma.sku.upsert).toHaveBeenCalled();
  });

  it('does not match inventory SKUs with empty ASIN', async () => {
    const sku = { id: 'sku-1', skuCode: 'MTH-WHITE-001', sellingPrice: 29.99 };
    const prisma: any = {
      commerceAccount: {
        upsert: jest.fn().mockResolvedValue({ id: 'acc-1', sellingPartnerId: 'A1', region: 'NA' }),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'acc-1', region: 'NA' }),
      },
      providerCredential: { findUnique: jest.fn().mockResolvedValue(null) },
      syncRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn(),
      },
      sku: { findFirst: jest.fn().mockResolvedValue(sku) },
      inventoryBalance: { upsert: jest.fn() },
    };
    const svc = new CommerceStoreService(prisma);
    await svc.sync('ws-1', 'OWNER', {
      capability: STORE_CAPABILITIES.inventorySummaries,
      useMock: true,
    });
    const where = prisma.sku.findFirst.mock.calls[0][0].where;
    const asinClause = (where.OR || []).find((c: any) => Object.prototype.hasOwnProperty.call(c, 'asin'));
    if (asinClause) expect(asinClause.asin).not.toBe('');
  });
});

describe('Epic 4 store sku360 source', () => {
  it('returns UNAVAILABLE advertising because Ads is out of scope', async () => {
    const ds = new StoreSku360DataSource({});
    const ads = await ds.getAdvertising({
      workspaceId: 'ws',
      skuId: 'sku',
      currentPeriod: { from: '2026-01-01', to: '2026-01-07' },
    });
    expect(ads.availability).toBe('UNAVAILABLE');
  });
});
