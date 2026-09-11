'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
import {
  Users,
  MessageSquare,
  Star,
  ExternalLink,
  ChevronRight,
  Sparkles,
  AlertCircle,
  ThumbsUp,
  CheckCircle2,
} from 'lucide-react';

interface Competitor {
  id: string;
  asin: string;
  brand: string;
  title: string;
  category: string;
  price: number;
  rating: number;
  reviewCount: number;
  estimatedSales: number;
  estimatedRevenue: number;
  bsr: number;
}

interface VocTopic {
  id: string;
  topicName: string;
  topicType: string;
  sentiment: string;
  reviewCount: number;
  percentage: number;
  severityScore: number;
  summary: string;
  evidenceQuotes: Array<{
    reviewId: string;
    quote: string;
    reviewer: string;
    rating: number;
  }>;
}

interface TopicEvidenceDetails {
  topicId: string;
  topicName: string;
  sentiment: string;
  percentage: number;
  evidenceCount: number;
  evidenceReviews: Array<{
    id: string;
    reviewerName: string;
    rating: number;
    reviewDate: string;
    title: string;
    content: string;
    highlightedEvidence: string;
    relevanceScore: number;
  }>;
}

export default function CompetitorAndVocPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [topics, setTopics] = useState<VocTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<VocTopic | null>(null);
  const [topicEvidence, setTopicEvidence] = useState<TopicEvidenceDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [compRes, topicRes] = await Promise.allSettled([
          ApiClient.get<Competitor[]>('/api/v1/competitors'),
          ApiClient.get<VocTopic[]>('/api/v1/voc/topics'),
        ]);

        if (compRes.status === 'fulfilled' && Array.isArray(compRes.value)) {
          setCompetitors(compRes.value);
        }
        if (topicRes.status === 'fulfilled' && Array.isArray(topicRes.value)) {
          setTopics(topicRes.value);
          if (topicRes.value.length > 0) {
            setSelectedTopic(topicRes.value[0]);
            loadTopicEvidence(topicRes.value[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load competitors & VOC:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const loadTopicEvidence = async (topicId: string) => {
    try {
      const res = await ApiClient.get<TopicEvidenceDetails>(`/api/v1/voc/topics/${topicId}/evidence`);
      setTopicEvidence(res);
    } catch (err) {
      console.error('Failed to load topic evidence:', err);
    }
  };

  const handleSelectTopic = (topic: VocTopic) => {
    setSelectedTopic(topic);
    loadTopicEvidence(topic.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">04 竞品监控与买家声音 (VOC)</h1>
            <span className="text-xs bg-purple-500/20 text-purple-400 font-semibold px-2 py-0.5 rounded border border-purple-500/30">
              Milestone 3: Review Evidence Drill-down
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Amazon 标杆竞品动态监控 • 买家评论情感聚类与原声证据链穿透
          </p>
        </div>

        <div className="text-xs text-gray-400 bg-surface border border-border px-3 py-1.5 rounded-lg">
          监测竞品数: <span className="font-bold text-white">{competitors.length}</span> • 聚类原声样本: <span className="font-bold text-white">180+</span>
        </div>
      </div>

      {/* Competitor Benchmark Table */}
      <div className="bg-surface border border-border rounded-xl p-5 shadow-lg">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center space-x-2">
          <Users className="w-4 h-4 text-blue-400" />
          <span>核心标杆竞品实时监控大盘 (Benchmark Competitors)</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[11px] text-gray-400 uppercase bg-surface-elevated/60 border-b border-border">
              <tr>
                <th className="py-3 px-4">ASIN & 竞品名称</th>
                <th className="py-3 px-4">品牌</th>
                <th className="py-3 px-4">售价 (Price)</th>
                <th className="py-3 px-4">星级评分</th>
                <th className="py-3 px-4">评论总数</th>
                <th className="py-3 px-4">预估月销量</th>
                <th className="py-3 px-4">预估月销售额</th>
                <th className="py-3 px-4">BSR 排名</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {competitors.map((c) => (
                <tr key={c.id} className="hover:bg-surface-elevated/40 transition">
                  <td className="py-3 px-4">
                    <div className="font-bold text-white">{c.title}</div>
                    <div className="text-[10px] text-blue-400 font-mono mt-0.5">{c.asin}</div>
                  </td>
                  <td className="py-3 px-4 font-semibold text-gray-300">{c.brand}</td>
                  <td className="py-3 px-4 font-bold text-white">${c.price.toFixed(2)}</td>
                  <td className="py-3 px-4 text-amber-400 font-semibold">⭐ {c.rating.toFixed(1)}</td>
                  <td className="py-3 px-4 text-gray-300">{c.reviewCount.toLocaleString()}</td>
                  <td className="py-3 px-4 text-emerald-400 font-medium">{c.estimatedSales.toLocaleString()} pcs</td>
                  <td className="py-3 px-4 font-bold text-white">${c.estimatedRevenue.toLocaleString()}</td>
                  <td className="py-3 px-4 text-gray-400">#{c.bsr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* VOC Topics & Review Evidence Drill-down Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: VOC Topics List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>VOC 主题聚类榜 (Topics)</span>
            </h3>
            <span className="text-[11px] text-gray-400">按占比排序</span>
          </div>

          <div className="space-y-2">
            {topics.map((t) => {
              const isSelected = selectedTopic?.id === t.id;
              const isPain = t.sentiment === 'NEGATIVE';

              return (
                <button
                  key={t.id}
                  onClick={() => handleSelectTopic(t)}
                  className={`w-full text-left p-4 rounded-xl border transition ${
                    isSelected
                      ? 'bg-surface-elevated border-purple-500 shadow-md ring-1 ring-purple-500'
                      : 'bg-surface border-border hover:bg-surface-elevated'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      isPain ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {t.topicType}
                    </span>
                    <span className="text-xs font-bold text-white">{t.percentage.toFixed(1)}% 买家提及</span>
                  </div>

                  <h4 className="text-sm font-bold text-white mt-2">{t.topicName}</h4>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{t.summary}</p>

                  <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[11px] text-gray-500">
                    <span>样本数量: {t.reviewCount} 条</span>
                    <span className="text-purple-400 font-semibold flex items-center">
                      点击下钻原声证据 <ChevronRight className="w-3 h-3 ml-0.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Review Evidence Drill-down Drawer/Card */}
        <div className="lg:col-span-7 bg-surface border border-border rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div>
                <span className="text-xs font-semibold text-purple-400 uppercase">Review Evidence Drill-Down</span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  {selectedTopic?.topicName || '买家原声核验证据'}
                </h3>
              </div>
              <span className="text-xs bg-surface-elevated border border-border text-gray-300 px-2.5 py-1 rounded">
                共关联 {topicEvidence?.evidenceCount || 0} 篇高权重证据
              </span>
            </div>

            {/* List of Verbatim Reviews */}
            <div className="space-y-3">
              {(topicEvidence?.evidenceReviews || []).map((rev) => (
                <div key={rev.id} className="bg-surface-elevated border border-border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-amber-400 text-xs font-bold">
                        {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                      </span>
                      <span className="text-xs font-bold text-white">{rev.title}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {rev.reviewerName} • Verified Purchase
                    </span>
                  </div>

                  <p className="text-xs text-gray-300 italic">
                    &ldquo;{rev.content}&rdquo;
                  </p>

                  <div className="bg-purple-950/30 border border-purple-800/40 rounded p-2 text-xs">
                    <span className="text-purple-300 font-semibold">🔍 提炼核心证据: </span>
                    <span className="text-purple-200 font-medium">&ldquo;{rev.highlightedEvidence}&rdquo;</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-gray-400">
            <span>确凿买家证据将作为 Listing Studio 与产品改进的依据约束</span>
            <span className="text-emerald-400 font-semibold flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 证据链完整可审计
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
