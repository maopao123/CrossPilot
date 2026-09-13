import { PrismaClient } from '../packages/db/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const wsId = '0e02ccf2-0202-4fa5-a385-3b293e581bf0';
  const mktId = '6f8ead53-c17e-443e-96db-622cc3aef2ec';
  const sku = await prisma.sku.findFirst({ where: { skuCode: 'FILE-BOX-001', workspaceId: wsId } });
  if (!sku) return;

  let listing = await prisma.listing.findFirst({ where: { skuId: sku.id } });
  if (!listing) {
    listing = await prisma.listing.create({
      data: {
        workspaceId: wsId,
        skuId: sku.id,
        marketplaceId: mktId,
        status: 'DRAFT',
      },
    });
    console.log('✅ Listing created for FILE-BOX-001:', listing.id);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());