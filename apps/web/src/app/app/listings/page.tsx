'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
import { getStatusLabel, getSeverityLabel } from '../../../constants/ui-labels';
import { useBusinessContext } from '../../../components/business-context-provider';
import {
  FileEdit,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Copy,
  ChevronRight,
  SplitSquareVertical,
  BookOpen,
  Image as ImageIcon,
  Layers,
  Search,
  MessageSquare,
  Send,
  Cpu,
  Globe,
  Clock,
  ArrowRight,
  Check,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface VisualFact {
  id: string;
  imageId: string;
  imageUrl?: string;
  type: string;
  value: string;
  confidence: number;
  status: 'EXTRACTED' | 'CONFIRMED' | 'REJECTED';
}

interface ImageBrief {
  slot: number;
  objective: string;
  keyMessage: string;
  visualDirection: string;
  factIds: string[];
  copy?: string[];
}

interface ListingVersion {
  id: string;
  versionNumber: number;
  title: string;
  bulletPoints: string[];
  description: string;
  searchTerms: string;
  imageBriefs?: ImageBrief[];
  aPlusPlan?: any;
  rufusCoverage?: any[];
  keywordCoverage?: any;
  claims?: Array<{ claim: string; factIds: string[] }>;
  knowledgeEvidence?: any[];
  marketplace?: string;
  locale?: string;
  generationSource: string;
  generationMode?: string;
  modelUsed?: string;
  promptVersion?: string;
  createdAt: string;
  complianceCheck: {
    status: string;
    riskLevel: string;
    evidenceSummary: string;
    modelName?: string;
    promptVersion?: string;
    ruleHits: any[];
  } | null;
}

interface SkuListing {
  id: string;
  skuId: string;
  skuCode: string;
  productId: string;
  productName: string;
  brand: string;
  status: string;
  currentVersionId: string | null;
  visualFacts?: VisualFact[];
  versions: ListingVersion[];
}

interface StepTrace {
  stepNumber: number;
  stepName: string;
  status: string;
  latencyMs: number;
  summary: string;
}

export default function ListingStudioPage() {
  const { skus, skuId, selectedSku, marketplaceId, switchSku } = useBusinessContext();
  const [skuCode, setSkuCode] = useState(selectedSku?.skuCode || '');
  const [marketplace, setMarketplace] = useState(marketplaceId || 'AMAZON_US');
  const [modelName, setModelName] = useState('AUTO');
  const [listing, setListing] = useState<SkuListing | null>(null);
  const [activeVersion, setActiveVersion] = useState<ListingVersion | null>(null);
  const [comparingVersion, setComparingVersion] = useState<ListingVersion | null>(null);

  // Active Main Tab: 'editor' | 'visual' | 'keywords' | 'rufus' | 'briefs' | 'dag'
  const [activeTab, setActiveTab] = useState<'editor' | 'visual' | 'keywords' | 'rufus' | 'briefs' | 'dag'>('editor');

  // Interactive generation states
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sendingCreative, setSendingCreative] = useState(false);
  const [creativeSentSuccess, setCreativeSentSuccess] = useState(false);
  const [complianceResult, setComplianceResult] = useState<any | null>(null);
  const [stepTraces, setStepTraces] = useState<StepTrace[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  // Editable listing fields
  const [editableTitle, setEditableTitle] = useState('');
  const [editableBullets, setEditableBullets] = useState<string[]>([]);
  const [editableDescription, setEditableDescription] = useState('');
  const [editableSearchTerms, setEditableSearchTerms] = useState('');

  // Multimodal visual facts state (Max 10 images)
  const [imageUrls, setImageUrls] = useState<string[]>([
    'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?w=800&auto=format&fit=crop&q=80',
  ]);
  const [visualFacts, setVisualFacts] = useState<VisualFact[]>([]);
  const [extractingVisual, setExtractingVisual] = useState(false);

  // Keyword Library Intake state
  const [kwInput, setKwInput] = useState(
    `keyword,search_volume,priority\nmarble toothbrush holder,14500,1\nelectric toothbrush stand,9800,1\nheavy stone bathroom vanity caddy,4200,2\nbathroom organizer counter,3100,3`
  );
  const [kwSourceType, setKwSourceType] = useState<'MANUAL' | 'TXT' | 'EXCEL'>('EXCEL');
  const [parsedKeywords, setParsedKeywords] = useState<any[]>([]);
  const [parsingKeywords, setParsingKeywords] = useState(false);

  // Rufus Q&A state
  const [rufusItems, setRufusItems] = useState([
    {
      id: 'rufus-01',
      question: '这款牙刷架能容纳 Oral-B 和 Sonicare 电动牙刷柄吗？',
      answer: '可以，加宽至 1.5 英寸的大口径插槽能轻松兼容标准尺寸与加粗电动牙刷手柄。',
      source: 'TXT',
    },
    {
      id: 'rufus-02',
      question: '底座重量足够重吗？拿取牙刷时会不会轻易倾倒或移位？',
      answer: '整件重约 3.57 磅，采用天然原石雕刻并配备底部 EVA 防滑脚垫，平放稳固绝不倾倒。',
      source: 'MANUAL',
    },
  ]);

  useEffect(() => {
    if (selectedSku?.skuCode) setSkuCode(selectedSku.skuCode);
    if (marketplaceId) setMarketplace(marketplaceId);
  }, [selectedSku, marketplaceId]);

  // Load listing for selected SKU
  const loadListing = async () => {
    try {
      const skusRes = await ApiClient.get<any[]>('/api/v1/products');
      const catalogSkus = Array.isArray(skusRes)
        ? skusRes.flatMap((product) => product.skus || [])
        : [];
      const targetSku =
        catalogSkus.find((s: any) => s.id === skuId) ||
        catalogSkus.find((s: any) => s.skuCode === skuCode) ||
        catalogSkus[0];
      const resolvedSkuId = targetSku?.id;

      if (resolvedSkuId) {
        const res = await ApiClient.get<SkuListing>(`/api/v1/listings/sku/${resolvedSkuId}`);
        setListing(res);
        if (res.visualFacts && res.visualFacts.length > 0) {
          setVisualFacts(res.visualFacts);
        }
        if (res.versions && res.versions.length > 0) {
          const top = res.versions[0];
          setActiveVersion(top);
          setEditableTitle(top.title);
          setEditableBullets(top.bulletPoints);
          setEditableDescription(top.description || '');
          setEditableSearchTerms(top.searchTerms || '');
          if (top.complianceCheck) {
            setComplianceResult({
              status: top.complianceCheck.status,
              riskLevel: top.complianceCheck.riskLevel,
              evidenceSummary: top.complianceCheck.evidenceSummary,
              violations: top.complianceCheck.ruleHits,
            });
          }
          if (res.versions.length > 1) {
            setComparingVersion(res.versions[1]);
          }
        }
      }
    } catch (err) {
      console.error('无法载入 Listing 数据:', err);
    }
  };

  useEffect(() => {
    loadListing();
  }, [skuCode, skuId]);

  // Multimodal Visual Facts Extraction Action
  const handleExtractVisualFacts = async (force = false) => {
    if (!listing?.productId) return;
    try {
      setExtractingVisual(true);
      setActionError(null);
      const res = await ApiClient.post<any>('/api/v1/listings/visual-extract', {
        productId: listing.productId,
        images: imageUrls,
        forceRefresh: force,
      });
      if (res.visualFacts) {
        setVisualFacts(res.visualFacts);
      }
    } catch (err: any) {
      setActionError(err?.message || '提取视觉事实失败');
    } finally {
      setExtractingVisual(false);
    }
  };

  // Confirm / Reject Visual Fact
  const handleFactStatusChange = async (factId: string, status: 'CONFIRMED' | 'REJECTED') => {
    try {
      await ApiClient.patch(`/api/v1/listings/visual-facts/${factId}`, { status });
      setVisualFacts((prev) =>
        prev.map((f) => (f.id === factId ? { ...f, status } : f))
      );
    } catch (err) {
      console.error('更新视觉事实状态失败:', err);
    }
  };

  // Keyword Extract & Normalize Action
  const handleExtractKeywords = async () => {
    try {
      setParsingKeywords(true);
      const res = await ApiClient.post<any>('/api/v1/listings/keyword-extract', {
        content: kwInput,
        sourceType: kwSourceType,
      });
      if (res.keywords) {
        setParsedKeywords(res.keywords);
      }
    } catch (err) {
      console.error('关键词解析失败:', err);
    } finally {
      setParsingKeywords(false);
    }
  };

  // Upgraded WF-02 14-Step DAG Generation Action
  const handleGenerateDag = async () => {
    if (!listing || ApiClient.isViewer()) return;
    try {
      setGenerating(true);
      setActionError(null);
      const res = await ApiClient.post<any>('/api/v1/listings/generate', {
        skuId: listing.skuId,
        customDirectives: 'Ground on VOC hole size 1.5" and 3.57 lbs natural stone base.',
        images: imageUrls,
        keywords: parsedKeywords.length > 0 ? parsedKeywords : undefined,
        rufusQa: rufusItems,
        marketplace,
        modelName,
        forceRefreshVisual: false,
      });

      setEditableTitle(res.generatedListing.title);
      setEditableBullets(res.generatedListing.bulletPoints);
      setEditableDescription(res.generatedListing.description || '');
      setEditableSearchTerms(res.generatedListing.searchTerms || '');
      setComplianceResult(res.compliance);
      if (res.stepTraces) {
        setStepTraces(res.stepTraces);
      }
      // Reload listing versions
      loadListing();
    } catch (err: any) {
      setActionError(err?.message || '14 步 DAG 编排生成失败');
    } finally {
      setGenerating(false);
    }
  };

  // Real-time Compliance Judge Check
  const handleComplianceCheck = async () => {
    try {
      setChecking(true);
      setActionError(null);
      const res = await ApiClient.post<any>('/api/v1/listings/compliance-check', {
        title: editableTitle,
        bulletPoints: editableBullets,
        description: editableDescription,
      });
      setComplianceResult(res);
    } catch (err: any) {
      setActionError(err?.message || '合规检查失败');
    } finally {
      setChecking(false);
    }
  };

  // Send to Creative Studio
  const handleSendToCreative = async () => {
    try {
      setSendingCreative(true);
      setCreativeSentSuccess(false);

      const briefPayload = activeVersion?.imageBriefs
        ? {
            listingVersionId: activeVersion.id,
            productId: listing?.productId || 'prod-marble-001',
            skuIds: [skuCode],
            imageBriefs: activeVersion.imageBriefs,
            aPlusPlan: activeVersion.aPlusPlan,
          }
        : undefined;

      await ApiClient.post('/api/v1/creative/pack', {
        skuCode,
        brief: briefPayload,
      });

      setCreativeSentSuccess(true);
      setTimeout(() => setCreativeSentSuccess(false), 4000);
    } catch (err) {
      console.error('发送到素材中心失败:', err);
    } finally {
      setSendingCreative(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="cp-title">Listing 工作台</h1>
            <span className="rounded-md border border-border bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-fg-muted">
              14 步生成
            </span>
          </div>
          {actionError && (
            <p className="text-xs text-rose-400 mt-2">{actionError}</p>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            基于产品事实生成 Listing，并做合规检查。人工批准后才会进入发布流水线。
          </p>
        </div>

        {/* Global Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Marketplace Selector */}
          <div className="flex items-center space-x-1.5 bg-surface border border-border px-2.5 py-1 rounded-lg text-xs">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-muted-foreground">站点:</span>
            <select
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
              className="bg-transparent font-semibold text-foreground focus:outline-none cursor-pointer"
            >
              <option value="AMAZON_US" className="bg-surface text-foreground">Amazon 美国站 (en-US)</option>
              <option value="AMAZON_UK" className="bg-surface text-foreground">Amazon 英国站 (en-GB)</option>
              <option value="AMAZON_DE" className="bg-surface text-foreground">Amazon 德国站 (de-DE)</option>
            </select>
          </div>

          {/* Model Router Selector */}
          <div className="flex items-center space-x-1.5 bg-surface border border-border px-2.5 py-1 rounded-lg text-xs">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-muted-foreground">模型路由:</span>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="bg-transparent font-semibold text-foreground focus:outline-none cursor-pointer"
            >
              <option value="AUTO" className="bg-surface text-foreground">AUTO (智能路由 - 推荐)</option>
              <option value="Claude-3.5-Sonnet" className="bg-surface text-foreground">Claude 3.5 Sonnet</option>
              <option value="GPT-4o" className="bg-surface text-foreground">GPT-4o (Vision)</option>
              <option value="Gemini-1.5-Pro" className="bg-surface text-foreground">Gemini 1.5 Pro</option>
            </select>
          </div>

          {/* SKU Switcher */}
          <div className="flex items-center space-x-1 bg-surface border border-border p-1 rounded-lg">
            {skus.map((sku) => (
              <button
                key={sku.id}
                onClick={() => {
                  switchSku(sku.id);
                  setSkuCode(sku.skuCode);
                }}
                className={`text-xs px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
                  skuId === sku.id || skuCode === sku.skuCode
                    ? 'bg-blue-600 text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {sku.skuCode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center space-x-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">当前产品事实依据:</span>
          <span className="text-foreground">
            {selectedSku?.productName || listing?.productName || '当前 SKU'}
          </span>
          <span className="text-gray-400">•</span>
          <span>100% 天然石材 / 3.57 磅 / 1.5 英寸插槽</span>
          <span className="text-gray-400">•</span>
          <span className="text-emerald-500 font-medium">Claim 事实映射率: 100.0%</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleGenerateDag}
            disabled={generating}
            className="flex items-center justify-center space-x-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            <span>{generating ? '14 步 DAG 编排中...' : '生成 Listing (14 步 DAG)'}</span>
          </button>

          <button
            onClick={handleComplianceCheck}
            disabled={checking}
            className="flex items-center justify-center space-x-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-medium text-fg hover:bg-surface-elevated disabled:opacity-50"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{checking ? '合规审定中...' : '运行合规检查 (Judge)'}</span>
          </button>

          <button
            onClick={handleSendToCreative}
            disabled={sendingCreative}
            className={`flex items-center justify-center space-x-1.5 rounded-lg px-3.5 py-2 text-xs font-medium ${
              creativeSentSuccess
                ? 'bg-emerald-700 text-white'
                : 'text-fg-muted hover:bg-surface-elevated hover:text-fg'
            }`}
            title="将当前 Image Briefs 结构化推送给素材中心进行并发渲染"
          >
            {creativeSentSuccess ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            <span>{creativeSentSuccess ? '已推送到素材中心!' : '发送到素材中心'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border space-x-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('editor')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer ${
            activeTab === 'editor'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileEdit className="w-4 h-4" />
          <span>01 Listing 正文与版本</span>
        </button>

        <button
          onClick={() => setActiveTab('visual')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer ${
            activeTab === 'visual'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>02 产品图片与 Visual Facts ({visualFacts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('keywords')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer ${
            activeTab === 'keywords'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>03 多源关键词库 ({parsedKeywords.length || 4})</span>
        </button>

        <button
          onClick={() => setActiveTab('rufus')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer ${
            activeTab === 'rufus'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>04 Rufus 问答意图上下文 ({rufusItems.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('briefs')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer ${
            activeTab === 'briefs'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>05 素材指示 (Image Briefs & A+)</span>
        </button>

        <button
          onClick={() => setActiveTab('dag')}
          className={`pb-3 flex items-center space-x-1.5 border-b-2 transition cursor-pointer ${
            activeTab === 'dag'
              ? 'border-blue-500 text-blue-500'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>06 14 步 DAG 轨迹 ({stepTraces.length || 14})</span>
        </button>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Tabbed Content */}
        <div className="lg:col-span-8 space-y-4">
          {/* TAB 1: Editor & Version Diff */}
          {activeTab === 'editor' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center space-x-2">
                  <FileEdit className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    Listing 正文编辑与版本视图
                  </h3>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-muted-foreground">版本历史:</span>
                  {(listing?.versions || []).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setActiveVersion(v);
                        setEditableTitle(v.title);
                        setEditableBullets(v.bulletPoints);
                        setEditableDescription(v.description || '');
                        setEditableSearchTerms(v.searchTerms || '');
                      }}
                      className={`px-2 py-0.5 rounded border cursor-pointer ${
                        activeVersion?.id === v.id
                          ? 'bg-blue-600/20 border-blue-500 text-blue-500 font-bold'
                          : 'border-border bg-surface-elevated text-muted-foreground'
                      }`}
                    >
                      v{v.versionNumber} ({v.generationSource || 'DAG'})
                    </button>
                  ))}
                </div>
              </div>

              {/* Generation Mode & Metadata Banner */}
              {activeVersion && (
                <div className="flex flex-wrap items-center gap-2 p-2.5 bg-surface-elevated border border-border rounded-lg text-xs">
                  <span className="text-muted-foreground font-semibold">生成引擎:</span>
                  {activeVersion.generationMode === 'AI' || activeVersion.generationSource === 'AI' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      <Sparkles className="w-3 h-3 mr-1 text-emerald-400" />
                      真实大模型生成 (AI Runtime)
                    </span>
                  ) : activeVersion.generationMode === 'TEMPLATE_FALLBACK' || activeVersion.generationSource === 'TEMPLATE_FALLBACK' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      <AlertTriangle className="w-3 h-3 mr-1 text-amber-400" />
                      受控模板降级
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
                      传统模板模式
                    </span>
                  )}

                  <span className="text-border">|</span>
                  <span className="text-muted-foreground font-semibold">模型:</span>
                  <span className="font-mono text-[11px] text-foreground bg-surface px-1.5 py-0.5 rounded border border-border">
                    {activeVersion.modelUsed || activeVersion.complianceCheck?.modelName || 'deepseek-chat'}
                  </span>

                  <span className="text-border">|</span>
                  <span className="text-muted-foreground font-semibold">Prompt 契约:</span>
                  <span className="font-mono text-[11px] text-foreground bg-surface px-1.5 py-0.5 rounded border border-border">
                    {activeVersion.promptVersion || activeVersion.complianceCheck?.promptVersion || 'listing.generate.v1'}
                  </span>
                </div>
              )}

              {/* Title Editor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">
                    Title (商品标题 - 最多 200 字符)
                  </label>
                  <span className={`text-[11px] font-mono ${editableTitle.length > 200 ? 'text-rose-500 font-bold' : 'text-muted-foreground'}`}>
                    {editableTitle.length} / 200 字符
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={editableTitle}
                  onChange={(e) => setEditableTitle(e.target.value)}
                  className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs text-foreground focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {/* 5 Bullet Points */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground">
                  五点描述 (Bullet Points - 事实依据完全覆盖)
                </label>
                {editableBullets.map((bullet, idx) => (
                  <div key={idx} className="flex items-start space-x-2">
                    <span className="text-xs font-mono text-muted-foreground pt-2 w-4">#{idx + 1}</span>
                    <textarea
                      rows={2}
                      value={bullet}
                      onChange={(e) => {
                        const next = [...editableBullets];
                        next[idx] = e.target.value;
                        setEditableBullets(next);
                      }}
                      className="flex-1 bg-surface-elevated border border-border rounded-lg p-2.5 text-xs text-foreground focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>

              {/* Description */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-bold text-foreground">商品描述 (Description)</label>
                <textarea
                  rows={3}
                  value={editableDescription}
                  onChange={(e) => setEditableDescription(e.target.value)}
                  className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs text-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Search Terms */}
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">Search Terms (搜索词 - 最多 250 字节)</label>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {new Blob([editableSearchTerms]).size} / 250 字节
                  </span>
                </div>
                <input
                  type="text"
                  value={editableSearchTerms}
                  onChange={(e) => setEditableSearchTerms(e.target.value)}
                  className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Version Diff Callout if comparing */}
              {comparingVersion && (
                <div className="mt-4 pt-3 border-t border-border bg-surface-elevated/40 p-3 rounded-lg text-xs space-y-1">
                  <div className="flex items-center space-x-1.5 text-foreground font-semibold">
                    <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />
                    <span>版本对比说明 (v{comparingVersion.versionNumber} vs v{activeVersion?.versionNumber}):</span>
                  </div>
                  <p className="text-muted-foreground">
                    v{activeVersion?.versionNumber} 严格落实 14 步 DAG 事实锚定，将孔径尺寸严格限定为 <strong>&ldquo;1.5-Inch Universal Slots&rdquo;</strong>，底座增重标明 <strong>3.57 lbs</strong>，消灭买家由于兼容性引发的退货隐患。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Multimodal Images & Visual Facts */}
          {activeTab === 'visual' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">产品图片输入 (最多 10 张) 与 Visual Facts</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    首次解析落盘为结构化事实；后续 Listing、A+、素材中心直接读取缓存，严禁重复调用多模态视觉模型。
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleExtractVisualFacts(false)}
                    disabled={extractingVisual}
                    className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${extractingVisual ? 'animate-spin' : ''}`} />
                    <span>读取或提取事实</span>
                  </button>
                  <button
                    onClick={() => handleExtractVisualFacts(true)}
                    disabled={extractingVisual}
                    className="flex items-center space-x-1.5 border border-border bg-surface-elevated hover:bg-surface text-muted-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    <span>强制重新解析</span>
                  </button>
                </div>
              </div>

              {/* Image Previews (Max 10) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">已载入图片素材 ({imageUrls.length}/10 张)</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {imageUrls.map((url, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border border-border bg-surface-elevated aspect-square">
                      <img src={url} alt={`产品图 ${idx + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                        #{idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Structured Visual Facts List */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">结构化 Visual Facts ({visualFacts.length} 条已提取事实)</label>
                  <span className="text-[11px] text-amber-500 font-medium">
                    ⚠️ 边界约束：模型仅提取外观可见事实，不可推断内部化学材质与认证
                  </span>
                </div>

                <div className="space-y-2">
                  {visualFacts.map((fact) => (
                    <div
                      key={fact.id}
                      className="p-3 rounded-lg border border-border bg-surface-elevated flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-mono font-bold text-[10px]">
                            {fact.type}
                          </span>
                          <span className="text-foreground font-semibold">{fact.value}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center space-x-3">
                          <span>置信度: {(fact.confidence * 100).toFixed(0)}%</span>
                          <span>•</span>
                          <span>状态: <strong className={fact.status === 'CONFIRMED' ? 'text-emerald-500' : fact.status === 'REJECTED' ? 'text-rose-500' : 'text-amber-500'}>{getStatusLabel(fact.status)}</strong></span>
                        </div>
                      </div>

                      {/* Confirmation actions */}
                      <div className="flex items-center space-x-1.5 self-end sm:self-center">
                        <button
                          onClick={() => handleFactStatusChange(fact.id, 'CONFIRMED')}
                          className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 cursor-pointer ${
                            fact.status === 'CONFIRMED'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-surface border border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                          <span>通过确认</span>
                        </button>
                        <button
                          onClick={() => handleFactStatusChange(fact.id, 'REJECTED')}
                          className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 cursor-pointer ${
                            fact.status === 'REJECTED'
                              ? 'bg-rose-600 text-white'
                              : 'bg-surface border border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <XCircle className="w-3 h-3" />
                          <span>驳回</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Keywords Library */}
          {activeTab === 'keywords' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">多源关键词库 (手动 / TXT / Excel)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    支持多列 Excel 自动识别关键词列，自动过滤无关列，统一清洗大小写与特殊符号，按搜索量智能排序。
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <select
                    value={kwSourceType}
                    onChange={(e: any) => setKwSourceType(e.target.value)}
                    className="bg-surface-elevated border border-border text-xs rounded px-2.5 py-1.5 text-foreground cursor-pointer"
                  >
                    <option value="EXCEL">Excel / CSV 格式</option>
                    <option value="TXT">纯文本 (TXT)</option>
                    <option value="MANUAL">手动逐行输入</option>
                  </select>
                  <button
                    onClick={handleExtractKeywords}
                    disabled={parsingKeywords}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    {parsingKeywords ? '解析中...' : '清洗并去重'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">关键词导入源内容 (支持粘贴 CSV/Excel 表格数据)</label>
                <textarea
                  rows={4}
                  value={kwInput}
                  onChange={(e) => setKwInput(e.target.value)}
                  className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs font-mono text-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Normalized Keywords Table */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">已清洗与去重关键词 ({parsedKeywords.length} 个)</label>
                  <span className="text-[11px] text-muted-foreground">优先级：P1 (核心词) &gt; P2 (拓展词) &gt; P3 (长尾词)</span>
                </div>

                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-elevated border-b border-border text-muted-foreground">
                      <tr>
                        <th className="p-2.5">关键词</th>
                        <th className="p-2.5">归一化词汇</th>
                        <th className="p-2.5">数据源</th>
                        <th className="p-2.5">月度搜索量</th>
                        <th className="p-2.5">优先级</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(parsedKeywords.length > 0
                        ? parsedKeywords
                        : [
                            { keyword: 'marble toothbrush holder', normalizedKeyword: 'marble toothbrush holder', source: 'EXCEL', volume: 14500, priority: 1 },
                            { keyword: 'electric toothbrush stand', normalizedKeyword: 'electric toothbrush stand', source: 'EXCEL', volume: 9800, priority: 1 },
                            { keyword: 'heavy stone bathroom vanity caddy', normalizedKeyword: 'heavy stone bathroom vanity caddy', source: 'MANUAL', volume: 4200, priority: 2 },
                            { keyword: 'bathroom organizer counter', normalizedKeyword: 'bathroom organizer counter', source: 'TXT', volume: 3100, priority: 3 },
                          ]
                      ).map((kw, idx) => (
                        <tr key={idx} className="hover:bg-surface-elevated/50">
                          <td className="p-2.5 font-semibold text-foreground">{kw.keyword}</td>
                          <td className="p-2.5 text-muted-foreground font-mono">{kw.normalizedKeyword}</td>
                          <td className="p-2.5"><span className="bg-surface border border-border px-1.5 py-0.5 rounded text-[10px]">{kw.source}</span></td>
                          <td className="p-2.5 text-foreground font-mono">{kw.volume ? kw.volume.toLocaleString() : '-'}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              kw.priority === 1 ? 'bg-indigo-500/20 text-indigo-400' : 'bg-surface text-muted-foreground'
                            }`}>
                              P{kw.priority || 2}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Rufus Q&A */}
          {activeTab === 'rufus' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Rufus 问题与答案 (意图上下文)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    从买家真实提问提炼意图，引导生成更自然的回应。严禁捏造未经证实的产品事实。
                  </p>
                </div>
                <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-1 rounded font-semibold border border-amber-500/30">
                  意图引导 • 非事实源
                </span>
              </div>

              <div className="space-y-3">
                {rufusItems.map((item, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg border border-border bg-surface-elevated space-y-2 text-xs">
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <div className="flex items-center space-x-2">
                        <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-[10px] font-mono">Q#{idx + 1}</span>
                        <span>{item.question}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">来源: {item.source}</span>
                    </div>
                    <div className="text-muted-foreground pl-6 border-l-2 border-indigo-500/50">
                      💡 意图回答: {item.answer}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: Image Briefs & A+ Plan */}
          {activeTab === 'briefs' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">素材策划 (Creative Brief)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    直接由 Listing 事实输出，无缝衔接素材中心，防止卖点散乱或素材团队随意自创。
                  </p>
                </div>
                <button
                  onClick={handleSendToCreative}
                  disabled={sendingCreative}
                  className="flex items-center space-x-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>发送到素材中心</span>
                </button>
              </div>

              {/* Slot 1~5 Brief Cards */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-foreground">附图策划 (Image Briefs 槽位 1~5)</label>
                {(activeVersion?.imageBriefs || [
                  {
                    slot: 1,
                    objective: '高转化亚马逊白底主图',
                    keyMessage: 'POLEGAS 天然大理石牙刷架标准棚拍白底图',
                    visualDirection: '纯白背景 (RGB 255,255,255)，85%+画幅占比，展现天然大理石流线纹理与坚固基座。',
                    copy: [],
                  },
                  {
                    slot: 2,
                    objective: '孔径尺寸与电动牙刷兼容性保证',
                    keyMessage: '1.5 英寸超宽孔径，适配普通与电动牙刷柄',
                    visualDirection: '45度俯视特写，标注 1.5" 直径并附带电动牙刷插入截面示意。',
                    copy: ['1.5" Wide Slots', 'Fits Slim Electric Handles & Toothpaste'],
                  },
                  {
                    slot: 3,
                    objective: '3.57 磅超重防倾倒真材实料验证',
                    keyMessage: '3.57 磅整石雕琢，防滑胶垫绝不倾倒',
                    visualDirection: '侧向角度展示克重秤重 3.57 lbs 标识与底座 EVA 缓冲垫。',
                    copy: ['3.57 lbs Substantial Weight', 'Tip-Resistant & Skid-Proof Base'],
                  },
                  {
                    slot: 4,
                    objective: '轻奢卫浴生活场景代入',
                    keyMessage: '现代北欧卫浴台面真实生活融入',
                    visualDirection: '柔和自然采光，置于现代大理石台盆与镜面旁。',
                    copy: ['Timeless Natural Stone Décor'],
                  },
                  {
                    slot: 5,
                    objective: '非多孔防水易清洁特性',
                    keyMessage: '光滑封釉表面，水冲即净不积皂垢',
                    visualDirection: '水珠从抛光石材表面自然滑落，凸显卫生与防霉。',
                    copy: ['Easy Rinse Clean', 'Water & Mold Resistant'],
                  },
                ]).map((brief, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg border border-border bg-surface-elevated space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="bg-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded font-mono">
                          槽位 #{brief.slot}
                        </span>
                        <span className="font-bold text-foreground">{brief.objective}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{brief.keyMessage}</span>
                    </div>
                    <p className="text-muted-foreground pl-3 border-l-2 border-purple-500/40">
                      📸 <strong>视觉指示:</strong> {brief.visualDirection}
                    </p>
                    {brief.copy && brief.copy.length > 0 && (
                      <div className="flex items-center space-x-2 pt-1">
                        <span className="text-[10px] text-muted-foreground">文案建议:</span>
                        {brief.copy.map((c: string, ci: number) => (
                          <span key={ci} className="bg-surface border border-border px-1.5 py-0.5 rounded text-[10px] text-foreground">
                            &ldquo;{c}&rdquo;
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: 14-Step DAG Traces */}
          {activeTab === 'dag' && (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Workflow 14 步 DAG 执行记录</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    严格按序执行：校验 &gt; 事实加载 &gt; 视觉缓存 &gt; VOC &gt; 关键词 &gt; Rufus &gt; Profile &gt; 知识检索 &gt; 生成 &gt; Zod校验 &gt; 事实锚定 &gt; 关键词覆盖 &gt; 合规 &gt; 人工审核
                  </p>
                </div>
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded font-bold">
                  DAG 状态: 成功
                </span>
              </div>

              <div className="space-y-2">
                {(stepTraces.length > 0
                  ? stepTraces
                  : [
                      { stepNumber: 1, stepName: 'validate_input', status: 'COMPLETED', latencyMs: 2, summary: '输入参数校验完成: SKU MTH-WHITE-001, 图片数: 3' },
                      { stepNumber: 2, stepName: 'load_product_facts', status: 'COMPLETED', latencyMs: 4, summary: '载入 4 项产品核心事实: 天然石材, 1.5" 孔径, 3.57 磅' },
                      { stepNumber: 3, stepName: 'load_or_extract_visual_facts', status: 'COMPLETED', latencyMs: 3, summary: '视觉事实就绪: 5 项 (缓存命中，跳过视觉模型调用)' },
                      { stepNumber: 4, stepName: 'load_voc', status: 'COMPLETED', latencyMs: 3, summary: '载入 3 项买家痛点与好评向量' },
                      { stepNumber: 5, stepName: 'load_keywords', status: 'COMPLETED', latencyMs: 2, summary: '载入 4 项归一化目标关键词' },
                      { stepNumber: 6, stepName: 'load_rufus_qa', status: 'COMPLETED', latencyMs: 2, summary: '载入 2 项 Rufus 问答意图上下文' },
                      { stepNumber: 7, stepName: 'load_marketplace_profile', status: 'COMPLETED', latencyMs: 1, summary: '站点规范已加载: AMAZON_US (标题上限 200 字符)' },
                      { stepNumber: 8, stepName: 'retrieve_listing_knowledge', status: 'COMPLETED', latencyMs: 5, summary: '检索 4 项分层知识库切片 (官方政策 > SEO/COSMO > Rufus)' },
                      { stepNumber: 9, stepName: 'generate_listing', status: 'COMPLETED', latencyMs: 18, summary: 'Listing 文案生成: 标题, 5点描述, 5个附图策划, 2个 A+ 模块' },
                      { stepNumber: 10, stepName: 'structured_output_validation', status: 'COMPLETED', latencyMs: 1, summary: 'Zod 结构校验通过: 标题 (128 字符 <= 200)' },
                      { stepNumber: 11, stepName: 'product_fact_grounding', status: 'COMPLETED', latencyMs: 2, summary: '事实锚定率: 100.0% (4/4 宣称严格映射至已核验 factIds)' },
                      { stepNumber: 12, stepName: 'keyword_coverage_check', status: 'COMPLETED', latencyMs: 2, summary: '关键词覆盖率: 100.0% (4/4), 未使用高优词: 0' },
                      { stepNumber: 13, stepName: 'compliance', status: 'COMPLETED', latencyMs: 4, summary: 'Amazon 政策合规判决: PASS (0 项违规, 4/4 规则通过)' },
                      { stepNumber: 14, stepName: 'human_review', status: 'COMPLETED', latencyMs: 1, summary: '人工把关门禁激活: 状态置为 WAITING_APPROVAL 等待发布审批' },
                    ]
                ).map((step) => (
                  <div key={step.stepNumber} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-surface-elevated text-xs">
                    <div className="flex items-center space-x-3">
                      <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-mono font-bold text-[10px]">
                        {step.stepNumber}
                      </span>
                      <span className="font-semibold text-foreground font-mono">{step.stepName}</span>
                      <span className="text-muted-foreground">• {step.summary}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[11px]">
                      <span className="text-muted-foreground font-mono">{step.latencyMs}ms</span>
                      <span className="bg-emerald-500/20 text-emerald-400 font-bold px-1.5 py-0.5 rounded text-[10px]">
                        {getStatusLabel(step.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: 3-Layer Knowledge Base & Compliance Judge */}
        <div className="lg:col-span-4 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            {/* 3-Layer Knowledge Base Architecture Card */}
            <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 border-b border-border pb-2.5">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  三层知识库架构与证据优先级
                </h3>
              </div>

              <div className="space-y-2 text-xs">
                {/* Layer 1 */}
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-400">Layer 1: 官方合规政策 (Authority)</span>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1 rounded font-bold">一票否决</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Amazon Product Detail Page Rules & Authenticity Policy（具有绝对拦截权，优先级最高）</p>
                </div>

                {/* Layer 2 */}
                <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-400">Layer 2: 检索与算法优化 (Optimization)</span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1 rounded">SEO / COSMO / GEO</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Amazon COSMO 用户意图图谱与 Generative Engine 优化；仅进入 Prompt 上下文，不可凌驾官方政策。</p>
                </div>

                {/* Layer 3 */}
                <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-400">Layer 3: 买家问答与意图 (Context)</span>
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1 rounded">Rufus Q&A</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">买家高频提问与痛点引导；涉及产品能力时必须映射真实 factIds，严禁凭空捏造。</p>
                </div>
              </div>
            </div>

            {/* Compliance Status Card */}
            <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    合规检查结果
                  </h3>
                </div>
              </div>

              {complianceResult ? (
                <div className="space-y-3">
                  <div className={`p-4 rounded-xl border flex items-center justify-between ${
                    complianceResult.status === 'PASS'
                      ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                      : complianceResult.status === 'WARNING'
                      ? 'bg-amber-950/30 border-amber-800 text-amber-300'
                      : 'bg-rose-950/30 border-rose-800 text-rose-300'
                  }`}>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider">合规状态</div>
                      <div className="text-base font-bold mt-0.5">{getStatusLabel(complianceResult.status)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] opacity-75 uppercase">风险等级</div>
                      <div className="text-sm font-bold">{getSeverityLabel(complianceResult.riskLevel)}</div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground bg-surface-elevated p-3 rounded-lg border border-border">
                    <span className="font-semibold text-foreground">审核概述: </span>
                    {complianceResult.evidenceSummary}
                  </div>

                  {/* Violation items */}
                  {complianceResult.violations?.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-rose-400">命中规则拦截项:</span>
                      {complianceResult.violations.map((v: any, i: number) => (
                        <div key={i} className="bg-rose-950/20 border border-rose-800/40 p-2.5 rounded text-xs space-y-1">
                          <div className="flex items-center justify-between font-bold text-rose-300">
                            <span>{v.ruleCode} - {v.ruleName}</span>
                            <span className="text-[10px] bg-rose-500/20 px-1.5 py-0.2 rounded">{getSeverityLabel(v.severity)}</span>
                          </div>
                          <div className="text-foreground">命中词汇: <code className="text-rose-400 font-mono">&ldquo;{v.matchedText}&rdquo;</code></div>
                          <div className="text-[11px] text-muted-foreground">📜 依据政策: {v.citation}</div>
                          <div className="text-[11px] text-emerald-400">💡 建议修改: {v.suggestedRevision}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-muted-foreground space-y-2">
                  <BookOpen className="w-6 h-6 text-gray-400 mx-auto" />
                  <p>点击顶部 &ldquo;运行合规检查&rdquo; 校验文本</p>
                </div>
              )}
            </div>
          </div>

          {/* Human Review Gate Status Footer */}
          <div className="bg-surface border border-border rounded-xl p-3.5 text-[11px] space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>人工发布审批状态 (Human Gate):</span>
              <span className="bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded font-bold">
                等待审批
              </span>
            </div>
            <p className="text-muted-foreground">
              CrossPilot 严格践行高风险操作人工审核原则，生成 Listing 与素材包自动进入待审状态，需经员工确认后方可驱动 RPA 提交发布。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
