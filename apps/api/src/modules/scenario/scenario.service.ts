import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ModelRouter } from '@crosspilot/shared';
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
        name: '天然大理石牙刷架',
        brand: 'POLEGAS',
        category: 'Home & Kitchen',
        subCategory: 'Bathroom Accessories',
        targetPrice: 29.99,
        description: '奢华手工天然大理石牙刷架，配重型防滑底座。',
        productBrief: `产品：天然大理石牙刷架
目标市场：Amazon US（家居与厨房 / 浴室配件）
核心价值主张：3.57 lbs 重型防滑天然大理石底座，永不倾倒。
卡槽规格：1 个大卡槽放牙膏（2.1 x 1.4 in）+ 3 个牙刷卡槽（直径 1.5 in）。
已验证材质：100% 天然抛光石材，底部非渗透树脂密封，EVA 防刮垫。
VOC 关键改进：孔径加大至 1.5 英寸，确保兼容 Oral-B 与 Philips Sonicare 手柄；新增内部排水坡度。`,
        features: {
          create: [
            { name: '材质', value: '100% 天然大理石', isCore: true, workspaceId: wsId },
            { name: '重量', value: '3.57 lbs（重型底座）', unit: 'lbs', isCore: true, workspaceId: wsId },
            { name: '卡槽配置', value: '1 大 + 3 小卡槽', isCore: true, workspaceId: wsId },
            { name: '孔径', value: '1.5 英寸', unit: 'in', isCore: true, workspaceId: wsId },
            { name: '底部处理', value: '防滑 EVA 软垫', isCore: true, workspaceId: wsId },
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
        title: 'LuxStone 重型天然树脂牙刷收纳架',
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
        title: 'KES 重型大理石底座牙刷架 SUS304',
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
        modelName: ModelRouter.llmRouter.heavyReasoning,
        promptVersion: 'v2.1',
      },
    });

    const topicHole = await this.prisma.vocTopic.create({
      data: {
        analysisRunId: vocRun.id,
        topicName: '电动手柄孔径偏小',
        topicType: 'PAIN_POINT',
        sentiment: 'NEGATIVE',
        reviewCount: 56,
        percentage: 31.10,
        severityScore: 4.5,
        summary: '31% 的差评反映标准卡槽过窄，放不下主流电动牙刷（Oral-B iO 系列与 Philips Sonicare DiamondClean）。',
      },
    });

    const topicWeight = await this.prisma.vocTopic.create({
      data: {
        analysisRunId: vocRun.id,
        topicName: '底座重量与稳定性好评',
        topicType: 'PRAISE',
        sentiment: 'POSITIVE',
        reviewCount: 76,
        percentage: 42.20,
        severityScore: 1.0,
        summary: '客户强烈好评 3.57 lbs 的厚重大理石底座，取用牙刷时不会滑动或倾倒。',
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
        title: '下一代大理石牙刷架：1.5" 通用卡槽',
        problemSummary: '现有市场竞品卡槽过窄（< 1.2"），导致电动牙刷用户退货率居高不下；厚实防滑底座是强需求。',
        targetCustomer: '美国城市自住房家庭，浴室现代化、使用电动牙刷。',
        recommendedPositioning: '高端天然石材浴室装饰，保证电动手柄通用兼容。',
        opportunityScore: 8.8,
        confidenceLevel: 0.92,
        evidenceSummary: '基于 180 条已验证 Amazon 评论：31% 痛点为卡槽孔径，42% 好评集中在底座重量稳定性。',
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
        title: 'POLEGAS 天然大理石牙刷架 - 浴室专用重型石质底座',
        bulletPointsJson: JSON.stringify([
          '纯正天然大理石：100% 天然抛光石材，纹理独一无二。',
          '重型底座：3.57 lbs 实心底座配防滑垫，永不倾倒。',
          '4 格分区：牙膏与多支牙刷一次收纳。',
          '现代奢华：提升主卫或客卫台面质感。',
          '易清洁：非渗透密封表面，湿布一擦即净。',
        ]),
        description: '用真正的大理石工艺升级你的浴室。',
        searchTerms: 'marble toothbrush holder heavy stone bathroom organizer vanity caddy',
        generationSource: 'AI_ASSISTED',
      },
    });

    const v2 = await this.prisma.listingVersion.create({
      data: {
        listingId: listing.id,
        versionNumber: 2,
        title: 'POLEGAS 天然大理石牙刷架 - 1.5" 宽卡槽，兼容电动与手动牙刷（3.57 lbs）',
        bulletPointsJson: JSON.stringify([
          '100% 纯正天然大理石：整块天然石材手工打磨，重 3.57 lbs。',
          '1.5 英寸通用卡槽：加宽卡槽设计，兼容 Oral-B、Philips Sonicare 及标准手动牙刷。',
          '重型防滑稳定：底部配 EVA 软垫，在湿滑的石英石或瓷砖台面上不倾倒、不滑动。',
          '卫生排水槽：内底倾斜设计，避免积水滞留。',
          '清洁与保养：防污密封处理，中性皂液手洗即可。',
        ]),
        description: '依据已验证的客户反馈改良：奢华大理石，保证电动手柄适配。',
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
        evidenceSummary: '符合 Amazon 商品详情页规范与 FTC 石材披露要求。',
        modelName: ModelRouter.llmRouter.heavyReasoning,
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
          question: '第 11 周净利润相比第 10 周为何下降？',
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
            title: '广泛匹配搜索词蚕食预算',
            metricName: '广告花费',
            impactAmount: -980.00,
            direction: 'NEGATIVE',
            confidence: 0.96,
            evidenceJson: JSON.stringify({ searchTerm: 'bathroom organizer', spend: 420.00, acos: 0.933 }),
            priority: 1,
            recommendation: '立即把 "bathroom organizer" 加入精准否定，止住预算流失。',
          },
          {
            analysisSessionId: session.id,
            findingType: 'RETURNS',
            title: '米灰变体退货率飙升',
            metricName: '退货损失',
            impactAmount: -620.00,
            direction: 'NEGATIVE',
            confidence: 0.91,
            evidenceJson: JSON.stringify({ returnRate: 0.067, reason: '电动牙刷手柄孔径不适配' }),
            priority: 2,
            recommendation: '更新 Listing 规格说明，并让客服明确 1.5" 兼容性。',
          },
          {
            analysisSessionId: session.id,
            findingType: 'INVENTORY',
            title: '绿色变体断货与加急头程运费',
            metricName: '丢失的销售毛利',
            impactAmount: -510.00,
            direction: 'NEGATIVE',
            confidence: 0.88,
            evidenceJson: JSON.stringify({ daysStockout: 4, rushAirFreightCost: 315.00 }),
            priority: 3,
            recommendation: '把安全库存阈值从 7 天提高到 14 天，覆盖爆发式增长变体。',
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
          inputJson: JSON.stringify({ question: '第 11 周净利润为何下降？' }),
          resultJson: JSON.stringify(scenario.waterfallWeek11),
        },
      });

      const step1 = await this.prisma.agentStep.create({
        data: {
          taskId: agentTask.id,
          stepNumber: 1,
          stepType: 'TOOL_CALL',
          name: '查询财务与利润台账',
          status: 'COMPLETED',
          inputSummary: '查询第 10 周与第 11 周的 ProfitDaily',
          outputSummary: '第 10 周净利润：$4,120；第 11 周净利润：$1,840（差异：-$2,280）',
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
          name: '查询广告差异',
          status: 'COMPLETED',
          inputSummary: '审计搜索词 ACOS 与广告活动花费',
          outputSummary: '发现广泛匹配关键词 "bathroom organizer" ACOS 93.3%，造成 -$980 拖累',
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
      message: '90 天纯净演示数据集已生成。',
    };
  }
}
