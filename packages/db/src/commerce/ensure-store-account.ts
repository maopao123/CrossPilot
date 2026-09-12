import { PrismaClient } from '@prisma/client';

export type CommercePlatform = 'amazon' | 'shopify' | 'simulator';

export function platformFromProvider(provider: string): CommercePlatform {
  if (provider.startsWith('simulator')) return 'simulator';
  if (provider === 'shopify') return 'shopify';
  return 'amazon';
}

export function storeLabelForProvider(
  provider: string,
  region?: string,
): { name: string; country: string } {
  if (provider === 'simulator-amazon') return { name: 'Simulator Amazon', country: 'US' };
  if (provider === 'simulator-shopify') return { name: 'Simulator Shopify', country: 'US' };
  if (provider === 'shopify') return { name: 'Shopify Store', country: 'US' };
  if (region === 'EU') return { name: 'Amazon EU', country: 'DE' };
  if (region === 'FE') return { name: 'Amazon FE', country: 'JP' };
  return { name: 'Amazon US', country: 'US' };
}

export interface EnsureStoreAccountInput {
  workspaceId: string;
  provider: string;
  region?: string;
  status?: string;
  sellingPartnerId?: string;
  defaultMarketplaceCode?: string;
}

/**
 * One Store per CommerceAccount. Simulator amazon/shopify stay two stores.
 * Replaces upserts that used unique (workspaceId, provider).
 */
export async function ensureStoreBoundAccount(
  prisma: PrismaClient | any,
  input: EnsureStoreAccountInput,
): Promise<{ storeId: string; accountId: string; platform: CommercePlatform }> {
  const platform = platformFromProvider(input.provider);
  const label = storeLabelForProvider(input.provider, input.region);
  const region = input.region || 'NA';

  const existing = await prisma.commerceAccount.findFirst({
    where: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      ...(input.provider === 'amazon' ? { region } : {}),
    },
  });

  if (existing?.storeId) {
    const data: Record<string, unknown> = {};
    if (input.status && input.status !== existing.status) data.status = input.status;
    if (input.sellingPartnerId) data.sellingPartnerId = input.sellingPartnerId;
    if (input.defaultMarketplaceCode) data.defaultMarketplaceCode = input.defaultMarketplaceCode;
    if (Object.keys(data).length > 0) {
      await prisma.commerceAccount.update({
        where: { id: existing.id },
        data,
      });
    }
    return { storeId: existing.storeId, accountId: existing.id, platform };
  }

  if (existing && !existing.storeId) {
    const store = await prisma.store.create({
      data: {
        workspaceId: input.workspaceId,
        name: label.name,
        platform,
        country: label.country,
        status: 'ACTIVE',
      },
    });
    await prisma.commerceAccount.update({
      where: { id: existing.id },
      data: { storeId: store.id },
    });
    return { storeId: store.id, accountId: existing.id, platform };
  }

  const store = await prisma.store.create({
    data: {
      workspaceId: input.workspaceId,
      name: label.name,
      platform,
      country: label.country,
      status: 'ACTIVE',
    },
  });
  const account = await prisma.commerceAccount.create({
    data: {
      workspaceId: input.workspaceId,
      storeId: store.id,
      provider: input.provider,
      region,
      status: input.status || 'CONNECTED',
      sellingPartnerId: input.sellingPartnerId,
      defaultMarketplaceCode: input.defaultMarketplaceCode,
    },
  });
  return { storeId: store.id, accountId: account.id, platform };
}
