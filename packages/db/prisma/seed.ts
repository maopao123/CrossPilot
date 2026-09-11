import { PrismaClient, UserStatus, WorkspaceRole } from '@prisma/client';
import { ScenarioGeneratorService } from '@crosspilot/domain';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting CrossPilot Full Demo Baseline Seed...');

  // 1. Marketplace: AMAZON_US
  const marketplace = await prisma.marketplace.upsert({
    where: { code: 'AMAZON_US' },
    update: {},
    create: {
      code: 'AMAZON_US',
      name: 'Amazon US',
      countryCode: 'US',
      currencyCode: 'USD',
      languageCode: 'en-US',
      timezone: 'America/Los_Angeles',
      isActive: true,
    },
  });
  console.log(`✅ Marketplace ready: ${marketplace.name} (${marketplace.code})`);

  // 2. Demo User
  const passwordHash = await bcrypt.hash('crosspilot123', 10);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@crosspilot.com' },
    update: {},
    create: {
      email: 'demo@crosspilot.com',
      name: 'CrossPilot Demo User',
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });
  console.log(`✅ Demo user ready: ${demoUser.email} (${demoUser.id})`);

  // 3. Demo Workspace
  const demoWorkspace = await prisma.workspace.upsert({
    where: { slug: 'crosspilot-demo' },
    update: {
      defaultMarketplaceId: marketplace.id,
    },
    create: {
      name: 'CrossPilot Demo',
      slug: 'crosspilot-demo',
      defaultMarketplaceId: marketplace.id,
    },
  });
  console.log(`✅ Demo workspace ready: ${demoWorkspace.name} (${demoWorkspace.id})`);
  const wsId = demoWorkspace.id;

  // 4. Workspace Membership
  const membership = await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: demoWorkspace.id,
        userId: demoUser.id,
      },
    },
    update: {
      role: WorkspaceRole.OWNER,
    },
    create: {
      workspaceId: demoWorkspace.id,
      userId: demoUser.id,
      role: WorkspaceRole.OWNER,
    },
  });
  console.log(`✅ Workspace membership ready: ${membership.role}`);

  // 5. Product & SKUs
  let product = await prisma.product.findFirst({
    where: { workspaceId: wsId, name: 'Natural Marble Toothbrush Holder' },
  });

  if (!product) {
    product = await prisma.product.create({
      data: {
        workspaceId: wsId,
        marketplaceId: marketplace.id,
        name: 'Natural Marble Toothbrush Holder',
        brand: 'POLEGAS',
        category: 'Home & Kitchen',
        subCategory: 'Bathroom Accessories',
        targetPrice: 29.99,
        description: 'Luxury handcrafted natural marble toothbrush holder with heavy non-slip base.',
        productBrief: `Product: Natural Marble Toothbrush Holder
Target Market: Amazon US (Home & Kitchen / Bathroom Accessories)
Core Value Proposition: Heavy non-slip real marble base (3.57 lbs) that never tips over.
Slot Spec: 1 large slot for toothpaste (2.1 x 1.4 in) + 3 slots for toothbrushes (1.5 in diameter).
Verified Materials: 100% natural polished stone, non-porous resin sealant bottom, EVA anti-scratch pads.
Key Improvements from VOC: Enlarged hole diameter to 1.5 inches to guarantee compatibility with Oral-B and Philips Sonicare handles. Added internal drainage slope.`,
        features: {
          create: [
            { name: 'Material', value: '100% Natural Marble', isCore: true, workspaceId: wsId },
            { name: 'Weight', value: '3.57 lbs (Heavy Base)', unit: 'lbs', isCore: true, workspaceId: wsId },
            { name: 'Slot Configuration', value: '1 Large + 3 Small Slots', isCore: true, workspaceId: wsId },
            { name: 'Hole Diameter', value: '1.5 inches', unit: 'in', isCore: true, workspaceId: wsId },
            { name: 'Bottom Finish', value: 'Anti-slip EVA Soft Pads', isCore: true, workspaceId: wsId },
          ],
        },
      },
    });
    console.log(`✅ Product created: ${product.name} (${product.id})`);
  }

  // 3 SKUs
  const whiteSku = await prisma.sku.upsert({
    where: { workspaceId_skuCode: { workspaceId: wsId, skuCode: 'MTH-WHITE-001' } },
    update: {},
    create: {
      workspaceId: wsId,
      productId: product.id,
      skuCode: 'MTH-WHITE-001',
      asin: 'B0C7M8W101',
      variantName: 'Carrara White',
      color: 'White',
      material: 'Natural Marble',
      sellingPrice: 29.99,
      weightKg: 1.62,
      currencyCode: 'USD',
    },
  });

  const greenSku = await prisma.sku.upsert({
    where: { workspaceId_skuCode: { workspaceId: wsId, skuCode: 'MTH-GREEN-001' } },
    update: {},
    create: {
      workspaceId: wsId,
      productId: product.id,
      skuCode: 'MTH-GREEN-001',
      asin: 'B0C7M8G202',
      variantName: 'Emerald Green',
      color: 'Green',
      material: 'Natural Marble',
      sellingPrice: 32.99,
      weightKg: 1.65,
      currencyCode: 'USD',
    },
  });

  const greySku = await prisma.sku.upsert({
    where: { workspaceId_skuCode: { workspaceId: wsId, skuCode: 'MTH-GREY-001' } },
    update: {},
    create: {
      workspaceId: wsId,
      productId: product.id,
      skuCode: 'MTH-GREY-001',
      asin: 'B0C7M8B303',
      variantName: 'Beige Grey',
      color: 'Grey',
      material: 'Natural Marble',
      sellingPrice: 28.99,
      weightKg: 1.58,
      currencyCode: 'USD',
    },
  });
  console.log(`✅ 3 SKUs ready: Carrara White, Emerald Green, Beige Grey`);

  // 6. Supplier & Quotes
  let supplier = await prisma.supplier.findFirst({
    where: { workspaceId: wsId, name: 'Fujian Stonework Crafts Co., Ltd.' },
  });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        workspaceId: wsId,
        name: 'Fujian Stonework Crafts Co., Ltd.',
        contactPerson: 'Mr. Lin',
        email: 'sales@stonework-crafts.cn',
        leadTimeDays: 15,
        status: 'ACTIVE',
        quotes: {
          create: [
            { workspaceId: wsId, skuId: whiteSku.id, unitCost: 6.50, moq: 200 },
            { workspaceId: wsId, skuId: greenSku.id, unitCost: 7.20, moq: 200 },
            { workspaceId: wsId, skuId: greySku.id, unitCost: 6.20, moq: 200 },
          ],
        },
      },
    });
    console.log(`✅ Supplier & quotes created: ${supplier.name}`);
  }

  // 7. Inventory Balances
  for (const item of [
    { skuId: whiteSku.id, fulfillableQuantity: 420, reservedQuantity: 30, inboundQuantity: 0 },
    { skuId: greenSku.id, fulfillableQuantity: 120, reservedQuantity: 40, inboundQuantity: 500 },
    { skuId: greySku.id, fulfillableQuantity: 210, reservedQuantity: 15, inboundQuantity: 0 },
  ]) {
    await prisma.inventoryBalance.upsert({
      where: {
        workspaceId_skuId_warehouseType: {
          workspaceId: wsId,
          skuId: item.skuId,
          warehouseType: 'FBA',
        },
      },
      update: item,
      create: {
        workspaceId: wsId,
        warehouseType: 'FBA',
        ...item,
      },
    });
  }
  console.log(`✅ Inventory balances upserted for 3 SKUs`);

  // 8. 90-Day Financial & Inventory Snapshots
  const existingProfitCount = await prisma.profitDaily.count({ where: { workspaceId: wsId } });
  if (existingProfitCount === 0) {
    const scenario = ScenarioGeneratorService.generate90Days();
    const skuMap: Record<string, string> = {
      'MTH-WHITE-001': whiteSku.id,
      'MTH-GREEN-001': greenSku.id,
      'MTH-GREY-001': greySku.id,
    };

    const profitData = scenario.skuMetrics.map((m) => ({
      workspaceId: wsId,
      skuId: skuMap[m.skuCode],
      date: new Date(m.date),
      revenue: m.revenue,
      cogs: m.cogs,
      adsCost: m.adsCost,
      amazonFees: m.amazonFees,
      fbaFee: m.fbaFee,
      returnLoss: m.returnLoss,
      otherCosts: m.otherCosts,
      netProfit: m.netProfit,
      margin: m.margin,
    }));
    await prisma.profitDaily.createMany({ data: profitData });

    const invSnapshots = scenario.skuMetrics.map((m) => ({
      workspaceId: wsId,
      skuId: skuMap[m.skuCode],
      snapshotDate: new Date(m.date),
      fulfillable: m.inventoryFulfillable,
      reserved: m.inventoryReserved,
      inbound: m.inventoryInbound,
      daysCover: m.daysCover,
    }));
    await prisma.inventorySnapshot.createMany({ data: invSnapshots });
    console.log(`✅ 90-day trajectory seeded: ${profitData.length} profit records, ${invSnapshots.length} inventory snapshots`);
  }

  // 9. Competitors
  const comp1 = await prisma.competitor.upsert({
    where: { workspaceId_asin: { workspaceId: wsId, asin: 'B08XYZ1234' } },
    update: {},
    create: {
      workspaceId: wsId,
      marketplaceId: marketplace.id,
      asin: 'B08XYZ1234',
      brand: 'LuxStone Home',
      title: 'LuxStone Heavy Natural Resin Toothbrush Caddy',
      category: 'Home & Kitchen',
      snapshots: {
        create: [
          { snapshotDate: new Date(), price: 27.99, rating: 4.3, reviewCount: 850, estimatedSales: 1100, estimatedRevenue: 30789, bsr: 4200 },
        ],
      },
    },
  });

  const comp2 = await prisma.competitor.upsert({
    where: { workspaceId_asin: { workspaceId: wsId, asin: 'B09ABC5678' } },
    update: {},
    create: {
      workspaceId: wsId,
      marketplaceId: marketplace.id,
      asin: 'B09ABC5678',
      brand: 'KES Home',
      title: 'KES Heavy Marble Base Toothbrush Stand SUS304',
      category: 'Home & Kitchen',
      snapshots: {
        create: [
          { snapshotDate: new Date(), price: 34.99, rating: 4.6, reviewCount: 1420, estimatedSales: 1650, estimatedRevenue: 57733, bsr: 2300 },
        ],
      },
    },
  });
  console.log(`✅ Competitors seeded: ${comp1.brand}, ${comp2.brand}`);

  console.log('🎉 Full database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
