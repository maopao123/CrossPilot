'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
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
} from 'lucide-react';

interface ListingVersion {
  id: string;
  versionNumber: number;
  title: string;
  bulletPoints: string[];
  description: string;
  searchTerms: string;
  generationSource: string;
  createdAt: string;
  complianceCheck: {
    status: string;
    riskLevel: string;
    evidenceSummary: string;
    ruleHits: any[];
  } | null;
}

interface SkuListing {
  id: string;
  skuId: string;
  skuCode: string;
  productName: string;
  brand: string;
  status: string;
  currentVersionId: string | null;
  versions: ListingVersion[];
}

export default function ListingStudioPage() {
  const [skuCode, setSkuCode] = useState('MTH-WHITE-001');
  const [listing, setListing] = useState<SkuListing | null>(null);
  const [activeVersion, setActiveVersion] = useState<ListingVersion | null>(null);
  const [comparingVersion, setComparingVersion] = useState<ListingVersion | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [complianceResult, setComplianceResult] = useState<any | null>(null);
  const [editableTitle, setEditableTitle] = useState('');
  const [editableBullets, setEditableBullets] = useState<string[]>([]);

  // Load listing for selected SKU
  const loadListing = async () => {
    try {
      // First get SKUs list to obtain skuId
      const skusRes = await ApiClient.get<any[]>('/api/v1/products');
      let skuId = '';
      if (Array.isArray(skusRes) && skusRes.length > 0 && skusRes[0].skus) {
        const targetSku = skusRes[0].skus.find((s: any) => s.skuCode === skuCode) || skusRes[0].skus[0];
        skuId = targetSku.id;
      }

      if (skuId) {
        const res = await ApiClient.get<SkuListing>(`/api/v1/listings/sku/${skuId}`);
        setListing(res);
        if (res.versions && res.versions.length > 0) {
          setActiveVersion(res.versions[0]);
          setEditableTitle(res.versions[0].title);
          setEditableBullets(res.versions[0].bulletPoints);
          if (res.versions.length > 1) {
            setComparingVersion(res.versions[1]);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load listing:', err);
    }
  };

  useEffect(() => {
    loadListing();
  }, [skuCode]);

  // Fact-Grounded Generation Action
  const handleGenerate = async () => {
    if (!listing) return;
    try {
      setGenerating(true);
      const res = await ApiClient.post<any>('/api/v1/listings/generate', {
        skuId: listing.skuId,
        customDirectives: 'Ground on VOC hole size 1.5" and 3.57 lbs natural stone base.',
      });

      setEditableTitle(res.generatedListing.title);
      setEditableBullets(res.generatedListing.bulletPoints);
      setComplianceResult(res.compliance);
    } catch (err) {
      console.error('Generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Real-time Compliance Judge Check
  const handleComplianceCheck = async () => {
    try {
      setChecking(true);
      const res = await ApiClient.post<any>('/api/v1/listings/compliance-check', {
        title: editableTitle,
        bulletPoints: editableBullets,
      });
      setComplianceResult(res);
    } catch (err) {
      console.error('Compliance check failed:', err);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">07 Listing 工作台 (Listing Studio)</h1>
            <span className="text-xs bg-indigo-500/20 text-indigo-400 font-semibold px-2 py-0.5 rounded border border-indigo-500/30">
              Milestone 4: Groundedness & Compliance Judge
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            基于真实产品事实与 VOC 证据驱动生成 • 亚马逊合规判决器（Policy RAG）
          </p>
        </div>

        {/* SKU Selector Switcher */}
        <div className="flex items-center space-x-2">
          {['MTH-WHITE-001', 'MTH-GREEN-001', 'MTH-GREY-001'].map((code) => (
            <button
              key={code}
              onClick={() => setSkuCode(code)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition ${
                skuCode === code
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-surface border-border text-gray-400 hover:text-gray-200'
              }`}
            >
              {code.replace('MTH-', '')}
            </button>
          ))}
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-3 text-xs text-gray-300">
          <span className="font-semibold text-white">当前产品:</span>
          <span>POLEGAS Natural Marble Toothbrush Holder</span>
          <span className="text-gray-500">•</span>
          <span className="text-gray-400">约束: 100% Real Marble / 3.57 lbs / 1.5&quot; Slots</span>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center justify-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-md w-full sm:w-auto"
          >
            <Sparkles className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            <span>{generating ? '依据产品事实生成中...' : 'AI 事实约束生成 (Generate)'}</span>
          </button>

          <button
            onClick={handleComplianceCheck}
            disabled={checking}
            className="flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-md w-full sm:w-auto"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{checking ? '审核中...' : '运行合规判决器 (Judge)'}</span>
          </button>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Listing Content Editor & Multi-Version Diff */}
        <div className="lg:col-span-8 bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center space-x-2">
              <FileEdit className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Listing 正文编辑与版本视图
              </h3>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-gray-400">版本历史:</span>
              {(listing?.versions || []).map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setActiveVersion(v);
                    setEditableTitle(v.title);
                    setEditableBullets(v.bulletPoints);
                  }}
                  className={`px-2 py-0.5 rounded border ${
                    activeVersion?.id === v.id
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold'
                      : 'border-border bg-surface-elevated text-gray-400'
                  }`}
                >
                  v{v.versionNumber} ({v.generationSource})
                </button>
              ))}
            </div>
          </div>

          {/* Title Editor */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-300">商品标题 (Title - Max 200 chars)</label>
            <textarea
              rows={2}
              value={editableTitle}
              onChange={(e) => setEditableTitle(e.target.value)}
              className="w-full bg-surface-elevated border border-border rounded-lg p-3 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
            />
          </div>

          {/* 5 Bullet Points */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-300">五点描述 (5 Bullet Points - Feature Grounded)</label>
            {editableBullets.map((bullet, idx) => (
              <div key={idx} className="flex items-start space-x-2">
                <span className="text-xs font-mono text-gray-500 pt-2 w-4">#{idx + 1}</span>
                <textarea
                  rows={2}
                  value={bullet}
                  onChange={(e) => {
                    const next = [...editableBullets];
                    next[idx] = e.target.value;
                    setEditableBullets(next);
                  }}
                  className="flex-1 bg-surface-elevated border border-border rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}
          </div>

          {/* Version Diff Callout if comparing */}
          {comparingVersion && (
            <div className="mt-4 pt-3 border-t border-border bg-surface-elevated/40 p-3 rounded-lg text-xs space-y-1">
              <div className="flex items-center space-x-1.5 text-gray-300 font-semibold">
                <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-400" />
                <span>版本对比说明 (v1 vs v2):</span>
              </div>
              <p className="text-gray-400">
                v2 依据 VOC 痛点将第2条五点特别补充了 <strong>&ldquo;1.5-Inch Universal Slots&rdquo;</strong> 兼容说明，并在标题中补充净重 3.57 lbs 真实事实，消除买家误解。
              </p>
            </div>
          )}
        </div>

        {/* Right: Compliance Judge & Policy Evidence Gate */}
        <div className="lg:col-span-4 bg-surface border border-border rounded-xl p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  合规审查与政策证据闸口
                </h3>
              </div>
            </div>

            {/* Compliance Status Card */}
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
                    <div className="text-xs font-bold uppercase tracking-wider">Compliance Status</div>
                    <div className="text-lg font-bold mt-0.5">{complianceResult.status}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400 uppercase">Risk Level</div>
                    <div className="text-sm font-bold">{complianceResult.riskLevel}</div>
                  </div>
                </div>

                <div className="text-xs text-gray-300 bg-surface-elevated p-3 rounded-lg border border-border">
                  <span className="font-semibold text-white">审核结果概述: </span>
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
                          <span className="text-[10px] bg-rose-500/20 px-1.5 py-0.2 rounded">{v.severity}</span>
                        </div>
                        <div className="text-gray-300">命中词汇: <code className="text-rose-400 font-mono">&ldquo;{v.matchedText}&rdquo;</code></div>
                        <div className="text-[11px] text-gray-400">📜 依据政策: {v.citation}</div>
                        <div className="text-[11px] text-emerald-400">💡 建议修改: {v.suggestedRevision}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10 text-xs text-gray-400 space-y-2">
                <BookOpen className="w-8 h-8 text-gray-600 mx-auto" />
                <p>点击上方 &ldquo;运行合规判决器&rdquo; 校验文本</p>
                <p className="text-[11px] text-gray-500">检测范围：FDA医疗宣称、极值排名词、材质虚标、尺寸事实</p>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-border text-[11px] text-gray-500 flex items-center justify-between">
            <span>政策库依据: Amazon Policy RAG 2026</span>
            <span className="text-emerald-400 font-medium">4 条刚性审查规则</span>
          </div>
        </div>
      </div>
    </div>
  );
}
