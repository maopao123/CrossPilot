import { PrismaClient } from '@prisma/client';
import { providerUnavailable, type CommerceAdapter } from '@crosspilot/domain';
import { SimulatorAdapter } from './simulator-adapter.js';

/**
 * Epic 2 registers Simulator only. Amazon/Shopify adapters are Epic 3/4.
 */
export function resolveCommerceAdapter(
  prisma: PrismaClient | any,
  platform: string,
): CommerceAdapter {
  if (platform === 'simulator') {
    return new SimulatorAdapter(prisma);
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
