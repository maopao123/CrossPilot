import { PrismaClient } from '@prisma/client';
import { providerUnavailable, type CommerceAdapter } from '@crosspilot/domain';
import { SimulatorAdapter } from './simulator-adapter.js';
import { AmazonAdapter } from './amazon-adapter.js';
import { ShopifyAdapter } from './shopify-adapter.js';

/**
 * Epic 2 registered Simulator; Epic 3 adds Amazon read adapter.
 * Epic 4 registers Shopify read adapter.
 */
export function resolveCommerceAdapter(
  prisma: PrismaClient | any,
  platform: string,
): CommerceAdapter {
  if (platform === 'simulator') {
    return new SimulatorAdapter(prisma);
  }
  if (platform === 'amazon') {
    return new AmazonAdapter(prisma);
  }
  if (platform === 'shopify') {
    return new ShopifyAdapter(prisma);
  }
  providerUnavailable(platform);
}

export async function resolveCommerceAdapterForStore(
  prisma: PrismaClient | any,
  storeId: string,
): Promise<CommerceAdapter> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) {
    providerUnavailable('unknown');
  }
  return resolveCommerceAdapter(prisma, store.platform);
}
