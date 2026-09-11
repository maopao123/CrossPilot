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
