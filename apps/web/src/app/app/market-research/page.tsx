'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiClient } from '../../../lib/api-client';
import {
  Search,
  TrendingUp,
  Target,
  Sparkles,
  ArrowRight,
  BarChart2,
  Users,
  CheckCircle2,
  ChevronRight,
  Database,
  ShieldCheck,
  Clock,
  Activity,
  RefreshCw,
  Info,
  Server,
  FileText,
  X,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Star,
  MessageSquareOff,
  Lightbulb,
  ExternalLink,
  Compass,
  Gauge,
  Scale,
  DollarSign,
  Layers,
  Award,
  AlertCircle,
} from 'lucide-react';
import type { ProductOpportunity as DomainProductOpportunity } from '@crosspilot/shared';


interface ResearchEvidenceItem {
  evidenceId: string;
  source: string;
  providerId: string;
  type: string;
  title?: string;
  content: string;
  capturedAt: string;
  mode: string;
}

interface MarketSnapshot {
  seedKeyword: string;
  category: string | null;
  searchVolumeMonthly: number | null;
  avgPrice: number | null;
  avgRating: number | null;
  avgReviewCount: number | null;
  competitorCount: number | null;
  opportunityScore: number | null;
  competitionScore: number | null;
  trendingKeywords: Array<{ keyword: string; volume: number | null; growth?: string | null }>;
  provider?: string;
  transport?: string;
  mode?: 'LIVE' | 'CACHED' | 'MOCK' | 'DEGRADED';
  capturedAt?: string;
  evidence?: ResearchEvidenceItem[];
}

interface SearchProductItem {
  asin: string;
  title: string;
  brand: string | null;
  category: string | null;
  price: number | null;
  monthlySales: number | null;
  monthlyRevenue: number | null;
  rating: number | null;
  reviewCount: number | null;
  bsr: number | null;
  imageUrl?: string | null;
  sourceUrl?: string | null;
}

interface KeywordMetricData {
  keyword: string;
  searchVolume: number | null;
  competition: number | null;
  cpc: number | null;
  abaRank?: number | null;
  topAsins?: string[] | null;
}

interface CompositeTraceStep {
  step: string;
  toolName: string;
  durationMs: number;
  credits: number;
  success: boolean;
  itemCount?: number;
  error?: string;
}

interface SearchProductResponse {
  query?: { keyword: string; marketplace?: string };
  keywordMetric?: KeywordMetricData | null;
  products: SearchProductItem[];
  total: number;
  evidence?: ResearchEvidenceItem[];
  provider: string;
  transport?: string;
  mode: string;
  compositeTrace?: {
    steps: CompositeTraceStep[];
    totalDurationMs: number;
    totalCredits: number;
  };
  capturedAt?: string;
}

interface LegacyProductOpportunity {
  id: string;
  title: string;
  problemSummary: string;
  targetCustomer: string;
  recommendedPositioning: string;
  opportunityScore: number;
  confidenceLevel: number;
  evidenceSummary: string;
  status: string;
}

interface TrendPoint {
  date: string;
  value: number | null;
}

interface TrendSummaryData {
  startValue: number | null;
  endValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  averageValue: number | null;
  changeAbsolute: number | null;
  changePercent: number | null;
  direction: string;
}

interface TrendItem {
  source: string;
  marketplace: string;
  subjectId?: string;
  metric: string;
  points: TrendPoint[];
  summary?: TrendSummaryData;
  metadata?: Record<string, any>;
}

interface TrendResponse {
  trend?: TrendItem | null;
  trends: TrendItem[];
  provider: string;
  transport?: string;
  mode: string;
  capturedAt: string;
  metadata?: {
    asin?: string;
    range?: string;
    days?: number;
    categoryTree?: Array<{ categoryId: string; name: string; root: boolean }>;
    dateRangeNotice?: string;
    totalCredits?: number;
    cacheHit?: boolean;
    cachedAt?: string;
    evidence?: ResearchEvidenceItem[];
  };
  evidence?: ResearchEvidenceItem[];
}

interface VocAnalysisScopeItem {
  type: string;
  targetAsin?: string;
  query?: string;
  totalAnalyzedItems: number;
  exactProductItems: number;
  brandProductItems: number;
  categoryItems: number;
  genericItems: number;
  uniqueSourcePages: number;
  uniqueAuthors?: number;
  sourceDistribution?: Record<string, number>;
  domainDistribution?: Record<string, number>;
}

interface VocEvidenceQuoteItem {
  quoteText: string;
  reviewDate?: string | null;
  rating?: number | null;
  reviewer?: string | null;
  url?: string | null;
  sourceType?: string | null;
  scope?: string | null;
}

interface VocPainPointItem {
  topic: string;
  category?: string | null;
  frequency?: number | null;
  percentage?: number | null;
  sampleSize?: number | null;
  scope?: string | null;
  denominatorText?: string | null;
  severity?: 'HIGH' | 'MEDIUM' | 'LOW';
  quotes: VocEvidenceQuoteItem[];
}

interface VocPraisePointItem {
  topic: string;
  category?: string | null;
  frequency?: number | null;
  percentage?: number | null;
  sampleSize?: number | null;
  scope?: string | null;
  denominatorText?: string | null;
  quotes: VocEvidenceQuoteItem[];
}

interface VocBuyerMotivationItem {
  motivation: string;
  frequency?: number | null;
  percentage?: number | null;
  sampleSize?: number | null;
  scope?: string | null;
  denominatorText?: string | null;
  quotes?: string[];
}

interface VocUseCaseItem {
  useCase: string;
  frequency?: number | null;
  percentage?: number | null;
  sampleSize?: number | null;
  scope?: string | null;
  denominatorText?: string | null;
}

interface VocDesiredFeatureItem {
  feature: string;
  frequency?: number | null;
  percentage?: number | null;
  sampleSize?: number | null;
  scope?: string | null;
  denominatorText?: string | null;
}

interface VocAnalysisData {
  asin: string;
  marketplace: string;
  vocSourceType?: string;
  analysisScope?: VocAnalysisScopeItem;
  totalReviewCount?: number | null;
  analyzedReviewCount?: number | null;
  totalReviewsAnalyzed?: number | null;
  averageRating: number | null;
  ratingDistribution?: Record<string, number> | null;
  painPoints?: VocPainPointItem[];
  praisePoints?: VocPraisePointItem[];
  buyerMotivations?: VocBuyerMotivationItem[];
  useCases?: VocUseCaseItem[];
  questions?: Array<{ question: string; frequency?: number | null; percentage?: number | null; sampleSize?: number | null; scope?: string | null; denominatorText?: string | null }>;
  desiredFeatures?: VocDesiredFeatureItem[];
  rawTexts?: any[];
  summary: string;
  evidenceNotice: string;
  supportedDimensions?: string[];
  unsupportedDimensions?: string[];
}

interface VocResponse {
  success?: boolean;
  voc?: VocAnalysisData | null;
  health?: VocAnalysisData | null;
  provider: string;
  transport?: string;
  mode: string;
  capturedAt: string;
  evidence?: ResearchEvidenceItem[];
}

export default function MarketResearchPage() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [opportunities, setOpportunities] = useState<LegacyProductOpportunity[]>([]);
  const [searchResult, setSearchResult] = useState<SearchProductResponse | null>(null);
  const [opportunityDecision, setOpportunityDecision] = useState<DomainProductOpportunity | null>(null);
  const [opportunityLoading, setOpportunityLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [keywordInput, setKeywordInput] = useState('toothbrush holder');
  const [marketplaceInput, setMarketplaceInput] = useState('AMAZON_US');
  const [showEvidence, setShowEvidence] = useState(false);

  // Phase 4: On-demand Product Trend Modal state
  const [trendModalAsin, setTrendModalAsin] = useState<string | null>(null);
  const [trendRange, setTrendRange] = useState<'30d' | '90d' | '180d' | '365d'>('30d');
  const [trendLoading, setTrendLoading] = useState<boolean>(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<TrendResponse | null>(null);

  // Phase 5: On-demand VOC / Buyer Voice Modal state
  const [vocModalAsin, setVocModalAsin] = useState<string | null>(null);
  const [vocLoading, setVocLoading] = useState<boolean>(false);
  const [vocError, setVocError] = useState<string | null>(null);
  const [vocData, setVocData] = useState<VocResponse | null>(null);

  async function loadData(keyword?: string, marketplace?: string) {
    try {
      const kw = keyword !== undefined ? keyword : keywordInput;
      const mp = marketplace !== undefined ? marketplace : marketplaceInput;
      const queryParams = new URLSearchParams();
      if (kw) queryParams.set('keyword', kw);
      if (mp) queryParams.set('marketplace', mp);

      const snapUrl = `/api/v1/market-research/snapshot?${queryParams.toString()}`;
      const prodUrl = `/api/v1/market-research/products?${queryParams.toString()}&limit=5`;
      const oppUrl = `/api/v1/market-research/opportunity?${queryParams.toString()}`;
      const legacyOppUrl = `/api/v1/product-opportunities?${queryParams.toString()}`;

      const [snapRes, oppRes, prodRes, oppDecRes] = await Promise.allSettled([
        ApiClient.get<MarketSnapshot>(snapUrl),
        ApiClient.get<LegacyProductOpportunity[]>(legacyOppUrl),
        ApiClient.get<SearchProductResponse>(prodUrl),
        ApiClient.get<DomainProductOpportunity>(oppUrl),
      ]);

      if (snapRes.status === 'fulfilled') {
        setSnapshot(snapRes.value);
      }
      if (oppRes.status === 'fulfilled' && Array.isArray(oppRes.value)) {
        setOpportunities(oppRes.value);
      }
      if (prodRes.status === 'fulfilled' && prodRes.value) {
        setSearchResult(prodRes.value);
      }
      if (oppDecRes.status === 'fulfilled' && oppDecRes.value) {
        setOpportunityDecision(oppDecRes.value);
      }
    } catch (err) {
      console.error('无法载入市场调研数据:', err);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }

  async function handleRefreshOpportunity(skipCache = false) {
    setOpportunityLoading(true);
    try {
      const kw = keywordInput.trim() || 'marble toothbrush holder';
      const mp = marketplaceInput;
      const url = `/api/v1/market-research/opportunity?keyword=${encodeURIComponent(kw)}&marketplace=${encodeURIComponent(mp)}${skipCache ? '&skipCache=true' : ''}`;
      const res = await ApiClient.get<DomainProductOpportunity>(url);
      setOpportunityDecision(res);
    } catch (err) {
      console.error('重新评估选品机会决策失败:', err);
    } finally {
      setOpportunityLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywordInput.trim()) return;
    setSearching(true);
    loadData(keywordInput.trim(), marketplaceInput);
  };

  async function fetchTrendData(asin: string, range: string) {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const url = `/api/v1/market-research/trend?asin=${encodeURIComponent(asin)}&range=${range}&marketplace=${encodeURIComponent(marketplaceInput)}`;
      const res = await ApiClient.get<TrendResponse>(url);
      setTrendData(res);
    } catch (err: any) {
      setTrendError(err.message || '获取商品历史趋势失败');
      setTrendData(null);
    } finally {
      setTrendLoading(false);
    }
  }

  function handleOpenTrendModal(asin: string) {
    setTrendModalAsin(asin);
    fetchTrendData(asin, trendRange);
  }

  function handleChangeTrendRange(newRange: '30d' | '90d' | '180d' | '365d') {
    setTrendRange(newRange);
    if (trendModalAsin) {
      fetchTrendData(trendModalAsin, newRange);
    }
  }

  async function fetchVocData(asin: string) {
    setVocLoading(true);
    setVocError(null);
    try {
      const [healthRes, vocRes] = await Promise.all([
        ApiClient.get<any>(
          `/api/v1/market-research/review-health?asin=${encodeURIComponent(asin)}&marketplace=${encodeURIComponent(marketplaceInput)}`,
        ).catch(() => null),
        ApiClient.get<any>(
          `/api/v1/market-research/voc?asin=${encodeURIComponent(asin)}&marketplace=${encodeURIComponent(marketplaceInput)}`,
        ).catch(() => null),
      ]);
      const healthData = healthRes?.health || healthRes?.voc;
      const textVocData = vocRes?.voc || vocRes?.health;

      setVocData({
        success: true,
        provider: `${healthRes?.provider || 'xydc'} + ${vocRes?.provider || 'firecrawl'}`,
        mode: vocRes?.mode || healthRes?.mode || 'LIVE',
        capturedAt: new Date().toISOString(),
        evidence: vocRes?.evidence || healthRes?.evidence || [],
        voc: {
          asin,
          marketplace: marketplaceInput,
          averageRating: healthData?.averageRating ?? textVocData?.averageRating,
          totalReviewCount: healthData?.totalReviewCount ?? textVocData?.totalReviewCount,
          analyzedReviewCount: textVocData?.analyzedReviewCount ?? healthData?.analyzedReviewCount,
          ratingDistribution: healthData?.ratingDistribution ?? textVocData?.ratingDistribution,
          vocSourceType: textVocData?.vocSourceType || 'EXTERNAL_VOC',
          analysisScope: textVocData?.analysisScope,
          painPoints: textVocData?.painPoints || [],
          praisePoints: textVocData?.praisePoints || [],
          buyerMotivations: textVocData?.buyerMotivations || [],
          useCases: textVocData?.useCases || [],
          questions: textVocData?.questions || [],
          desiredFeatures: textVocData?.desiredFeatures || [],
          rawTexts: textVocData?.rawTexts || [],
          summary: textVocData?.summary || healthData?.summary,
          evidenceNotice: textVocData?.evidenceNotice || healthData?.evidenceNotice,
        },
      });
    } catch (err: any) {
      setVocError(err.message || '获取商品评论与原声数据失败');
      setVocData(null);
    } finally {
      setVocLoading(false);
    }
  }

  function handleOpenVocModal(asin: string) {
    setVocModalAsin(asin);
    fetchVocData(asin);
  }

  if (loading && !snapshot) {
    return (
      <div className="py-20 text-center text-gray-400 text-sm flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        <span>正在通过 Provider Framework 检索市场与选品数据...</span>
      </div>
    );
  }

  const currentMode = searchResult?.mode || snapshot?.mode || 'MOCK';
  const currentProvider = searchResult?.provider || snapshot?.provider || 'mock';
  const currentTransport = searchResult?.transport || snapshot?.transport || 'NATIVE';
  const lastSyncTime = searchResult?.capturedAt || snapshot?.capturedAt;
  const combinedEvidence: ResearchEvidenceItem[] = [
    ...(searchResult?.evidence || []),
    ...(snapshot?.evidence || []),
  ].filter((v, i, a) => a.findIndex((t) => t.evidenceId === v.evidenceId) === i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="cp-title">市场调研</h1>
            <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2 py-0.5 rounded border border-blue-500/30">
              市场调研与选品机会
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Amazon 宏观大盘 • 核心词大盘态势与 VOC 选品机会卡 • 集成 Provider Framework 数据接入
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/app/competitors"
            className="flex items-center space-x-1.5 bg-surface-elevated hover:bg-surface border border-border text-gray-200 text-xs font-semibold px-3 py-2 rounded-lg transition"
          >
            <Users className="w-3.5 h-3.5 text-purple-400" />
            <span>进入竞品与 VOC 证据下钻</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Integration Provider & Governance Status Banner */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400">数据源通道:</span>
              <span className="text-sm font-semibold text-white">
                {currentProvider === 'xydc' ? '西柚洞察 (XYDC)' : '模拟数据源 (MockMarketProvider)'}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-surface-elevated text-gray-300">
                传输通道: {currentTransport}
              </span>
              {currentMode === 'LIVE' ? (
                <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>LIVE 实时连通</span>
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  <span>{currentMode === 'DEGRADED' ? 'DEGRADED 降级保护' : 'MOCK 确定性仿真'}</span>
                </span>
              )}
            </div>
            <div className="flex items-center space-x-4 text-xs text-gray-400 mt-1">
              <span className="flex items-center space-x-1">
                <Clock className="w-3 h-3 text-gray-500" />
                <span>捕获时间: {lastSyncTime ? new Date(lastSyncTime).toLocaleString() : '最新'}</span>
              </span>
              <span className="flex items-center space-x-1 text-emerald-400/90">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>凭据脱敏已生效</span>
              </span>
            </div>
          </div>
        </div>

        {/* Evidence Toggle Button */}
        {combinedEvidence.length > 0 && (
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center space-x-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-3 py-1.5 rounded-lg transition"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{showEvidence ? '隐藏事实凭证' : `查看事实凭证 (${combinedEvidence.length})`}</span>
          </button>
        )}
      </div>

      {/* Expandable Evidence Drawer */}
      {showEvidence && combinedEvidence.length > 0 && (
        <div className="bg-surface-elevated border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>结构化事实凭证链</span>
            </h4>
            <span className="text-[10px] text-gray-400 font-mono">不可篡改真实依据记录</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {combinedEvidence.map((evi) => (
              <div key={evi.evidenceId} className="bg-surface border border-border/80 rounded-lg p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{evi.title || '凭证记录'}</span>
                  <span className="text-[10px] font-mono text-gray-400 bg-surface-elevated px-1.5 py-0.5 rounded border border-border">
                    {evi.type} • {evi.mode}
                  </span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">{evi.content}</p>
                <div className="text-[10px] text-gray-500 pt-1 flex items-center justify-between border-t border-border/40">
                  <span>ID: {evi.evidenceId}</span>
                  <span>Provider: {evi.providerId}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Query Bar */}
      <form onSubmit={handleSearch} className="bg-surface border border-border rounded-xl p-4 flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="输入调研核心词 (如: ergonomic office chair, wireless earbuds, marble toothbrush holder)..."
            className="w-full bg-surface-elevated border border-border rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        <select
          value={marketplaceInput}
          onChange={(e) => setMarketplaceInput(e.target.value)}
          className="w-full md:w-44 bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
        >
          <option value="AMAZON_US">Amazon 美国站 (US)</option>
          <option value="AMAZON_UK">Amazon 英国站 (UK)</option>
          <option value="AMAZON_DE">Amazon 德国站 (DE)</option>
          <option value="AMAZON_JP">Amazon 日本站 (JP)</option>
        </select>

        <button
          type="submit"
          disabled={searching}
          className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-5 py-2 rounded-lg transition flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
        >
          {searching ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>查询中...</span>
            </>
          ) : (
            <>
              <Search className="w-3.5 h-3.5" />
              <span>执行大盘调研</span>
            </>
          )}
        </button>
      </form>

      {/* Phase 7 / 7.1: Product Research Decision Layer - Heuristic Opportunity Score V1 */}
      {opportunityDecision && (
        <div className="bg-surface border border-border rounded-xl p-6 shadow-sm space-y-6">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Gauge className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-white tracking-wide">
                  02.5 规则型选品机会评分 (Heuristic Opportunity Score V1)
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold">
                  {opportunityDecision.scoreVersion} ({opportunityDecision.methodology})
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold">
                  {opportunityDecision.calibrationStatus} · 相对排序模型
                </span>
                {opportunityDecision.evidenceStatus === 'SUFFICIENT' ? (
                  <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>证据充足 (SUFFICIENT)</span>
                  </span>
                ) : opportunityDecision.evidenceStatus === 'DEGRADED_PASS' ? (
                  <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>降级通过 (DEGRADED_PASS)</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2.5 py-0.5 rounded flex items-center space-x-1">
                    <X className="w-3.5 h-3.5" />
                    <span>证据不足 (INSUFFICIENT)</span>
                  </span>
                )}
                <span className="text-[11px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 rounded">
                  置信度: {opportunityDecision.confidence} ({(opportunityDecision.confidenceScore * 100).toFixed(0)}%)
                </span>
              </div>
              <p className="text-xs text-gray-400">
                启发式规则模型 • 未经过真实转化率校准 • 纯代码确定性公式加权计算 • 仅作相对机会比较与品类初筛，非绝对销量或成功率保证
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleRefreshOpportunity(true)}
                disabled={opportunityLoading}
                className="bg-surface-elevated hover:bg-surface border border-border text-gray-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${opportunityLoading ? 'animate-spin' : ''}`} />
                <span>重新评估决策</span>
              </button>
            </div>
          </div>

          {/* Scope Disclosure Banner */}
          {opportunityDecision.scopeDisclosure && (
            <div className="bg-surface-elevated/80 border border-border/80 rounded-lg p-3.5 text-xs space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-300 flex items-center space-x-1">
                  <Compass className="w-3.5 h-3.5 text-blue-400" />
                  <span>决策作用域:</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono text-[11px]">
                  {opportunityDecision.scopeDisclosure.decisionScope} (品类级市场机会)
                </span>
                {opportunityDecision.scopeDisclosure.representativeAsin && (
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono text-[11px]">
                    标杆参照: {opportunityDecision.scopeDisclosure.representativeAsin}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded bg-gray-500/10 text-gray-300 border border-gray-500/20 text-[11px]">
                  头部竞品样本: {opportunityDecision.scopeDisclosure.productSampleSize} 款
                </span>
                <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[11px]">
                  VOC 范围: {opportunityDecision.scopeDisclosure.vocScope} ({opportunityDecision.scopeDisclosure.vocContentKind} · {opportunityDecision.scopeDisclosure.vocSampleSize} 条)
                </span>
              </div>
              <div className="text-[11px] text-gray-400 leading-normal pl-4 border-l-2 border-blue-500/40">
                {opportunityDecision.scopeDisclosure.targetEntityNotice}
              </div>
            </div>
          )}

          {/* Hero Row: Overall Score Gauge & Cost Budget */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Score Card */}
            <div className="bg-surface-elevated border border-border rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Heuristic Opportunity Score V1
                </span>
                <span className="text-xs text-gray-400">0 - 100 相对排序评分</span>
              </div>

              <div className="flex items-baseline space-x-3">
                <span className="text-5xl font-black text-white tracking-tight font-mono">
                  {opportunityDecision.overallScore !== null ? opportunityDecision.overallScore : '—'}
                </span>
                <span className="text-lg text-gray-400 font-mono">/ 100</span>
                {opportunityDecision.overallScore !== null && (
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded ml-2 ${
                      opportunityDecision.overallScore >= 75
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : opportunityDecision.overallScore >= 60
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {opportunityDecision.overallScore >= 75
                      ? '高潜力优选'
                      : opportunityDecision.overallScore >= 60
                      ? '中等机会'
                      : '谨慎观望'}
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-surface rounded-full h-2.5 overflow-hidden border border-border">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${
                    (opportunityDecision.overallScore || 0) >= 75
                      ? 'bg-emerald-500'
                      : (opportunityDecision.overallScore || 0) >= 60
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, opportunityDecision.overallScore || 0))}%` }}
                ></div>
              </div>

              <div className="text-[11px] text-gray-400">
                {opportunityDecision.missingSignals.length > 0 ? (
                  <span className="text-amber-400">
                    注：{opportunityDecision.missingSignals.join(', ')} 信号缺失，其余信号权重已动态重归一化 (Sum = 100%)。
                  </span>
                ) : (
                  <span className="text-emerald-400">
                    ✓ 6 项市场信号全量可用，加权贡献无遗漏。
                  </span>
                )}
              </div>
            </div>

            {/* Executive Natural Language Synthesis */}
            <div className="lg:col-span-2 bg-surface-elevated border border-border rounded-xl p-5 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center space-x-2 border-b border-border/50 pb-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    决策层执行综述
                  </span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed mt-3">
                  {opportunityDecision.explanation.summary}
                </p>
              </div>

              {/* Cost & Resource Budget */}
              <div className="bg-surface border border-border/60 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px]">
                <div>
                  <span className="text-gray-400 block text-[10px]">XYDC 消耗</span>
                  <span className="font-bold text-blue-400 font-mono">
                    {opportunityDecision.costBudget.xydcCredits} Credits
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Firecrawl 消耗</span>
                  <span className="font-bold text-orange-400 font-mono">
                    {opportunityDecision.costBudget.firecrawlCredits} Credits
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">总请求数</span>
                  <span className="font-bold text-gray-200 font-mono">
                    {opportunityDecision.costBudget.totalRequests} 次
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">缓存命中</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {opportunityDecision.costBudget.cacheHits} 次
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">预估总成本</span>
                  <span className="font-bold text-purple-400 font-mono text-[10px]">
                    {opportunityDecision.costBudget.estimatedCostUsd !== null
                      ? `$${opportunityDecision.costBudget.estimatedCostUsd.toFixed(4)}`
                      : '未接计费接口'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Structured Facts Boundary Section: Strengths, Risks, Opportunities */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Strengths */}
            <div className="bg-surface-elevated border border-border rounded-xl p-4 space-y-2.5">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400 border-b border-border/50 pb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>市场优势与客观事实</span>
              </div>
              <div className="space-y-2">
                {opportunityDecision.strengths.map((fact, idx) => (
                  <div key={idx} className="text-xs bg-surface border border-border/50 p-2.5 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                        [{fact.level}] {fact.code}
                      </span>
                    </div>
                    <p className="text-gray-300 leading-snug">{fact.statement}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Risks */}
            <div className="bg-surface-elevated border border-border rounded-xl p-4 space-y-2.5">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-400 border-b border-border/50 pb-2">
                <AlertCircle className="w-4 h-4" />
                <span>竞争壁垒与数据风险</span>
              </div>
              <div className="space-y-2">
                {opportunityDecision.risks.map((fact, idx) => (
                  <div key={idx} className="text-xs bg-surface border border-border/50 p-2.5 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        [{fact.level}] {fact.code}
                      </span>
                    </div>
                    <p className="text-gray-300 leading-snug">{fact.statement}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Actionable Recommendations */}
            <div className="bg-surface-elevated border border-border rounded-xl p-4 space-y-2.5">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-purple-400 border-b border-border/50 pb-2">
                <Lightbulb className="w-4 h-4" />
                <span>VOC 机会与改良建议</span>
              </div>
              <div className="space-y-2">
                {opportunityDecision.opportunities.map((fact, idx) => (
                  <div key={idx} className="text-xs bg-surface border border-border/50 p-2.5 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                        fact.level === 'RECOMMENDATION'
                          ? 'text-purple-400 bg-purple-500/10 border-purple-500/20'
                          : 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                      }`}>
                        [{fact.level}] {fact.code}
                      </span>
                    </div>
                    <p className="text-gray-300 leading-snug">{fact.statement}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Six Market Signals Interactive Matrix */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 border-b border-border pb-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                六大市场信号逐项解析
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {/* Signal 1: Demand */}
              <div className="bg-surface-elevated border border-border rounded-lg p-4 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <span>1. 市场需求</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                        {opportunityDecision.signals.demand.scope}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">
                      权重: {((opportunityDecision.signals.demand.weight || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-blue-400">
                      {opportunityDecision.signals.demand.normalizedScore ?? '—'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      贡献: +{opportunityDecision.signals.demand.contribution ?? 0}分
                    </span>
                  </div>

                  <div className="bg-surface p-2 rounded border border-border/50 text-[11px] space-y-1 mt-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">周搜索量:</span>
                      <span className="text-white font-mono font-semibold">
                        {opportunityDecision.signals.demand.rawMetrics.weeklySearchVolume?.toLocaleString() || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">ABA 排名:</span>
                      <span className="text-white font-mono font-semibold">
                        {opportunityDecision.signals.demand.rawMetrics.abaRank ? `#${opportunityDecision.signals.demand.rawMetrics.abaRank.toLocaleString()}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-gray-400 pt-2 border-t border-border/40">
                  {opportunityDecision.signals.demand.findings[0] || '需求稳定'}
                </div>
              </div>

              {/* Signal 2: Competition */}
              <div className="bg-surface-elevated border border-border rounded-lg p-4 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <span>2. 竞争友好度</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                        {opportunityDecision.signals.competition.scope}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">
                      权重: {((opportunityDecision.signals.competition.weight || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-emerald-400">
                      {opportunityDecision.signals.competition.normalizedScore ?? '—'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      贡献: +{opportunityDecision.signals.competition.contribution ?? 0}分
                    </span>
                  </div>

                  <div className="bg-surface p-2 rounded border border-border/50 text-[11px] space-y-1 mt-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">竞品均评:</span>
                      <span className="text-white font-mono font-semibold">
                        {opportunityDecision.signals.competition.rawMetrics.topAsinAvgReviews ? `${opportunityDecision.signals.competition.rawMetrics.topAsinAvgReviews} 条` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">壁垒反向映射:</span>
                      <span className="text-emerald-400 font-mono font-semibold">
                        难度 {opportunityDecision.signals.competition.rawMetrics.competitiveDifficulty ?? '—'}/100
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-gray-400 pt-2 border-t border-border/40">
                  {opportunityDecision.signals.competition.findings[0] || '竞争格局适中'}
                </div>
              </div>

              {/* Signal 3: Commercial */}
              <div className="bg-surface-elevated border border-border rounded-lg p-4 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <span>3. 商业价格</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                        {opportunityDecision.signals.commercial.scope}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">
                      权重: {((opportunityDecision.signals.commercial.weight || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-purple-400">
                      {opportunityDecision.signals.commercial.normalizedScore ?? '—'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      贡献: +{opportunityDecision.signals.commercial.contribution ?? 0}分
                    </span>
                  </div>

                  <div className="bg-surface p-2 rounded border border-border/50 text-[11px] space-y-1 mt-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">零售均价:</span>
                      <span className="text-emerald-400 font-mono font-semibold">
                        {opportunityDecision.signals.commercial.rawMetrics.avgPrice ? `$${opportunityDecision.signals.commercial.rawMetrics.avgPrice.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">价格稳定性:</span>
                      <span className="text-white font-mono font-semibold">
                        {opportunityDecision.signals.commercial.rawMetrics.priceStability === 'STABLE' ? '稳定 (STABLE)' : '波动 (VOLATILE)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-gray-400 pt-2 border-t border-border/40">
                  {opportunityDecision.signals.commercial.findings[0] || '价格带健康'}
                </div>
              </div>

              {/* Signal 4: Trend */}
              <div className="bg-surface-elevated border border-border rounded-lg p-4 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <span>4. 趋势动量</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                        {opportunityDecision.signals.trend.scope}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">
                      权重: {((opportunityDecision.signals.trend.weight || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-amber-400">
                      {opportunityDecision.signals.trend.normalizedScore ?? '—'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      贡献: +{opportunityDecision.signals.trend.contribution ?? 0}分
                    </span>
                  </div>

                  <div className="bg-surface p-2 rounded border border-border/50 text-[11px] space-y-1 mt-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">BSR 走向:</span>
                      <span className="text-white font-mono font-semibold">
                        {opportunityDecision.signals.trend.rawMetrics.bsrDirection === 'RANK_IMPROVED'
                          ? '名次上升'
                          : opportunityDecision.signals.trend.rawMetrics.bsrDirection === 'RANK_DECLINED'
                            ? '名次下降'
                            : '名次平稳'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">排名含义:</span>
                      <span className="text-emerald-400 font-mono font-semibold">
                        {opportunityDecision.signals.trend.rawMetrics.bsrDirection === 'RANK_IMPROVED' ? '名次上升 (销量走强)' : '名次平稳'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-gray-400 pt-2 border-t border-border/40">
                  {opportunityDecision.signals.trend.findings[0] || '动量跟踪中'}
                </div>
              </div>

              {/* Signal 5: Review Health */}
              <div className="bg-surface-elevated border border-border rounded-lg p-4 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <span>5. 评价健康度</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20 font-mono">
                        {opportunityDecision.signals.reviewHealth.scope}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">
                      权重: {((opportunityDecision.signals.reviewHealth.weight || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-teal-400">
                      {opportunityDecision.signals.reviewHealth.normalizedScore ?? '—'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      贡献: +{opportunityDecision.signals.reviewHealth.contribution ?? 0}分
                    </span>
                  </div>

                  <div className="bg-surface p-2 rounded border border-border/50 text-[11px] space-y-1 mt-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">主流星级:</span>
                      <span className="text-white font-mono font-semibold">
                        {opportunityDecision.signals.reviewHealth.rawMetrics.averageRating ? `⭐ ${opportunityDecision.signals.reviewHealth.rawMetrics.averageRating}` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">总评价数:</span>
                      <span className="text-white font-mono font-semibold">
                        {opportunityDecision.signals.reviewHealth.rawMetrics.totalReviewCount?.toLocaleString() || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-gray-400 pt-2 border-t border-border/40">
                  {opportunityDecision.signals.reviewHealth.findings[0] || '定量健康度'}
                </div>
              </div>

              {/* Signal 6: VOC Opportunity */}
              <div className="bg-surface-elevated border border-border rounded-lg p-4 space-y-2.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <span>6. VOC 用户心声机会</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20 font-mono">
                        {opportunityDecision.signals.voc.scope}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">
                      权重: {((opportunityDecision.signals.voc.weight || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-orange-400">
                      {opportunityDecision.signals.voc.normalizedScore ?? '—'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      贡献: +{opportunityDecision.signals.voc.contribution ?? 0}分
                    </span>
                  </div>

                  <div className="bg-surface p-2 rounded border border-border/50 text-[11px] space-y-1 mt-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">核心痛点提及率:</span>
                      <span className="text-orange-400 font-mono font-semibold">
                        {opportunityDecision.signals.voc.rawMetrics.topPainPointPercentage}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">文本来源范围:</span>
                      <span className="text-white font-mono font-semibold">
                        {opportunityDecision.signals.voc.rawMetrics.scope} ({opportunityDecision.signals.voc.rawMetrics.contentKind})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-gray-400 pt-2 border-t border-border/40">
                  {opportunityDecision.signals.voc.findings[0] || '外部 VOC 挖掘'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real XYDC Composite Search: Keyword Intelligence Card */}
      {searchResult?.keywordMetric && (
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                搜索词市场情报
              </h3>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                {searchResult.keywordMetric.keyword}
              </span>
            </div>
            {searchResult.compositeTrace && (
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400 font-mono">
                <span className="bg-surface-elevated px-2 py-0.5 rounded border border-border">
                  复合执行耗时: {searchResult.compositeTrace.totalDurationMs}ms
                </span>
                <span className="bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded border border-purple-500/20 font-semibold">
                  消耗额度: {searchResult.compositeTrace.totalCredits} Credits
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-surface-elevated border border-border p-3.5 rounded-lg">
              <span className="text-xs text-gray-400">周/月搜索量</span>
              <div className="text-xl font-bold text-white mt-1">
                {searchResult.keywordMetric.searchVolume != null
                  ? searchResult.keywordMetric.searchVolume.toLocaleString()
                  : '—'}
              </div>
              <span className="text-[10px] text-gray-400">Amazon ABA 官方周报告</span>
            </div>

            <div className="bg-surface-elevated border border-border p-3.5 rounded-lg">
              <span className="text-xs text-gray-400">ABA 搜索排名</span>
              <div className="text-xl font-bold text-white mt-1">
                {searchResult.keywordMetric.abaRank != null
                  ? `#${searchResult.keywordMetric.abaRank.toLocaleString()}`
                  : '—'}
              </div>
              <span className="text-[10px] text-gray-400">全站点搜索频率排名</span>
            </div>

            <div className="bg-surface-elevated border border-border p-3.5 rounded-lg">
              <span className="text-xs text-gray-400">点击单价 (CPC)</span>
              <div className="text-xl font-bold text-emerald-400 mt-1">
                {searchResult.keywordMetric.cpc != null
                  ? `$${searchResult.keywordMetric.cpc.toFixed(2)}`
                  : '—'}
              </div>
              <span className="text-[10px] text-gray-400">大盘建议竞价均值</span>
            </div>

            <div className="bg-surface-elevated border border-border p-3.5 rounded-lg">
              <span className="text-xs text-gray-400">竞争难度</span>
              <div className="text-xl font-bold text-amber-400 mt-1">
                {searchResult.keywordMetric.competition != null
                  ? `${(searchResult.keywordMetric.competition * 100).toFixed(0)}%`
                  : '—'}
              </div>
              <span className="text-[10px] text-gray-400">自然排位与投放难度</span>
            </div>
          </div>
        </div>
      )}

      {/* Real XYDC Composite Search: Top Products Card */}
      {searchResult?.products && searchResult.products.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                核心头部竞品 (ABA 头部 ASIN 批量穿透)
              </h3>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-semibold">
                {searchResult.products.length} 款已检索
              </span>
            </div>
            <span className="text-xs text-gray-400">
              数据源由 XYDC get_asin_info 批量提取，未提供字段严格呈现为 —
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {searchResult.products.map((prod) => (
              <div
                key={prod.asin}
                className="bg-surface-elevated border border-border rounded-lg p-4 flex flex-col justify-between space-y-3 hover:border-blue-500/50 transition"
              >
                <div className="flex items-start space-x-3">
                  {prod.imageUrl ? (
                    <img
                      src={prod.imageUrl}
                      alt={prod.title}
                      className="w-16 h-16 object-cover rounded border border-border flex-shrink-0 bg-white"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-surface rounded border border-border flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                      无图片
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-blue-400">
                        {prod.asin}
                      </span>
                      {prod.sourceUrl && (
                        <a
                          href={prod.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-gray-400 hover:text-white underline"
                        >
                          Amazon
                        </a>
                      )}
                    </div>
                    <h4 className="text-xs font-semibold text-white truncate mt-1" title={prod.title}>
                      {prod.title}
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      品牌: <span className="text-gray-300">{prod.brand || '—'}</span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-border/50 pt-2 text-center text-xs">
                  <div>
                    <span className="text-[10px] text-gray-400 block">售价</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      {prod.price != null ? `$${prod.price.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">星级评分</span>
                    <span className="font-bold text-white font-mono">
                      {prod.rating != null ? `⭐ ${prod.rating.toFixed(1)}` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">评价数</span>
                    <span className="font-bold text-gray-300 font-mono">
                      {prod.reviewCount != null ? prod.reviewCount.toLocaleString() : '—'}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenTrendModal(prod.asin)}
                    className="flex items-center justify-center space-x-1 py-1.5 px-2 rounded text-xs font-semibold bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600 hover:text-white transition cursor-pointer"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>历史趋势</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenVocModal(prod.asin)}
                    className="flex items-center justify-center space-x-1 py-1.5 px-2 rounded text-xs font-semibold bg-purple-600/10 text-purple-400 border border-purple-500/20 hover:bg-purple-600 hover:text-white transition cursor-pointer"
                  >
                    <Star className="w-3.5 h-3.5" />
                    <span>评论概览</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market Overview Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-surface border border-border p-4 rounded-xl">
          <span className="text-xs text-gray-400">月搜索量</span>
          <div className="text-lg font-bold text-white mt-1">
            {snapshot?.searchVolumeMonthly != null ? snapshot.searchVolumeMonthly.toLocaleString() : '—'}
          </div>
          <span className="text-[10px] text-gray-400 mt-0.5 block">
            {snapshot?.searchVolumeMonthly != null && snapshot.searchVolumeMonthly > 0 ? '月度检索体量' : '—'}
          </span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <span className="text-xs text-gray-400">类目均价</span>
          <div className="text-lg font-bold text-white mt-1">
            {snapshot?.avgPrice != null ? `$${snapshot.avgPrice.toFixed(2)}` : '—'}
          </div>
          <span className="text-[10px] text-gray-400 mt-0.5 block">
            {snapshot?.avgPrice != null && snapshot.avgPrice > 0 ? '样本平均售价' : '—'}
          </span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <span className="text-xs text-gray-400">类目均评分</span>
          <div className="text-lg font-bold text-white mt-1">
            {snapshot?.avgRating != null ? `⭐ ${snapshot.avgRating.toFixed(1)}` : '—'}
          </div>
          <span className="text-[10px] text-gray-400 mt-0.5 block">
            {snapshot?.avgRating != null && snapshot.avgRating > 0 ? '样本平均星级' : '—'}
          </span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <span className="text-xs text-gray-400">平均评论数</span>
          <div className="text-lg font-bold text-white mt-1">
            {snapshot?.avgReviewCount != null ? snapshot.avgReviewCount.toLocaleString() : '—'}
          </div>
          <span className="text-[10px] text-gray-400 mt-0.5 block">
            {snapshot?.avgReviewCount != null && snapshot.avgReviewCount > 0 ? '样本平均评价数' : '—'}
          </span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <span className="text-xs text-gray-400">机会评分</span>
          <div className="text-lg font-bold text-emerald-400 mt-1">
            {snapshot?.opportunityScore != null ? `${snapshot.opportunityScore} / 10` : '—'}
          </div>
          <span className="text-[10px] text-emerald-400 mt-0.5 block">
            {snapshot?.opportunityScore != null && snapshot.opportunityScore > 0
              ? (snapshot.opportunityScore >= 8 ? '高机会潜力' : snapshot.opportunityScore >= 5 ? '中等机会潜力' : '低机会潜力')
              : '—'}
          </span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <span className="text-xs text-gray-400">竞争烈度</span>
          <div className="text-lg font-bold text-amber-400 mt-1">
            {snapshot?.competitionScore != null ? `${snapshot.competitionScore} / 10` : '—'}
          </div>
          <span className="text-[10px] text-amber-400 mt-0.5 block">
            {snapshot?.competitionScore != null && snapshot.competitionScore > 0
              ? (snapshot.competitionScore >= 8 ? '高竞争强度' : snapshot.competitionScore >= 5 ? '中等竞争强度' : '低竞争强度')
              : '—'}
          </span>
        </div>
      </div>

      {/* Trending Search Keywords */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <span>{(snapshot?.trendingKeywords || []).length > 0 ? '高增长买家搜索词' : '相关买家搜索词'} (基于 {snapshot?.seedKeyword || '主题词'})</span>
        </h3>

        {(snapshot?.trendingKeywords || []).length === 0 ? (
          <div className="text-xs text-gray-500 py-4 text-center border border-dashed border-border rounded-lg">
            当前数据源暂未收录相关买家趋势搜索词
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(snapshot?.trendingKeywords || []).map((k, i) => (
              <div key={i} className="bg-surface-elevated border border-border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white font-mono">{k.keyword}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    月搜索: {k.volume != null ? k.volume.toLocaleString() : '—'}
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800 px-2 py-0.5 rounded">
                  {k.growth != null ? k.growth : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product Opportunity Briefs Derived from VOC */}
      <div className="bg-surface border border-border rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>VOC 沉淀之产品定义机会卡</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              由真实买家原声 (VOC) 与差评痛点提炼，辅助生成针对「{snapshot?.seedKeyword || '当前类目'}」的差异化产品立项机会卡
            </p>
          </div>
          <span className="text-xs bg-purple-500/20 text-purple-300 font-semibold px-2.5 py-1 rounded border border-purple-500/30">
            AI 事实锚定机会卡
          </span>
        </div>

        {opportunities.length === 0 ? (
          <div className="text-xs text-gray-500 py-6 text-center border border-dashed border-border rounded-lg">
            暂无已沉淀的产品立项机会卡（需先完成品类 VOC 分析或机会评估）
          </div>
        ) : (
          <div className="space-y-4">
            {opportunities.map((opp) => (
              <div key={opp.id} className="bg-surface-elevated border border-border rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold text-white">{opp.title}</h4>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">机会得分:</span>
                    <span className="text-sm font-bold text-emerald-400">{opp.opportunityScore} / 10</span>
                    <span className="text-xs text-gray-500">| 置信度: {(opp.confidenceLevel * 100).toFixed(0)}%</span>
                  </div>
                </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="bg-surface p-3 rounded border border-border">
                  <span className="font-semibold text-rose-400">买家核心痛点</span>
                  <p className="text-gray-300 mt-1">{opp.problemSummary}</p>
                </div>
                <div className="bg-surface p-3 rounded border border-border">
                  <span className="font-semibold text-blue-400">目标客户群</span>
                  <p className="text-gray-300 mt-1">{opp.targetCustomer}</p>
                </div>
                <div className="bg-surface p-3 rounded border border-border">
                  <span className="font-semibold text-emerald-400">推荐产品定位</span>
                  <p className="text-gray-300 mt-1">{opp.recommendedPositioning}</p>
                </div>
              </div>

              <div className="text-xs text-gray-400 bg-surface/60 p-2.5 rounded border border-border/80 flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-300">依据来源: </span>
                  <span>{opp.evidenceSummary}</span>
                </div>
                <Link
                  href="/app/listings"
                  className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded flex items-center space-x-1 cursor-pointer"
                >
                  <span>直达 Listing 工作台 &rarr;</span>
                </Link>
              </div>
            </div>
          ))}
          </div>
        )}
      </div>

      {/* Phase 4: On-demand Product Trend Modal */}
      {trendModalAsin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-surface-elevated border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-white">商品多维表现历史趋势</h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                      {trendModalAsin}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    按需调取 BSR 排名走势与价格/评分日级波动 (100% 真实数据，防假默认值)
                  </p>
                </div>
              </div>

              {/* Range Selector & Close */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center bg-surface-elevated border border-border rounded-lg p-0.5 text-xs">
                  {(['30d', '90d', '180d', '365d'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleChangeTrendRange(r)}
                      className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                        trendRange === r
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {r === '30d' ? '近30天' : r === '90d' ? '近90天' : r === '180d' ? '近半年' : '近1年'}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setTrendModalAsin(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface border border-transparent hover:border-border transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {trendLoading && (
                <div className="py-20 text-center flex flex-col items-center justify-center space-y-3 text-gray-400 text-sm">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                  <span>正在通过 Provider Framework 按需查询商品趋势数据...</span>
                </div>
              )}

              {trendError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm flex items-center justify-between">
                  <span>{trendError}</span>
                  <button
                    type="button"
                    onClick={() => fetchTrendData(trendModalAsin, trendRange)}
                    className="px-3 py-1 bg-rose-600 text-white rounded text-xs font-semibold hover:bg-rose-500 transition cursor-pointer"
                  >
                    重试
                  </button>
                </div>
              )}

              {!trendLoading && !trendError && trendData && (
                <div className="space-y-6">
                  {/* Metadata Header Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface border border-border rounded-xl text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-400">数据模式:</span>
                      {trendData.mode === 'LIVE' ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center space-x-1">
                          <Activity className="w-3 h-3 mr-1" />
                          <span>实时提取 (LIVE)</span>
                        </span>
                      ) : trendData.mode === 'CACHED' ? (
                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold flex items-center space-x-1">
                          <Database className="w-3 h-3 mr-1" />
                          <span>缓存命中 (CACHED - 0 Credits)</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                          兜底模拟 ({trendData.mode})
                        </span>
                      )}
                      <span className="text-gray-500">|</span>
                      <span className="text-gray-400">服务商:</span>
                      <span className="text-white font-medium uppercase">{trendData.provider}</span>
                      {trendData.transport && (
                        <span className="text-gray-400">({trendData.transport})</span>
                      )}
                    </div>

                    <div className="flex items-center space-x-4 text-gray-400">
                      {trendData.metadata?.categoryTree && trendData.metadata.categoryTree.length > 0 && (
                        <div>
                          <span>类目: </span>
                          <span className="text-gray-200">
                            {trendData.metadata.categoryTree.map((c) => c.name).join(' > ')}
                          </span>
                        </div>
                      )}
                      {trendData.metadata?.totalCredits != null && (
                        <div>
                          <span>耗费额度: </span>
                          <span className="text-amber-400 font-mono font-bold">
                            {trendData.metadata.totalCredits} Credits
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* BSR Card */}
                    {(() => {
                      const bsr = trendData.trends?.find((t) => t.metric === 'BSR');
                      const s = bsr?.summary;
                      return (
                        <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400 font-medium">BSR 类目排名</span>
                            {s?.direction === 'RANK_IMPROVED' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center">
                                <ArrowUpRight className="w-3 h-3 mr-0.5" /> 排名上升
                              </span>
                            ) : s?.direction === 'RANK_DECLINED' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center">
                                <ArrowDownRight className="w-3 h-3 mr-0.5" /> 排名下滑
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20 flex items-center">
                                <Minus className="w-3 h-3 mr-0.5" /> 走势平稳
                              </span>
                            )}
                          </div>
                          <div className="text-2xl font-bold font-mono text-white">
                            {s?.endValue != null ? `#${s.endValue.toLocaleString()}` : '—'}
                          </div>
                          <div className="text-xs text-gray-400 space-y-1 pt-1 border-t border-border/50">
                            <div className="flex justify-between">
                              <span>期初排名:</span>
                              <span className="font-mono text-gray-200">
                                {s?.startValue != null ? `#${s.startValue.toLocaleString()}` : '—'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>最佳 / 最低:</span>
                              <span className="font-mono text-gray-200">
                                #{s?.minValue != null ? s.minValue.toLocaleString() : '—'} / #{s?.maxValue != null ? s.maxValue.toLocaleString() : '—'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>净变动:</span>
                              <span className={`font-mono font-bold ${s?.changeAbsolute && s.changeAbsolute < 0 ? 'text-emerald-400' : s?.changeAbsolute && s.changeAbsolute > 0 ? 'text-rose-400' : 'text-gray-300'}`}>
                                {s?.changeAbsolute != null ? `${s.changeAbsolute > 0 ? '+' : ''}${s.changeAbsolute} (#)` : '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Price Card */}
                    {(() => {
                      const price = trendData.trends?.find((t) => t.metric === 'PRICE');
                      const s = price?.summary;
                      return (
                        <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400 font-medium">售价波动走势</span>
                            {s?.direction === 'PRICE_UP' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center">
                                <ArrowUpRight className="w-3 h-3 mr-0.5" /> 价格上调
                              </span>
                            ) : s?.direction === 'PRICE_DOWN' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center">
                                <ArrowDownRight className="w-3 h-3 mr-0.5" /> 价格下调
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20 flex items-center">
                                <Minus className="w-3 h-3 mr-0.5" /> 价格恒定
                              </span>
                            )}
                          </div>
                          <div className="text-2xl font-bold font-mono text-emerald-400">
                            {s?.endValue != null ? `$${s.endValue.toFixed(2)}` : '—'}
                          </div>
                          <div className="text-xs text-gray-400 space-y-1 pt-1 border-t border-border/50">
                            <div className="flex justify-between">
                              <span>期初价格:</span>
                              <span className="font-mono text-gray-200">
                                {s?.startValue != null ? `$${s.startValue.toFixed(2)}` : '—'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>区间均价:</span>
                              <span className="font-mono text-gray-200">
                                {s?.averageValue != null ? `$${s.averageValue.toFixed(2)}` : '—'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>价格区间:</span>
                              <span className="font-mono text-gray-200">
                                {s?.minValue != null && s?.maxValue != null
                                  ? `$${s.minValue.toFixed(2)} - $${s.maxValue.toFixed(2)}`
                                  : '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Rating Card */}
                    {(() => {
                      const rating = trendData.trends?.find((t) => t.metric === 'RATING');
                      const s = rating?.summary;
                      return (
                        <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400 font-medium">星级评分走势</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {s?.direction === 'RATING_IMPROVED' ? '评分提升' : s?.direction === 'RATING_DECLINED' ? '评分下降' : '评分稳定'}
                            </span>
                          </div>
                          <div className="text-2xl font-bold font-mono text-white flex items-center">
                            <span>⭐ {s?.endValue != null ? s.endValue.toFixed(1) : '—'}</span>
                          </div>
                          <div className="text-xs text-gray-400 space-y-1 pt-1 border-t border-border/50">
                            <div className="flex justify-between">
                              <span>期初星级:</span>
                              <span className="font-mono text-gray-200">
                                {s?.startValue != null ? `${s.startValue.toFixed(1)} 星` : '—'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>区间均值:</span>
                              <span className="font-mono text-gray-200">
                                {s?.averageValue != null ? `${s.averageValue.toFixed(2)} 星` : '—'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>净波动:</span>
                              <span className="font-mono text-gray-200">
                                {s?.changeAbsolute != null ? `${s.changeAbsolute > 0 ? '+' : ''}${s.changeAbsolute}` : '0.0'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Review Count Card */}
                    {(() => {
                      const rev = trendData.trends?.find((t) => t.metric === 'REVIEW_COUNT');
                      const s = rev?.summary;
                      return (
                        <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400 font-medium">评价总数增长</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              {s?.direction === 'REVIEWS_INCREASED' ? '持续增长' : '净增平稳'}
                            </span>
                          </div>
                          <div className="text-2xl font-bold font-mono text-white">
                            {s?.endValue != null ? s.endValue.toLocaleString() : '—'}
                          </div>
                          <div className="text-xs text-gray-400 space-y-1 pt-1 border-t border-border/50">
                            <div className="flex justify-between">
                              <span>期初评论:</span>
                              <span className="font-mono text-gray-200">
                                {s?.startValue != null ? s.startValue.toLocaleString() : '—'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>区间新增:</span>
                              <span className="font-mono text-emerald-400 font-bold">
                                {s?.changeAbsolute != null ? `+${s.changeAbsolute.toLocaleString()}` : '0'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>增长速率:</span>
                              <span className="font-mono text-gray-200">
                                {s?.changePercent != null ? `+${s.changePercent}%` : '0%'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Points Data Table */}
                  <div className="bg-surface border border-border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border bg-surface-elevated/50 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-blue-400" />
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                          日级多维历史指标明细
                        </h4>
                      </div>
                      <span className="text-[11px] text-gray-400">
                        {trendData.metadata?.dateRangeNotice || '包含 BSR 类目排名、价格与评分日级数据'}
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="text-[10px] text-gray-400 uppercase bg-surface/80 sticky top-0 border-b border-border">
                          <tr>
                            <th className="px-4 py-2">日期</th>
                            <th className="px-4 py-2">BSR 排名</th>
                            <th className="px-4 py-2">展示售价</th>
                            <th className="px-4 py-2">星级评分</th>
                            <th className="px-4 py-2">累计评价</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 font-mono">
                          {(() => {
                            const bsrTrend = trendData.trends?.find((t) => t.metric === 'BSR');
                            const priceTrend = trendData.trends?.find((t) => t.metric === 'PRICE');
                            const ratingTrend = trendData.trends?.find((t) => t.metric === 'RATING');
                            const reviewTrend = trendData.trends?.find((t) => t.metric === 'REVIEW_COUNT');

                            // Unique dates sorted descending
                            const dates = Array.from(
                              new Set([
                                ...(bsrTrend?.points.map((p) => p.date) || []),
                                ...(priceTrend?.points.map((p) => p.date) || []),
                              ]),
                            ).sort().reverse();

                            if (dates.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                    暂无日级明细点位
                                  </td>
                                </tr>
                              );
                            }

                            return dates.slice(0, 30).map((d) => {
                              const bsrPt = bsrTrend?.points.find((p) => p.date === d);
                              const pricePt = priceTrend?.points.find((p) => p.date === d);
                              const ratingPt = ratingTrend?.points.find((p) => p.date === d);
                              const reviewPt = reviewTrend?.points.find((p) => p.date === d);

                              return (
                                <tr key={d} className="hover:bg-surface-elevated/40">
                                  <td className="px-4 py-2 text-gray-300">{d}</td>
                                  <td className="px-4 py-2 text-blue-400">
                                    {bsrPt?.value != null ? `#${bsrPt.value.toLocaleString()}` : '—'}
                                  </td>
                                  <td className="px-4 py-2 text-emerald-400">
                                    {pricePt?.value != null ? `$${pricePt.value.toFixed(2)}` : '—'}
                                  </td>
                                  <td className="px-4 py-2 text-white">
                                    {ratingPt?.value != null ? `⭐ ${ratingPt.value.toFixed(1)}` : '—'}
                                  </td>
                                  <td className="px-4 py-2 text-gray-400">
                                    {reviewPt?.value != null ? reviewPt.value.toLocaleString() : '—'}
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phase 5.1: On-demand Product Review Health Modal */}
      {vocModalAsin && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-elevated border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between bg-surface/50">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Star className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-white tracking-tight">
                      商品评价与口碑概览
                    </h3>
                    <span className="font-mono text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                      {vocModalAsin}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    基于公开评价的星级与数量统计指标 • 明确区分公开指标与单品文本挖掘事实边界
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {vocData && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400 font-mono">
                      Provider: <span className="text-white font-bold">{vocData.provider.toUpperCase()}</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
                        vocData.mode === 'LIVE'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : vocData.mode === 'CACHED'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {vocData.mode}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setVocModalAsin(null)}
                  className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-surface transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {vocLoading && (
                <div className="py-20 text-center flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
                  <span className="text-sm text-gray-400">
                    正在通过 Provider Gateway 调用 review.product.health (ASIN: {vocModalAsin})...
                  </span>
                </div>
              )}

              {vocError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm flex items-start space-x-3">
                  <Info className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold">查询失败</h5>
                    <p className="text-xs mt-1 text-rose-200">{vocError}</p>
                  </div>
                </div>
              )}

              {vocData?.voc && !vocLoading && (
                <div className="space-y-5">
                  {/* Factual Disclaimer Banner */}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 flex items-start space-x-3">
                    <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-200/90 leading-relaxed">
                      <span className="font-bold text-amber-300">事实与推断边界声明：</span>
                      {vocData.voc.evidenceNotice ||
                        '商品评价与口碑指标基于公开数据，非物理工程质检结论。当前数据源未提供单条 Review 文本挖掘工具。'}
                    </div>
                  </div>

                  {/* Summary & Key Metrics */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-surface border border-border rounded-xl p-4 space-y-1">
                      <span className="text-xs text-gray-400 font-medium">官方星级评分</span>
                      <div className="text-2xl font-bold font-mono text-white flex items-center space-x-1">
                        <span>⭐ {vocData.voc.averageRating != null ? vocData.voc.averageRating.toFixed(1) : '—'}</span>
                      </div>
                      <span className="text-[11px] text-gray-500 block pt-1 border-t border-border/40">
                        {vocData.voc.averageRating != null ? '基于真实商城页面评分' : '暂无评分数据'}
                      </span>
                    </div>

                    <div className="bg-surface border border-border rounded-xl p-4 space-y-1">
                      <span className="text-xs text-gray-400 font-medium">公开累计评价总数</span>
                      <div className="text-2xl font-bold font-mono text-white">
                        {(vocData.voc.totalReviewCount ?? vocData.voc.totalReviewsAnalyzed) != null
                          ? (vocData.voc.totalReviewCount ?? vocData.voc.totalReviewsAnalyzed)!.toLocaleString()
                          : '—'}
                      </div>
                      <span className="text-[11px] text-gray-500 block pt-1 border-t border-border/40">
                        公开累计 Review 数量指标
                      </span>
                    </div>

                    <div className="bg-surface border border-border rounded-xl p-4 space-y-1">
                      <span className="text-xs text-gray-400 font-medium">已分析 Review 文本数</span>
                      <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                        {vocData.voc.analyzedReviewCount != null && vocData.voc.analyzedReviewCount > 0
                          ? `${vocData.voc.analyzedReviewCount.toLocaleString()} 条`
                          : '0 条 (暂无文本)'}
                      </div>
                      <span className="text-[11px] text-gray-500 block pt-1 border-t border-border/40">
                        {vocData.voc.analyzedReviewCount != null && vocData.voc.analyzedReviewCount > 0
                          ? '已执行文本 NLP 分析样本'
                          : '数据源未提供单条评论文本'}
                      </span>
                    </div>

                    <div className="bg-surface border border-border rounded-xl p-4 space-y-1">
                      <span className="text-xs text-gray-400 font-medium">证据链与通道</span>
                      <div className="text-lg font-bold font-mono text-purple-400 mt-1">
                        {vocData.mode}
                      </div>
                      <span className="text-[11px] text-gray-500 block pt-1 border-t border-border/40 truncate">
                        Provider: {vocData.provider}
                      </span>
                    </div>
                  </div>

                  {/* Analysis Scope & Source Diversity Panel */}
                  {vocData.voc.analysisScope && (
                    <div className="bg-surface border border-border/90 rounded-xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                        <div className="flex items-center space-x-2">
                          <Compass className="w-4 h-4 text-blue-400" />
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                            外部原声分析范围与数据源多样性
                          </h4>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
                          {vocData.voc.analysisScope.type === 'CATEGORY'
                            ? '品类外部原声 (VOC)'
                            : vocData.voc.analysisScope.type === 'PRODUCT_PLUS_CATEGORY'
                            ? '商品 + 品类混合原声'
                            : '商品精准外部原声'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="bg-surface-elevated p-2.5 rounded-lg border border-border/50">
                          <span className="text-[11px] text-gray-400 block">分析样本量</span>
                          <span className="text-sm font-bold font-mono text-white">
                            {vocData.voc.analysisScope.totalAnalyzedItems} 条讨论
                          </span>
                        </div>
                        <div className="bg-surface-elevated p-2.5 rounded-lg border border-border/50">
                          <span className="text-[11px] text-gray-400 block">独立来源页面</span>
                          <span className="text-sm font-bold font-mono text-emerald-400">
                            {vocData.voc.analysisScope.uniqueSourcePages} 个独立 URL
                          </span>
                        </div>
                        <div className="bg-surface-elevated p-2.5 rounded-lg border border-border/50">
                          <span className="text-[11px] text-gray-400 block">涵盖权威域名</span>
                          <span className="text-sm font-bold font-mono text-purple-400">
                            {Object.keys(vocData.voc.analysisScope.domainDistribution || {}).length} 个域名
                          </span>
                        </div>
                        <div className="bg-surface-elevated p-2.5 rounded-lg border border-border/50">
                          <span className="text-[11px] text-gray-400 block">目标 ASIN 条目</span>
                          <span className="text-sm font-bold font-mono text-amber-400">
                            {vocData.voc.analysisScope.exactProductItems} 条 (品类: {vocData.voc.analysisScope.categoryItems})
                          </span>
                        </div>
                      </div>

                      {/* Source Distribution Badges */}
                      {vocData.voc.analysisScope.sourceDistribution && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/30">
                          <span className="text-[11px] text-gray-400">渠道分布:</span>
                          {Object.entries(vocData.voc.analysisScope.sourceDistribution).map(([src, count]) => (
                            <span key={src} className="text-[10px] px-2 py-0.5 rounded bg-surface-elevated text-gray-300 border border-border font-mono">
                              {src}: <strong className="text-white">{count}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Summary Text */}
                  {vocData.voc.summary && (
                    <div className="bg-surface border border-border rounded-xl p-4">
                      <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                        分析摘要
                      </h4>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        {vocData.voc.summary}
                      </p>
                    </div>
                  )}

                  {/* Dedicated Text-level VOC Section */}
                  {(!vocData.voc.painPoints || vocData.voc.painPoints.length === 0) ? (
                    <div className="bg-surface border border-border/80 rounded-xl p-5 space-y-3">
                      <div className="flex items-center space-x-2">
                        <MessageSquareOff className="w-4 h-4 text-amber-400" />
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                          文本级 VOC 分析 (痛点 / 爽点 / 购买动机)
                        </h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold font-mono">
                          当前数据源暂不支持
                        </span>
                      </div>
                      <div className="bg-surface-elevated border border-border/80 rounded-lg p-4 text-xs text-gray-300 leading-relaxed space-y-2.5">
                        <p className="font-semibold text-amber-300">
                          当前 Provider 仅提供星级与评价总量指标，未提供单条 Review 文本挖掘工具。
                        </p>
                        <p className="text-gray-400 leading-relaxed">
                          在西柚洞察 (XYDC) MCP 现有的 45 个 Remote Tools 中，仅开放商品总评级（<code className="text-blue-300 font-mono">stars</code>）与累计评价量（<code className="text-blue-300 font-mono">ratings</code>），不存在单 ASIN 粒度的买家评论抓取、文本情感分析或痛点聚类接口。
                        </p>
                        <p className="text-gray-400 leading-relaxed">
                          CrossPilot 坚持严格事实锚定原则，坚决杜绝由 LLM 凭空捏造虚假痛点、虚假好评率与伪造引言。如需深度文本级买家原声挖掘，需待供应商开放单品 Review 文本接口或接入专用 Review 挖掘数据源。
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Pain Points */}
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <ArrowDownRight className="w-4 h-4 text-rose-400" />
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                            核心买家痛点
                          </h4>
                        </div>
                        <div className="space-y-2">
                          {vocData.voc.painPoints.map((pp, idx) => (
                            <div
                              key={idx}
                              className="bg-surface border border-border/80 rounded-xl p-4 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <span className="w-5 h-5 rounded-full bg-rose-500/10 text-rose-400 font-bold text-[11px] flex items-center justify-center font-mono">
                                    {idx + 1}
                                  </span>
                                  <h5 className="text-xs font-bold text-white">{pp.topic}</h5>
                                  {pp.category && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated text-gray-400 border border-border">
                                      {pp.category}
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <span className="text-xs font-bold text-rose-400 font-mono block">
                                    {pp.frequency != null ? `${pp.frequency} / ${pp.sampleSize || 25} (${pp.percentage}%)` : `${pp.percentage}%`}
                                  </span>
                                  {pp.scope && (
                                    <span className="text-[10px] text-gray-400 font-mono">
                                      {pp.scope === 'CATEGORY' ? '品类原声' : pp.scope}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {Array.isArray(pp.quotes) && pp.quotes.length > 0 && (
                                <div className="space-y-1.5 pt-2 border-t border-border/40">
                                  {pp.quotes.map((q, qIdx) => (
                                    <div
                                      key={qIdx}
                                      className="bg-surface-elevated rounded-lg p-2.5 text-xs text-gray-300 italic border border-border/50 flex flex-col space-y-1.5"
                                    >
                                      <span>“{q.quoteText}”</span>
                                      <div className="text-[10px] text-gray-500 flex flex-wrap items-center gap-2 not-italic pt-1 border-t border-border/30">
                                        {q.rating != null && <span>⭐ {q.rating}星</span>}
                                        {q.reviewer && <span>— {q.reviewer}</span>}
                                        {q.sourceType && <span className="bg-surface px-1.5 py-0.5 rounded border border-border font-mono text-gray-400">{q.sourceType}</span>}
                                        {q.scope && <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 font-mono">{q.scope}</span>}
                                        {q.url && (
                                          <a
                                            href={q.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300 hover:underline flex items-center space-x-1"
                                          >
                                            <span>出处链接</span>
                                            <ExternalLink className="w-2.5 h-2.5 inline" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Praise Points */}
                      {Array.isArray(vocData.voc.praisePoints) && vocData.voc.praisePoints.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                              核心买家爽点与正面反馈
                            </h4>
                          </div>
                          <div className="space-y-2">
                            {vocData.voc.praisePoints.map((pp, idx) => (
                              <div
                                key={idx}
                                className="bg-surface border border-border/80 rounded-xl p-4 space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-[11px] flex items-center justify-center font-mono">
                                      {idx + 1}
                                    </span>
                                    <h5 className="text-xs font-bold text-white">{pp.topic}</h5>
                                    {pp.category && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated text-gray-400 border border-border">
                                        {pp.category}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs font-bold text-emerald-400 font-mono block">
                                      {pp.frequency != null ? `${pp.frequency} / ${pp.sampleSize || 25} (${pp.percentage}%)` : `${pp.percentage}%`}
                                    </span>
                                    {pp.scope && (
                                      <span className="text-[10px] text-gray-400 font-mono">
                                        {pp.scope === 'CATEGORY' ? '品类原声' : pp.scope}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {Array.isArray(pp.quotes) && pp.quotes.length > 0 && (
                                  <div className="space-y-1.5 pt-2 border-t border-border/40">
                                    {pp.quotes.map((q, qIdx) => (
                                      <div
                                        key={qIdx}
                                        className="bg-surface-elevated rounded-lg p-2.5 text-xs text-gray-300 italic border border-border/50 flex flex-col space-y-1.5"
                                      >
                                        <span>“{q.quoteText}”</span>
                                        <div className="text-[10px] text-gray-500 flex flex-wrap items-center gap-2 not-italic pt-1 border-t border-border/30">
                                          {q.rating != null && <span>⭐ {q.rating}星</span>}
                                          {q.reviewer && <span>— {q.reviewer}</span>}
                                          {q.sourceType && <span className="bg-surface px-1.5 py-0.5 rounded border border-border font-mono text-gray-400">{q.sourceType}</span>}
                                          {q.scope && <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 font-mono">{q.scope}</span>}
                                          {q.url && (
                                            <a
                                              href={q.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-400 hover:text-blue-300 hover:underline flex items-center space-x-1"
                                            >
                                              <span>出处链接</span>
                                              <ExternalLink className="w-2.5 h-2.5 inline" />
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Buyer Motivations */}
                      {Array.isArray(vocData.voc.buyerMotivations) && vocData.voc.buyerMotivations.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Target className="w-4 h-4 text-purple-400" />
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                              购买动机与使用场景
                            </h4>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {vocData.voc.buyerMotivations.map((bm, idx) => (
                              <div
                                key={idx}
                                className="bg-surface border border-border rounded-xl p-3.5 space-y-1"
                              >
                                <span className="text-xs font-bold text-white block">
                                  {bm.motivation}
                                </span>
                                {bm.percentage != null && (
                                  <span className="text-xs text-purple-400 font-mono font-semibold">
                                    占比: {bm.percentage}%
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Use Cases */}
                      {Array.isArray(vocData.voc.useCases) && vocData.voc.useCases.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Sparkles className="w-4 h-4 text-blue-400" />
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                              典型使用场景
                            </h4>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {vocData.voc.useCases.map((uc, idx) => (
                              <div
                                key={idx}
                                className="bg-surface border border-border rounded-xl p-3.5 space-y-1"
                              >
                                <span className="text-xs font-bold text-white block">
                                  {uc.useCase}
                                </span>
                                {uc.percentage != null && (
                                  <span className="text-xs text-blue-400 font-mono font-semibold">
                                    提及率: {uc.percentage}%
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Desired Features */}
                      {Array.isArray(vocData.voc.desiredFeatures) && vocData.voc.desiredFeatures.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Lightbulb className="w-4 h-4 text-amber-400" />
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                              买家期待改进特性
                            </h4>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {vocData.voc.desiredFeatures.map((df, idx) => (
                              <div
                                key={idx}
                                className="bg-surface border border-border rounded-xl p-3.5 space-y-1"
                              >
                                <span className="text-xs font-bold text-white block">
                                  {df.feature}
                                </span>
                                {df.percentage != null && (
                                  <span className="text-xs text-amber-400 font-mono font-semibold">
                                    需求呼声: {df.percentage}%
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Evidence Footprint */}
                  <div className="bg-surface/50 border border-border/50 rounded-xl p-3 text-[11px] text-gray-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-3.5 h-3.5 text-gray-500" />
                      <span>
                        证据标识: {vocData.evidence?.[0]?.evidenceId || `ev_rev_${vocModalAsin}`}
                      </span>
                    </div>
                    <span>同步时间: {new Date(vocData.capturedAt).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
