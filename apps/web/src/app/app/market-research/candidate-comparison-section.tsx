'use client';

import React, { useState, useEffect } from 'react';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  Info,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  TrendingUp,
  FileText,
  DollarSign,
  Layers,
  HelpCircle,
  Sparkles,
  Award,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import type {
  ProductCandidate,
  CandidateComparisonResult,
  ComparisonReason,
  CandidateDecision,
  ScenarioEconomicsResult,
} from '@crosspilot/shared';
import { ApiClient } from '../../../lib/api-client';

interface CandidateComparisonSectionProps {
  onCandidateSelect?: (candidate: ProductCandidate) => void;
}

export function CandidateComparisonSection({ onCandidateSelect }: CandidateComparisonSectionProps) {
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [comparison, setComparison] = useState<CandidateComparisonResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [scenarioTab, setScenarioTab] = useState<'conservative' | 'base' | 'optimistic'>('base');
  const [expandedCosts, setExpandedCosts] = useState<Record<string, boolean>>({});
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null);
  const [activeReasonDetail, setActiveReasonDetail] = useState<{
    candA: ProductCandidate;
    candB: ProductCandidate;
    reasons: ComparisonReason[];
  } | null>(null);

  async function loadDefaultCandidates() {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiClient.get<{
        candidates: ProductCandidate[];
        comparison: CandidateComparisonResult;
      }>('/api/v1/market-research/candidates/defaults');
      if (res && res.candidates) {
        setCandidates(res.candidates);
        setComparison(res.comparison);
        if (res.candidates.length >= 2) {
          setSelectedPairKey(`${res.candidates[0].id}_vs_${res.candidates[1].id}`);
        }
      }
    } catch (err: any) {
      setError(err?.message || '无法加载候选产品方案数据');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDefaultCandidates();
  }, []);

  const toggleCostExpansion = (id: string) => {
    setExpandedCosts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getDecisionBadge = (decision: CandidateDecision) => {
    switch (decision) {
      case 'SHORTLIST':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>建议入围 (SHORTLIST)</span>
          </span>
        );
      case 'WATCH':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Eye className="w-3.5 h-3.5" />
            <span>密切观察 (WATCH)</span>
          </span>
        );
      case 'NEEDS_VALIDATION':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>待验证 (NEEDS_VALIDATION)</span>
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5" />
            <span>阻断拦截 (BLOCKED)</span>
          </span>
        );
      case 'INSUFFICIENT_DATA':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>数据不全 (INSUFFICIENT)</span>
          </span>
        );
    }
  };

  const getDimensionLabel = (dim: string) => {
    switch (dim) {
      case 'ECONOMICS':
        return '财务与边际贡献';
      case 'RISK_PROFILE':
        return '合规与专利风险';
      case 'EVIDENCE_CONFIDENCE':
        return '事实证据充分度';
      case 'MARKET_DEMAND':
        return '市场真实需求';
      default:
        return dim;
    }
  };

  const getConclusionBadge = (conc: string) => {
    switch (conc) {
      case 'A_BETTER':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            方案 A 占优
          </span>
        );
      case 'B_BETTER':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            方案 B 占优
          </span>
        );
      case 'SIMILAR':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-gray-500/15 text-gray-400 border border-gray-500/30">
            二者相当
          </span>
        );
      case 'NOT_COMPARABLE':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            口径不一致不可比
          </span>
        );
    }
  };

  // Compute active pair comparison
  const availablePairs = React.useMemo(() => {
    if (!candidates || candidates.length < 2) return [];
    const pairs: { key: string; label: string; candA: ProductCandidate; candB: ProductCandidate }[] = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = 0; j < candidates.length; j++) {
        if (i !== j) {
          const candA = candidates[i];
          const candB = candidates[j];
          pairs.push({
            key: `${candA.id}_vs_${candB.id}`,
            label: `${candA.title.slice(0, 18)}... vs ${candB.title.slice(0, 18)}...`,
            candA,
            candB,
          });
        }
      }
    }
    return pairs;
  }, [candidates]);

  const currentPairData = React.useMemo(() => {
    if (!selectedPairKey || !comparison || !comparison.pairwiseReasons) return null;
    const reasons = comparison.pairwiseReasons[selectedPairKey] || [];
    const [idA, idB] = selectedPairKey.split('_vs_');
    const candA = candidates.find((c) => c.id === idA);
    const candB = candidates.find((c) => c.id === idB);
    if (!candA || !candB) return null;
    return { candA, candB, reasons };
  }, [selectedPairKey, comparison, candidates]);

  return (
    <div className="bg-surface border border-border rounded-xl p-6 shadow-sm space-y-6">
      {/* 1. Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Scale className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-white tracking-wide">
              03.0 候选产品决策与横向对比矩阵 (Product Research V2 MVP)
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold">
              V2 实体产品粒度
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-semibold">
              同口径统一核算
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold">
              因果链逐项溯源
            </span>
          </div>
          <p className="text-xs text-gray-400">
            支持 3～5 个具体候选产品多维横向比较 • 门禁流水线评估 • 消除 IEEE 754 浮点漂移 • 缺失数据诚实拦截绝不伪造优势
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Scenario Tab Controls */}
          <div className="flex items-center bg-surface-elevated border border-border rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setScenarioTab('conservative')}
              className={`px-3 py-1.5 rounded font-medium transition cursor-pointer ${
                scenarioTab === 'conservative'
                  ? 'bg-amber-600/80 text-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              悲观保守情景
            </button>
            <button
              type="button"
              onClick={() => setScenarioTab('base')}
              className={`px-3 py-1.5 rounded font-medium transition cursor-pointer ${
                scenarioTab === 'base'
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              基准情景
            </button>
            <button
              type="button"
              onClick={() => setScenarioTab('optimistic')}
              className={`px-3 py-1.5 rounded font-medium transition cursor-pointer ${
                scenarioTab === 'optimistic'
                  ? 'bg-emerald-600/80 text-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              乐观情景
            </button>
          </div>

          <button
            type="button"
            onClick={loadDefaultCandidates}
            disabled={loading}
            className="bg-surface-elevated hover:bg-surface border border-border text-gray-200 text-xs font-semibold px-3 py-2 rounded-lg transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
            <span>重新加载候选</span>
          </button>
        </div>
      </div>

      {loading && (
        <div className="py-16 text-center flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
          <span className="text-sm text-gray-400">正在按同口径计算候选产品三情景经济模型与横向对比...</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadDefaultCandidates}
            className="px-3 py-1 bg-rose-600 text-white rounded font-semibold hover:bg-rose-500 transition cursor-pointer"
          >
            重试
          </button>
        </div>
      )}

      {!loading && !error && comparison && (
        <>
          {/* 2. Ranking Summary Banner */}
          <div className="bg-surface-elevated border border-emerald-500/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-inner">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/15 text-emerald-400">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    横向排序综合结论:
                  </span>
                  <div className="flex items-center space-x-1.5">
                    {comparison.ranking.map((id, idx) => {
                      const cand = candidates.find((c) => c.id === id);
                      return (
                        <React.Fragment key={id}>
                          <span
                            className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                              idx === 0
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-surface text-gray-300 border-border'
                            }`}
                          >
                            #{idx + 1} {cand ? cand.title.slice(0, 14) + '...' : id}
                          </span>
                          {idx < comparison.ranking.length - 1 && (
                            <span className="text-gray-500 text-xs">&gt;</span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-emerald-200/90 mt-1">{comparison.summary}</p>
              </div>
            </div>
            <div className="text-[11px] font-mono text-gray-400 bg-surface px-3 py-1.5 rounded-lg border border-border flex items-center space-x-1.5 self-start md:self-auto">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>严禁跨币种混排 • 统一站点 {candidates[0]?.marketplace}</span>
            </div>
          </div>

          {/* 3. Candidate Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {candidates.map((candidate, idx) => {
              const scenario: ScenarioEconomicsResult =
                candidate.economics.scenarios[scenarioTab] || candidate.economics.scenarios.base;
              const isProfitPositive = scenario.contributionProfit > 0;
              const marginPercent = (scenario.contributionMargin * 100).toFixed(1);
              const isExpanded = !!expandedCosts[candidate.id];

              return (
                <div
                  key={candidate.id}
                  className={`bg-surface-elevated border rounded-xl p-5 flex flex-col justify-between space-y-4 transition ${
                    candidate.decision === 'SHORTLIST'
                      ? 'border-emerald-500/40 shadow-emerald-950/20 shadow-lg'
                      : candidate.decision === 'BLOCKED'
                      ? 'border-rose-500/30'
                      : 'border-border'
                  }`}
                >
                  {/* Top Meta */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-surface border border-border text-gray-400 font-semibold">
                        候选 #{idx + 1} • {candidate.id}
                      </span>
                      {getDecisionBadge(candidate.decision)}
                    </div>

                    <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">
                      {candidate.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
                      <span className="bg-surface px-2 py-0.5 rounded border border-border">
                        {candidate.category}
                      </span>
                      {candidate.marketResearch?.representativeAsin && (
                        <span className="font-mono bg-surface px-2 py-0.5 rounded border border-border text-purple-300">
                          ASIN: {candidate.marketResearch.representativeAsin}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Economics Metric Highlight */}
                  <div className="bg-surface rounded-xl p-3.5 border border-border space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400 font-medium">
                        {scenarioTab === 'conservative'
                          ? '悲观预测'
                          : scenarioTab === 'optimistic'
                          ? '乐观预测'
                          : '基准情景'}{' '}
                        净边际贡献
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        售价: ${scenario.sellingPrice.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline space-x-1.5">
                        <span
                          className={`text-2xl font-black font-mono tracking-tight ${
                            isProfitPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          ${scenario.contributionProfit.toFixed(2)}
                        </span>
                        <span className="text-xs text-gray-400">/ 件</span>
                      </div>
                      <div
                        className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                          isProfitPositive
                            ? scenario.contributionMargin >= 0.15
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/20 text-amber-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        利润率: {marginPercent}%
                      </div>
                    </div>

                    {/* Cost Breakdown Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleCostExpansion(candidate.id)}
                      className="w-full text-[11px] text-blue-400 hover:text-blue-300 pt-2 border-t border-border flex items-center justify-between transition cursor-pointer"
                    >
                      <span>单件全成本拆解 ({isExpanded ? '收起' : '展开详情'})</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isExpanded && (
                      <div className="text-[11px] text-gray-300 space-y-1.5 pt-1.5 font-mono">
                        <div className="flex justify-between">
                          <span className="text-gray-400">头程采购 (COGS):</span>
                          <span>${scenario.productCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">头程海运 (Freight):</span>
                          <span>${scenario.freight.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">FBA 配送费:</span>
                          <span>${scenario.fbaFee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">平台佣金 (15%):</span>
                          <span>${scenario.amazonReferralFee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">广告营销预估 (Ads):</span>
                          <span>${scenario.advertisingCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">退货破损折损:</span>
                          <span>${scenario.expectedReturnLoss.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold border-t border-border/60 pt-1 text-gray-200">
                          <span>总费用支出:</span>
                          <span>${scenario.totalExpenses.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Risks & Missing Items */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-400 font-semibold flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-amber-400" />
                        <span>合规与风险状态</span>
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {candidate.risks.length} 项评估
                      </span>
                    </div>

                    {candidate.risks.length === 0 ? (
                      <div className="text-[11px] text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded">
                        无重大风险标记
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {candidate.risks.map((r) => (
                          <div
                            key={r.riskId}
                            className={`text-[11px] px-2 py-1 rounded border flex items-center justify-between ${
                              r.status === 'FAIL'
                                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                : r.status === 'UNVERIFIED'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            }`}
                          >
                            <span className="truncate pr-2">[{r.category}] {r.title}</span>
                            <span className="font-mono text-[10px] font-bold flex-shrink-0">
                              {r.status === 'FAIL' ? 'FAIL 严重' : r.status === 'UNVERIFIED' ? '待验' : 'PASS'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {candidate.missingRequirements && candidate.missingRequirements.length > 0 && (
                      <div className="pt-1">
                        <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded inline-block">
                          缺失验证项: {candidate.missingRequirements[0].description}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Footprint */}
                  <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-gray-500">
                    <span>证据 {candidate.evidence.length} 条 • 假设 {candidate.assumptions.length} 项</span>
                    <button
                      type="button"
                      onClick={() => onCandidateSelect?.(candidate)}
                      className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <span>查看详情</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4. Horizontal Comparison Matrix (Comparison Matrix) */}
          <div className="bg-surface-elevated border border-border rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  多候选横向综合对比矩阵 (Pairwise Comparison Matrix)
                </h3>
              </div>

              {/* Pair Selector */}
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400">选择对比对:</span>
                <select
                  value={selectedPairKey || ''}
                  onChange={(e) => setSelectedPairKey(e.target.value)}
                  className="bg-surface border border-border rounded-lg text-xs text-gray-200 px-3 py-1.5 focus:outline-none focus:border-blue-500 font-mono"
                >
                  {availablePairs.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.candA.id} vs {p.candB.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Matrix Table for Active Pair */}
            {currentPairData ? (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-surface text-gray-400 font-medium">
                        <th className="py-2.5 px-3">比较维度</th>
                        <th className="py-2.5 px-3">方案 A ({currentPairData.candA.id})</th>
                        <th className="py-2.5 px-3">方案 B ({currentPairData.candB.id})</th>
                        <th className="py-2.5 px-3 text-center">对比结论</th>
                        <th className="py-2.5 px-3">核心归因说明</th>
                        <th className="py-2.5 px-3 text-right">因果溯源</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {currentPairData.reasons.map((reason, rIdx) => (
                        <tr key={rIdx} className="hover:bg-surface/50 transition">
                          <td className="py-3 px-3 font-semibold text-white">
                            {getDimensionLabel(reason.dimension)}
                          </td>
                          <td className="py-3 px-3 text-gray-300">
                            {reason.dimension === 'ECONOMICS' ? (
                              <span className="font-mono text-emerald-400">
                                利润 ${(currentPairData.candA.economics.scenarios.base.contributionProfit).toFixed(2)} (
                                {((currentPairData.candA.economics.scenarios.base.contributionMargin) * 100).toFixed(1)}%)
                              </span>
                            ) : reason.dimension === 'RISK_PROFILE' ? (
                              <span>{currentPairData.candA.decision === 'BLOCKED' ? '存在阻断风险' : '风险已受控'}</span>
                            ) : reason.dimension === 'EVIDENCE_CONFIDENCE' ? (
                              <span>{currentPairData.candA.evidence.length} 条事实依据</span>
                            ) : (
                              <span>{currentPairData.candA.marketResearch?.searchVolumeMonthly?.toLocaleString() || '—'} 月搜索</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-gray-300">
                            {reason.dimension === 'ECONOMICS' ? (
                              <span className="font-mono text-indigo-400">
                                利润 ${(currentPairData.candB.economics.scenarios.base.contributionProfit).toFixed(2)} (
                                {((currentPairData.candB.economics.scenarios.base.contributionMargin) * 100).toFixed(1)}%)
                              </span>
                            ) : reason.dimension === 'RISK_PROFILE' ? (
                              <span>{currentPairData.candB.decision === 'BLOCKED' ? '存在阻断风险' : '风险已受控'}</span>
                            ) : reason.dimension === 'EVIDENCE_CONFIDENCE' ? (
                              <span>{currentPairData.candB.evidence.length} 条事实依据</span>
                            ) : (
                              <span>{currentPairData.candB.marketResearch?.searchVolumeMonthly?.toLocaleString() || '—'} 月搜索</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {getConclusionBadge(reason.conclusion)}
                          </td>
                          <td className="py-3 px-3 text-gray-300 max-w-xs leading-relaxed">
                            {reason.explanation}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setActiveReasonDetail(currentPairData)}
                              className="text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-2.5 py-1 rounded transition inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>Why A &gt; B</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 py-6 text-center">请选择有效的对比对方案</div>
            )}
          </div>

          {/* 5. "Why A > B" Traceability Deep-Dive Drawer / Modal */}
          {activeReasonDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="relative w-full max-w-3xl max-h-[85vh] bg-surface-elevated border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Drawer Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">
                        核心归因与事实溯源 (Why {activeReasonDetail.candA.id} &gt; {activeReasonDetail.candB.id})
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        不可伪造因果链条：指标差异 &rarr; 事实证据依据 &rarr; 关键假设比对
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveReasonDetail(null)}
                    className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-surface transition cursor-pointer"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                {/* Drawer Body */}
                <div className="p-6 overflow-y-auto space-y-5 text-xs">
                  {/* Pair Title Header */}
                  <div className="grid grid-cols-2 gap-4 bg-surface p-4 rounded-xl border border-border">
                    <div>
                      <span className="text-emerald-400 font-bold font-mono">方案 A ({activeReasonDetail.candA.id})</span>
                      <h4 className="text-white font-semibold mt-1">{activeReasonDetail.candA.title}</h4>
                      <div className="mt-2 text-gray-400">
                        基准净利润: <strong className="text-emerald-400">${activeReasonDetail.candA.economics.scenarios.base.contributionProfit.toFixed(2)}</strong> (
                        {((activeReasonDetail.candA.economics.scenarios.base.contributionMargin) * 100).toFixed(1)}%)
                      </div>
                    </div>
                    <div>
                      <span className="text-indigo-400 font-bold font-mono">方案 B ({activeReasonDetail.candB.id})</span>
                      <h4 className="text-white font-semibold mt-1">{activeReasonDetail.candB.title}</h4>
                      <div className="mt-2 text-gray-400">
                        基准净利润: <strong className="text-indigo-400">${activeReasonDetail.candB.economics.scenarios.base.contributionProfit.toFixed(2)}</strong> (
                        {((activeReasonDetail.candB.economics.scenarios.base.contributionMargin) * 100).toFixed(1)}%)
                      </div>
                    </div>
                  </div>

                  {/* Reasons Breakdown */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-blue-400" />
                      <span>逐维因果论证与证据链</span>
                    </h4>

                    {activeReasonDetail.reasons.map((r, idx) => (
                      <div key={idx} className="bg-surface border border-border rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">{getDimensionLabel(r.dimension)}</span>
                          {getConclusionBadge(r.conclusion)}
                        </div>
                        <p className="text-gray-300 leading-relaxed">{r.explanation}</p>

                        <div className="pt-2 border-t border-border/50 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-gray-400 block mb-1">方案 A 支撑依据:</span>
                            {activeReasonDetail.candA.evidence.map((evi) => (
                              <div key={evi.id} className="bg-surface-elevated p-2 rounded border border-border text-gray-300 space-y-0.5 mb-1">
                                <span className="font-mono text-[10px] text-blue-300 font-bold block">{evi.id} ({evi.scope})</span>
                                <p className="line-clamp-2">{evi.content}</p>
                              </div>
                            ))}
                          </div>
                          <div>
                            <span className="text-gray-400 block mb-1">方案 B 支撑依据:</span>
                            {activeReasonDetail.candB.evidence.map((evi) => (
                              <div key={evi.id} className="bg-surface-elevated p-2 rounded border border-border text-gray-300 space-y-0.5 mb-1">
                                <span className="font-mono text-[10px] text-purple-300 font-bold block">{evi.id} ({evi.scope})</span>
                                <p className="line-clamp-2">{evi.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Assumptions Disclosure */}
                        {(activeReasonDetail.candA.assumptions.length > 0 || activeReasonDetail.candB.assumptions.length > 0) && (
                          <div className="pt-2 border-t border-border/40 text-[11px] text-gray-400">
                            <span className="font-semibold text-gray-300">关键财务假设说明:</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1">
                              {activeReasonDetail.candA.assumptions.map((asm) => (
                                <li key={asm.id}>
                                  [{activeReasonDetail.candA.id}] {asm.field}: {asm.description} (来源: {asm.sourceReason})
                                </li>
                              ))}
                              {activeReasonDetail.candB.assumptions.map((asm) => (
                                <li key={asm.id}>
                                  [{activeReasonDetail.candB.id}] {asm.field}: {asm.description} (来源: {asm.sourceReason})
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
