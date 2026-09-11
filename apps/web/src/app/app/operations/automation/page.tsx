'use client';

import React, { useState } from 'react';
import { ApiClient } from '@/lib/api-client';
import {
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  Bot,
  UserCheck,
  ExternalLink,
  Cpu,
  Layers,
  ArrowRight,
  Terminal,
  FileCheck,
  Check,
  X,
  Clock,
  Send,
} from 'lucide-react';

interface WorkflowNode {
  stepNumber: number;
  name: string;
  runtime: 'AI' | 'TOOL' | 'HUMAN' | 'RPA';
  status: 'COMPLETED' | 'WAITING' | 'RUNNING' | 'PENDING' | 'FAILED';
  summary: string;
  details?: any;
}

export default function OperationAutomationPage() {
  const [skuCode, setSkuCode] = useState('MTH-GREEN-001');
  const [targetPrice, setTargetPrice] = useState(29.99);
  const [isRunning, setIsRunning] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<'IDLE' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [activeWorkflow, setActiveWorkflow] = useState<{
    id: string;
    status: 'WAITING_APPROVAL' | 'SUCCEEDED' | 'RUNNING' | 'FAILED';
    approvalId: string;
    steps: WorkflowNode[];
  }>({
    id: 'wf_run_publish_001',
    status: 'WAITING_APPROVAL',
    approvalId: 'appr_wf_run_publish_001',
    steps: [
      {
        stepNumber: 1,
        name: 'AI 文案生成与产品事实锚定',
        runtime: 'AI',
        status: 'COMPLETED',
        summary: '生成 1.5" 孔径、3.57 lbs 净重与天然大理石真实材质标题与 5 点描述',
        details: {
          title: 'POLEGAS Natural Marble Toothbrush Holder - 1.5" Universal Wide Slots, Heavy Solid Stone Base',
          bulletCount: 5,
        },
      },
      {
        stepNumber: 2,
        name: 'Listing 亚马逊合规与宣称质检',
        runtime: 'TOOL',
        status: 'COMPLETED',
        summary: '严格核查 POL-FDA-001 与 POL-RANK-002，判定结果: PASS (0 违规)',
        details: { status: 'PASS', score: 1.0, inspectedRules: 4 },
      },
      {
        stepNumber: 3,
        name: '素材工坊 1.5" 标注图与纯白底主图生成',
        runtime: 'TOOL',
        status: 'COMPLETED',
        summary: '已产出 2000x2000 亚马逊主图与 3 大卖点卡片图',
        details: { imagesCount: 5, assetStatus: 'READY' },
      },
      {
        stepNumber: 4,
        name: '人工把关审批门禁 (Human Approval Gate)',
        runtime: 'HUMAN',
        status: 'WAITING',
        summary: '高风险上架动作：待运营负责人批准发布标价 $29.99 与 Listing 终稿',
        details: {
          approvalId: 'appr_wf_run_publish_001',
          requiredAction: 'APPROVE_LISTING_SUBMIT',
          price: 29.99,
        },
      },
      {
        stepNumber: 5,
        name: 'RPA 自动化打开后台并填报发布',
        runtime: 'RPA',
        status: 'PENDING',
        summary: '影刀/Mock RPA 驱动无头浏览器执行 Seller Central 录入',
      },
      {
        stepNumber: 6,
        name: '上架状态回验与 Feed ID 确认',
        runtime: 'TOOL',
        status: 'PENDING',
        summary: '验证亚马逊 Batch Feed 批次接收并核验库存与价格生效',
      },
    ],
  });

  const [rpaLogs, setRpaLogs] = useState<string[]>([
    '[09:30:12] [Workflow Engine] Initialized WF-Operation-01: Amazon Listing Publish Flow',
    '[09:30:13] [Node 1 - AI] Generated copy grounded on SKU Product Brief facts.',
    '[09:30:14] [Node 2 - Tool] Compliance check evaluated against 4 Amazon policies: 0 violations.',
    '[09:30:15] [Node 3 - Tool] Ingested 5 assets from Creative Studio.',
    '[09:30:15] [Node 4 - Human Gate] PAUSED at Approval Gate. Proposed target price: $29.99.',
  ]);

  const handleStartWorkflow = async () => {
    setIsRunning(true);
    setApprovalStatus('PENDING');

    try {
      const data = await ApiClient.post<any>('/api/v1/operations/listing-publish', {
        skuCode,
        targetPrice,
        autoApprove: false,
      });

      if (data) {
        setActiveWorkflow(data);
        setRpaLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] [Workflow Engine] Started publish workflow for ${skuCode}.`,
          `[${new Date().toLocaleTimeString()}] [Node 4 - Human Gate] Paused. Awaiting operator signoff.`,
          ...prev,
        ]);
        return;
      }
    } catch (err: any) {
      setRpaLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] [Workflow Engine] Failed to start publish workflow: ${err.message}`,
        ...prev,
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleApprove = async () => {
    setIsRunning(true);
    setApprovalStatus('APPROVED');

    try {
      const data = await ApiClient.post<any>(
        `/api/v1/operations/approve/${activeWorkflow.approvalId}`,
        {},
      );

      if (data) {
        setActiveWorkflow(data);
        setRpaLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] [Node 6 - Verification] Amazon Batch Feed confirmed.`,
          `[${new Date().toLocaleTimeString()}] [Node 5 - RPA] Completed Seller Central automated upload for ${skuCode}.`,
          `[${new Date().toLocaleTimeString()}] [Node 4 - Human Gate] Approved by operator. Dispatched to RPA Adapter.`,
          ...prev,
        ]);
        return;
      }
    } catch (err: any) {
      setRpaLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] [Approval Gate] Approval failed: ${err.message}`,
        ...prev,
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleReject = () => {
    setApprovalStatus('REJECTED');
    setActiveWorkflow((prev) => ({
      ...prev,
      status: 'FAILED',
      steps: prev.steps.map((s) =>
        s.runtime === 'HUMAN'
          ? { ...s, status: 'FAILED', summary: '运营负责人已驳回发布申请' }
          : s,
      ),
    }));
    setRpaLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] [Human Gate] Action REJECTED by operator. Workflow cancelled.`,
      ...prev,
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-surface border border-border rounded-xl p-6 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold">
            <PlayCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-white tracking-tight">
                运营自动化工作流 (Operation Automation)
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                P0 RPA Pipeline
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              WF-Operation-01 Listing Publish：AI 负责内容生成与合规质检，人类把关审批门禁，RPA 负责稳定填报与发布
            </p>
          </div>
        </div>

        <div className="mt-4 md:mt-0 flex items-center space-x-3">
          <input
            type="number"
            value={targetPrice}
            onChange={(e) => setTargetPrice(parseFloat(e.target.value) || 0)}
            className="w-24 bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            placeholder="发布价格"
          />

          <button
            onClick={handleStartWorkflow}
            disabled={isRunning}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md shadow-emerald-600/20"
          >
            {isRunning ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>流水线执行中...</span>
              </>
            ) : (
              <>
                <PlayCircle className="w-3.5 h-3.5" />
                <span>启动 Listing 发布流水线</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Human Approval Gate Spotlight Card */}
      {activeWorkflow.status === 'WAITING_APPROVAL' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 animate-in fade-in duration-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-300 flex-shrink-0 mt-0.5">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-white">
                    人工审批门禁等待中 (Human Gate: WAITING_APPROVAL)
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-amber-500/20 text-amber-300">
                    High-Risk Action
                  </span>
                </div>
                <p className="text-xs text-gray-300">
                  AI 文案已就绪并通过合规检测，素材已生成。为防止非预期价格或违规内容直发，当前流程已在发布前自动挂起。
                </p>
                <div className="text-xs text-gray-400 flex items-center space-x-4 pt-1">
                  <span>
                    目标 SKU: <strong className="text-white font-mono">{skuCode}</strong>
                  </span>
                  <span>
                    计划售价: <strong className="text-emerald-400 font-mono">${targetPrice} USD</strong>
                  </span>
                  <span>
                    合规状态: <strong className="text-emerald-400">100% 审计通过</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 self-end md:self-center">
              <button
                onClick={handleReject}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-surface border border-border hover:bg-surface-elevated text-gray-300 transition flex items-center space-x-1.5"
              >
                <X className="w-3.5 h-3.5 text-red-400" />
                <span>驳回发布 (Reject)</span>
              </button>

              <button
                onClick={handleApprove}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-md shadow-emerald-600/20"
              >
                <Check className="w-3.5 h-3.5" />
                <span>核准并触发 RPA (Approve & Publish)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification Banner */}
      {activeWorkflow.status === 'SUCCEEDED' && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-white">Listing 发布流水线全部完成 (Workflow Succeeded)</h3>
              <p className="text-xs text-gray-300 mt-0.5">
                RPA 已成功将商品资料与图片提交至亚马逊 Seller Central，Feed ID: 8192049102，等待亚马逊全球商品目录编目。
              </p>
            </div>
          </div>

          <a
            href={`https://sellercentral.amazon.com/inventory/view/${skuCode}`}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-lg text-xs bg-emerald-600 text-white font-medium flex items-center space-x-1 hover:bg-emerald-500"
          >
            <span>查看 Seller Central 草稿</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Workflow DAG / Step Progress Graph */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white">流水线节点执行编排 (Workflow Pipeline Nodes)</h3>
          </div>
          <span className="text-xs text-gray-400">
            状态:{' '}
            <strong
              className={`font-mono ${
                activeWorkflow.status === 'SUCCEEDED'
                  ? 'text-emerald-400'
                  : activeWorkflow.status === 'WAITING_APPROVAL'
                  ? 'text-amber-400'
                  : 'text-blue-400'
              }`}
            >
              {activeWorkflow.status}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeWorkflow.steps.map((step) => {
            const isCompleted = step.status === 'COMPLETED';
            const isWaiting = step.status === 'WAITING';
            const isPending = step.status === 'PENDING';

            return (
              <div
                key={step.stepNumber}
                className={`p-4 rounded-xl border transition ${
                  isWaiting
                    ? 'bg-amber-500/5 border-amber-500/40 ring-1 ring-amber-500/20'
                    : isCompleted
                    ? 'bg-surface-elevated/40 border-emerald-500/30'
                    : 'bg-surface border-border/60 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                        isCompleted
                          ? 'bg-emerald-500 text-white'
                          : isWaiting
                          ? 'bg-amber-500 text-black'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {isCompleted ? '✓' : step.stepNumber}
                    </span>
                    <span className="text-xs font-bold text-white">{step.name}</span>
                  </div>

                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                      step.runtime === 'RPA'
                        ? 'bg-purple-500/20 text-purple-300'
                        : step.runtime === 'HUMAN'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {step.runtime}
                  </span>
                </div>

                <p className="text-xs text-gray-400 mt-2.5 line-clamp-2">{step.summary}</p>

                <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">执行节点状态</span>
                  <span
                    className={`font-semibold ${
                      isCompleted
                        ? 'text-emerald-400'
                        : isWaiting
                        ? 'text-amber-400'
                        : 'text-gray-500'
                    }`}
                  >
                    {step.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RPA Real-Time Execution Logs Terminal */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">RPA 自动化执行实时审计日志 (Execution Trace Logs)</h3>
          </div>
          <span className="text-[11px] text-gray-400 font-mono">Adapter: Yingdao/Mock RPA Engine</span>
        </div>

        <div className="p-4 rounded-lg bg-black/80 border border-border font-mono text-xs text-gray-300 space-y-1.5 max-h-56 overflow-y-auto">
          {rpaLogs.map((log, i) => (
            <div key={i} className="flex items-start space-x-2">
              <span className="text-emerald-500 select-none">&gt;</span>
              <span
                className={
                  log.includes('PAUSED') || log.includes('Gate')
                    ? 'text-amber-300 font-semibold'
                    : log.includes('Succeeded') || log.includes('accepted')
                    ? 'text-emerald-400 font-semibold'
                    : 'text-gray-300'
                }
              >
                {log}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
