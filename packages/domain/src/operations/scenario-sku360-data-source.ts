/**
 * Scenario Sku360 Data Source (Epic 3 Phase 3)
 *
 * Implements ISku360DataSource by adapting ScenarioGeneratorService's deterministic 90-day simulation.
 * Replays realistic operational facts across White, Green, and Grey SKUs:
 * - White SKU (MTH-WHITE-001): Steady hero SKU, Day 18 ACOS spike ($420 spend on "bathroom organizer")
 * - Green SKU (MTH-GREEN-001): Viral sales surge (Day 35-48), critical stockout warning (Day 52, daysCover 11.8 < 15), stockout (Day 62)
 * - Grey SKU (MTH-GREY-001): Return rate spike (Day 50, 3.2% -> 6.7%), VOC hole-size defect (Day 55, 31% complaints)
 * - Week 10 vs Week 11 profit drop (-$2,280 waterfall attribution)
 */

import {
  DataAvailabilityStatus,
  OperationEvidenceItem,
  Sku360Identity,
  Sku360SearchTermItem,
  Sku360VocTheme,
} from '@crosspilot/shared';

import {
  ISku360DataSource,
  Sku360LoadParams,
  DomainLoadResult,
  RawSalesData,
  RawAdvertisingData,
  RawInventoryData,
  RawReviewsData,
  RawReturnsData,
  RawCompetitorsData,
  RawProfitData,
} from './sku360-data-source.interface.js';

import {
  ScenarioGeneratorService,
  DailyScenarioMetrics,
} from '../scenario/scenario-generator.js';

import { roundMoney, roundMargin } from '../profit/profit-calculation.service.js';

export interface SkuMetadataConfig {
  productId: string;
  skuId: string;
  skuCode: string;
  asin: string;
  productName: string;
  variantName: string;
  brand: string;
  category: string;
  status: string;
}

export const SCENARIO_SKU_REGISTRY: Record<string, SkuMetadataConfig> = {
  'MTH-WHITE-001': {
    productId: 'prod_mth_001',
    skuId: 'sku_white_001',
    skuCode: 'MTH-WHITE-001',
    asin: 'B0BFGNSXYL',
    productName: '天然大理石牙刷架',
    variantName: 'Carrara White',
    brand: 'POLEGAS',
    category: 'Home & Kitchen',
    status: 'ACTIVE',
  },
  'sku_white_001': {
    productId: 'prod_mth_001',
    skuId: 'sku_white_001',
    skuCode: 'MTH-WHITE-001',
    asin: 'B0BFGNSXYL',
    productName: '天然大理石牙刷架',
    variantName: 'Carrara White',
    brand: 'POLEGAS',
    category: 'Home & Kitchen',
    status: 'ACTIVE',
  },
  'MTH-GREEN-001': {
    productId: 'prod_mth_001',
    skuId: 'sku_green_001',
    skuCode: 'MTH-GREEN-001',
    asin: 'B0B8VG753F',
    productName: '天然大理石牙刷架',
    variantName: 'Emerald Green',
    brand: 'POLEGAS',
    category: 'Home & Kitchen',
    status: 'ACTIVE',
  },
  'sku_green_001': {
    productId: 'prod_mth_001',
    skuId: 'sku_green_001',
    skuCode: 'MTH-GREEN-001',
    asin: 'B0B8VG753F',
    productName: '天然大理石牙刷架',
    variantName: 'Emerald Green',
    brand: 'POLEGAS',
    category: 'Home & Kitchen',
    status: 'ACTIVE',
  },
  'MTH-GREY-001': {
    productId: 'prod_mth_001',
    skuId: 'sku_grey_001',
    skuCode: 'MTH-GREY-001',
    asin: 'B08P4ZZTNG',
    productName: '天然大理石牙刷架',
    variantName: 'Beige Grey',
    brand: 'POLEGAS',
    category: 'Home & Kitchen',
    status: 'ACTIVE',
  },
  'sku_grey_001': {
    productId: 'prod_mth_001',
    skuId: 'sku_grey_001',
    skuCode: 'MTH-GREY-001',
    asin: 'B08P4ZZTNG',
    productName: '天然大理石牙刷架',
    variantName: 'Beige Grey',
    brand: 'POLEGAS',
    category: 'Home & Kitchen',
    status: 'ACTIVE',
  },
};

export class ScenarioSku360DataSource implements ISku360DataSource {
  private scenarioData: ReturnType<typeof ScenarioGeneratorService.generate90Days>;
  private baseDate: Date;

  constructor(startDate?: Date) {
    this.baseDate = startDate ? new Date(startDate) : new Date('2026-06-01T00:00:00Z');
    this.scenarioData = ScenarioGeneratorService.generate90Days(this.baseDate);
  }

  private resolveSku(skuIdOrCode: string): SkuMetadataConfig {
    const config = SCENARIO_SKU_REGISTRY[skuIdOrCode];
    if (config) return config;
    // Fallback: match by prefix
    const lower = skuIdOrCode.toLowerCase();
    if (lower.includes('green')) return SCENARIO_SKU_REGISTRY['MTH-GREEN-001'];
    if (lower.includes('grey') || lower.includes('gray')) return SCENARIO_SKU_REGISTRY['MTH-GREY-001'];
    return SCENARIO_SKU_REGISTRY['MTH-WHITE-001'];
  }

  private filterMetrics(skuCode: string, from: string, to: string): DailyScenarioMetrics[] {
    const fromDate = from.slice(0, 10);
    const toDate = to.slice(0, 10);
    return this.scenarioData.skuMetrics.filter(
      (m) => m.skuCode === skuCode && m.date >= fromDate && m.date <= toDate,
    );
  }

  private getDaysCount(from: string, to: string): number {
    const d1 = new Date(from.slice(0, 10)).getTime();
    const d2 = new Date(to.slice(0, 10)).getTime();
    return Math.max(1, Math.round(Math.abs(d2 - d1) / (24 * 60 * 60 * 1000)) + 1);
  }

  async getIdentity(params: Sku360LoadParams): Promise<Sku360Identity> {
    const meta = this.resolveSku(params.skuId);
    return {
      workspaceId: params.workspaceId,
      marketplaceId: params.marketplaceId || 'AMAZON_US',
      productId: meta.productId,
      skuId: meta.skuId,
      skuCode: meta.skuCode,
      asin: meta.asin,
      productName: meta.productName,
      brand: meta.brand,
      category: meta.category,
      status: meta.status,
    };
  }

  async getSales(params: Sku360LoadParams): Promise<DomainLoadResult<RawSalesData>> {
    const meta = this.resolveSku(params.skuId);
    const curMetrics = this.filterMetrics(meta.skuCode, params.currentPeriod.from, params.currentPeriod.to);

    const curOrders = curMetrics.reduce((s, m) => s + m.ordersCount, 0);
    const curUnits = curMetrics.reduce((s, m) => s + m.unitsSold, 0);
    const curRev = roundMoney(curMetrics.reduce((s, m) => s + m.revenue, 0));
    const curAsp = curUnits > 0 ? roundMoney(curRev / curUnits) : 0;

    let baseOrders = 0;
    let baseUnits = 0;
    let baseRev = 0;
    let baseAsp = 0;

    if (params.baselinePeriod) {
      const baseMetrics = this.filterMetrics(meta.skuCode, params.baselinePeriod.from, params.baselinePeriod.to);
      baseOrders = baseMetrics.reduce((s, m) => s + m.ordersCount, 0);
      baseUnits = baseMetrics.reduce((s, m) => s + m.unitsSold, 0);
      baseRev = roundMoney(baseMetrics.reduce((s, m) => s + m.revenue, 0));
      baseAsp = baseUnits > 0 ? roundMoney(baseRev / baseUnits) : 0;
    }

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EVI-SALES-${meta.skuCode}-${params.currentPeriod.from.slice(0, 10)}`,
        category: 'DATABASE',
        title: 'Sales & Order Metrics',
        content: `Loaded ${curOrders} orders, ${curUnits} units sold, $${curRev.toFixed(2)} revenue for ${meta.skuCode}.`,
        source: 'ScenarioGeneratorService.orders',
        capturedAt: new Date().toISOString(),
        metadata: {
          domain: 'SALES',
          skuCode: meta.skuCode,
          currentUnits: curUnits,
          baselineUnits: baseUnits,
        },
      },
    ];

    return {
      data: {
        current: {
          ordersCount: curOrders,
          unitsSold: curUnits,
          revenue: curRev,
          averageSellingPrice: curAsp,
          sessions: curUnits * 12,
          pageViews: curUnits * 18,
          conversionRate: roundMargin(curOrders / (curUnits * 12 || 1)),
        },
        baseline: params.baselinePeriod
          ? {
              ordersCount: baseOrders,
              unitsSold: baseUnits,
              revenue: baseRev,
              averageSellingPrice: baseAsp,
              sessions: baseUnits * 12,
              pageViews: baseUnits * 18,
              conversionRate: roundMargin(baseOrders / (baseUnits * 12 || 1)),
            }
          : undefined,
      },
      availability: curMetrics.length > 0 ? 'AVAILABLE' : 'PARTIAL',
      asOf: params.currentPeriod.to,
      evidence,
    };
  }

  async getAdvertising(params: Sku360LoadParams): Promise<DomainLoadResult<RawAdvertisingData>> {
    const meta = this.resolveSku(params.skuId);
    const curMetrics = this.filterMetrics(meta.skuCode, params.currentPeriod.from, params.currentPeriod.to);

    const curSpend = roundMoney(curMetrics.reduce((s, m) => s + m.adsCost, 0));
    const curSales = roundMoney(curMetrics.reduce((s, m) => s + m.revenue, 0));
    const curOrders = curMetrics.reduce((s, m) => s + m.ordersCount, 0);
    const curClicks = curOrders * 9;
    const curImpressions = curClicks * 45;
    const curAcos = curSales > 0 ? roundMargin(curSpend / curSales) : (curSpend > 0 ? 1.0 : 0);

    let baseSpend = 0;
    let baseSales = 0;
    let baseOrders = 0;
    let baseClicks = 0;
    let baseImpressions = 0;
    let baseAcos = 0;

    if (params.baselinePeriod) {
      const baseMetrics = this.filterMetrics(meta.skuCode, params.baselinePeriod.from, params.baselinePeriod.to);
      baseSpend = roundMoney(baseMetrics.reduce((s, m) => s + m.adsCost, 0));
      baseSales = roundMoney(baseMetrics.reduce((s, m) => s + m.revenue, 0));
      baseOrders = baseMetrics.reduce((s, m) => s + m.ordersCount, 0);
      baseClicks = baseOrders * 9;
      baseImpressions = baseClicks * 45;
      baseAcos = baseSales > 0 ? roundMargin(baseSpend / baseSales) : (baseSpend > 0 ? 1.0 : 0);
    }

    // Search terms: Inject Day 18 "bathroom organizer" for White SKU if applicable
    const searchTerms: Sku360SearchTermItem[] = [];
    if (meta.skuCode === 'MTH-WHITE-001') {
      const includesDay18 = curMetrics.some((m) => m.day === 18);
      if (includesDay18) {
        searchTerms.push({
          searchTerm: 'bathroom organizer',
          impressions: 12500,
          clicks: 280,
          spend: 420.0,
          orders: 2,
          sales: 450.0,
          acos: 0.9333,
          cvr: 0.0071,
          ctr: 0.0224,
        });
        searchTerms.push({
          searchTerm: 'acrylic toothbrush organizer',
          impressions: 3200,
          clicks: 28,
          spend: 45.0,
          orders: 0,
          sales: 0,
          acos: 1.0,
          cvr: 0,
          ctr: 0.0087,
        });
      }
      searchTerms.push({
        searchTerm: 'marble toothbrush holder',
        impressions: 8400,
        clicks: 310,
        spend: 215.0,
        orders: 24,
        sales: 719.76,
        acos: 0.2987,
        cvr: 0.0774,
        ctr: 0.0369,
      });
    }

    return {
      data: {
        current: {
          spend: curSpend,
          sales: curSales,
          orders: curOrders,
          clicks: curClicks,
          impressions: curImpressions,
          acos: curAcos,
          roas: curSpend > 0 ? roundMoney(curSales / curSpend) : 0,
          ctr: curImpressions > 0 ? roundMargin(curClicks / curImpressions) : 0,
          cvr: curClicks > 0 ? roundMargin(curOrders / curClicks) : 0,
        },
        baseline: params.baselinePeriod
          ? {
              spend: baseSpend,
              sales: baseSales,
              orders: baseOrders,
              clicks: baseClicks,
              impressions: baseImpressions,
              acos: baseAcos,
              roas: baseSpend > 0 ? roundMoney(baseSales / baseSpend) : 0,
              ctr: baseImpressions > 0 ? roundMargin(baseClicks / baseImpressions) : 0,
              cvr: baseClicks > 0 ? roundMargin(baseOrders / baseClicks) : 0,
            }
          : undefined,
        targetAcos: 0.30,
        searchTerms,
      },
      availability: curMetrics.length > 0 ? 'AVAILABLE' : 'PARTIAL',
      asOf: params.currentPeriod.to,
    };
  }

  async getInventory(params: Sku360LoadParams): Promise<DomainLoadResult<RawInventoryData>> {
    const meta = this.resolveSku(params.skuId);
    const curMetrics = this.filterMetrics(meta.skuCode, params.currentPeriod.from, params.currentPeriod.to);

    const latestMetric = curMetrics[curMetrics.length - 1] || this.scenarioData.skuMetrics.find((m) => m.skuCode === meta.skuCode);
    const totalUnits = curMetrics.reduce((s, m) => s + m.unitsSold, 0);
    const daysCount = Math.max(1, curMetrics.length);
    const avgDailySales = Math.round((totalUnits / daysCount) * 10) / 10 || (latestMetric ? latestMetric.unitsSold : 10);

    const fulfillableQuantity = latestMetric ? latestMetric.inventoryFulfillable : 300;
    const inboundQuantity = latestMetric ? latestMetric.inventoryInbound : 0;
    const reservedQuantity = latestMetric ? latestMetric.inventoryReserved : 20;

    let baselineFulfillable: number | undefined;
    let baselineDaysCover: number | undefined;

    if (params.baselinePeriod) {
      const baseMetrics = this.filterMetrics(meta.skuCode, params.baselinePeriod.from, params.baselinePeriod.to);
      const firstBase = baseMetrics[baseMetrics.length - 1];
      if (firstBase) {
        baselineFulfillable = firstBase.inventoryFulfillable;
        baselineDaysCover = firstBase.daysCover;
      }
    }

    return {
      data: {
        fulfillableQuantity,
        inboundQuantity,
        reservedQuantity,
        avgDailySales,
        leadTimeDays: 15,
        safetyStockDays: 7,
        targetDaysCover: 45,
        baseline: {
          fulfillableQuantity: baselineFulfillable,
          daysCover: baselineDaysCover,
          avgDailySales,
        },
      },
      availability: 'AVAILABLE',
      asOf: params.currentPeriod.to,
    };
  }

  async getReviews(params: Sku360LoadParams): Promise<DomainLoadResult<RawReviewsData>> {
    const meta = this.resolveSku(params.skuId);
    const curMetrics = this.filterMetrics(meta.skuCode, params.currentPeriod.from, params.currentPeriod.to);
    const maxDay = curMetrics.reduce((max, m) => Math.max(max, m.day), 0);

    if (meta.skuCode === 'MTH-GREY-001' && maxDay >= 50) {
      // Grey variant with hole-size defect
      return {
        data: {
          overallRating: 4.1,
          totalReviews: 890,
          recentReviewCount: 45,
          negativeReviewCount: 14,
          negativeReviewRatio: 0.311,
          baseline: {
            overallRating: 4.5,
            totalReviews: 845,
          },
          topPainPoints: [
            {
              topicName: 'Hole diameter too narrow for electric handles',
              percentage: 31.1,
              reviewCount: 14,
              sentiment: 'NEGATIVE',
            },
            {
              topicName: 'Base stone minor chipping',
              percentage: 8.9,
              reviewCount: 4,
              sentiment: 'NEGATIVE',
            },
          ],
          topPositiveThemes: [
            {
              topicName: 'Heavy genuine marble feel',
              percentage: 60.0,
              reviewCount: 27,
              sentiment: 'POSITIVE',
            },
          ],
        },
        availability: 'AVAILABLE',
        asOf: params.currentPeriod.to,
      };
    }

    if (meta.skuCode === 'MTH-GREEN-001') {
      return {
        data: {
          overallRating: 4.7,
          totalReviews: 1250,
          recentReviewCount: 38,
          negativeReviewCount: 1,
          negativeReviewRatio: 0.026,
          baseline: {
            overallRating: 4.7,
            totalReviews: 1212,
          },
        },
        availability: 'AVAILABLE',
        asOf: params.currentPeriod.to,
      };
    }

    // Default White Hero SKU
    return {
      data: {
        overallRating: 4.6,
        totalReviews: 5147,
        recentReviewCount: 65,
        negativeReviewCount: 2,
        negativeReviewRatio: 0.031,
        baseline: {
          overallRating: 4.6,
          totalReviews: 5082,
        },
      },
      availability: 'AVAILABLE',
      asOf: params.currentPeriod.to,
    };
  }

  async getReturns(params: Sku360LoadParams): Promise<DomainLoadResult<RawReturnsData>> {
    const meta = this.resolveSku(params.skuId);
    const curMetrics = this.filterMetrics(meta.skuCode, params.currentPeriod.from, params.currentPeriod.to);
    const curUnits = curMetrics.reduce((s, m) => s + m.unitsSold, 0);
    const maxDay = curMetrics.reduce((max, m) => Math.max(max, m.day), 0);

    let curDelivered = Math.max(25, curUnits);
    let curReturnCount = 1;
    let curReturnCost = 29.99;
    let curReturnRate = 0.025;
    let baseReturnRate = 0.025;
    let baseReturnCount = 1;
    let topReasons: Array<{ reason: string; count: number; percentage?: number }> = [];

    if (meta.skuCode === 'MTH-GREY-001' && maxDay >= 50) {
      // Grey SKU return rate spike: 6.7% vs 3.2%
      curReturnRate = 0.067;
      curReturnCount = Math.round(curDelivered * curReturnRate);
      curReturnCost = 620.0;
      baseReturnRate = 0.032;
      baseReturnCount = Math.round(curDelivered * baseReturnRate);
      topReasons = [
        { reason: 'Slot hole too small for electric brush', count: Math.round(curReturnCount * 0.7), percentage: 70 },
        { reason: 'Chipped marble corner upon arrival', count: Math.round(curReturnCount * 0.3), percentage: 30 },
      ];
    } else {
      curReturnCount = Math.round(curDelivered * curReturnRate);
      curReturnCost = roundMoney(curReturnCount * 29.99);
      baseReturnCount = Math.round(curDelivered * baseReturnRate);
    }

    return {
      data: {
        current: {
          returnCount: curReturnCount,
          deliveredUnits: curDelivered,
          returnCost: curReturnCost,
          returnRate: curReturnRate,
          topReturnReasons: topReasons,
        },
        baseline: params.baselinePeriod
          ? {
              returnCount: baseReturnCount,
              deliveredUnits: curDelivered,
              returnCost: roundMoney(baseReturnCount * 29.99),
              returnRate: baseReturnRate,
            }
          : undefined,
      },
      availability: 'AVAILABLE',
      asOf: params.currentPeriod.to,
    };
  }

  async getCompetitors(params: Sku360LoadParams): Promise<DomainLoadResult<RawCompetitorsData>> {
    const meta = this.resolveSku(params.skuId);
    return {
      data: {
        items: [
          {
            competitorId: 'COMP-001',
            asin: 'B09XYZ1234',
            name: 'HBLife Resin Heavyweight Toothbrush Stand',
            relationType: 'DIRECT_BENCHMARK',
            isPrimary: true,
            currentPrice: 22.49,
            baselinePrice: 25.99, // 13.5% price cut (triggers R-COMP-01 if compared)
            currentRating: 4.5,
            baselineRating: 4.4,
            reviewCount: 3200,
          },
          {
            competitorId: 'COMP-002',
            asin: 'B08ABCD567',
            name: 'Generic Ceramic Toothbrush Cup',
            relationType: 'INDIRECT_BENCHMARK',
            isPrimary: false,
            currentPrice: 16.99,
            baselinePrice: 16.99,
            currentRating: 4.2,
            baselineRating: 4.2,
            reviewCount: 850,
          },
        ],
      },
      availability: 'AVAILABLE',
      asOf: params.currentPeriod.to,
    };
  }

  async getProfit(params: Sku360LoadParams): Promise<DomainLoadResult<RawProfitData>> {
    const meta = this.resolveSku(params.skuId);
    const curMetrics = this.filterMetrics(meta.skuCode, params.currentPeriod.from, params.currentPeriod.to);

    const curRev = roundMoney(curMetrics.reduce((s, m) => s + m.revenue, 0));
    const curCogs = roundMoney(curMetrics.reduce((s, m) => s + m.cogs, 0));
    const curAmz = roundMoney(curMetrics.reduce((s, m) => s + m.amazonFees, 0));
    const curFba = roundMoney(curMetrics.reduce((s, m) => s + m.fbaFee, 0));
    const curAds = roundMoney(curMetrics.reduce((s, m) => s + m.adsCost, 0));
    const curRet = roundMoney(curMetrics.reduce((s, m) => s + m.returnLoss, 0));
    const curOth = roundMoney(curMetrics.reduce((s, m) => s + m.otherCosts, 0));
    const curNet = roundMoney(curMetrics.reduce((s, m) => s + m.netProfit, 0));
    const curMargin = curRev > 0 ? roundMargin(curNet / curRev) : 0;

    let baseRev = 0;
    let baseCogs = 0;
    let baseAmz = 0;
    let baseFba = 0;
    let baseAds = 0;
    let baseRet = 0;
    let baseOth = 0;
    let baseNet = 0;
    let baseMargin = 0;

    if (params.baselinePeriod) {
      const baseMetrics = this.filterMetrics(meta.skuCode, params.baselinePeriod.from, params.baselinePeriod.to);
      baseRev = roundMoney(baseMetrics.reduce((s, m) => s + m.revenue, 0));
      baseCogs = roundMoney(baseMetrics.reduce((s, m) => s + m.cogs, 0));
      baseAmz = roundMoney(baseMetrics.reduce((s, m) => s + m.amazonFees, 0));
      baseFba = roundMoney(baseMetrics.reduce((s, m) => s + m.fbaFee, 0));
      baseAds = roundMoney(baseMetrics.reduce((s, m) => s + m.adsCost, 0));
      baseRet = roundMoney(baseMetrics.reduce((s, m) => s + m.returnLoss, 0));
      baseOth = roundMoney(baseMetrics.reduce((s, m) => s + m.otherCosts, 0));
      baseNet = roundMoney(baseMetrics.reduce((s, m) => s + m.netProfit, 0));
      baseMargin = baseRev > 0 ? roundMargin(baseNet / baseRev) : 0;
    }

    // Check if this matches Week 11 business review (Day 71-77 vs Day 64-70)
    let waterfallAttribution: RawProfitData['waterfallAttribution'];
    const includesWeek11 = curMetrics.some((m) => m.day >= 71 && m.day <= 77);
    if (includesWeek11) {
      waterfallAttribution = {
        currentProfit: 1840.0,
        previousProfit: 4120.0,
        advertisingImpact: -980.0,
        returnsImpact: -620.0,
        inventoryImpact: -510.0,
        priceImpact: -310.0,
        otherImpact: 140.0,
      };
    }

    return {
      data: {
        current: {
          revenue: curRev,
          cogs: curCogs,
          amazonFees: curAmz,
          fbaFee: curFba,
          adsCost: curAds,
          returnLoss: curRet,
          otherCosts: curOth,
          netProfit: curNet,
          margin: curMargin,
        },
        baseline: params.baselinePeriod
          ? {
              revenue: baseRev,
              cogs: baseCogs,
              amazonFees: baseAmz,
              fbaFee: baseFba,
              adsCost: baseAds,
              returnLoss: baseRet,
              otherCosts: baseOth,
              netProfit: baseNet,
              margin: baseMargin,
            }
          : undefined,
        waterfallAttribution,
      },
      availability: curMetrics.length > 0 ? 'AVAILABLE' : 'PARTIAL',
      asOf: params.currentPeriod.to,
    };
  }
}
