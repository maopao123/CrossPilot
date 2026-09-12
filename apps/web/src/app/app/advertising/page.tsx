'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
import { getStatusLabel } from '../../../constants/ui-labels';
import {
  Megaphone,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  campaignType: string;
  targetingType: string;
  budget: number;
  status: string;
  metrics30d: {
    impressions: number;
    clicks: number;
    spend: number;
    sales: number;
    orders: number;
    acos: number;
    roas: number;
  };
}

interface SearchTerm {
  id: string;
  campaignId: string;
  searchTerm: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
  acos: number;
  analysis: {
    action: string;
    reason: string;
    suggestedBidAdjustmentPercent?: number;
  };
}

interface NegativeRec {
  searchTerm: string;
  campaignId: string;
  spend: number;
  sales: number;
  acos: number;
  reason: string;
  action: string;
  savingsProjectedMonthly: number;
}

export default function AdvertisingPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([]);
  const [recommendations, setRecommendations] = useState<NegativeRec[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isViewer, setIsViewer] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setIsViewer(ApiClient.isViewer());
      const [campRes, termsRes, recsRes] = await Promise.allSettled([
        ApiClient.get<Campaign[]>('/api/v1/advertising/campaigns'),
        ApiClient.get<SearchTerm[]>('/api/v1/advertising/search-terms'),
        ApiClient.get<NegativeRec[]>('/api/v1/advertising/negative-recommendations'),
      ]);

      if (campRes.status === 'fulfilled' && Array.isArray(campRes.value)) {
        setCampaigns(campRes.value);
      }
      if (termsRes.status === 'fulfilled' && Array.isArray(termsRes.value)) {
        setSearchTerms(termsRes.value);
      }
      if (recsRes.status === 'fulfilled' && Array.isArray(recsRes.value)) {
        setRecommendations(recsRes.value);
      }
    } catch (err) {
      console.error('无法载入广告数据:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApplyNegative = async (rec: NegativeRec) => {
    if (isViewer) return;
    try {
      setApplying(rec.searchTerm);
      setApplySuccess(null);
      setApplyError(null);
      const res = await ApiClient.post<any>('/api/v1/advertising/apply-negative', {
        campaignId: rec.campaignId,
        searchTerm: rec.searchTerm,
      });
      setApplySuccess(res.message);
      await loadData();
    } catch (err: any) {
      setApplyError(err.message || '应用否定关键词失败');
    } finally {
      setApplying(null);
    }
  };

  const getActionLabel = (action: string) => {
    if (action === 'ADD_NEGATIVE_EXACT') return '精准否定';
    if (action === 'INCREASE_BID') return '提升出价';
    if (action === 'DECREASE_BID') return '降低出价';
    if (action === 'MAINTAIN') return '保持观察';
    return action;
  };

  if (loading && campaigns.length === 0) {
    return (
      <div className="py-20 text-center text-gray-400 text-sm">
        正在加载广告运营数据...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="cp-title">广告</h1>
            <span className="text-xs bg-amber-500/20 text-amber-400 font-semibold px-2 py-0.5 rounded border border-amber-500/30">
              搜索词优化与否定投放
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Amazon Sponsored Products 广告与搜索词漏斗 • 高 ACOS 预算漏斗拦截
          </p>
        </div>

        <div className="text-xs text-gray-400 bg-surface border border-border px-3 py-1.5 rounded-lg">
          目标 ACOS: <span className="font-bold text-emerald-400">30%</span> • 策略: 确定性算法过滤
        </div>
      </div>

      {/* Negative Keyword Alert Banner if any high ACOS terms */}
      {recommendations.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-5 shadow-lg">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold uppercase text-amber-400 tracking-wider">
                    PPC 预算浪费预警 (E02)
                  </span>
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 font-semibold px-1.5 py-0.2 rounded">
                    ACOS 93.3% 预警
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">
                  泛搜索词 &ldquo;bathroom organizer&rdquo; 正在严重吞噬广告预算
                </h3>
                <p className="text-xs text-gray-300 mt-0.5">
                  已消耗广告费 $420.00，仅产生 2 笔转化（销售额 $450.00），ACOS 高达 93.3%。建议立即加入精准否定 (Negative Exact)。
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 self-end md:self-auto">
              {applySuccess && (
                <span className="text-xs text-emerald-400 font-semibold">{applySuccess}</span>
              )}
              {applyError && (
                <span className="text-xs text-rose-400 font-semibold">{applyError}</span>
              )}
              <button
                onClick={() => handleApplyNegative(recommendations[0])}
                disabled={isViewer || applying === recommendations[0].searchTerm}
                className="flex items-center space-x-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-md cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {applying === recommendations[0].searchTerm ? '正在写入广告活动...' : '一键添加精准否定词'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaigns KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {campaigns.map((camp) => (
          <div key={camp.id} className="bg-surface border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">{camp.name}</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold px-2 py-0.5 rounded uppercase">
                {getStatusLabel(camp.status)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-2">
              <div className="bg-surface-elevated p-2 rounded">
                <span className="text-[10px] text-gray-400">30天花费</span>
                <div className="text-sm font-bold text-white mt-0.5">${camp.metrics30d.spend}</div>
              </div>
              <div className="bg-surface-elevated p-2 rounded">
                <span className="text-[10px] text-gray-400">广告销售额</span>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">${camp.metrics30d.sales}</div>
              </div>
              <div className="bg-surface-elevated p-2 rounded">
                <span className="text-[10px] text-gray-400">ACOS</span>
                <div className={`text-sm font-bold mt-0.5 ${camp.metrics30d.acos > 0.3 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {(camp.metrics30d.acos * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="text-[11px] text-gray-400 flex items-center justify-between pt-1">
              <span>日预算: ${camp.budget} / 天</span>
              <span>ROAS: {camp.metrics30d.roas}x</span>
            </div>
          </div>
        ))}
      </div>

      {/* Search Term Report Table */}
      <div className="bg-surface border border-border rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <Search className="w-4 h-4 text-blue-400" />
              <span>买家搜索词表现报告</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              基于确定性业务逻辑分析 CTR、CVR、ACOS 并输出优化建议
            </p>
          </div>
          <span className="text-xs text-gray-400">目标 ACOS: 30%</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[11px] text-gray-400 uppercase bg-surface-elevated/60 border-b border-border">
              <tr>
                <th className="py-3 px-4">搜索词</th>
                <th className="py-3 px-4">曝光量</th>
                <th className="py-3 px-4">点击量</th>
                <th className="py-3 px-4">广告花费</th>
                <th className="py-3 px-4">订单数</th>
                <th className="py-3 px-4">销售额</th>
                <th className="py-3 px-4">ACOS</th>
                <th className="py-3 px-4">优化建议</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {searchTerms.map((term) => {
                const isBad = term.analysis.action === 'ADD_NEGATIVE_EXACT';
                const isGreat = term.analysis.action === 'INCREASE_BID';

                return (
                  <tr key={term.id} className="hover:bg-surface-elevated/40 transition">
                    <td className="py-3 px-4 font-bold text-white font-mono">{term.searchTerm}</td>
                    <td className="py-3 px-4 text-gray-300">{term.impressions.toLocaleString()}</td>
                    <td className="py-3 px-4 text-gray-300">{term.clicks.toLocaleString()}</td>
                    <td className="py-3 px-4 font-semibold text-white">${term.spend.toFixed(2)}</td>
                    <td className="py-3 px-4 font-bold text-white">{term.orders}</td>
                    <td className="py-3 px-4 font-semibold text-emerald-400">${term.sales.toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <span className={`font-bold ${term.acos > 0.8 ? 'text-rose-400 font-mono text-sm' : term.acos > 0.3 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {(term.acos * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isBad
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : isGreat
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-blue-500/20 text-blue-300'
                        }`}>
                          {getActionLabel(term.analysis.action)}
                        </span>
                        <span className="text-[11px] text-gray-400 max-w-xs truncate">{term.analysis.reason}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
