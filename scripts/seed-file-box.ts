import { PrismaClient } from '../packages/db/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const wsId = '0e02ccf2-0202-4fa5-a385-3b293e581bf0';
  const mktId = '6f8ead53-c17e-443e-96db-622cc3aef2ec';

  let product = await prisma.product.findFirst({
    where: { workspaceId: wsId, name: 'Decorative Linen File Storage Box' },
  });

  if (!product) {
    product = await prisma.product.create({
      data: {
        workspaceId: wsId,
        marketplaceId: mktId,
        name: 'Decorative Linen File Storage Box',
        brand: 'HOMEFORTE',
        category: 'Office Products',
        subCategory: 'Office Storage Supplies',
        targetPrice: 28.99,
        description: 'Collapsible decorative linen file organizer storage box with lid and smooth metal handles.',
        productBrief: 'Product: Decorative Linen File Storage Box with Lid\nTarget Market: Amazon US (Office Products / Office Storage)\nCore Value: Heavy-duty collapsible linen document organizer with built-in metal slide rails for Letter & Legal hanging file folders.\nDimensions: 15.0 x 12.2 x 10.8 inches.\nCapacity: Supports up to 35 lbs stacking weight with reinforced MDF bottom and solid lid.',
        features: {
          create: [
            { name: 'Material', value: 'Premium Linen Fabric & High-Density MDF', isCore: true, workspaceId: wsId },
            { name: 'Weight Capacity', value: '35 lbs (Heavy Duty Base)', unit: 'lbs', isCore: true, workspaceId: wsId },
            { name: 'Folder Compatibility', value: 'Letter & Legal Size Dual Compatible', isCore: true, workspaceId: wsId },
            { name: 'Dimensions', value: '15.0 x 12.2 x 10.8 inches', unit: 'in', isCore: true, workspaceId: wsId },
            { name: 'Structure', value: 'Collapsible with Removable Solid Lid & Metal Handles', isCore: true, workspaceId: wsId },
          ],
        },
      },
    });
    console.log('✅ Product created: ' + product.name + ' (' + product.id + ')');
  }

  const fileBoxSku = await prisma.sku.upsert({
    where: { workspaceId_skuCode: { workspaceId: wsId, skuCode: 'FILE-BOX-001' } },
    update: {},
    create: {
      workspaceId: wsId,
      productId: product.id,
      skuCode: 'FILE-BOX-001',
      asin: 'B0DFILEBOX1',
      variantName: 'Heather Grey Linen',
      color: 'Grey',
      material: 'Linen & MDF',
      sellingPrice: 28.99,
      weightKg: 1.25,
      currencyCode: 'USD',
    },
  });

  console.log('✅ File box SKU ready: FILE-BOX-001 (' + fileBoxSku.id + ')');
}

main().catch(console.error).finally(() => prisma.$disconnect());