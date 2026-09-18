'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Building2,
  Layers,
  Scale,
  RefreshCw,
  ExternalLink,
  PackageCheck,
  Factory,
  HelpCircle,
  Plus,
} from 'lucide-react';
import type {
  ProductCandidate,
  ProductSpecification,
  SupplierQuote,
  SupplierQuoteFactBadge,
  OnePageDecisionPacket,
  DecisionCostItem,
  ResearchFunnelEvent,
  ResearchTask,
  ResearchTaskStage,
  ResearchTaskSummary,
} from '@crosspilot/shared';
import { ApiClient } from '../../../lib/api-client';
import { ResearchTaskWorkflow, SingleProductModuleKey } from './research-task-workflow';

interface SingleProductResearchSectionProps {
  initialCandidate?: ProductCandidate;
  initialTask?: ResearchTask | null;
  onCandidateChange?: (candidate: ProductCandidate | null) => void;
  onTaskChange?: (task: ResearchTask | null) => void;
}

export function SingleProductResearchSection({
  initialCandidate,
  initialTask,
  onCandidateChange,
  onTaskChange,
}: SingleProductResearchSectionProps) {
  const [candidate, setCandidate] = useState<ProductCandidate | null>(initialCandidate ?? null);
  const [currentTask, setCurrentTask] = useState<ResearchTask | null>(initialTask ?? null);
  const [isSavingTask, setIsSavingTask] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialTask?.updatedAt ?? null);
  const packet: OnePageDecisionPacket | undefined = candidate?.decisionPacket;
  const [loading, setLoading] = useState<boolean>(false);
  const [activeModule, setActiveModule] = useState<'market' | 'competitors' | 'specs' | 'quotes' | 'economics' | 'decision'>('decision');
  const [copiedRfq, setCopiedRfq] = useState<boolean>(false);
  const [copyingRfqText, setCopyingRfqText] = useState<string>('');

  // 折叠区展开控制 (Spec §6 & §35)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    conservative: false,
    sensitivity: false,
    costBreakdown: false,
    riskEvidence: false,
  });

  // 识别 Demo 状态 (P1: Demo 隔离)
  const [isDemo, setIsDemo] = useState<boolean>(Boolean(initialCandidate?.id === 'cand-glass-fruit-box-001'));

  // 草稿报价弹窗或输入状态 (P0: 禁止以 0 作为未填写的初始状态)
  const [showAddQuoteModal, setShowAddQuoteModal] = useState<boolean>(false);
  const [newQuoteForm, setNewQuoteForm] = useState<{
    supplierName: string;
    unitPrice: number | '';
    packagingCost: number | '';
    logoCost: number | '';
    moq: number | '';
    leadTimeDays: number | '';
    sampleCost: number | '';
    sourceChannel: '1688' | 'DIRECT' | 'CANTON_FAIR' | 'OTHER';
  }>({
    supplierName: '',
    unitPrice: '',
    packagingCost: '',
    logoCost: '',
    moq: '',
    leadTimeDays: '',
    sampleCost: '',
    sourceChannel: '1688',
  });

  // 包装/Logo未知费用确认弹窗 (Anti-gaming Spec §16: 弹窗不预填 0 误导用户)
  const [pendingPrimaryQuoteId, setPendingPrimaryQuoteId] = useState<string | null>(null);
  const [showUnknownChargeModal, setShowUnknownChargeModal] = useState<boolean>(false);
  const [unknownChargesInput, setUnknownChargesInput] = useState<{
    packagingCost: number | '';
    logoCost: number | '';
  }>({
    packagingCost: '',
    logoCost: '',
  });

  // 规格编辑草稿表单
  const [specForm, setSpecForm] = useState({
    material: '',
    capacity: '',
    dimensions: '',
    targetSellingPrice: 0,
  });

  // 埋点去重引用 (P1-3 & P1-4)
  const viewedPacketKeyRef = useRef<string | null>(null);
  const criticalFeesCompletedRef = useRef<string | null>(null);

  // 启动资金补全/调整弹窗 (P0-1 完整性闭环: 禁止预填 100/6429 假数值)
  const [showInitialCashModal, setShowInitialCashModal] = useState<boolean>(false);
  const [initialCashForm, setInitialCashForm] = useState<{
    sampleCost: number | '';
    firstFreightCost: number | '';
    toolingCost: number | '';
    packagingSetupCost: number | '';
  }>({
    sampleCost: '',
    firstFreightCost: '',
    toolingCost: '',
    packagingSetupCost: '',
  });

  function openInitialCashModal() {
    setInitialCashForm({
      sampleCost: candidate?.initialCash?.sampleCost ?? '',
      firstFreightCost: candidate?.initialCash?.firstFreightCost ?? '',
      toolingCost: candidate?.initialCash?.toolingCost ?? '',
      packagingSetupCost: candidate?.initialCash?.packagingSetupCost ?? '',
    });
    setShowInitialCashModal(true);
  }

  // 核心漏斗埋点上报 (Spec §35 & §38)
  function trackFunnel(eventName: ResearchFunnelEvent, metadata?: Record<string, unknown>) {
    if (!candidate?.id) return;
    ApiClient.post('/api/v1/market-research/analytics/event', {
      eventName,
      candidateId: candidate.id,
      metadata,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  // 监听外部传入的 candidate 和 task 变更 (Phase 3 & Phase 5)
  useEffect(() => {
    if (initialCandidate) {
      setCandidate(initialCandidate);
      if (initialCandidate.id === 'cand-glass-fruit-box-001') {
        setIsDemo(true);
      }
    }
  }, [initialCandidate]);

  useEffect(() => {
    if (initialTask) {
      setCurrentTask(initialTask);
      setLastSavedAt(initialTask.updatedAt);
      if (initialTask.candidateData) {
        setCandidate(initialTask.candidateData);
      }
    }
  }, [initialTask]);

  // 初次进入若无 candidate 与 task，自动从云端恢复最近活跃选品任务 (Phase 5 & 6 场景2)
  useEffect(() => {
    if (!initialCandidate && !initialTask) {
      ApiClient.get<ResearchTaskSummary[]>('/api/v1/market-research/tasks')
        .then((tasks) => {
          if (tasks && tasks.length > 0) {
            return ApiClient.get<ResearchTask>(`/api/v1/market-research/tasks/${tasks[0].id}`);
          }
          return null;
        })
        .then((fullTask) => {
          if (fullTask && fullTask.candidateData) {
            setCurrentTask(fullTask);
            setCandidate(fullTask.candidateData);
            setLastSavedAt(fullTask.updatedAt);
            onTaskChange?.(fullTask);
            onCandidateChange?.(fullTask.candidateData);
          }
        })
        .catch(() => {});
    }
  }, []);

  // 状态同步与任务自动保存器 (Phase 5)
  async function syncTaskProgress(
    cand: ProductCandidate,
    stage: ResearchTaskStage,
    customTitle?: string,
  ): Promise<ResearchTask | null> {
    if (!cand) return null;
    setIsSavingTask(true);
    try {
      const taskTitle = customTitle || currentTask?.title || `${cand.title || '新产品'}选品任务`;
      if (currentTask?.id) {
        const updated = await ApiClient.put<ResearchTask>(`/api/v1/market-research/tasks/${currentTask.id}`, {
          title: taskTitle,
          currentStage: stage,
          candidateData: cand,
        });
        setCurrentTask(updated);
        setLastSavedAt(updated.updatedAt);
        onTaskChange?.(updated);
        return updated;
      } else {
        const created = await ApiClient.post<ResearchTask>('/api/v1/market-research/tasks', {
          title: taskTitle,
          currentStage: stage,
          candidateData: cand,
        });
        setCurrentTask(created);
        setLastSavedAt(created.updatedAt);
        onTaskChange?.(created);
        return created;
      }
    } catch (e) {
      console.warn('Failed to auto-save research task:', e);
      return null;
    } finally {
      setIsSavingTask(false);
    }
  }

  function handleTaskChangeFromWorkflow(task: ResearchTask) {
    setCurrentTask(task);
    setLastSavedAt(task.updatedAt);
    if (task.candidateData) {
      setCandidate(task.candidateData);
      onCandidateChange?.(task.candidateData);
    }
    onTaskChange?.(task);
  }

  function handleNewTaskFromWorkflow() {
    setCurrentTask(null);
    setCandidate(null);
    setLastSavedAt(null);
    setActiveModule('market');
    onTaskChange?.(null);
    onCandidateChange?.(null);
  }

  // P1: 取消普通页面自动加载 Demo (零自动加载，保持真实业务入口干净)

  async function loadFruitBoxDemo() {
    setLoading(true);
    try {
      const res = await ApiClient.get<ProductCandidate>('/api/v1/market-research/single-product/demo-fruit-box');
      setCandidate(res);
      setIsDemo(true);
      if (res.specifications && res.specifications[0]) {
        const s = res.specifications[0];
        setSpecForm({
          material: s.material,
          capacity: s.capacity,
          dimensions: s.dimensions,
          targetSellingPrice: s.targetSellingPrice,
        });
      }
      onCandidateChange?.(res);
      await syncTaskProgress(res, 'DECISION', '玻璃水果盒测试选品任务');
    } catch (e) {
      console.error('Failed to load demo fruit box', e);
    } finally {
      setLoading(false);
    }
  }

  // 真实业务入口: 初始化新产品候选 (Spec §3 & §8)
  async function handleInitCandidate(entry: 'idea' | 'market' | 'quotes' | 'decision') {
    setLoading(true);
    try {
      const titles: Record<string, string> = {
        idea: '新产品创意企划',
        market: '市场调研新产品',
        quotes: '工厂报价核算产品',
        decision: '综合立项决策产品',
      };
      const res = await ApiClient.post<ProductCandidate>('/api/v1/market-research/single-product/init', {
        title: titles[entry] || '新选品项目',
        entryPoint: entry,
      });
      setCandidate(res);
      setIsDemo(false);
      handleEntryPointSelect(entry);
      onCandidateChange?.(res);
      await syncTaskProgress(res, 'CREATED', `${titles[entry] || '新产品'}选品任务`);
    } catch (e: any) {
      alert(e?.message || '初始化选品项目失败');
    } finally {
      setLoading(false);
    }
  }

  // 埋点: 真实浏览决策结论包 (P1-3)
  useEffect(() => {
    if (activeModule === 'decision' && packet && candidate?.id) {
      const key = `${candidate.id}_${packet.verdict}_${packet.evaluatedAt}`;
      if (viewedPacketKeyRef.current !== key) {
        viewedPacketKeyRef.current = key;
        trackFunnel('DECISION_PACKET_VIEWED', {
          verdict: packet.verdict,
          economicsStatus: candidate.economics?.status,
          initialCashStatus: candidate.initialCash?.status,
        });
        if (currentTask?.currentStage !== 'DECISION') {
          syncTaskProgress(candidate, 'DECISION');
        }
      }
    }
  }, [activeModule, packet, candidate?.id, currentTask?.currentStage]);

  // 埋点: 5项关键财务输入真正齐备时触发 (P1-4)
  useEffect(() => {
    if (candidate?.id && candidate.economics?.status === 'COMPLETE') {
      const inputs = candidate.economics.inputs;
      const all5Present =
        inputs?.sellingPrice?.value != null &&
        inputs?.productCost?.value != null &&
        inputs?.referralFeeRate?.value != null &&
        inputs?.fbaFeePerUnit?.value != null &&
        inputs?.freightPerUnit?.value != null;
      if (all5Present && criticalFeesCompletedRef.current !== candidate.id) {
        criticalFeesCompletedRef.current = candidate.id;
        trackFunnel('CRITICAL_FEES_COMPLETED', {
          sellingPrice: inputs.sellingPrice.value,
          productCost: inputs.productCost.value,
          referralFeeRate: inputs.referralFeeRate.value,
          fbaFeePerUnit: inputs.fbaFeePerUnit.value,
          freightPerUnit: inputs.freightPerUnit.value,
        });
      }
    }
  }, [candidate?.id, candidate?.economics?.status]);

  // 同步当前 Candidate 规格至表单
  useEffect(() => {
    if (candidate) {
      const active = candidate.specifications?.find((s) => s.id === candidate.activeSpecVersionId);
      if (active) {
        setSpecForm({
          material: active.material || '',
          capacity: active.capacity || '',
          dimensions: active.dimensions || '',
          targetSellingPrice: active.targetSellingPrice || 0,
        });
      }
    }
  }, [candidate?.id, candidate?.activeSpecVersionId]);

  // 多入口快速跳转 (Spec §3)
  function handleEntryPointSelect(entry: 'idea' | 'market' | 'quotes' | 'decision') {
    switch (entry) {
      case 'idea':
        setActiveModule('market');
        break;
      case 'market':
        setActiveModule('competitors');
        break;
      case 'quotes':
        setActiveModule('quotes');
        break;
      case 'decision':
        setActiveModule('decision');
        break;
    }
  }

  // 冻结规格
  async function handleFreezeSpec() {
    if (!candidate) return;
    setLoading(true);
    try {
      const activeSpec = candidate.specifications?.find((s) => s.id === candidate.activeSpecVersionId) || candidate.specifications?.[0];
      if (!activeSpec) return;

      const updatedSpec: ProductSpecification = {
        ...activeSpec,
        material: specForm.material,
        capacity: specForm.capacity,
        dimensions: specForm.dimensions,
        targetSellingPrice: Number(specForm.targetSellingPrice),
      };

      const res = await ApiClient.post<ProductCandidate>('/api/v1/market-research/single-product/spec/freeze', {
        candidate,
        spec: updatedSpec,
      });
      setCandidate(res);
      onCandidateChange?.(res);
      await syncTaskProgress(res, 'SPECIFICATION');
    } catch (e: any) {
      alert(e?.message || '冻结规格失败，请确保核心4项规格已填完整');
    } finally {
      setLoading(false);
    }
  }

  // 复制询价单
  async function handleCopyRfq() {
    if (!candidate) return;
    try {
      const rfq = await ApiClient.post<{ copyableText: string }>('/api/v1/market-research/single-product/rfq', {
        candidate,
      });
      setCopyingRfqText(rfq.copyableText);
      await navigator.clipboard.writeText(rfq.copyableText);
      setCopiedRfq(true);
      trackFunnel('RFQ_GENERATED', { specId: candidate.activeSpecVersionId });
      setTimeout(() => setCopiedRfq(false), 3000);
    } catch (e) {
      console.error('Failed to copy RFQ', e);
    }
  }

  // 选定主选算账工厂
  async function handleSelectPrimaryQuote(quoteId: string) {
    if (!candidate) return;
    const quote = candidate.supplierQuotes?.find((q) => q.id === quoteId);
    if (!quote) return;

    // 检查是否有 UNKNOWN 包装费或 Logo 费 (Spec §16 Anti-gaming)
    const packagingIsUnknown =
      quote.packagingCost.source === 'UNKNOWN' || quote.packagingCost.value === null;
    const logoIsUnknown =
      quote.logoCost.source === 'UNKNOWN' || quote.logoCost.value === null;

    if (packagingIsUnknown || logoIsUnknown) {
      setPendingPrimaryQuoteId(quoteId);
      setUnknownChargesInput({
        packagingCost: packagingIsUnknown ? '' : (quote.packagingCost.value ?? ''),
        logoCost: logoIsUnknown ? '' : (quote.logoCost.value ?? ''),
      });
      setShowUnknownChargeModal(true);
      return;
    }

    setLoading(true);
    try {
      const res = await ApiClient.post<ProductCandidate>('/api/v1/market-research/single-product/quote/select-primary', {
        candidate,
        quoteId,
      });
      setCandidate(res);
      onCandidateChange?.(res);
      await syncTaskProgress(res, 'QUOTE');
    } catch (e: any) {
      alert(e?.message || '选择算账工厂失败');
    } finally {
      setLoading(false);
    }
  }

  // 确认未知费用后选定算账工厂
  async function confirmUnknownChargesAndSelect() {
    if (!candidate || !pendingPrimaryQuoteId) return;
    if (unknownChargesInput.packagingCost === '' || unknownChargesInput.logoCost === '') {
      alert('请明确确认包装费与Logo定制费（若工厂确认免费，请明确填写 0）');
      return;
    }
    setLoading(true);
    try {
      const res = await ApiClient.post<ProductCandidate>('/api/v1/market-research/single-product/quote/select-primary', {
        candidate,
        quoteId: pendingPrimaryQuoteId,
        confirmedUnknownCharges: {
          packagingCost: Number(unknownChargesInput.packagingCost),
          logoCost: Number(unknownChargesInput.logoCost),
        },
      });
      setCandidate(res);
      onCandidateChange?.(res);
      setShowUnknownChargeModal(false);
      setPendingPrimaryQuoteId(null);
      await syncTaskProgress(res, 'QUOTE');
    } catch (e: any) {
      alert(e?.message || '确认费用失败');
    } finally {
      setLoading(false);
    }
  }

  // 保存新报价 (P0: UNKNOWN ≠ FACT 0，严格遵守数据真实性)
  async function handleSaveNewQuote() {
    if (!candidate) return;

    const trimmedName = newQuoteForm.supplierName.trim();
    const unitPriceNum = parseOptionalNumber(newQuoteForm.unitPrice);
    const moqNum = parseOptionalNumber(newQuoteForm.moq);

    if (!trimmedName || unitPriceNum === undefined || unitPriceNum <= 0 || moqNum === undefined || moqNum <= 0) {
      alert('请填写供应商名称、出厂单价与最小起订量 (MOQ)');
      return;
    }

    setLoading(true);
    try {
      const packagingCostVal = parseOptionalNumber(newQuoteForm.packagingCost);
      const packagingCostObj =
        packagingCostVal === undefined
          ? { value: null, source: 'UNKNOWN' as const }
          : { value: packagingCostVal, source: 'FACT' as const };

      const logoCostVal = parseOptionalNumber(newQuoteForm.logoCost);
      const logoCostObj =
        logoCostVal === undefined
          ? { value: null, source: 'UNKNOWN' as const }
          : { value: logoCostVal, source: 'FACT' as const };

      const res = await ApiClient.post<ProductCandidate>('/api/v1/market-research/single-product/quote/save', {
        candidate,
        quote: {
          supplierName: trimmedName,
          unitPrice: unitPriceNum,
          packagingCost: packagingCostObj,
          logoCost: logoCostObj,
          moq: moqNum,
          leadTimeDays: parseOptionalNumber(newQuoteForm.leadTimeDays),
          sampleCost: parseOptionalNumber(newQuoteForm.sampleCost),
          sourceChannel: newQuoteForm.sourceChannel,
          captureMethod: 'MANUAL',
          currency: 'CNY',
        },
      });
      setCandidate(res);
      onCandidateChange?.(res);
      setShowAddQuoteModal(false);
      setNewQuoteForm({
        supplierName: '',
        unitPrice: '',
        packagingCost: '',
        logoCost: '',
        moq: '',
        leadTimeDays: '',
        sampleCost: '',
        sourceChannel: '1688',
      });
      trackFunnel('QUOTE_ENTERED', { supplierName: trimmedName });
      await syncTaskProgress(res, 'QUOTE');
    } catch (e: any) {
      alert(e?.message || '保存报价失败');
    } finally {
      setLoading(false);
    }
  }

  // 保存启动资金补全/调整 (P0-1: 严禁把空值偷偷当 0 处理)
  async function handleSaveInitialCash() {
    if (!candidate) return;
    setLoading(true);
    try {
      const res = await ApiClient.post<ProductCandidate>('/api/v1/market-research/single-product/evaluate', {
        candidate,
        initialCashParams: {
          sampleCost: parseOptionalNumber(initialCashForm.sampleCost),
          firstFreightCost: parseOptionalNumber(initialCashForm.firstFreightCost),
          toolingCost: parseOptionalNumber(initialCashForm.toolingCost) ?? 0,
          packagingSetupCost: parseOptionalNumber(initialCashForm.packagingSetupCost) ?? 0,
        },
      });
      setCandidate(res);
      onCandidateChange?.(res);
      setShowInitialCashModal(false);
      await syncTaskProgress(res, 'ECONOMICS');
    } catch (e: any) {
      alert(e?.message || '更新启动资金失败');
    } finally {
      setLoading(false);
    }
  }

  // 切换手风琴展开状态并触发埋点 (Spec §35.4)
  function toggleAccordion(key: 'conservative' | 'sensitivity' | 'costBreakdown' | 'riskEvidence') {
    setExpandedSections((prev) => {
      const nextVal = !prev[key];
      if (nextVal) {
        trackFunnel('COLLAPSIBLE_SECTION_EXPANDED', { sectionKey: key });
      }
      return {
        ...prev,
        [key]: nextVal,
      };
    });
  }

  if (!candidate && loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-12 text-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
        <p className="text-gray-300 text-sm">正在加载 CrossPilot 单产品选品模型...</p>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="space-y-6">
        {/* ResearchTaskWorkflow 全局选品任务流水线与历史任务切换 (Phase 4) */}
        <ResearchTaskWorkflow
          currentTask={currentTask}
          candidate={candidate}
          activeModule={activeModule}
          onSelectModule={setActiveModule}
          onTaskChange={handleTaskChangeFromWorkflow}
          onNewTask={handleNewTaskFromWorkflow}
          isSaving={isSavingTask}
          lastSavedAt={lastSavedAt}
        />

        {/* 真实业务入口选择卡片 (Spec §8: 无 Candidate 时展示真实入口页) */}
        <div className="bg-surface/80 backdrop-blur border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border/60">
            <div>
              <div className="flex items-center space-x-2.5 mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  单产品选品决策 (Single-Product Research V1)
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-gray-300">
                你现在处在哪一步？(选择你的真实推进阶段，开始真实选品项目)
              </p>
            </div>
            <button
              onClick={loadFruitBoxDemo}
              disabled={loading}
              className="text-xs text-gray-400 hover:text-blue-300 flex items-center space-x-1.5 transition-colors self-start md:self-auto bg-surface/80 hover:bg-blue-500/10 px-3 py-2 rounded-xl border border-border hover:border-blue-500/30 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>载入玻璃水果盒测试样本</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
            <button
              onClick={() => handleInitCandidate('idea')}
              disabled={loading}
              className="p-5 rounded-xl border border-border hover:border-blue-500 hover:bg-blue-500/5 text-left transition-all group"
            >
              <span className="text-xs font-semibold text-blue-400 block mb-1">阶段 1</span>
              <span className="text-sm font-bold text-white block group-hover:text-blue-300">我只有一个产品想法</span>
              <span className="text-xs text-gray-400 block mt-2">从产品概念或用户需求出发，梳理核心卖点与规格</span>
            </button>

            <button
              onClick={() => handleInitCandidate('market')}
              disabled={loading}
              className="p-5 rounded-xl border border-border hover:border-blue-500 hover:bg-blue-500/5 text-left transition-all group"
            >
              <span className="text-xs font-semibold text-blue-400 block mb-1">阶段 2</span>
              <span className="text-sm font-bold text-white block group-hover:text-blue-300">确定产品，想看市场</span>
              <span className="text-xs text-gray-400 block mt-2">分析细分价格带、代表竞品标杆与真实买家抱怨</span>
            </button>

            <button
              onClick={() => handleInitCandidate('quotes')}
              disabled={loading}
              className="p-5 rounded-xl border border-border hover:border-blue-500 hover:bg-blue-500/5 text-left transition-all group"
            >
              <span className="text-xs font-semibold text-blue-400 block mb-1">阶段 3</span>
              <span className="text-sm font-bold text-white block group-hover:text-blue-300">已有工厂报价，帮我算账</span>
              <span className="text-xs text-gray-400 block mt-2">录入出厂单价与MOQ，核算单件贡献利润与首单启动资金</span>
            </button>

            <button
              onClick={() => handleInitCandidate('decision')}
              disabled={loading}
              className="p-5 rounded-xl border border-border hover:border-blue-500 hover:bg-blue-500/5 text-left transition-all group"
            >
              <span className="text-xs font-semibold text-blue-400 block mb-1">阶段 4</span>
              <span className="text-sm font-bold text-white block group-hover:text-blue-300">基本确定，判断能不能做</span>
              <span className="text-xs text-gray-400 block mt-2">结合利润、启动资金、核心风险与下一步唯一动作做终局判断</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeSpec = candidate?.specifications?.find((s) => s.id === candidate.activeSpecVersionId) || candidate?.specifications?.[0];
  const quotes: SupplierQuote[] = candidate?.supplierQuotes || [];
  const primaryQuote = quotes.find((q) => q.id === candidate?.primaryQuoteId);

  // 计算事实最值徽标 (Spec §17)
  const factBadges = computeFactBadges(quotes);

  return (
    <div className="space-y-6">
      {/* ResearchTaskWorkflow 全局选品任务流水线与阶段指示器 (Phase 4) */}
      <ResearchTaskWorkflow
        currentTask={currentTask}
        candidate={candidate}
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        onTaskChange={handleTaskChangeFromWorkflow}
        onNewTask={handleNewTaskFromWorkflow}
        isSaving={isSavingTask}
        lastSavedAt={lastSavedAt}
      />

      {/* 1. 首页多入口选择条 (Spec §3: 不要强迫所有用户从 Step 1 开始) */}
      <div className="bg-surface/70 backdrop-blur border border-border/80 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <h3 className="text-xs font-bold text-gray-300 tracking-wider uppercase">
              你现在处在哪一步？(选择你的真实推进阶段)
            </h3>
          </div>
          <button
            onClick={loadFruitBoxDemo}
            className="text-xs text-gray-400 hover:text-blue-300 flex items-center space-x-1.5 transition-colors self-start md:self-auto bg-surface hover:bg-blue-500/10 px-2.5 py-1 rounded-lg border border-border hover:border-blue-500/20"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>载入玻璃水果盒测试样本</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={() => handleEntryPointSelect('idea')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeModule === 'market'
                ? 'bg-blue-500/15 border-blue-500 text-white'
                : 'bg-surface border-border text-gray-300 hover:border-gray-500 hover:bg-surface/80'
            }`}
          >
            <span className="text-[11px] text-gray-400 block mb-0.5">阶段 1</span>
            <span className="text-xs font-semibold block">我只有一个产品想法</span>
          </button>

          <button
            onClick={() => handleEntryPointSelect('market')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeModule === 'competitors'
                ? 'bg-blue-500/15 border-blue-500 text-white'
                : 'bg-surface border-border text-gray-300 hover:border-gray-500 hover:bg-surface/80'
            }`}
          >
            <span className="text-[11px] text-gray-400 block mb-0.5">阶段 2</span>
            <span className="text-xs font-semibold block">确定产品，想看市场</span>
          </button>

          <button
            onClick={() => handleEntryPointSelect('quotes')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeModule === 'quotes'
                ? 'bg-blue-500/15 border-blue-500 text-white'
                : 'bg-surface border-border text-gray-300 hover:border-gray-500 hover:bg-surface/80'
            }`}
          >
            <span className="text-[11px] text-gray-400 block mb-0.5">阶段 3</span>
            <span className="text-xs font-semibold block">已有工厂报价，帮我算账</span>
          </button>

          <button
            onClick={() => handleEntryPointSelect('decision')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeModule === 'decision'
                ? 'bg-blue-500/15 border-blue-500 text-white'
                : 'bg-surface border-border text-gray-300 hover:border-gray-500 hover:bg-surface/80'
            }`}
          >
            <span className="text-[11px] text-gray-400 block mb-0.5">阶段 4</span>
            <span className="text-xs font-semibold block">基本确定，判断能不能做</span>
          </button>
        </div>
      </div>

      {/* 2. Candidate 首页核心摘要卡片 (Spec §28: 两个关键数字 + 一句建议 + 一个下一步) */}
      {candidate && (
        <div className="bg-gradient-to-br from-surface via-surface to-blue-950/20 border border-border rounded-2xl p-5 sm:p-6 shadow-md">
          {/* Demo 明确标识 Banner (Spec §Demo Isolation) */}
          {(isDemo || candidate.id === 'cand-glass-fruit-box-001') && (
            <div className="mb-4 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-amber-300 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>测试样本 (Demo 数据，仅用于功能体验)</span>
              </div>
              <span className="text-[11px] text-amber-400/80">
                系统内置基准测试样例，真实选品数据不包含此数据
              </span>
            </div>
          )}

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-border/60">
            <div>
              <div className="flex items-center space-x-2.5 mb-1.5">
                {(isDemo || candidate.id === 'cand-glass-fruit-box-001') ? (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    测试样本 (Demo)
                  </span>
                ) : (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    单产品选品 V1
                  </span>
                )}
                <span className="text-xs text-gray-400 font-mono">
                  ID: {candidate.id}
                </span>
                {activeSpec && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      activeSpec.status === 'FROZEN'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {activeSpec.status === 'FROZEN' ? '已按这个去询价 (FROZEN)' : '还在修改 (DRAFT)'}
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {candidate.title}
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 mt-1 flex items-center space-x-2">
                <span className="font-semibold text-amber-400">建议：</span>
                <span>{packet?.adviceZh || '先补齐核心财务数据与资质证明后再决定是否打样'}</span>
              </p>
            </div>

            {/* 快捷动作按钮 (Spec §28) */}
            <div className="flex items-center space-x-2 flex-wrap sm:flex-nowrap">
              <button
                onClick={handleCopyRfq}
                className="px-3.5 py-2 rounded-xl bg-surface border border-border hover:border-gray-500 text-xs font-semibold text-gray-200 hover:text-white flex items-center space-x-1.5 transition-all shadow-sm"
              >
                {copiedRfq ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedRfq ? '已复制询价单' : '复制询价单'}</span>
              </button>

              <button
                onClick={() => setActiveModule('quotes')}
                className="px-3.5 py-2 rounded-xl bg-surface border border-border hover:border-gray-500 text-xs font-semibold text-gray-200 hover:text-white flex items-center space-x-1.5 transition-all shadow-sm"
              >
                <Factory className="w-3.5 h-3.5 text-blue-400" />
                <span>填工厂报价</span>
              </button>

              <button
                onClick={() => setActiveModule('decision')}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center space-x-1.5 transition-all shadow-sm shadow-blue-500/20"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>查看完整结论</span>
              </button>
            </div>
          </div>

          {/* 两个关键数字与下一步 (Spec §28) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
            {/* 关键数字 1: 单件大约剩多少 */}
            <div className="bg-surface/80 border border-border/80 rounded-xl p-4 flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                  单件大约剩 (贡献利润)
                </span>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-black text-white font-mono">
                    {packet?.unitContributionProfitUsd != null
                      ? `$${packet.unitContributionProfitUsd.toFixed(2)}`
                      : '待计算'}
                  </span>
                  {packet?.unitContributionMargin != null && (
                    <span className="text-xs text-emerald-400 font-mono font-bold">
                      {(packet.unitContributionMargin * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 关键数字 2: 首单大约需要多少 */}
            <div className="bg-surface/80 border border-border/80 rounded-xl p-4 flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                  首单大约需要 (启动现金)
                </span>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  {packet?.initialCashRequired?.status === 'INCOMPLETE' ? (
                    <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {packet.initialCashRequired.formattedTextZh}
                    </span>
                  ) : (
                    <span className="text-2xl font-black text-white font-mono">
                      {packet?.initialCashRequired?.formattedTextZh || '还不能计算'}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400">
                    (MOQ: {candidate?.initialCash?.moq ? `${candidate.initialCash.moq} 件` : '未确定'})
                  </span>
                </div>
              </div>
            </div>

            {/* 下一步只做一件事 (Next Best Action) */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider flex items-center space-x-1 mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>下一步只做一件事</span>
                </span>
                <p className="text-xs font-bold text-white line-clamp-2">
                  → {packet?.nextBestAction?.title || '暂无待办'}
                </p>
              </div>

              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  {packet?.nextBestAction?.description
                    ? packet.nextBestAction.description.slice(0, 28) + '...'
                    : '处理完后重新推导下一动作'}
                </span>
                <button
                  onClick={() => {
                    trackFunnel('NEXT_BEST_ACTION_CLICKED', {
                      actionId: packet?.nextBestAction?.id,
                      category: packet?.nextBestAction?.category,
                    });
                    if (packet?.nextBestAction?.category === 'LAUNCH_CASH') {
                      openInitialCashModal();
                    } else if (packet?.nextBestAction?.category === 'RISK_VERIFICATION') {
                      setActiveModule('decision');
                      setExpandedSections((p) => ({ ...p, riskEvidence: true }));
                    } else if (packet?.nextBestAction?.category === 'CRITICAL_INPUT') {
                      setActiveModule('quotes');
                    } else {
                      setActiveModule('decision');
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-[11px] font-bold text-white flex items-center space-x-1"
                >
                  <span>{packet?.nextBestAction?.buttonText || '继续处理'}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. 6 大主模块导航栏 (Spec §27: 非强制 Stepper，可随时跳入/回退) */}
      <div className="border-b border-border flex items-center space-x-1 overflow-x-auto pb-2 scrollbar-none text-xs">
        <button
          onClick={() => setActiveModule('market')}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center space-x-2 ${
            activeModule === 'market'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-surface'
          }`}
        >
          <span>① 市场与细分方向</span>
        </button>

        <button
          onClick={() => setActiveModule('competitors')}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center space-x-2 ${
            activeModule === 'competitors'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-surface'
          }`}
        >
          <span>② 竞品与买家抱怨</span>
        </button>

        <button
          onClick={() => setActiveModule('specs')}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center space-x-2 ${
            activeModule === 'specs'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-surface'
          }`}
        >
          <span>③ 产品方案与规格</span>
          {activeSpec && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          )}
        </button>

        <button
          onClick={() => setActiveModule('quotes')}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center space-x-2 ${
            activeModule === 'quotes'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-surface'
          }`}
        >
          <span>④ 工厂报价与对比</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface border border-border">
            {quotes.length}
          </span>
        </button>

        <button
          onClick={() => setActiveModule('economics')}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center space-x-2 ${
            activeModule === 'economics'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-surface'
          }`}
        >
          <span>⑤ 利润与首单资金</span>
        </button>

        <button
          onClick={() => setActiveModule('decision')}
          className={`px-4 py-2.5 rounded-xl font-bold transition-all whitespace-nowrap flex items-center space-x-2 ${
            activeModule === 'decision'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-surface'
          }`}
        >
          <span>⑥ 一页结论</span>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
        </button>
      </div>

      {/* 4. 模块内容渲染区 */}

      {/* 模块 ①: 市场与细分卖法 (Spec §5 Step 2) */}
      {activeModule === 'market' && (
        <div className="bg-surface border border-border rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">这个市场大概有 4 种卖法</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                基于 ABA 搜索需求与头部竞品聚类，系统识别出 4 个主流细分方向：
              </p>
            </div>
            <span className="text-xs text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20">
              系统提示：“玻璃盒 + 沥水篮”值得深入推进
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface/60 border border-border rounded-xl p-4 space-y-2">
              <span className="text-xs text-gray-400 font-mono">方向 ①</span>
              <h4 className="text-sm font-bold text-white">普通塑料水果盒</h4>
              <div className="text-xs text-gray-300 space-y-1 pt-2 border-t border-border/50">
                <p>主流价格带: $14.99 ~ $19.99</p>
                <p>竞争度: 极度激烈 (大牌白牌混战)</p>
                <p className="text-amber-400">痛点: 易染色、塑料有异味</p>
              </div>
            </div>

            <div className="bg-surface/60 border border-border rounded-xl p-4 space-y-2">
              <span className="text-xs text-gray-400 font-mono">方向 ②</span>
              <h4 className="text-sm font-bold text-white">普通玻璃水果盒</h4>
              <div className="text-xs text-gray-300 space-y-1 pt-2 border-t border-border/50">
                <p>主流价格带: $22.99 ~ $26.99</p>
                <p>竞争度: 中等</p>
                <p className="text-amber-400">痛点: 无沥水层，底部积水易腐烂</p>
              </div>
            </div>

            <div className="bg-blue-500/10 border-2 border-blue-500 rounded-xl p-4 space-y-2 relative">
              <span className="absolute top-3 right-3 text-[10px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded">
                当前主选
              </span>
              <span className="text-xs text-blue-400 font-mono">方向 ③ (推荐)</span>
              <h4 className="text-sm font-bold text-white">玻璃盒 + 沥水篮</h4>
              <div className="text-xs text-gray-200 space-y-1 pt-2 border-t border-blue-500/30">
                <p>主流价格带: $27.99 ~ $32.99</p>
                <p>搜索增长: +38% 年同比增长</p>
                <p className="text-emerald-400">优势: 溢价空间高、健康卫生、解决积水</p>
              </div>
              <button
                onClick={() => setActiveModule('specs')}
                className="w-full mt-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white"
              >
                深入该方向 →
              </button>
            </div>

            <div className="bg-surface/60 border border-border rounded-xl p-4 space-y-2">
              <span className="text-xs text-gray-400 font-mono">方向 ④</span>
              <h4 className="text-sm font-bold text-white">分隔式多格水果盒</h4>
              <div className="text-xs text-gray-300 space-y-1 pt-2 border-t border-border/50">
                <p>主流价格带: $25.99 ~ $29.99</p>
                <p>竞争度: 偏小众</p>
                <p className="text-amber-400">痛点: 清洗死角多，容量偏小</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 模块 ②: 竞品与买家抱怨 (Spec §5 Step 3) */}
      {activeModule === 'competitors' && (
        <div className="bg-surface border border-border rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white">别人怎么卖、买家在抱怨什么？</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              真实采集公开买家评语（没抓到真实评语的项诚实标注“暂时没找到，不编”）：
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 代表竞品 */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                代表头部竞品标杆
              </h4>
              <div className="space-y-2.5">
                <div className="p-3.5 rounded-xl bg-surface/70 border border-border flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">A品牌: 玻璃盒+塑料内篮</span>
                    <span className="text-xs text-gray-400">$27.99 / 4.5★ (月销 ~1,200)</span>
                  </div>
                  <span className="text-xs text-gray-300 bg-surface px-2.5 py-1 rounded border border-border">
                    基础款
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-surface/70 border border-border flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">B品牌: 3件套大容量密封盒</span>
                    <span className="text-xs text-gray-400">$34.99 / 4.3★ (月销 ~800)</span>
                  </div>
                  <span className="text-xs text-gray-300 bg-surface px-2.5 py-1 rounded border border-border">
                    组合装
                  </span>
                </div>
              </div>
            </div>

            {/* 买家抱怨真实痛点 */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                买家主要集中抱怨的痛点 (VOC)
              </h4>
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-200">
                    <span className="font-bold text-white">洗完底部容易积水泡烂水果: </span>
                    “内篮滤网孔太小，表面张力让水排不干，草莓第二天就长霉了。”
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-200">
                    <span className="font-bold text-white">内篮边缘没有提手不好拿: </span>
                    “装满水果后内篮卡在玻璃盒里，手指抠不出来，容易滑脱摔碎。”
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-200">
                    <span className="font-bold text-white">密封圈藏污纳垢难以清洗: </span>
                    “盖子凹槽容易发黑，橡胶圈拆卸后变形无法严密闭合。”
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <button
              onClick={() => setActiveModule('specs')}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center space-x-1.5"
            >
              <span>确定我的产品方案 →</span>
            </button>
          </div>
        </div>
      )}

      {/* 模块 ③: 产品方案与规格 (Spec §11, §12, §13 CORE_SPEC_FIELDS) */}
      {activeModule === 'specs' && (
        <div className="bg-surface border border-border rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white">你准备做成什么样？(规格方案)</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-bold ${
                    activeSpec?.status === 'FROZEN'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {activeSpec?.status === 'FROZEN' ? '已按这个去询价 (FROZEN)' : '还在修改 (DRAFT)'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                询价前只需确认 4 项核心规格；核心规格一旦变更，旧报价将自动失效 (STALE)。
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleCopyRfq}
                className="px-3 py-1.5 rounded-lg bg-surface border border-border hover:border-gray-500 text-xs font-semibold text-gray-200 flex items-center space-x-1"
              >
                {copiedRfq ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedRfq ? '已复制询价单' : '复制询价单'}</span>
              </button>

              <button
                onClick={handleFreezeSpec}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-sm flex items-center space-x-1.5"
              >
                <PackageCheck className="w-3.5 h-3.5" />
                <span>按这个去询价 (冻结规格)</span>
              </button>
            </div>
          </div>

          {/* 核心 4 大规格表单 (CORE_SPEC_FIELDS) */}
          <div className="p-4 rounded-xl bg-surface/80 border border-border space-y-4">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
              CORE_SPEC_FIELDS (核心 4 项规格 · 询价必填)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">材质主体与配件</label>
                <input
                  type="text"
                  value={specForm.material}
                  onChange={(e) => setSpecForm({ ...specForm, material: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">产品容量</label>
                <input
                  type="text"
                  value={specForm.capacity}
                  onChange={(e) => setSpecForm({ ...specForm, capacity: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">产品外部尺寸 (长×宽×高)</label>
                <input
                  type="text"
                  value={specForm.dimensions}
                  onChange={(e) => setSpecForm({ ...specForm, dimensions: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">计划零售价 ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={specForm.targetSellingPrice}
                  onChange={(e) => setSpecForm({ ...specForm, targetSellingPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* 非核心规格展示 (工厂报价后自动回填) */}
          <div className="p-4 rounded-xl bg-surface/50 border border-border/60 space-y-2 text-xs">
            <div className="flex items-center justify-between text-gray-400">
              <span className="font-semibold">非核心规格 (包装毛净重 / 箱规 / 装箱数)</span>
              <span className="text-[11px] text-emerald-400">
                {activeSpec?.netWeight ? '✓ 已从工厂报价回填真实数据' : '暂时不知道也可以'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-gray-300">
              <div>单件净重: {activeSpec?.netWeight?.value ? `${activeSpec.netWeight.value}g` : '未知 (可估算)'}</div>
              <div>包装后毛重: {activeSpec?.packagedWeight?.value ? `${activeSpec.packagedWeight.value}g` : '未知'}</div>
              <div>每箱装箱数: {activeSpec?.unitsPerCarton?.value ? `${activeSpec.unitsPerCarton.value} 件/箱` : '未知'}</div>
              <div>外箱箱规: {activeSpec?.cartonDimensions?.value ? activeSpec.cartonDimensions.value : '未知'}</div>
            </div>
          </div>
        </div>
      )}

      {/* 模块 ④: 工厂报价与对比 (Spec §14 ~ §18) */}
      {activeModule === 'quotes' && (
        <div className="bg-surface border border-border rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white">工厂怎么报？(3家供应商对比)</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                同一规格问 3 家工厂，客观对比；系统只标注客观事实标签，不进行主观隐性打分。
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowAddQuoteModal(true)}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>录入新报价</span>
              </button>
            </div>
          </div>

          {/* 汇率快照小字条 (Spec §21) */}
          <div className="px-3.5 py-2 rounded-lg bg-surface/60 border border-border/80 text-[11px] text-gray-400 flex items-center justify-between">
            {candidate?.fxSnapshot?.rate ? (
              <span>
                当前换算汇率：1 CNY = {candidate.fxSnapshot.rate} USD (来源: {candidate.fxSnapshot.source})
              </span>
            ) : (
              <span className="text-amber-400">
                汇率状态：未录入 (还差人民币兑美元汇率，确认后才能完成成本换算)
              </span>
            )}
            <span>人民币出厂价自动折算为美元入账，可自由切换</span>
          </div>

          {/* 报价列表与事实标签 */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-gray-400">
                  <th className="py-2.5 px-3 font-semibold">工厂名称</th>
                  <th className="py-2.5 px-3 font-semibold">出厂单价</th>
                  <th className="py-2.5 px-3 font-semibold">包装/Logo</th>
                  <th className="py-2.5 px-3 font-semibold">采购总成本</th>
                  <th className="py-2.5 px-3 font-semibold">MOQ</th>
                  <th className="py-2.5 px-3 font-semibold">生产交期</th>
                  <th className="py-2.5 px-3 font-semibold">客观事实标签</th>
                  <th className="py-2.5 px-3 font-semibold text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {quotes.map((q) => {
                  const isPrimary = q.id === candidate?.primaryQuoteId;
                  const totalCny = q.unitPrice + (q.packagingCost.value || 0) + (q.logoCost.value || 0);
                  const badges = factBadges.filter((b) => b.quoteId === q.id);

                  return (
                    <tr
                      key={q.id}
                      className={`hover:bg-surface/60 transition-colors ${
                        isPrimary ? 'bg-blue-500/10' : ''
                      }`}
                    >
                      <td className="py-3 px-3">
                        <span className="font-bold text-white block">{q.supplierName}</span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {q.sourceChannel} • {q.captureMethod}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-gray-200">
                        ¥{q.unitPrice.toFixed(2)}
                      </td>

                      <td className="py-3 px-3 text-gray-300">
                        ¥{q.packagingCost.value ?? '未知'} / ¥{q.logoCost.value ?? '未知'}
                      </td>

                      <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                        ¥{totalCny.toFixed(2)}
                        <span className="text-[10px] text-gray-400 block">
                          {candidate?.fxSnapshot?.rate
                            ? `(~$${(totalCny * candidate.fxSnapshot.rate).toFixed(2)})`
                            : '(~美元汇率待确认)'}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono text-gray-300">
                        {q.moq} 件
                      </td>

                      <td className="py-3 px-3 text-gray-300">
                        {q.leadTimeDays ? `${q.leadTimeDays} 天` : '未标明'}
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                          {badges.map((b, i) => (
                            <span
                              key={i}
                              className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            >
                              {b.labelZh}
                            </span>
                          ))}
                          {badges.length === 0 && (
                            <span className="text-[10px] text-gray-500">-</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        {isPrimary ? (
                          <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
                            ✓ 当前算账工厂
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSelectPrimaryQuote(q.id)}
                            className="px-2.5 py-1 rounded bg-surface border border-border hover:border-blue-500 text-gray-200 hover:text-white transition-all font-semibold"
                          >
                            用这家算账
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 模块 ⑤: 单件利润与首单启动资金 (Spec §19) */}
      {activeModule === 'economics' && (() => {
        const cashCurrency = candidate?.initialCash?.currency || 'CNY';
        const cashSymbol = cashCurrency === 'USD' ? '$' : '¥';
        return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左卡: 单件利润 Unit Economics */}
          <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-white">单件赚多少？(Unit Economics)</h3>
                <p className="text-xs text-gray-400">单件边际贡献测算（按 USD）</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-mono font-bold">
                边际利润: {packet?.unitContributionProfitUsd != null ? `$${packet.unitContributionProfitUsd.toFixed(2)}` : '待算'}
              </span>
            </div>

            <div className="space-y-2 text-xs divide-y divide-border/40">
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">计划零售售价</span>
                <span className="font-mono font-bold text-white">
                  {candidate?.economics?.inputs?.sellingPrice?.value != null
                    ? `$${candidate.economics.inputs.sellingPrice.value.toFixed(2)}`
                    : '未核定'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">单件采购出厂成本 (含包装Logo)</span>
                <span className="font-mono text-rose-400">
                  {candidate?.economics?.inputs?.productCost?.value != null
                    ? `-$${candidate.economics.inputs.productCost.value.toFixed(2)}`
                    : '未核定'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">
                  亚马逊平台佣金 ({candidate?.economics?.inputs?.referralFeeRate?.value != null ? `${(candidate.economics.inputs.referralFeeRate.value * 100).toFixed(0)}%` : '未核定'})
                </span>
                <span className="font-mono text-rose-400">
                  {packet?.costBreakdown?.referralFee?.included && packet.costBreakdown.referralFee.value != null
                    ? `-$${packet.costBreakdown.referralFee.value.toFixed(2)}`
                    : '暂未计入'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">FBA 配送派送费</span>
                <span className="font-mono text-rose-400">
                  {packet?.costBreakdown?.fbaFee?.included && packet.costBreakdown.fbaFee.value != null
                    ? `-$${packet.costBreakdown.fbaFee.value.toFixed(2)}`
                    : '暂未计入'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">单件头程海运/空运费</span>
                <span className="font-mono text-rose-400">
                  {packet?.costBreakdown?.freightFee?.included && packet.costBreakdown.freightFee.value != null
                    ? `-$${packet.costBreakdown.freightFee.value.toFixed(2)}`
                    : '暂未计入'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">进口关税与税费</span>
                <span className="font-mono text-rose-400">
                  {packet?.costBreakdown?.duty?.included && packet.costBreakdown.duty.value != null
                    ? `-$${packet.costBreakdown.duty.value.toFixed(2)}`
                    : '暂未计入'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">预估单件广告推广成本 (PPC)</span>
                <span className="font-mono text-rose-400">
                  {packet?.costBreakdown?.advertisingCost?.included && packet.costBreakdown.advertisingCost.value != null
                    ? `-$${packet.costBreakdown.advertisingCost.value.toFixed(2)}`
                    : '暂未计入'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">预估退货与损耗</span>
                <span className="font-mono text-rose-400">
                  {packet?.costBreakdown?.expectedReturnLoss?.included && packet.costBreakdown.expectedReturnLoss.value != null
                    ? `-$${packet.costBreakdown.expectedReturnLoss.value.toFixed(2)}`
                    : '暂未计入'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">月度仓储费与杂费</span>
                <span className="font-mono text-rose-400">
                  {packet?.costBreakdown?.storage?.included && packet.costBreakdown.storage.value != null
                    ? `-$${packet.costBreakdown.storage.value.toFixed(2)}`
                    : '暂未计入'}
                </span>
              </div>
              <div className="flex justify-between pt-3 text-sm font-bold border-t-2 border-border">
                <span className="text-white">单件贡献利润 (Contribution Profit)</span>
                <span className="font-mono text-emerald-400">
                  {packet?.unitContributionProfitUsd != null
                    ? `$${packet.unitContributionProfitUsd.toFixed(2)}`
                    : '待算'}
                </span>
              </div>
            </div>
          </div>

          {/* 右卡: 首单启动现金要求 Initial Cash Requirement */}
          <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-white">首单掏多少？(Initial Cash)</h3>
                <p className="text-xs text-gray-400">首次启动这个品需要的真金白银投入 (MOQ×成本+样品+头程)</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={openInitialCashModal}
                  className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-[11px] font-bold text-white transition-all shadow-sm"
                >
                  补齐 / 调整启动资金项
                </button>
                <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-bold ${
                  candidate?.initialCash?.status === 'INCOMPLETE'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'bg-purple-500/15 text-purple-400'
                }`}>
                  {candidate?.initialCash?.status === 'INCOMPLETE'
                    ? candidate.initialCash.displaySummaryZh
                    : `总需求: ${packet?.initialCashRequired?.formattedTextZh || '还不能计算'}`}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs divide-y divide-border/40">
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">起订量 (MOQ 规模)</span>
                <span className="font-mono font-bold text-white">
                  {candidate?.initialCash?.moq ? `${candidate.initialCash.moq} 件` : '未确定'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">
                  大货采购货款 {candidate?.initialCash?.moq && candidate?.initialCash?.productCostPerUnit ? `(${candidate.initialCash.moq} 件 × ${cashSymbol}${candidate.initialCash.productCostPerUnit.toFixed(2)})` : ''}
                </span>
                <span className="font-mono text-purple-300">
                  {candidate?.initialCash?.inventoryCost != null && candidate.initialCash.inventoryCost > 0
                    ? `${cashSymbol}${candidate.initialCash.inventoryCost.toFixed(2)}`
                    : '待算'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">样品打样与寄送费 (一次性)</span>
                <span className="font-mono text-purple-300">
                  {candidate?.initialCash?.sampleCost != null
                    ? `${cashSymbol}${candidate.initialCash.sampleCost.toFixed(2)}`
                    : '未填 (缺样品费)'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">首批头程物流费</span>
                <span className="font-mono text-purple-300">
                  {candidate?.initialCash?.firstFreightCost != null
                    ? `${cashSymbol}${candidate.initialCash.firstFreightCost.toFixed(2)}`
                    : '未填 (缺首批头程)'}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">模具开模费 (公模为 0)</span>
                <span className="font-mono text-purple-300">
                  {candidate?.initialCash?.toolingCost != null
                    ? `${cashSymbol}${candidate.initialCash.toolingCost.toFixed(2)}`
                    : `${cashSymbol}0.00`}
                </span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-gray-400">定制包装制版费</span>
                <span className="font-mono text-purple-300">
                  {candidate?.initialCash?.packagingSetupCost != null
                    ? `${cashSymbol}${candidate.initialCash.packagingSetupCost.toFixed(2)}`
                    : `${cashSymbol}0.00`}
                </span>
              </div>
              <div className="flex justify-between pt-3 text-sm font-bold border-t-2 border-border">
                <span className="text-white">首期最低现金门槛</span>
                <span className={`font-mono ${
                  candidate?.initialCash?.status === 'INCOMPLETE' ? 'text-amber-400' : 'text-purple-400'
                }`}>
                  {candidate?.initialCash?.status === 'INCOMPLETE'
                    ? candidate.initialCash.displaySummaryZh
                    : packet?.initialCashRequired?.formattedTextZh || '还不能计算'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 pt-3">
              注：样品费与一次性模具费不进入单件采购成本，严格体现在首单启动资金中，杜绝算错账。
            </p>
          </div>
        </div>
        );
      })()}

      {/* 模块 ⑥: 一页结论 (Spec §5 Step 8, §6, §7, §8, §9) */}
      {activeModule === 'decision' && packet && (
        <div className="bg-surface border border-border rounded-2xl p-6 space-y-6">
          {/* 顶栏大字结论牌 */}
          <div className="p-5 rounded-xl bg-gradient-to-r from-blue-950/30 to-surface border border-blue-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block mb-1">
                CrossPilot 最终决策建议
              </span>
              <h2 className="text-2xl font-black text-white">
                {packet.adviceZh}
              </h2>
            </div>
            <div className="flex items-center space-x-3">
              <span
                className={`px-3 py-1.5 rounded-lg text-xs font-black border ${
                  packet.verdict === 'SHORTLIST'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : packet.verdict === 'BLOCKED'
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                }`}
              >
                {packet.verdictTitleZh}
              </span>
            </div>
          </div>

          {/* 双列清单: 已确认 vs 还差 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-surface/80 border border-border space-y-2">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>已确认要素 (Confirmed)</span>
              </span>
              <ul className="text-xs text-gray-200 space-y-1.5 pt-1">
                {packet.confirmedChecklistZh.map((item, idx) => (
                  <li key={idx} className="flex items-center space-x-2">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-surface/80 border border-border space-y-2">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>还差要素 (Missing)</span>
              </span>
              <ul className="text-xs text-gray-200 space-y-1.5 pt-1">
                {packet.missingChecklistZh.map((item, idx) => (
                  <li key={idx} className="flex items-center space-x-2">
                    <span className="text-amber-400 font-bold">⚠</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 4 大默认折叠手风琴区 (Spec §6 & §7 & §8) */}
          <div className="space-y-3 pt-3">
            {/* 手风琴 1: 情况差一点会怎样 (Conservative Scenario) */}
            <div className="border border-border rounded-xl overflow-hidden bg-surface/60">
              <button
                onClick={() => toggleAccordion('conservative')}
                className="w-full p-4 text-left flex items-center justify-between text-xs font-bold text-gray-200 hover:text-white transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${
                      expandedSections.conservative ? 'rotate-90 text-blue-400' : ''
                    }`}
                  />
                  <span>▸ 情况差一点会怎样 (保守情景测算)</span>
                </div>
                <span className="text-[11px] text-gray-400 font-normal">
                  {expandedSections.conservative ? '收起' : '展开查看'}
                </span>
              </button>

              {expandedSections.conservative && (
                <div className="p-4 pt-0 border-t border-border/40 text-xs text-gray-300 space-y-2">
                  <p className="text-[11px] text-gray-400">
                    {packet.conservativeScenarioSummary.explanationZh}
                  </p>
                  <div className="p-3 rounded-lg bg-surface border border-border flex items-center justify-between font-mono">
                    <span>保守情景单件净留存:</span>
                    <span className="font-bold text-emerald-400">
                      ${packet.conservativeScenarioSummary.unitContributionProfitUsd?.toFixed(2)} / 件 (
                      {((packet.conservativeScenarioSummary.unitContributionMargin || 0) * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 手风琴 2: 什么变化会改变结论 (Decision Sensitivity) */}
            <div className="border border-border rounded-xl overflow-hidden bg-surface/60">
              <button
                onClick={() => toggleAccordion('sensitivity')}
                className="w-full p-4 text-left flex items-center justify-between text-xs font-bold text-gray-200 hover:text-white transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${
                      expandedSections.sensitivity ? 'rotate-90 text-blue-400' : ''
                    }`}
                  />
                  <span>▸ 什么变化会改变结论 (敏感度分析)</span>
                </div>
                <span className="text-[11px] text-gray-400 font-normal">
                  {expandedSections.sensitivity ? '收起' : '展开查看'}
                </span>
              </button>

              {expandedSections.sensitivity && (
                <div className="p-4 pt-0 border-t border-border/40 text-xs text-gray-300 space-y-2.5">
                  {packet.decisionSensitivities.map((s, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-surface border border-border space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-white">{s.factorName}</span>
                        <span className="text-amber-400">{s.triggerThreshold}</span>
                      </div>
                      <p className="text-[11px] text-gray-400">{s.explanation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 手风琴 3: 查看完整成本分项 */}
            <div className="border border-border rounded-xl overflow-hidden bg-surface/60">
              <button
                onClick={() => toggleAccordion('costBreakdown')}
                className="w-full p-4 text-left flex items-center justify-between text-xs font-bold text-gray-200 hover:text-white transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${
                      expandedSections.costBreakdown ? 'rotate-90 text-blue-400' : ''
                    }`}
                  />
                  <span>▸ 查看完整成本分项 (Cost Breakdown)</span>
                </div>
                <span className="text-[11px] text-gray-400 font-normal">
                  {expandedSections.costBreakdown ? '收起' : '展开查看'}
                </span>
              </button>

              {expandedSections.costBreakdown && (
                <div className="p-4 pt-0 border-t border-border/40 text-xs text-gray-300">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      采购出厂价: {packet.costBreakdown.productCost?.value != null ? `$${packet.costBreakdown.productCost.value.toFixed(2)}` : '未核定'}
                    </div>
                    <div>
                      佣金: {packet.costBreakdown.referralFee?.included && packet.costBreakdown.referralFee.value != null ? `$${packet.costBreakdown.referralFee.value.toFixed(2)}` : '暂未计入'}
                    </div>
                    <div>
                      FBA 配送: {packet.costBreakdown.fbaFee?.included && packet.costBreakdown.fbaFee.value != null ? `$${packet.costBreakdown.fbaFee.value.toFixed(2)}` : '暂未计入'}
                    </div>
                    <div>
                      头程运费: {packet.costBreakdown.freightFee?.included && packet.costBreakdown.freightFee.value != null ? `$${packet.costBreakdown.freightFee.value.toFixed(2)}` : '暂未计入'}
                    </div>
                    <div>
                      预估关税: {packet.costBreakdown.duty?.included && packet.costBreakdown.duty.value != null ? `$${packet.costBreakdown.duty.value.toFixed(2)}` : '暂未计入'}
                    </div>
                    <div>
                      推广费用: {packet.costBreakdown.advertisingCost?.included && packet.costBreakdown.advertisingCost.value != null ? `$${packet.costBreakdown.advertisingCost.value.toFixed(2)}` : '暂未计入'}
                    </div>
                    <div>
                      退货损失: {packet.costBreakdown.expectedReturnLoss?.included && packet.costBreakdown.expectedReturnLoss.value != null ? `$${packet.costBreakdown.expectedReturnLoss.value.toFixed(2)}` : '暂未计入'}
                    </div>
                    <div>
                      月度仓储: {packet.costBreakdown.storage?.included && packet.costBreakdown.storage.value != null ? `$${packet.costBreakdown.storage.value.toFixed(2)}` : '暂未计入'}
                    </div>
                    <div className="col-span-2 sm:col-span-4 font-bold text-white pt-2 border-t border-border/40">
                      总计核定费用: {packet.costBreakdown.totalExpenses?.value != null ? `$${packet.costBreakdown.totalExpenses.value.toFixed(2)}` : '待完整测算'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 手风琴 4: 风险与 Evidence 详情 */}
            <div className="border border-border rounded-xl overflow-hidden bg-surface/60">
              <button
                onClick={() => toggleAccordion('riskEvidence')}
                className="w-full p-4 text-left flex items-center justify-between text-xs font-bold text-gray-200 hover:text-white transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${
                      expandedSections.riskEvidence ? 'rotate-90 text-blue-400' : ''
                    }`}
                  />
                  <span>▸ 风险与 Evidence 详情 (全链路依据)</span>
                </div>
                <span className="text-[11px] text-gray-400 font-normal">
                  {expandedSections.riskEvidence ? '收起' : '展开查看'}
                </span>
              </button>

              {expandedSections.riskEvidence && (
                <div className="p-4 pt-0 border-t border-border/40 text-xs text-gray-300 space-y-2">
                  {packet.riskAndEvidenceSummary.applicableRisks.map((r) => (
                    <div key={r.riskId} className="p-3 rounded-lg bg-surface border border-border flex items-center justify-between">
                      <div>
                        <span className="font-bold text-white block">{r.title}</span>
                        <span className="text-[11px] text-gray-400">{r.notes}</span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          r.status === 'PASS'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {r.status === 'PASS' ? '已核验 (PASS)' : '待核验 (UNVERIFIED)'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. 弹窗: 未知包装费与定制费防投机确认 (Spec §16 Anti-gaming Modal) */}
      {showUnknownChargeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">确认报价是否存在附加费用</h3>
            </div>
            <p className="text-xs text-gray-300">
              该工厂报价中的【包装费】或【Logo费】尚未核定。CrossPilot 严禁隐式将未知费用当作 0 计算。请明确确认工厂是否有额外费用：
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  包装是否有额外费用？(若工厂免费提供出厂包装，请明确输入 0)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="若工厂确认免费请明确输入 0"
                  value={unknownChargesInput.packagingCost}
                  onChange={(e) =>
                    setUnknownChargesInput({
                      ...unknownChargesInput,
                      packagingCost: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Logo 是否有额外费用？(若工厂确认免收打标费，请明确输入 0)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="若工厂确认免费请明确输入 0"
                  value={unknownChargesInput.logoCost}
                  onChange={(e) =>
                    setUnknownChargesInput({
                      ...unknownChargesInput,
                      logoCost: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
              <button
                onClick={() => {
                  setShowUnknownChargeModal(false);
                  setPendingPrimaryQuoteId(null);
                }}
                className="px-4 py-2 rounded-lg bg-surface border border-border text-xs text-gray-300"
              >
                取消
              </button>
              <button
                onClick={confirmUnknownChargesAndSelect}
                disabled={unknownChargesInput.packagingCost === '' || unknownChargesInput.logoCost === ''}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white"
              >
                确认并以此算账
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. 弹窗: 录入新报价表单 */}
      {showAddQuoteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">录入工厂报价 (Supplier Quote)</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="text-gray-400 block mb-1">供应商名称 *</label>
                <input
                  type="text"
                  placeholder="例如: 浙江台州某制品厂"
                  value={newQuoteForm.supplierName}
                  onChange={(e) => setNewQuoteForm({ ...newQuoteForm, supplierName: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-gray-400 block mb-1">出厂单价 * (¥ CNY)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="必填，如 42"
                  value={newQuoteForm.unitPrice}
                  onChange={(e) =>
                    setNewQuoteForm({
                      ...newQuoteForm,
                      unitPrice: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-gray-400 block mb-1">包装费用 (¥ CNY，不填为未知)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="留空为未知；免费填 0"
                  value={newQuoteForm.packagingCost}
                  onChange={(e) =>
                    setNewQuoteForm({
                      ...newQuoteForm,
                      packagingCost: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-gray-400 block mb-1">Logo 费用 (¥ CNY，不填为未知)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="留空为未知；免费填 0"
                  value={newQuoteForm.logoCost}
                  onChange={(e) =>
                    setNewQuoteForm({
                      ...newQuoteForm,
                      logoCost: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-gray-400 block mb-1">最小起订量 * (MOQ)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="必填，如 500"
                  value={newQuoteForm.moq}
                  onChange={(e) =>
                    setNewQuoteForm({
                      ...newQuoteForm,
                      moq: e.target.value === '' ? '' : (parseInt(e.target.value, 10) || 0),
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-gray-400 block mb-1">大货生产交期 (天)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="选填，如 25"
                  value={newQuoteForm.leadTimeDays}
                  onChange={(e) =>
                    setNewQuoteForm({
                      ...newQuoteForm,
                      leadTimeDays: e.target.value === '' ? '' : (parseInt(e.target.value, 10) || 0),
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-gray-400 block mb-1">样品费用 (¥ CNY)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="选填，如 100"
                  value={newQuoteForm.sampleCost}
                  onChange={(e) =>
                    setNewQuoteForm({
                      ...newQuoteForm,
                      sampleCost: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
              <button
                onClick={() => setShowAddQuoteModal(false)}
                className="px-4 py-2 rounded-lg bg-surface border border-border text-xs text-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleSaveNewQuote}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white"
              >
                保存报价
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. 弹窗: 启动资金补齐与调整表单 (P0-1) */}
      {showInitialCashModal && (() => {
        const cashCurrencyLabel = candidate?.initialCash?.currency === 'USD' ? '$ USD' : '¥ CNY';
        return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div>
              <h3 className="text-base font-bold text-white">补齐 / 调整首单启动资金 (Initial Cash)</h3>
              <p className="text-xs text-gray-400 mt-1">
                首次启动该品所需的真金白银投入。起订量与单价已根据主选工厂确定，在此补齐打样、首批头程与模具/包装版费。
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-gray-300 block mb-1 font-medium">样品打样与寄送费 ({cashCurrencyLabel})</label>
                <input
                  type="number"
                  placeholder="未填写 (必填)"
                  value={initialCashForm.sampleCost}
                  onChange={(e) =>
                    setInitialCashForm({
                      ...initialCashForm,
                      sampleCost: e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white"
                />
                <span className="text-[11px] text-gray-500">若未打样请输入预估样品费，必填项</span>
              </div>

              <div>
                <label className="text-gray-300 block mb-1 font-medium">首批头程物流费 ({cashCurrencyLabel})</label>
                <input
                  type="number"
                  placeholder="未填写 (必填)"
                  value={initialCashForm.firstFreightCost}
                  onChange={(e) =>
                    setInitialCashForm({
                      ...initialCashForm,
                      firstFreightCost: e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white"
                />
                <span className="text-[11px] text-gray-500">
                  首批 {candidate?.initialCash?.moq ? `${candidate.initialCash.moq} 件 ` : ''}发往海外仓/FBA 的总运费，必填项
                </span>
              </div>

              <div>
                <label className="text-gray-300 block mb-1 font-medium">模具开模费 ({cashCurrencyLabel})</label>
                <input
                  type="number"
                  placeholder="公模为 0"
                  value={initialCashForm.toolingCost}
                  onChange={(e) =>
                    setInitialCashForm({
                      ...initialCashForm,
                      toolingCost: e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white"
                />
                <span className="text-[11px] text-gray-500">如无私模开模填 0 即可</span>
              </div>

              <div>
                <label className="text-gray-300 block mb-1 font-medium">定制包装制版费 ({cashCurrencyLabel})</label>
                <input
                  type="number"
                  placeholder="无制版费为 0"
                  value={initialCashForm.packagingSetupCost}
                  onChange={(e) =>
                    setInitialCashForm({
                      ...initialCashForm,
                      packagingSetupCost: e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
              <button
                onClick={() => setShowInitialCashModal(false)}
                className="px-4 py-2 rounded-lg bg-surface border border-border text-xs text-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleSaveInitialCash}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white"
              >
                保存并重新核算
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// 辅助函数: 计算客观事实标签 (Spec §17)
function computeFactBadges(quotes: SupplierQuote[]): SupplierQuoteFactBadge[] {
  if (!quotes || quotes.length === 0) return [];
  const badges: SupplierQuoteFactBadge[] = [];

  const minPrice = Math.min(...quotes.map((q) => q.unitPrice));
  const minMoq = Math.min(...quotes.map((q) => q.moq));
  const validLeadTimes = quotes.filter((q) => q.leadTimeDays != null && q.leadTimeDays > 0);
  const minLeadTime = validLeadTimes.length > 0 ? Math.min(...validLeadTimes.map((q) => q.leadTimeDays!)) : null;

  for (const q of quotes) {
    if (q.unitPrice === minPrice) {
      badges.push({ quoteId: q.id, badgeType: 'LOWEST_PRICE', labelZh: '单价最低' });
    }
    if (q.moq === minMoq) {
      badges.push({ quoteId: q.id, badgeType: 'LOWEST_MOQ', labelZh: 'MOQ 最低' });
    }
    if (minLeadTime !== null && q.leadTimeDays === minLeadTime) {
      badges.push({ quoteId: q.id, badgeType: 'SHORTEST_LEAD_TIME', labelZh: '交期最短' });
    }
  }

  return badges;
}

// 辅助函数: 解析可选数字，空字符串或 null/undefined 返回 undefined，保留真正的 0 (P0 Truthfulness)
function parseOptionalNumber(
  value: number | string | undefined | null,
): number | undefined {
  if (value === '' || value === undefined || value === null) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
