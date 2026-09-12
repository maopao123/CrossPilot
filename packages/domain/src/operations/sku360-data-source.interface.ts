/**
 * Sku360 Data Source Interface & Raw Domain Contracts (Epic 3 Phase 3)
 *
 * Defines the contract that underlying data providers (Prisma, ScenarioGenerator, Mock, etc.)
 * must implement to supply cross-domain operational facts into Sku360ContextLoader.
 */

import {
  DataAvailabilityStatus,
  OperationEvidenceItem,
  Sku360Identity,
  Sku360SearchTermItem,
  Sku360VocTheme,
} from '@crosspilot/shared';

export interface Sku360LoadParams {
  workspaceId: string;
  skuId: string;
  marketplaceId?: string;
  currentPeriod: {
    from: string; // ISO 8601 (YYYY-MM-DD or full timestamp)
    to: string; // ISO 8601 (YYYY-MM-DD or full timestamp)
  };
  baselinePeriod?: {
    from: string;
    to: string;
  };
  options?: {
    timeoutMs?: number;
    requireAllDomains?: boolean;
    freshnessMaxAgeDays?: number;
  };
}

export interface Workspace360LoadParams {
  workspaceId: string;
  marketplaceId?: string;
  currentPeriod: {
    from: string;
    to: string;
  };
  baselinePeriod?: {
    from: string;
    to: string;
  };
  skuIds?: string[];
  options?: {
    concurrency?: number;
    timeoutMs?: number;
    freshnessMaxAgeDays?: number;
  };
}

export interface DomainLoadResult<T> {
  data?: T;
  availability: DataAvailabilityStatus;
  asOf: string; // ISO 8601
  sourceTimestamp?: string;
  evidence?: OperationEvidenceItem[];
  error?: string;
}

export interface RawSalesData {
  current: {
    ordersCount: number;
    unitsSold: number;
    revenue: number;
    averageSellingPrice?: number;
    sessions?: number;
    pageViews?: number;
    conversionRate?: number;
  };
  baseline?: {
    ordersCount: number;
    unitsSold: number;
    revenue: number;
    averageSellingPrice?: number;
    sessions?: number;
    pageViews?: number;
    conversionRate?: number;
  };
}

export interface RawAdvertisingData {
  current: {
    spend: number;
    sales: number;
    orders?: number;
    clicks?: number;
    impressions?: number;
    acos?: number;
    roas?: number;
    ctr?: number;
    cvr?: number;
  };
  baseline?: {
    spend: number;
    sales: number;
    orders?: number;
    clicks?: number;
    impressions?: number;
    acos?: number;
    roas?: number;
    ctr?: number;
    cvr?: number;
  };
  targetAcos?: number;
  searchTerms?: Sku360SearchTermItem[];
}

export interface RawInventoryData {
  fulfillableQuantity: number;
  inboundQuantity: number;
  reservedQuantity?: number;
  avgDailySales: number;
  leadTimeDays: number;
  safetyStockDays?: number;
  targetDaysCover?: number;
  baseline?: {
    fulfillableQuantity?: number;
    daysCover?: number;
    avgDailySales?: number;
  };
}

export interface RawReviewsData {
  overallRating: number;
  totalReviews: number;
  recentReviewCount?: number;
  negativeReviewCount?: number;
  negativeReviewRatio?: number;
  baseline?: {
    overallRating?: number;
    totalReviews?: number;
  };
  topPainPoints?: Sku360VocTheme[];
  topPositiveThemes?: Sku360VocTheme[];
}

export interface RawReturnsData {
  current: {
    returnCount: number;
    deliveredUnits: number;
    returnCost?: number;
    returnRate?: number;
    topReturnReasons?: Array<{ reason: string; count: number; percentage?: number }>;
  };
  baseline?: {
    returnCount: number;
    deliveredUnits: number;
    returnCost?: number;
    returnRate?: number;
  };
}

export interface RawCompetitorsData {
  items: Array<{
    competitorId: string;
    asin: string;
    name?: string;
    relationType?: string;
    isPrimary?: boolean;
    currentPrice: number;
    baselinePrice?: number;
    currentRating?: number;
    baselineRating?: number;
    reviewCount?: number;
  }>;
}

export interface RawProfitData {
  current: {
    revenue: number;
    cogs: number;
    amazonFees: number;
    fbaFee: number;
    adsCost: number;
    returnLoss: number;
    otherCosts: number;
    netProfit?: number;
    margin?: number;
  };
  baseline?: {
    revenue: number;
    cogs: number;
    amazonFees: number;
    fbaFee: number;
    adsCost: number;
    returnLoss: number;
    otherCosts: number;
    netProfit?: number;
    margin?: number;
  };
  waterfallAttribution?: {
    currentProfit?: number;
    previousProfit?: number;
    advertisingImpact: number;
    returnsImpact: number;
    inventoryImpact: number;
    priceImpact: number;
    otherImpact?: number;
  };
}

export interface ISku360DataSource {
  getIdentity(params: Sku360LoadParams): Promise<Sku360Identity>;
  getSales(params: Sku360LoadParams): Promise<DomainLoadResult<RawSalesData>>;
  getAdvertising(params: Sku360LoadParams): Promise<DomainLoadResult<RawAdvertisingData>>;
  getInventory(params: Sku360LoadParams): Promise<DomainLoadResult<RawInventoryData>>;
  getReviews(params: Sku360LoadParams): Promise<DomainLoadResult<RawReviewsData>>;
  getReturns(params: Sku360LoadParams): Promise<DomainLoadResult<RawReturnsData>>;
  getCompetitors(params: Sku360LoadParams): Promise<DomainLoadResult<RawCompetitorsData>>;
  getProfit(params: Sku360LoadParams): Promise<DomainLoadResult<RawProfitData>>;
}
