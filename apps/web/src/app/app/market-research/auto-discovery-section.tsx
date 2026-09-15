'use client';

import React, { useState } from 'react';
import {
  Compass,
  Search,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Info,
  RefreshCw,
  ExternalLink,
  Tag,
  Boxes,
  HelpCircle,
  FileText,
  Sliders,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import type {
  ProductDiscoveryRequest,
  ProductDiscoveryRun,
  CandidateDraft,
  DiscoveryDryRunPreview,
  ProductCandidate,
} from '@crosspilot/shared';
import { ApiClient } from '../../../lib/api-client';

interface AutoDiscoverySectionProps {
  onHandoffToV2?: (candidates: ProductCandidate[]) => void;
}

export function AutoDiscoverySection({ onHandoffToV2 }: AutoDiscoverySectionProps) {
  // Input form state
  const [marketplace, setMarketplace] = useState('AMAZON_US');
  const [seedKeyword, setSeedKeyword] = useState('glass food storage');
  const [category, setCategory] = useState('Home & Kitchen > Storage & Organization');
  const [excludeBrandTerms, setExcludeBrandTerms] = useState(true);
  const [excludeAccessoryIntent, setExcludeAccessoryIntent] = useState(true);
  const [candidateLimit, setCandidateLimit] = useState(5);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxProviderCalls, setMaxProviderCalls] = useState(20);

  // Execution state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<ProductDiscoveryRun | null>(null);
  const [previewResult, setPreviewResult] = useState<DiscoveryDryRunPreview | null>(null);

  // Selection for Handoff (3-5 candidates)
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffSuccessMsg, setHandoffSuccessMsg] = useState<string | null>(null);

  // Drawer state for "Why Discovered"
  const [activeDrawerDraft, setActiveDrawerDraft] = useState<CandidateDraft | null>(null);

  async function handleRunDiscovery(isDemo = false) {
    setLoading(true);
    setError(null);
    setHandoffSuccessMsg(null);
    try {
      if (isDemo) {
        const res = await ApiClient.get<ProductDiscoveryRun>('/api/v1/market-research/discovery/demo');
        if (res) {
          setRunResult(res);
          // Pre-select top 3-5 candidates for convenient handoff demo
          const topIds = new Set(res.candidateDrafts.slice(0, 4).map((d) => d.id));
          setSelectedDraftIds(topIds);
        }
      } else {
        const req: ProductDiscoveryRequest = {
          marketplace,
          seed: { keyword: seedKeyword, category: category || undefined },
          constraints: {
            excludeBrandTerms,
            excludeAccessoryIntent,
          },
          limits: {
            maxCandidateDrafts: candidateLimit,
          },
          budget: {
            maxProviderCalls,
          },
        };
        const res = await ApiClient.post<ProductDiscoveryRun>('/api/v1/market-research/discovery/run', req);
        if (res) {
          setRunResult(res);
          const topIds = new Set(res.candidateDrafts.slice(0, 3).map((d) => d.id));
          setSelectedDraftIds(topIds);
        }
      }
    } catch (err: any) {
      setError(err?.message || '自动选品探索运行失败');
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    try {
      const req: ProductDiscoveryRequest = {
        marketplace,
        seed: { keyword: seedKeyword },
        budget: { maxProviderCalls },
      };
      const res = await ApiClient.post<DiscoveryDryRunPreview>('/api/v1/market-research/discovery/preview', req);
      setPreviewResult(res);
    } catch (err: any) {
      setError(err?.message || '无法获取预算预估');
    }
  }

  const toggleSelectDraft = (id: string) => {
    setSelectedDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 5) {
          alert('V2 决策流水线推荐同时横向对比 3～5 个候选，最多选择 5 个。');
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  async function handleHandoff() {
    if (!runResult) return;
    const selectedDrafts = runResult.candidateDrafts.filter((d) => selectedDraftIds.has(d.id));
    if (selectedDrafts.length < 1) {
      alert('请至少选择 1 个候选草案进行交接（推荐选择 3～5 个）。');
      return;
    }

    setHandoffLoading(true);
    try {
      const res = await ApiClient.post<ProductCandidate[]>('/api/v1/market-research/discovery/handoff', {
        drafts: selectedDrafts,
        allEvidence: runResult.evidence,
      });
      if (res && onHandoffToV2) {
        onHandoffToV2(res);
        setHandoffSuccessMsg(`成功交接 ${res.length} 个候选草案至 V2 决策对比流水线！已如实标记为待验证 (NEEDS_VALIDATION)。`);
      }
    } catch (err: any) {
      setError(err?.message || '交接至 V2 流水线失败');
    } finally {
      setHandoffLoading(false);
    }
  }

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">HIGH PRIORITY</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">MEDIUM</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-300 border border-gray-500/30">LOW</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">NEEDS DATA</span>;
    }
  };

  const getGateBadge = (gate?: string) => {
    switch (gate) {
      case 'PASS':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">GATE: PASS</span>;
      case 'DEGRADED_PASS':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">GATE: DEGRADED_PASS</span>;
      case 'REJECT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">GATE: REJECT</span>;
      default:
        return null;
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-6 mb-8 relative">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-5 border-b border-border gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Compass className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-white tracking-wide">
              Product Research Phase 2A — Auto Discovery MVP
            </h2>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              V2.1.0-FROZEN
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1 max-w-4xl leading-relaxed">
            从 Seed Keyword 出发，通过真实 Provider 检索扩展、竞品 ASIN 反查、购买意图聚类与严格证据门禁，自动化发现
            5～10 个证据可追溯的候选方向草案（Candidate Drafts），并提供无损交接进入 V2 决策流水线。
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => handleRunDiscovery(true)}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-surface border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 hover:border-purple-500/50 transition cursor-pointer flex items-center space-x-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>加载演示示例 (Glass Food Storage)</span>
          </button>
        </div>
      </div>

      {/* Input Form Step 1 */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-300 mb-1.5 block">目标站点 (Marketplace)</label>
          <select
            value={marketplace}
            onChange={(e) => setMarketplace(e.target.value)}
            className="w-full bg-background border border-border text-white text-xs rounded-lg px-3 py-2 focus:border-purple-500 focus:outline-none"
          >
            <option value="AMAZON_US">Amazon US (美国站)</option>
            <option value="AMAZON_DE">Amazon DE (德国站)</option>
            <option value="AMAZON_UK">Amazon UK (英国站)</option>
            <option value="AMAZON_JP">Amazon JP (日本站)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-300 mb-1.5 block">种子关键词 (Seed Keyword)</label>
          <input
            type="text"
            value={seedKeyword}
            onChange={(e) => setSeedKeyword(e.target.value)}
            placeholder="例如: glass food storage"
            className="w-full bg-background border border-border text-white text-xs rounded-lg px-3 py-2 focus:border-purple-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-300 mb-1.5 block">候选发现上限 (Candidate Limit)</label>
          <input
            type="number"
            min={3}
            max={10}
            value={candidateLimit}
            onChange={(e) => setCandidateLimit(Number(e.target.value))}
            className="w-full bg-background border border-border text-white text-xs rounded-lg px-3 py-2 focus:border-purple-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-300 mb-1.5 block">过滤规则策略</label>
          <div className="flex flex-col space-y-1.5 pt-0.5">
            <label className="flex items-center space-x-2 text-[11px] text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeBrandTerms}
                onChange={(e) => setExcludeBrandTerms(e.target.checked)}
                className="rounded border-border text-purple-600 focus:ring-0"
              />
              <span>剔除纯品牌词 (Brand Filtering)</span>
            </label>
            <label className="flex items-center space-x-2 text-[11px] text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeAccessoryIntent}
                onChange={(e) => setExcludeAccessoryIntent(e.target.checked)}
                className="rounded border-border text-purple-600 focus:ring-0"
              />
              <span>剔除配件意图 (Accessory Filtering)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Advanced Collapse */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-[11px] text-gray-400 hover:text-gray-200 flex items-center space-x-1 cursor-pointer transition"
        >
          <Sliders className="w-3 h-3" />
          <span>{showAdvanced ? '收起调用预算与高级参数' : '展开调用预算与高级参数 (Budget & Limits)'}</span>
          {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showAdvanced && (
          <div className="mt-3 p-3.5 bg-background/50 border border-border rounded-lg grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-gray-400 mb-1 block">Provider 最大调用限制 (Calls Guard)</label>
              <input
                type="number"
                value={maxProviderCalls}
                onChange={(e) => setMaxProviderCalls(Number(e.target.value))}
                className="w-full bg-background border border-border text-white text-xs rounded px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 mb-1 block">类目限定范围 (Optional Category)</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-background border border-border text-white text-xs rounded px-2.5 py-1.5"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handlePreview}
                className="px-3 py-1.5 text-xs rounded bg-surface border border-border text-gray-300 hover:text-white transition cursor-pointer"
              >
                预估调用开销 (Dry Run Preview)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex items-center space-x-3">
        <button
          type="button"
          onClick={() => handleRunDiscovery(false)}
          disabled={loading || !seedKeyword}
          className="px-5 py-2.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition flex items-center space-x-2 shadow-lg shadow-purple-600/20 disabled:opacity-50 cursor-pointer"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span>{loading ? '正在进行网络扩展与意图聚类...' : '开始自动选品探索 (Run Auto Discovery)'}</span>
        </button>

        {previewResult && (
          <div className="text-[11px] text-gray-300 flex items-center space-x-2 px-3 py-1.5 rounded bg-purple-500/10 border border-purple-500/20">
            <Info className="w-3.5 h-3.5 text-purple-400" />
            <span>
              预计调用能力: {previewResult.plannedCapabilities.join(', ')} | 估算调用: {previewResult.estimatedCallCount} 次 | 预估积分: {previewResult.knownCreditCost ?? '未知'}
            </span>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Discovery Results & Stats Step 2 */}
      {runResult && (
        <div className="mt-6 pt-5 border-t border-border">
          {/* Status & Guard Banner */}
          <div className="p-3.5 rounded-lg bg-purple-500/10 border border-purple-500/20 flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex items-center space-x-3">
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                runResult.status === 'COMPLETED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {runResult.status === 'COMPLETED' ? '探索完成 (COMPLETED)' : '探索降级完成 (DEGRADED)'}
              </span>
              <span className="text-xs text-white font-medium">
                种子词: <span className="text-purple-300">"{runResult.seedKeyword}"</span>
              </span>
              <span className="text-xs text-gray-400">
                产出 <strong className="text-white">{runResult.candidateDrafts.length}</strong> 个证据候选草案
              </span>
            </div>

            <div className="text-[11px] text-gray-400 flex items-center space-x-3">
              <span>调用次数: {runResult.budgetUsage.providerCalls}</span>
              {runResult.budgetUsage.credits != null && <span>积分消耗: {runResult.budgetUsage.credits}</span>}
              <span>门禁拦截: {runResult.stats.candidateDraftsRejected}</span>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-5">
            <div className="bg-background/80 border border-border p-2.5 rounded-lg">
              <div className="text-[10px] text-gray-400">接收词项</div>
              <div className="text-sm font-bold text-white mt-0.5">{runResult.stats.keywordsReceived}</div>
            </div>
            <div className="bg-background/80 border border-border p-2.5 rounded-lg">
              <div className="text-[10px] text-gray-400">归一化去重</div>
              <div className="text-sm font-bold text-white mt-0.5">{runResult.stats.keywordsDeduplicated}</div>
            </div>
            <div className="bg-background/80 border border-border p-2.5 rounded-lg">
              <div className="text-[10px] text-gray-400">有效词节点</div>
              <div className="text-sm font-bold text-white mt-0.5">{runResult.stats.keywordsAccepted}</div>
            </div>
            <div className="bg-background/80 border border-border p-2.5 rounded-lg">
              <div className="text-[10px] text-gray-400">代表竞品 ASIN</div>
              <div className="text-sm font-bold text-white mt-0.5">{runResult.stats.asinsAccepted}</div>
            </div>
            <div className="bg-background/80 border border-border p-2.5 rounded-lg">
              <div className="text-[10px] text-gray-400">形成意图簇</div>
              <div className="text-sm font-bold text-white mt-0.5">{runResult.stats.clustersCreated}</div>
            </div>
            <div className="bg-background/80 border border-border p-2.5 rounded-lg">
              <div className="text-[10px] text-gray-400">生成候选草案</div>
              <div className="text-sm font-bold text-purple-400 mt-0.5">{runResult.candidateDrafts.length}</div>
            </div>
            <div className="bg-background/80 border border-border p-2.5 rounded-lg">
              <div className="text-[10px] text-gray-400">证据溯源链</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">{runResult.evidence.length} 项</div>
            </div>
          </div>

          {/* Strict Truthfulness Invariant Notice */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300 mb-5 flex items-start space-x-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">真理准则与冻结门禁提示：</strong>
              Auto Discovery 仅产出具备真实市场信号与证据支持的“候选方向草案 (Candidate Drafts)”，严禁替代 V2 进行商业决策。
              缺失时间序列时趋势如实标注为 <span className="font-mono bg-black/40 px-1 py-0.5 rounded">UNKNOWN</span>，严禁假定 0%；
              代表 ASIN 如实展示采集样本量，绝不冒充 Top10 全景。
            </div>
          </div>

          {/* Candidate Draft Cards Step 3 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Boxes className="w-4 h-4 text-purple-400" />
                <span>候选方向草案列表 ({runResult.candidateDrafts.length} 个)</span>
              </h3>
              <span className="text-xs text-gray-400">
                已选中 <strong className="text-purple-400">{selectedDraftIds.size}</strong> 个 (推荐选择 3～5 个进行交接)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {runResult.candidateDrafts.map((draft) => {
                const isSelected = selectedDraftIds.has(draft.id);
                return (
                  <div
                    key={draft.id}
                    className={`border rounded-xl p-4 transition relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-purple-900/15 border-purple-500 shadow-md shadow-purple-900/20'
                        : 'bg-background/60 border-border hover:border-gray-600'
                    }`}
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <label className="flex items-start space-x-2 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectDraft(draft.id)}
                            className="mt-1 rounded border-border text-purple-600 focus:ring-0"
                          />
                          <div>
                            <h4 className="text-sm font-bold text-white leading-snug">{draft.title}</h4>
                            <div className="text-[10px] text-gray-400 mt-0.5 font-mono">{draft.productType}</div>
                          </div>
                        </label>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        {getPriorityBadge(draft.priorityTier)}
                        {getGateBadge(draft.gateStatus)}
                        {draft.isBrandDependent && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            BRAND_DEPENDENT
                          </span>
                        )}
                      </div>

                      {/* Signals Grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-surface/80 p-2.5 rounded-lg mb-3 border border-border/60">
                        <div>
                          <span className="text-[10px] text-gray-400 block">月搜索量 (Demand)</span>
                          <span className="font-bold text-white">
                            {draft.discoveryMetrics.demand?.value != null
                              ? draft.discoveryMetrics.demand.value.toLocaleString()
                              : 'UNKNOWN'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 block">历史趋势 (Trend)</span>
                          <span className="font-bold text-gray-300">
                            {draft.discoveryMetrics.growth?.value != null
                              ? `${draft.discoveryMetrics.growth.value}%`
                              : 'UNKNOWN (无序列)'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 block">竞争度 / CPC</span>
                          <span className="font-bold text-gray-300">
                            {draft.discoveryMetrics.competition?.value != null
                              ? draft.discoveryMetrics.competition.value
                              : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 block">代表竞品样本</span>
                          <span className="font-bold text-purple-300">
                            {draft.discoveryMetrics.asinSampleSize} 个 ASIN (真实样本)
                          </span>
                        </div>
                      </div>

                      {/* Keywords & ASINs */}
                      <div className="space-y-1.5 text-[11px] mb-3">
                        <div className="flex items-center space-x-1.5 text-gray-300">
                          <Tag className="w-3 h-3 text-purple-400 flex-shrink-0" />
                          <span className="text-gray-400">核心词:</span>
                          <span className="font-semibold text-white truncate">{draft.primaryKeyword}</span>
                        </div>
                        {draft.supportingKeywords.length > 0 && (
                          <div className="text-[10px] text-gray-400 truncate pl-4">
                            支撑词: {draft.supportingKeywords.join(', ')}
                          </div>
                        )}
                        <div className="flex items-center space-x-1.5 text-gray-300 pl-4">
                          <span className="text-gray-400">竞品:</span>
                          <span className="font-mono text-[10px] text-gray-300">{draft.representativeAsins.join(', ')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="pt-2.5 border-t border-border/60 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => setActiveDrawerDraft(draft)}
                        className="text-purple-400 hover:text-purple-300 font-medium flex items-center space-x-1 transition cursor-pointer"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>为什么发现该方向?</span>
                      </button>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {draft.evidenceIds.length} 项证据
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Handoff Step 5 */}
          <div className="mt-8 p-5 rounded-xl bg-gradient-to-r from-purple-950/40 via-surface to-purple-950/40 border border-purple-500/40 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-bold text-white">
                  交接至 Product Research V2 决策对比流水线
                </h4>
              </div>
              <p className="text-xs text-gray-300 mt-1 max-w-2xl leading-relaxed">
                已选中 <strong className="text-purple-300">{selectedDraftIds.size}</strong> 个草案。交接后将生成 ProductCandidate 骨架。
                财务成本与专利将如实标记为 <span className="font-mono bg-black/40 px-1 py-0.5 rounded text-amber-300">UNKNOWN / UNVERIFIED</span>，
                V2 将判定为 <span className="font-mono bg-black/40 px-1 py-0.5 rounded text-amber-300">NEEDS_VALIDATION</span>，绝不伪造虚假 SHORTLIST。
              </p>
              {handoffSuccessMsg && (
                <div className="text-xs text-emerald-400 font-semibold mt-2 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{handoffSuccessMsg}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleHandoff}
              disabled={handoffLoading || selectedDraftIds.size === 0}
              className="px-6 py-2.5 text-xs font-bold rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition flex items-center space-x-2 shadow-lg shadow-purple-600/30 disabled:opacity-50 cursor-pointer flex-shrink-0"
            >
              {handoffLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              <span>执行交接至 V2 对比矩阵 ({selectedDraftIds.size} 个)</span>
            </button>
          </div>
        </div>
      )}

      {/* Why Discovered Drawer (UI Step 4) */}
      {activeDrawerDraft && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-surface border-l border-border w-full max-w-md h-full overflow-y-auto p-6 flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">发现归因追溯 (Why Discovered)</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveDrawerDraft(null)}
                  className="text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4">
                <h4 className="text-base font-bold text-white">{activeDrawerDraft.title}</h4>
                <div className="text-xs text-gray-400 font-mono mt-0.5">{activeDrawerDraft.productType}</div>
                <div className="text-[11px] text-gray-500 font-mono mt-0.5">{activeDrawerDraft.id}</div>
              </div>

              {/* Provenance Flow */}
              <div className="mt-5 space-y-4">
                <div className="text-xs font-semibold text-gray-300">因果追溯链 (Trace Path):</div>
                <div className="bg-background/80 p-3.5 rounded-lg border border-border space-y-2 text-xs">
                  <div>
                    <span className="text-gray-500 block text-[10px]">1. 种子来源</span>
                    <span className="text-purple-300 font-medium">"{runResult?.seedKeyword}"</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">2. 意图核心词</span>
                    <span className="text-white font-medium">"{activeDrawerDraft.primaryKeyword}"</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">3. 支撑搜索词集 ({activeDrawerDraft.supportingKeywords.length} 个)</span>
                    <span className="text-gray-300">{activeDrawerDraft.supportingKeywords.join(', ') || '无额外变体'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">4. 锚定竞品 ASIN ({activeDrawerDraft.representativeAsins.length} 个)</span>
                    <span className="font-mono text-purple-300">{activeDrawerDraft.representativeAsins.join(', ')}</span>
                  </div>
                </div>

                <div className="text-xs font-semibold text-gray-300 mt-4">结构化发现理由 (Discovery Reasons):</div>
                <div className="space-y-2.5">
                  {activeDrawerDraft.discoveryReasons.map((reason, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-background border border-border text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {reason.code}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {reason.metricIds.join(', ')}
                        </span>
                      </div>
                      <p className="text-white text-xs mt-1 leading-relaxed">{reason.conclusion}</p>
                      <div className="text-[10px] text-gray-400 font-mono mt-1.5">
                        证据凭证: {reason.evidenceIds.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>

                {activeDrawerDraft.missingRequirements.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                    <strong className="block mb-1">缺失项说明:</strong>
                    {activeDrawerDraft.missingRequirements.map((miss, idx) => (
                      <span key={idx} className="block text-[11px]">• {miss} 暂未获得有效凭证</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border mt-6">
              <button
                type="button"
                onClick={() => setActiveDrawerDraft(null)}
                className="w-full py-2 text-xs font-semibold rounded-lg bg-surface border border-border text-gray-300 hover:text-white transition cursor-pointer"
              >
                关闭追溯面板
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
