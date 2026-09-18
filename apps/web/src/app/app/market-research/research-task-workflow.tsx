'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  CircleDashed,
  FolderPlus,
  History,
  Save,
  ChevronDown,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Layers,
  FileCheck2,
} from 'lucide-react';
import type {
  ProductCandidate,
  ResearchTask,
  ResearchTaskStage,
  ResearchTaskSummary,
} from '@crosspilot/shared';
import { ApiClient } from '../../../lib/api-client';

export type SingleProductModuleKey = 'market' | 'competitors' | 'specs' | 'quotes' | 'economics' | 'decision';

interface ResearchTaskWorkflowProps {
  currentTask: ResearchTask | null;
  candidate: ProductCandidate | null;
  activeModule: SingleProductModuleKey;
  onSelectModule: (module: SingleProductModuleKey) => void;
  onTaskChange: (task: ResearchTask) => void;
  onNewTask: () => void;
  isSaving?: boolean;
  lastSavedAt?: string | null;
}

interface WorkflowStageStep {
  id: ResearchTaskStage;
  numberStr: string;
  title: string;
  targetModule: SingleProductModuleKey;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  statusLabelZh: string;
  detailsZh: string;
}

export function ResearchTaskWorkflow({
  currentTask,
  candidate,
  activeModule,
  onSelectModule,
  onTaskChange,
  onNewTask,
  isSaving = false,
  lastSavedAt = null,
}: ResearchTaskWorkflowProps) {
  const [taskList, setTaskList] = useState<ResearchTaskSummary[]>([]);
  const [showTaskListDropdown, setShowTaskListDropdown] = useState<boolean>(false);
  const [loadingTasks, setLoadingTasks] = useState<boolean>(false);

  // 加载历史任务列表
  async function refreshTaskList() {
    setLoadingTasks(true);
    try {
      const list = await ApiClient.get<ResearchTaskSummary[]>('/api/v1/market-research/tasks');
      setTaskList(list || []);
    } catch (err) {
      console.error('Failed to load research tasks', err);
    } finally {
      setLoadingTasks(false);
    }
  }

  useEffect(() => {
    refreshTaskList();
  }, [currentTask?.id]);

  // 切换已有任务
  async function handleSwitchTask(taskId: string) {
    if (currentTask?.id === taskId) {
      setShowTaskListDropdown(false);
      return;
    }
    setLoadingTasks(true);
    try {
      const full = await ApiClient.get<ResearchTask>(`/api/v1/market-research/tasks/${taskId}`);
      if (full) {
        onTaskChange(full);
      }
    } catch (err: any) {
      alert(err?.message || '加载选品任务失败');
    } finally {
      setLoadingTasks(false);
      setShowTaskListDropdown(false);
    }
  }

  // 真实计算 5 大阶段的完成状态（依据 Candidate 真实领域数据）
  const activeSpec = candidate?.specifications?.find((s) => s.id === candidate?.activeSpecVersionId) || candidate?.specifications?.[0];
  const quotes = candidate?.supplierQuotes || [];
  const primaryQuote = quotes.find((q) => q.id === candidate?.primaryQuoteId);
  const economicsComplete = candidate?.economics?.status === 'COMPLETE';
  const initialCashComplete = candidate?.initialCash?.status === 'COMPLETE';
  const decisionVerdict = candidate?.decision;

  // 1. 市场机会分析状态
  const hasMarketData =
    Boolean(candidate?.marketResearch?.searchVolumeMonthly != null) ||
    Boolean(candidate?.evidence && candidate.evidence.some((e) => e.scope === 'KEYWORD' || e.scope === 'MARKET'));
  const stage1Status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = hasMarketData ? 'COMPLETED' : 'IN_PROGRESS';
  const stage1Label = hasMarketData ? '已完成' : '进行中';
  const stage1Detail = hasMarketData ? '市场容量与细分方向已确认' : '正在收集宏观与细分词';

  // 2. 产品规格状态
  let stage2Status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';
  let stage2Label = '未开始';
  let stage2Detail = '核心4项规格待录入';
  if (activeSpec?.status === 'FROZEN') {
    stage2Status = 'COMPLETED';
    stage2Label = '已完成 (已冻结)';
    stage2Detail = `${activeSpec.material} • ${activeSpec.capacity}`;
  } else if (activeSpec && activeSpec.material && activeSpec.dimensions) {
    stage2Status = 'IN_PROGRESS';
    stage2Label = '进行中 (草稿)';
    stage2Detail = '规格已填，等待冻结询价';
  }

  // 3. 供应商报价状态
  let stage3Status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';
  let stage3Label = '未开始';
  let stage3Detail = '尚未录入工厂报价';
  if (primaryQuote) {
    stage3Status = 'COMPLETED';
    stage3Label = '已完成 (已选主选)';
    stage3Detail = `主选: ${primaryQuote.supplierName} (¥${primaryQuote.unitPrice})`;
  } else if (quotes.length > 0) {
    stage3Status = 'IN_PROGRESS';
    stage3Label = `进行中 (${quotes.length}家报价)`;
    stage3Detail = '已录入报价，待选定算账工厂';
  }

  // 4. 利润测算状态
  let stage4Status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';
  let stage4Label = '未开始';
  let stage4Detail = '待主选工厂确定后测算';
  if (economicsComplete && initialCashComplete) {
    stage4Status = 'COMPLETED';
    stage4Label = '已完成';
    stage4Detail = `单件利润 $${candidate?.economics?.scenarios?.base?.contributionProfit?.toFixed(2) ?? '0.00'} • 现金已核`;
  } else if (candidate?.economics?.inputs?.productCost?.value != null) {
    stage4Status = 'IN_PROGRESS';
    stage4Label = '进行中';
    stage4Detail = '缺少部分关键费用或启动资金项';
  }

  // 5. 投资决策状态
  let stage5Status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';
  let stage5Label = '未开始';
  let stage5Detail = '待财务与风险门禁汇总结论';
  if (decisionVerdict && decisionVerdict !== 'INSUFFICIENT_DATA') {
    stage5Status = 'COMPLETED';
    stage5Label = `已完成 (${decisionVerdict})`;
    stage5Detail = candidate?.decisionPacket?.adviceZh || '结论报告已生成';
  } else if (candidate?.decisionPacket != null) {
    stage5Status = 'IN_PROGRESS';
    stage5Label = '进行中';
    stage5Detail = '一页决策结论包评估中';
  }

  const steps: WorkflowStageStep[] = [
    {
      id: 'MARKET_RESEARCH',
      numberStr: '①',
      title: '市场机会分析',
      targetModule: 'market',
      status: stage1Status,
      statusLabelZh: stage1Label,
      detailsZh: stage1Detail,
    },
    {
      id: 'SPECIFICATION',
      numberStr: '②',
      title: '产品规格方案',
      targetModule: 'specs',
      status: stage2Status,
      statusLabelZh: stage2Label,
      detailsZh: stage2Detail,
    },
    {
      id: 'QUOTE',
      numberStr: '③',
      title: '供应商报价',
      targetModule: 'quotes',
      status: stage3Status,
      statusLabelZh: stage3Label,
      detailsZh: stage3Detail,
    },
    {
      id: 'ECONOMICS',
      numberStr: '④',
      title: '单件利润与首单现金',
      targetModule: 'economics',
      status: stage4Status,
      statusLabelZh: stage4Label,
      detailsZh: stage4Detail,
    },
    {
      id: 'DECISION',
      numberStr: '⑤',
      title: '终局投资决策',
      targetModule: 'decision',
      status: stage5Status,
      statusLabelZh: stage5Label,
      detailsZh: stage5Detail,
    },
  ];

  const taskTitle = currentTask?.title || (candidate?.title ? `${candidate.title} 选品任务` : '未命名选品任务');

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
      {/* 顶部标题栏、当前任务指示与切换器 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                选品任务流 • Research Task Workflow
              </span>
              {currentTask ? (
                <span className="text-[10px] px-2 py-0.2 rounded font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  ID: {currentTask.id.slice(0, 16)}...
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.2 rounded font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  未持久化草稿
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center space-x-2">
              <span>{taskTitle}</span>
            </h2>
          </div>
        </div>

        {/* 右侧控制动作: 历史任务选择、自动保存指示、新建任务 */}
        <div className="flex items-center space-x-2">
          {/* 自动保存指示器 */}
          <div className="hidden md:flex items-center space-x-1.5 text-[11px] text-gray-400 px-2.5 py-1 rounded-lg bg-surface-elevated border border-border/60">
            {isSaving ? (
              <>
                <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
                <span className="text-blue-300">正在同步云端...</span>
              </>
            ) : (
              <>
                <Save className="w-3 h-3 text-emerald-400" />
                <span>{lastSavedAt ? `已自动同步 (${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : '已连接任务中心'}</span>
              </>
            )}
          </div>

          {/* 历史任务切换下拉框 */}
          <div className="relative">
            <button
              onClick={() => {
                refreshTaskList();
                setShowTaskListDropdown(!showTaskListDropdown);
              }}
              className="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface border border-border text-xs font-semibold text-gray-200 flex items-center space-x-1.5 transition shadow-sm"
            >
              <History className="w-3.5 h-3.5 text-purple-400" />
              <span>历史任务 ({taskList.length})</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {showTaskListDropdown && (
              <div className="absolute right-0 mt-1.5 w-72 bg-surface-elevated border border-border rounded-xl shadow-2xl p-2 z-50 space-y-1">
                <div className="flex items-center justify-between px-2 py-1 text-[11px] text-gray-400 border-b border-border/60">
                  <span className="font-semibold">切换选品任务</span>
                  <button
                    onClick={refreshTaskList}
                    disabled={loadingTasks}
                    className="hover:text-white flex items-center space-x-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingTasks ? 'animate-spin' : ''}`} />
                    <span>刷新</span>
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1">
                  {taskList.length === 0 ? (
                    <div className="p-3 text-center text-xs text-gray-500">
                      暂无历史任务，完成关键动作后自动记录
                    </div>
                  ) : (
                    taskList.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleSwitchTask(t.id)}
                        className={`w-full text-left p-2 rounded-lg text-xs transition flex flex-col ${
                          currentTask?.id === t.id
                            ? 'bg-blue-600/20 border border-blue-500/40 text-white'
                            : 'hover:bg-surface text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="truncate">{t.title}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface border border-border text-gray-400">
                            {t.currentStage}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 mt-0.5">
                          更新: {new Date(t.updatedAt).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 新建选品任务按钮 */}
          <button
            onClick={onNewTask}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center space-x-1 transition shadow-sm shadow-blue-500/20"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>新建任务</span>
          </button>
        </div>
      </div>

      {/* 5 阶段进度流卡片 (支持点击无缝进入已有 Tab) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {steps.map((step) => {
          const isCurrentActive =
            (step.targetModule === 'market' && (activeModule === 'market' || activeModule === 'competitors')) ||
            activeModule === step.targetModule;

          return (
            <button
              key={step.id}
              onClick={() => onSelectModule(step.targetModule)}
              className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                isCurrentActive
                  ? 'bg-blue-500/10 border-blue-500 shadow-sm ring-1 ring-blue-500/30'
                  : 'bg-surface/80 border-border hover:border-gray-500 hover:bg-surface-elevated'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-mono text-gray-400">
                    {step.numberStr} 阶段
                  </span>
                  {step.status === 'COMPLETED' ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center space-x-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>已完成</span>
                    </span>
                  ) : step.status === 'IN_PROGRESS' ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center space-x-1 bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      <Clock className="w-3 h-3 animate-pulse" />
                      <span>进行中</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center space-x-1 bg-surface border border-border text-gray-500">
                      <CircleDashed className="w-3 h-3" />
                      <span>未开始</span>
                    </span>
                  )}
                </div>

                <h4 className={`text-xs font-bold ${isCurrentActive ? 'text-blue-300' : 'text-white'}`}>
                  {step.title}
                </h4>
              </div>

              <div className="pt-2 border-t border-border/40 mt-2 flex items-center justify-between">
                <span className="text-[10px] text-gray-400 truncate max-w-[140px]">
                  {step.detailsZh}
                </span>
                <ArrowRight className={`w-3 h-3 shrink-0 ${isCurrentActive ? 'text-blue-400' : 'text-gray-500'}`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
