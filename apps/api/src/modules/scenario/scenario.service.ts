import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ScenarioGeneratorService,
  CORE_BUSINESS_EVENTS,
  BusinessEvent,
  VarianceAttributionService,
} from '@crosspilot/domain';

@Injectable()
export class ScenarioService {
  private readonly logger = new Logger(ScenarioService.name);

  constructor(private readonly prisma: PrismaService) {}

  getTimeline(): BusinessEvent[] {
    return CORE_BUSINESS_EVENTS;
  }

  getDailyAggregates() {
    return ScenarioGeneratorService.generate90Days();
  }

  getWaterfallWeek11() {
    const scenario = ScenarioGeneratorService.generate90Days();
    const attribution = VarianceAttributionService.attributeVariance({
      previousProfit: scenario.waterfallWeek11.week10Profit,
      currentProfit: scenario.waterfallWeek11.week11Profit,
      advertisingImpact: scenario.waterfallWeek11.breakdown.advertising,
      returnsImpact: scenario.waterfallWeek11.breakdown.returns,
      inventoryImpact: scenario.waterfallWeek11.breakdown.inventory,
      priceImpact: scenario.waterfallWeek11.breakdown.price,
      otherImpact: scenario.waterfallWeek11.breakdown.other,
    });

    return {
      ...scenario.waterfallWeek11,
      attribution,
    };
  }

  /**
   * 1-Click Demo Reset: wipes and seeds the complete 90-day demo scenario in PostgreSQL
   */
  async resetDemo(workspaceSlug = 'crosspilot-demo') {
    this.logger.log(`Starting 1-Click Demo Reset for workspace: ${workspaceSlug}`);

    // Find or create workspace
    let workspace = await this.prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
    });

    const marketplace = await this.prisma.marketplace.upsert({
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

    if (!workspace) {
      workspace = await this.prisma.workspace.create({
        data: {
          name: 'CrossPilot Demo',
          slug: workspaceSlug,
          defaultMarketplaceId: marketplace.id,
        },
      });
    }

    const wsId = workspace.id;

    // Clean existing business entities for idempotency
    await this.prisma.$transaction([
      this.prisma.toolExecution.deleteMany({ where: { task: { workspaceId: wsId } } }),
      this.prisma.agentStep.deleteMany({ where: { task: { workspaceId: wsId } } }),
      this.prisma.approval.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.agentTask.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.analysisFinding.deleteMany({ where: { session: { workspaceId: wsId } } }),
      this.prisma.analysisWaterfall.deleteMany({ where: { session: { workspaceId: wsId } } }),
      this.prisma.analysisSession.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.listingComplianceEvidence.deleteMany({
        where: { complianceCheck: { listingVersion: { listing: { workspaceId: wsId } } } },
      }),
      this.prisma.listingComplianceCheck.deleteMany({
        where: { listingVersion: { listing: { workspaceId: wsId } } },
      }),
      this.prisma.listingVersion.deleteMany({ where: { listing: { workspaceId: wsId } } }),
      this.prisma.listing.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.vocTopicReview.deleteMany({ where: { topic: { analysisRun: { workspaceId: wsId } } } }),
      this.prisma.vocTopic.deleteMany({ where: { analysisRun: { workspaceId: wsId } } }),
      this.prisma.vocAnalysisRun.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.productOpportunity.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.competitorSnapshot.deleteMany({ where: { competitor: { workspaceId: wsId } } }),
      this.prisma.productCompetitor.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.competitor.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.marketMetricsSnapshot.deleteMany({ where: { project: { workspaceId: wsId } } }),
      this.prisma.marketResearchProject.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.searchTermMetricDaily.deleteMany({ where: { campaign: { workspaceId: wsId } } }),
      this.prisma.adMetricDaily.deleteMany({ where: { campaign: { workspaceId: wsId } } }),
      this.prisma.adTarget.deleteMany({ where: { campaign: { workspaceId: wsId } } }),
      this.prisma.campaignSku.deleteMany({ where: { campaign: { workspaceId: wsId } } }),
      this.prisma.campaign.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.returnRecord.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.orderItem.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.order.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.inventorySnapshot.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.inventoryRecommendation.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.inventoryBalance.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.profitDaily.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.purchaseOrderItem.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.purchaseOrder.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.supplierSkuQuote.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.supplier.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.review.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.productFeature.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.sku.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.product.deleteMany({ where: { workspaceId: wsId } }),
    ]);

    // 1. Create Product: POLEGAS Natural Marble Toothbrush Holder
    const product = await this.prisma.product.create({
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

    // 2. Create 3 SKUs
    const whiteSku = await this.prisma.sku.create({
      data: {
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

    const greenSku = await this.prisma.sku.create({
      data: {
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

    const greySku = await this.prisma.sku.create({
      data: {
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

    // 3. Create Supplier & Quotes
    const supplier = await this.prisma.supplier.create({
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

    // 4. Create Initial Inventory Balances
    await this.prisma.inventoryBalance.createMany({
      data: [
        { workspaceId: wsId, skuId: whiteSku.id, warehouseType: 'FBA', fulfillableQuantity: 420, reservedQuantity: 30, inboundQuantity: 0 },
        { workspaceId: wsId, skuId: greenSku.id, warehouseType: 'FBA', fulfillableQuantity: 120, reservedQuantity: 40, inboundQuantity: 500 }, // E04 low inventory
        { workspaceId: wsId, skuId: greySku.id, warehouseType: 'FBA', fulfillableQuantity: 210, reservedQuantity: 15, inboundQuantity: 0 },
      ],
    });

    // 5. Generate and Insert 90 Days Daily Scenario
    const scenario = ScenarioGeneratorService.generate90Days();
    const skuMap: Record<string, string> = {
      'MTH-WHITE-001': whiteSku.id,
      'MTH-GREEN-001': greenSku.id,
      'MTH-GREY-001': greySku.id,
    };

    // Insert ProfitDaily records
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
    await this.prisma.profitDaily.createMany({ data: profitData });

    // Insert Inventory Snapshots
    const invSnapshots = scenario.skuMetrics.map((m) => ({
      workspaceId: wsId,
      skuId: skuMap[m.skuCode],
      snapshotDate: new Date(m.date),
      fulfillable: m.inventoryFulfillable,
      reserved: m.inventoryReserved,
      inbound: m.inventoryInbound,
      daysCover: m.daysCover,
    }));
    await this.prisma.inventorySnapshot.createMany({ data: invSnapshots });

    // 6. Create Campaigns & Search Term Metrics
    const campaign = await this.prisma.campaign.create({
      data: {
        workspaceId: wsId,
        marketplaceId: marketplace.id,
        name: 'SP - Marble Toothbrush Holder - Auto & Exact',
        campaignType: 'SPONSORED_PRODUCTS',
        targetingType: 'AUTO',
        budget: 150.00,
        status: 'ENABLED',
        startDate: new Date(scenario.days[0].date),
        campaignSkus: {
          create: [
            { skuId: whiteSku.id },
            { skuId: greenSku.id },
            { skuId: greySku.id },
          ],
        },
        adTargets: {
          create: [
            { targetValue: 'marble toothbrush holder', matchType: 'EXACT', bid: 1.45 },
            { targetValue: 'heavy stone toothbrush stand', matchType: 'PHRASE', bid: 1.10 },
            { targetValue: 'bathroom organizer', matchType: 'BROAD', bid: 0.95 },
          ],
        },
      },
    });

    // Insert Ad Metrics Daily
    const adMetrics = scenario.days.map((d) => ({
      campaignId: campaign.id,
      skuId: whiteSku.id,
      metricDate: new Date(d.date),
      impressions: Math.round(d.totalOrders * 320),
      clicks: Math.round(d.totalOrders * 12),
      spend: d.totalAdsCost,
      orders: Math.round(d.totalOrders * 0.35),
      sales: Math.round(d.totalRevenue * 0.38),
    }));
    await this.prisma.adMetricDaily.createMany({ data: adMetrics });

    // Insert Search Term Metrics (highlighting 'bathroom organizer' high ACOS waste)
    await this.prisma.searchTermMetricDaily.createMany({
      data: [
        {
          campaignId: campaign.id,
          skuId: whiteSku.id,
          searchTerm: 'bathroom organizer',
          metricDate: new Date(scenario.days[70].date),
          impressions: 12500,
          clicks: 280,
          spend: 420.00,
          orders: 2,
          sales: 450.00,
          acos: 0.9333, // 93.3% ACOS
        },
        {
          campaignId: campaign.id,
          skuId: whiteSku.id,
          searchTerm: 'marble toothbrush holder',
          metricDate: new Date(scenario.days[70].date),
          impressions: 8400,
          clicks: 310,
          spend: 185.00,
          orders: 28,
          sales: 840.00,
          acos: 0.2202, // 22% healthy ACOS
        },
        {
          campaignId: campaign.id,
          skuId: greenSku.id,
          searchTerm: 'emerald bathroom decor',
          metricDate: new Date(scenario.days[70].date),
          impressions: 9200,
          clicks: 245,
          spend: 140.00,
          orders: 19,
          sales: 626.00,
          acos: 0.2236,
        },
      ],
    });

    // 7. Create Competitors & Snapshots
    const comp1 = await this.prisma.competitor.create({
      data: {
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

    const comp2 = await this.prisma.competitor.create({
      data: {
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

    await this.prisma.productCompetitor.createMany({
      data: [
        { workspaceId: wsId, productId: product.id, competitorId: comp1.id, isPrimary: true },
        { workspaceId: wsId, productId: product.id, competitorId: comp2.id, isPrimary: false },
      ],
    });

    // 8. Create VOC Analysis Run, Topics, and Evidence Reviews
    const vocRun = await this.prisma.vocAnalysisRun.create({
      data: {
        workspaceId: wsId,
        productId: product.id,
        status: 'COMPLETED',
        reviewCount: 180,
        modelName: 'gpt-4o',
        promptVersion: 'v2.1',
      },
    });

    const topicHole = await this.prisma.vocTopic.create({
      data: {
        analysisRunId: vocRun.id,
        topicName: 'Hole Size Narrow for Electric Handles',
        topicType: 'PAIN_POINT',
        sentiment: 'NEGATIVE',
        reviewCount: 56,
        percentage: 31.10,
        severityScore: 4.5,
        summary: '31% of negative reviews report that the standard slots are too tight to fit popular electric toothbrush models (Oral-B iO series and Philips Sonicare DiamondClean).',
      },
    });

    const topicWeight = await this.prisma.vocTopic.create({
      data: {
        analysisRunId: vocRun.id,
        topicName: 'Base Weight & Stability Praise',
        topicType: 'PRAISE',
        sentiment: 'POSITIVE',
        reviewCount: 76,
        percentage: 42.20,
        severityScore: 1.0,
        summary: 'Customers strongly praise the 3.57 lbs heavy marble base that does not slide or tip over when grabbing toothbrushes.',
      },
    });

    // Representative customer reviews
    const rev1 = await this.prisma.review.create({
      data: {
        workspaceId: wsId,
        skuId: greySku.id,
        rating: 2,
        title: 'Gorgeous stone but my Oral-B iO does not fit!',
        content: 'The marble is beautiful and heavy, but the slots are only about 1.1 inches. My Oral-B iO handle will not fit into the smaller holes. Had to return it.',
        reviewerName: 'Sarah M.',
        reviewDate: new Date(scenario.days[50].date),
        isVerified: true,
      },
    });

    const rev2 = await this.prisma.review.create({
      data: {
        workspaceId: wsId,
        skuId: whiteSku.id,
        rating: 5,
        title: 'Finally a toothbrush holder that never tips over!',
        content: 'Solid genuine marble! We have 2 toddlers who always knock things off the counter. This thing is 3.5 lbs of solid rock and stays put.',
        reviewerName: 'David K.',
        reviewDate: new Date(scenario.days[30].date),
        isVerified: true,
      },
    });

    await this.prisma.vocTopicReview.create({
      data: {
        topicId: topicHole.id,
        reviewId: rev1.id,
        relevanceScore: 0.95,
        evidenceText: 'the slots are only about 1.1 inches. My Oral-B iO handle will not fit into the smaller holes.',
      },
    });

    // 9. Create Product Opportunity Brief
    await this.prisma.productOpportunity.create({
      data: {
        workspaceId: wsId,
        productId: product.id,
        title: 'Next-Gen Marble Toothbrush Caddy with 1.5" Universal Slots',
        problemSummary: 'Existing market competitors have narrow holes (< 1.2") causing high return rates from electric toothbrush owners. Heavy base is highly desired.',
        targetCustomer: 'US Urban homeowners with modern bathrooms using electric toothbrushes.',
        recommendedPositioning: 'Premium natural stone bathroom decor with guaranteed universal compatibility.',
        opportunityScore: 8.8,
        confidenceLevel: 0.92,
        evidenceSummary: 'Derived from 180 verified Amazon reviews: 31% pain point on hole size, 42% praise on weight stability.',
        status: 'APPROVED',
      },
    });

    // 10. Create Listing and 2 Versions
    const listing = await this.prisma.listing.create({
      data: {
        workspaceId: wsId,
        skuId: whiteSku.id,
        marketplaceId: marketplace.id,
        status: 'APPROVED',
      },
    });

    const v1 = await this.prisma.listingVersion.create({
      data: {
        listingId: listing.id,
        versionNumber: 1,
        title: 'POLEGAS Natural Marble Toothbrush Holder - Heavy Stone Base for Bathroom',
        bulletPointsJson: JSON.stringify([
          'GENUINE NATURAL MARBLE: 100% natural polished stone with unique natural veining.',
          'HEAVY BASE: 3.57 lbs solid base with non-slip bottom prevents tipping.',
          '4 COMPARTMENTS: Holds toothpaste and multiple toothbrushes conveniently.',
          'MODERN LUXURY: Elevates any master or guest bathroom countertop.',
          'EASY TO CLEAN: Non-porous sealed finish wipes clean with a damp cloth.',
        ]),
        description: 'Upgrade your bathroom with authentic marble craftsmanship.',
        searchTerms: 'marble toothbrush holder heavy stone bathroom organizer vanity caddy',
        generationSource: 'AI_ASSISTED',
      },
    });

    const v2 = await this.prisma.listingVersion.create({
      data: {
        listingId: listing.id,
        versionNumber: 2,
        title: 'POLEGAS Natural Marble Toothbrush Holder - 1.5" Wide Slots Fits Electric & Manual Handles (3.57 lbs)',
        bulletPointsJson: JSON.stringify([
          '100% AUTHENTIC NATURAL MARBLE: Handcrafted from solid natural stone, weighing 3.57 lbs.',
          '1.5-INCH UNIVERSAL SLOTS: Specially engineered wide compartments fit Oral-B, Philips Sonicare, and standard manual toothbrushes.',
          'HEAVY NON-SLIP STABILITY: Never tips or slides on wet quartz or tile countertops thanks to soft protective EVA pads.',
          'HYGIENIC DRAINAGE GROOVES: Sloped interior base prevents stagnant water accumulation.',
          'EASY CLEANING & CARE: Sealed against water stains. Hand wash with mild soap.',
        ]),
        description: 'Engineered based on verified customer feedback: luxury marble with guaranteed electric handle fit.',
        searchTerms: 'marble toothbrush holder electric toothbrush stand sonicare oral-b heavy stone caddy',
        generationSource: 'AI_GROUNDED_VOC',
      },
    });

    await this.prisma.listing.update({
      where: { id: listing.id },
      data: { currentVersionId: v2.id },
    });

    // Compliance Check on V2
    await this.prisma.listingComplianceCheck.create({
      data: {
        listingVersionId: v2.id,
        status: 'PASS',
        riskLevel: 'LOW',
        ruleHitsJson: JSON.stringify([]),
        evidenceSummary: 'Passes Amazon Detail Page Guidelines and FTC Stone Disclosure requirements.',
        modelName: 'gpt-4o',
      },
    });

    // 11. Create AI Business Analyst Session & Waterfall Attribution
    const demoUser = await this.prisma.user.findUnique({
      where: { email: 'demo@crosspilot.com' },
    });

    if (demoUser) {
      const session = await this.prisma.analysisSession.create({
        data: {
          workspaceId: wsId,
          userId: demoUser.id,
          activeSkuId: greenSku.id,
          question: 'Why did net profit drop in Week 11 compared to Week 10?',
          status: 'COMPLETED',
        },
      });

      await this.prisma.analysisWaterfall.create({
        data: {
          analysisSessionId: session.id,
          periodStart: new Date(scenario.days[63].date),
          periodEnd: new Date(scenario.days[76].date),
          totalVariance: -2280.00,
          advertisingImpact: -980.00,
          returnsImpact: -620.00,
          inventoryImpact: -510.00,
          priceImpact: -310.00,
          otherImpact: 140.00,
          formulaExplained: '-2280 = -980 (Ads) - 620 (Returns) - 510 (Inventory) - 310 (Price) + 140 (Other)',
        },
      });

      await this.prisma.analysisFinding.createMany({
        data: [
          {
            analysisSessionId: session.id,
            findingType: 'ADVERTISING',
            title: 'Broad Search Term Bleed',
            metricName: 'Ads Spend',
            impactAmount: -980.00,
            direction: 'NEGATIVE',
            confidence: 0.96,
            evidenceJson: JSON.stringify({ searchTerm: 'bathroom organizer', spend: 420.00, acos: 0.933 }),
            priority: 1,
            recommendation: 'Add "bathroom organizer" to Negative Exact immediately to stop budget drain.',
          },
          {
            analysisSessionId: session.id,
            findingType: 'RETURNS',
            title: 'Beige Grey Variant Return Spike',
            metricName: 'Return Loss',
            impactAmount: -620.00,
            direction: 'NEGATIVE',
            confidence: 0.91,
            evidenceJson: JSON.stringify({ returnRate: 0.067, reason: 'Hole too small for electric handles' }),
            priority: 2,
            recommendation: 'Update listing specs and advise customer support to clarify 1.5" compatibility.',
          },
          {
            analysisSessionId: session.id,
            findingType: 'INVENTORY',
            title: 'Green Variant Stockout & Rush Inbound Freight',
            metricName: 'Lost Sales Margin',
            impactAmount: -510.00,
            direction: 'NEGATIVE',
            confidence: 0.88,
            evidenceJson: JSON.stringify({ daysStockout: 4, rushAirFreightCost: 315.00 }),
            priority: 3,
            recommendation: 'Raise safety stock threshold from 7 days to 14 days for viral surge variants.',
          },
        ],
      });

      // 12. Create Agent Task & Tool Execution Traces
      const agentTask = await this.prisma.agentTask.create({
        data: {
          workspaceId: wsId,
          userId: demoUser.id,
          taskType: 'VARIANCE_ATTRIBUTION',
          status: 'COMPLETED',
          activeSkuId: greenSku.id,
          inputJson: JSON.stringify({ question: 'Why did net profit drop in Week 11?' }),
          resultJson: JSON.stringify(scenario.waterfallWeek11),
        },
      });

      const step1 = await this.prisma.agentStep.create({
        data: {
          taskId: agentTask.id,
          stepNumber: 1,
          stepType: 'TOOL_CALL',
          name: 'Query Financial & Profit Ledger',
          status: 'COMPLETED',
          inputSummary: 'Query ProfitDaily for Week 10 vs Week 11',
          outputSummary: 'Week 10 Net Profit: $4,120; Week 11 Net Profit: $1,840 (Delta: -$2,280)',
        },
      });

      await this.prisma.toolExecution.create({
        data: {
          taskId: agentTask.id,
          agentStepId: step1.id,
          toolName: 'query_profit_summary',
          inputJson: JSON.stringify({ weekStartA: '2026-08-15', weekStartB: '2026-08-22' }),
          outputJson: JSON.stringify({ week10Profit: 4120, week11Profit: 1840, variance: -2280 }),
          latencyMs: 145,
          status: 'SUCCESS',
        },
      });

      const step2 = await this.prisma.agentStep.create({
        data: {
          taskId: agentTask.id,
          stepNumber: 2,
          stepType: 'TOOL_CALL',
          name: 'Query Advertising Variance',
          status: 'COMPLETED',
          inputSummary: 'Audit Search Term ACOS and Campaign Spend',
          outputSummary: 'Found broad match keyword "bathroom organizer" with 93.3% ACOS causing -$980 drag',
        },
      });

      await this.prisma.toolExecution.create({
        data: {
          taskId: agentTask.id,
          agentStepId: step2.id,
          toolName: 'query_ad_metrics',
          inputJson: JSON.stringify({ campaignType: 'SPONSORED_PRODUCTS' }),
          outputJson: JSON.stringify({ spendIncrease: 980, highAcosTerms: ['bathroom organizer'] }),
          latencyMs: 180,
          status: 'SUCCESS',
        },
      });
    }

    this.logger.log(`1-Click Demo Reset completed successfully for workspace: ${workspaceSlug}`);

    return {
      success: true,
      workspaceId: wsId,
      productId: product.id,
      skusCreated: 3,
      daysGenerated: scenario.days.length,
      eventsCount: CORE_BUSINESS_EVENTS.length,
      message: 'Clean 90-day demo dataset generated successfully.',
    };
  }
}
