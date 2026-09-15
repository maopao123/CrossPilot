/**
 * XYDC (西柚洞察) Vendor-Specific DTOs
 * Strictly isolated inside integrations package.
 * Never exported to Domain, Workflow, or Frontend.
 */

export interface XydcRawProduct {
  id?: string;
  asin?: string;
  item_id?: string;
  title: string;
  brand_name?: string;
  brand?: string;
  category_path?: string;
  price?: number;
  sales_monthly?: number;
  monthlySales?: number;
  est_sales?: number;
  revenue_monthly?: number;
  monthlyRevenue?: number;
  est_revenue?: number;
  customer_rating?: number;
  rating?: number;
  review_count?: number;
  reviews?: number;
  bsr_rank?: number;
  bsr?: number;
  main_image_url?: string;
  image_url?: string;
  product_url?: string;
  url?: string;
}

export interface XydcRawMarketOverview {
  keyword: string;
  category?: string;
  marketplace?: string;
  monthly_search_volume?: number;
  search_volume?: number;
  average_price?: number;
  avg_price?: number;
  average_rating?: number;
  avg_rating?: number;
  average_reviews?: number;
  avg_reviews?: number;
  active_competitors_count?: number;
  competitors_count?: number;
  opportunity_index?: number;
  competition_intensity?: number;
  trending_keywords?: Array<{
    kw?: string;
    keyword?: string;
    vol?: number;
    volume?: number;
    growth_rate?: string;
    growth?: string;
  }>;
  top_asins?: XydcRawProduct[];
}

export interface XydcRawKeyword {
  keyword: string;
  volume?: number;
  search_volume?: number;
  competition_score?: number;
  relevance_score?: number;
  cpc_bid?: number;
  growth_rate?: string;
}

export interface XydcRawTrendPoint {
  date: string;
  val: number;
}

export interface XydcRawTrend {
  asin?: string;
  metric_name: string;
  historical_data: XydcRawTrendPoint[];
}

/**
 * Real Schema DTOs for XYDC MCP Remote Tool: get_asin_info
 * Verified via live MCP discovery against https://mcp.xydc.com/mcp
 */
export interface XydcProductEntity {
  asin: string;
  country: string;
  amazonUrl?: string;
  smallPicUrl?: string;
  bigPicUrl?: string;
  title?: string;
  currency?: string;
  price?: string | number | null;
  stars?: string | number | null;
  ratings?: number | null;
}

export interface XydcGetAsinInfoResponse {
  status: number;
  cost_credits: number;
  data: {
    entities?: XydcProductEntity[];
    error?: boolean;
    reason?: string;
    message?: string;
  };
}

/**
 * Real Schema DTOs for XYDC MCP Remote Tool: get_keyword_info
 * Verified via live MCP discovery against https://mcp.xydc.com/mcp
 */
export interface XydcSearchTermTopAsin {
  asin: string;
  clickShare: string;
  conversionShare: string;
}

export interface XydcSearchTermAbaReport {
  reportFromDate: string;
  reportToDate: string;
  searchFrequencyRank: number;
  weeklySearchVolume: number;
  topAsins: XydcSearchTermTopAsin[];
}

export interface XydcSearchTermCostPerClick {
  value: string;
  minSuggestedBid: string;
  maxSuggestedBid: string;
}

export interface XydcSearchTermEntity {
  searchTerm: string;
  clickConversionRate?: string | null;
  competitiveDifficulty?: number | null;
  organicRotation?: string | null;
  abaReport?: XydcSearchTermAbaReport | null;
  costPerClick?: XydcSearchTermCostPerClick | null;
}

export interface XydcGetKeywordInfoResponse {
  status: number;
  cost_credits: number;
  data: {
    total?: number;
    list?: XydcSearchTermEntity[];
    error?: boolean;
    reason?: string;
    message?: string;
  };
}

/**
 * Real Schema DTOs for XYDC MCP Remote Tool: get_asin_keywords
 * Verified against docs/30_modules/provider/XYDC_TOOLS_SCHEMA.json
 */
export interface XydcAsinKeywordRankInfo {
  position: string;
  totalRank?: number | null;
  page: number;
  pageRank?: number | null;
  rankTime: string;
}

export interface XydcAsinResearchTrafficData {
  total: number;
  organic: number;
  advertising: number;
  totalGrowthRate?: string;
  organicGrowthRate?: string;
  advertisingGrowthRate?: string;
}

export interface XydcAsinResearchTrafficAcquisitionRate {
  total: string | null;
  organic: string | null;
  advertising: string | null;
  totalGrowthRate?: string;
  organicGrowthRate?: string;
  advertisingGrowthRate?: string;
}

export interface XydcAsinResearchTrafficSummary {
  traffic: XydcAsinResearchTrafficData | null;
  trafficAcquisitionRate: XydcAsinResearchTrafficAcquisitionRate | null;
}

export interface XydcAsinResearchItem {
  country: string;
  searchTerm: string;
  ranks: XydcAsinKeywordRankInfo[];
  trafficSummary: XydcAsinResearchTrafficSummary;
}

export interface XydcGetAsinKeywordsResponse {
  status: number;
  cost_credits: number;
  data: {
    list?: XydcAsinResearchItem[];
    total?: number;
    searchTermCount?: Array<{ type: 'organic' | 'advertising' | 'all'; count: number }>;
    error?: boolean;
    reason?: string;
    message?: string;
  };
}

/**
 * Real Schema DTOs for XYDC MCP Remote Tool: get_asin_bsr_trends
 * Verified via live MCP discovery against https://mcp.xydc.com/mcp
 */
export interface XydcBsrCategory {
  categoryId: string;
  name: string;
  root: boolean;
}

export interface XydcBsrValue {
  categoryId: string;
  rank: number | null;
}

export interface XydcBsrTrendPoint {
  date: string;
  values: XydcBsrValue[];
}

export interface XydcGetBsrTrendsResponse {
  status: number;
  cost_credits: number;
  data: {
    asin?: string;
    country?: string;
    categoryTree?: XydcBsrCategory[];
    trends?: XydcBsrTrendPoint[];
    dateRangeNotice?: string;
    error?: boolean;
    reason?: string;
    message?: string;
  };
}

/**
 * Real Schema DTOs for XYDC MCP Remote Tool: get_asin_info_trends
 * Verified via live MCP discovery against https://mcp.xydc.com/mcp
 */
export interface XydcPriceDistribution {
  display: string;
  deal: string;
  strikethrough: string;
  origin: string;
  prime: string;
  coupon: string[];
  promotion: string[];
  subscribe: string[];
  other: string[];
}

export interface XydcInfoTrendPoint {
  date: string;
  ratings: number | null;
  stars: string;
  priceDistribution: XydcPriceDistribution;
}

export interface XydcGetInfoTrendsResponse {
  status: number;
  cost_credits: number;
  data: {
    asin?: string;
    country?: string;
    trends?: XydcInfoTrendPoint[];
    dateRangeNotice?: string;
    error?: boolean;
    reason?: string;
    message?: string;
  };
}
