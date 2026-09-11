/**
 * Normalized Research Contracts for CrossPilot V9
 * Single source of truth for market data domain models.
 * Strictly decoupled from third-party vendor DTOs (e.g. XYDC, SellerSprite, Keepa).
 */

export interface MarketProduct {
  source: string;
  marketplace: string;
  externalId: string;
  asin?: string;
  title: string;
  brand?: string;
  category?: string;
  price?: number;
  monthlySales?: number;
  monthlyRevenue?: number;
  rating?: number;
  reviewCount?: number;
  bsr?: number;
  sourceUrl?: string;
  imageUrl?: string;
  capturedAt: string;
  rawRef?: string;
}

export type MarketMetricType =
  | 'AVG_PRICE'
  | 'COMPETITOR_COUNT'
  | 'SEARCH_VOLUME'
  | 'SALES'
  | 'REVENUE'
  | 'BSR'
  | 'OPPORTUNITY_SCORE'
  | 'COMPETITION_SCORE'
  | 'OTHER';

export interface MarketMetric {
  source: string;
  marketplace: string;
  metric: MarketMetricType;
  value: number;
  unit?: string;
  capturedAt: string;
}

export interface KeywordMetric {
  source: string;
  marketplace: string;
  keyword: string;
  searchVolume?: number;
  competition?: number;
  relevance?: number;
  growth?: string;
  cpc?: number;
  capturedAt: string;
}

export type TrendMetricType = 'PRICE' | 'SALES' | 'REVENUE' | 'BSR' | 'SEARCH_INTEREST';

export interface MarketTrend {
  source: string;
  marketplace: string;
  subjectId?: string;
  metric: TrendMetricType;
  points: Array<{
    date: string;
    value: number;
  }>;
}

export type EvidenceSourceMode = 'LIVE' | 'CACHED' | 'MOCK' | 'DEGRADED';

export type EvidenceType =
  | 'MARKET_PRODUCT'
  | 'MARKET_METRIC'
  | 'KEYWORD'
  | 'TREND'
  | 'VOC'
  | 'OTHER';

export interface ResearchEvidence {
  evidenceId: string;
  source: string;
  providerId: string;
  type: EvidenceType;
  sourceId?: string;
  title?: string;
  content: string;
  capturedAt: string;
  mode: EvidenceSourceMode;
  metadata?: Record<string, unknown>;
}

export interface MarketOverviewSnapshot {
  seedKeyword: string;
  category: string;
  marketplace: string;
  searchVolumeMonthly: number;
  avgPrice: number;
  avgRating: number;
  avgReviewCount: number;
  competitorCount: number;
  opportunityScore: number;
  competitionScore: number;
  trendingKeywords: Array<{ keyword: string; volume: number; growth?: string }>;
  topProducts?: MarketProduct[];
  evidence?: ResearchEvidence[];
  source: string;
  mode: EvidenceSourceMode;
  capturedAt: string;
}
