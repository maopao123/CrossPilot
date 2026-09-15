'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
import { connectAuthenticatedSse } from '../../../lib/authenticated-sse';
import {
  BrainCircuit,
  TrendingDown,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Send,
  Terminal,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface WaterfallData {
  periodStart: string;
  periodEnd: string;
  totalVariance: number;
  formulaExplained: string;
  breakdown: {
    advertising: number;
    returns: number;
    inventory: number;
    price: number;
    other: number;
  };
  attribution: {
    previousProfit: number;
    currentProfit: number;
    totalVariance: number;
    isExactMatch: boolean;
    residual: number;
    formulaString: string;
    relativeContributions: {
      advertisingPercent: number;
      returnsPercent: number;
      inventoryPercent: number;
      pricePercent: number;
      otherPercent: number;
    };
  };
  findings: Array<{
    type: string;
    title: string;
    metric: string;
    impactAmount: number | null;
    direction: string;
    confidence: number;
    evidence: any;
    recommendation: string;
    priority: number;
  }>;
}

interface ToolExecutionTrace {
  tool: string;
  input: any;
  output: any;
  latencyMs: number;
}

export default function BusinessAnalystPage() {
  const [waterfall, setWaterfall] = useState<WaterfallData | null>(null);
  const [question, setQuestion] = useState('为什么第11周利润骤降？');
  const [answering, setAnswering] = useState(false);
  const [agentAnswer, setAgentAnswer] = useState<string | null>(null);
  const [askStatus, setAskStatus] = useState<string | null>(null);
  const [actionPlan, setActionPlan] = useState<
    Array<{ priority: number; action: string; target: string; impact: string }>
  >([]);
  const [toolTraces, setToolTraces] = useState<ToolExecutionTrace[]>([]);
  const [showTraces, setShowTraces] = useState(true);
  const [sseActive, setSseActive] = useState(false);
  const [sseLogs, setSseLogs] = useState<string[]>([]);
  const sseCloseRef = useRef<(() => void) | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingScenario, setSwitchingScenario] = useState(false);
  const [scenarioMode, setScenarioMode] = useState<'RECONCILED' | 'CONFLICT_SAMPLE'>('RECONCILED');

  const loadWaterfall = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<WaterfallData>('/api/v1/analyst/waterfall');
      setWaterfall(res);
      if (res?.attribution?.isExactMatch === false) {
        setScenarioMode('CONFLICT_SAMPLE');
      } else if (res?.attribution?.isExactMatch === true) {
        setScenarioMode('RECONCILED');
      }
    } catch (err) {
      console.error('Failed to load waterfall:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchScenario = async (mode: 'RECONCILED' | 'CONFLICT_SAMPLE') => {
    try {
      setSwitchingScenario(true);
      await ApiClient.post('/api/v1/scenario/set-mode', { mode });
      setScenarioMode(mode);
      setAgentAnswer(null);
      setAskStatus(null);
      setActionPlan([]);
      setToolTraces([]);
      await loadWaterfall();
    } catch (err) {
      console.error('Failed to switch scenario mode:', err);
    } finally {
      setSwitchingScenario(false);
    }
  };

  useEffect(() => {
    loadWaterfall();
    return () => {
      sseCloseRef.current?.();
    };
  }, []);

  const handleAsk = async () => {
    try {
      setAnswering(true);
      setAgentAnswer(null);
      setAskStatus(null);
      setActionPlan([]);
      const res = await ApiClient.post<any>('/api/v1/analyst/ask', { question });
      setAgentAnswer(res.answer);
      setAskStatus(res.status);
      setActionPlan(res.actionPlan || []);
      setToolTraces(res.toolExecutions || []);
      if (res.status === 'RECONCILIATION_FAILED') {
        setScenarioMode('CONFLICT_SAMPLE');
      } else if (res.status === 'RECONCILED') {
        setScenarioMode('RECONCILED');
      }
      if (res.waterfallSummary) {
        setWaterfall((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            totalVariance:
              typeof res.waterfallSummary.totalVariance === 'number'
                ? res.waterfallSummary.totalVariance
                : prev.totalVariance,
            attribution: {
              ...prev.attribution,
              totalVariance:
                typeof res.waterfallSummary.totalVariance === 'number'
                  ? res.waterfallSummary.totalVariance
                  : prev.attribution?.totalVariance,
              isExactMatch:
                typeof res.waterfallSummary.isExactMatch === 'boolean'
                  ? res.waterfallSummary.isExactMatch
                  : prev.attribution?.isExactMatch,
              residual:
                typeof res.waterfallSummary.residual === 'number'
                  ? res.waterfallSummary.residual
                  : prev.attribution?.residual,
            },
          };
        });
      }
    } catch (err: any) {
      console.error('Ask analyst failed:', err);
    } finally {
      setAnswering(false);
    }
  };

  const handleStartSSE = () => {
    sseCloseRef.current?.();
    setSseActive(true);
    setSseLogs(['[SSE] 正在连接 /api/v1/agent-tasks/stream...']);

    const close = connectAuthenticatedSse(
      '/api/v1/agent-tasks/stream?taskType=VARIANCE_ATTRIBUTION',
      {
        onEvent: (eventName, data, raw) => {
          const type = data?.type || eventName;
          const line = `[${type}] ${data?.toolName ? `Tool: ${data.toolName}` : ''} ${data?.message || data?.name || raw}`;
          setSseLogs((prev) => [...prev, line]);
          if (type === 'TASK_COMPLETE') {
            setSseLogs((prev) => [...prev, '🏁 [SSE] 执行完毕，连接已关闭。']);
            setSseActive(false);
          }
        },
        onError: (err) => {
          const message =
            err.status === 401
              ? '[SSE] 未授权，请重新登录'
              : `[SSE] 连接失败: ${err.message}`;
          setSseLogs((prev) => [...prev, message]);
          setSseActive(false);
        },
      },
      { terminalEvents: ['TASK_COMPLETE'] },
    );
    sseCloseRef.current = close;
  };

  const b = waterfall?.breakdown || {
    advertising: 0,
    returns: 0,
    inventory: 0,
    price: 0,
    other: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <h1 className="cp-title">经营分析</h1>
            <span className="rounded-md border border-border bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-fg-muted">
              利润归因
            </span>
            <span className="rounded-md border border-purple-800/60 bg-purple-950/40 px-2.5 py-0.5 text-[11px] font-mono text-purple-300">
              Scope: 全店多 SKU 经营因果 (WORKSPACE) • 白/绿/灰 3 变体
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            确定性财务对账与跨域经营因果归因 • Mastra 自动化工具流执行
          </p>
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          {/* Dual Scenario Switcher */}
          <div className="flex items-center space-x-1 bg-surface-elevated p-1 rounded-lg border border-border">
            <button
              onClick={() => handleSwitchScenario('RECONCILED')}
              disabled={switchingScenario}
              title="切换至 100% 封闭数学对账正常样本 (Week 10 $4,120 ➔ Week 11 $1,840, 差异 -$2,280, 门禁通过)"
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                scenarioMode === 'RECONCILED'
                  ? 'bg-emerald-600 text-white font-bold shadow'
                  : 'text-gray-400 hover:text-white hover:bg-surface'
              }`}
            >
              🟢 封闭对账 (Scenario A)
            </button>
            <button
              onClick={() => handleSwitchScenario('CONFLICT_SAMPLE')}
              disabled={switchingScenario}
              title="切换至门禁拦截对抗样本 (实际差异 -$225.16 vs 测算 -$2,280, 残差 $2,054.84, 触发 Fail-Closed)"
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                scenarioMode === 'CONFLICT_SAMPLE'
                  ? 'bg-rose-700 text-white font-bold shadow'
                  : 'text-gray-400 hover:text-white hover:bg-surface'
              }`}
            >
              🔴 门禁拦截 (Scenario B)
            </button>
          </div>

          <button
            onClick={handleStartSSE}
            disabled={sseActive}
            className="flex items-center space-x-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-medium text-fg hover:bg-surface-elevated disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${sseActive ? 'animate-pulse' : ''}`} />
            <span>{sseActive ? '实时 SSE 执行中...' : 'SSE 流式执行演练'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Question Input */}
      <div className="bg-surface border border-border rounded-xl p-4 shadow-lg">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="输入经营分析问题，例如：为什么第11周利润骤降？"
              className="w-full bg-surface-elevated border border-border rounded-lg px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            onClick={handleAsk}
            disabled={answering}
            className="flex flex-shrink-0 items-center justify-center space-x-2 rounded-lg bg-accent px-5 py-2.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{answering ? 'AI 调度工具分析中...' : '提问经营 Agent'}</span>
          </button>
        </div>

        {/* Agent Answer Render & Action Plan Gate */}
        {agentAnswer && (
          <div className="mt-4 p-4 rounded-xl bg-purple-950/20 border border-purple-800/40 text-xs text-gray-200 space-y-3">
            <div className="flex items-center space-x-2 text-purple-300 font-bold">
              <Sparkles className="w-4 h-4" />
              <span>AI 经营分析师综合答复</span>
              {askStatus === 'RECONCILIATION_FAILED' && (
                <span className="ml-auto text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded font-mono font-bold flex items-center space-x-1">
                  <AlertCircle className="w-3 h-3 text-rose-400" />
                  <span>门禁已拦截 (Fail-Closed)</span>
                </span>
              )}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed text-gray-300 font-normal">
              {agentAnswer}
            </div>

            {/* Action Plan Block or Display */}
            <div className="pt-3 border-t border-purple-800/30">
              <div className="text-xs font-bold text-gray-300 mb-2 flex items-center space-x-1.5">
                <span>🎯 自动化执行建议 (Action Plan)</span>
              </div>
              {actionPlan.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {actionPlan.map((action, idx) => (
                    <div
                      key={idx}
                      className="bg-surface-elevated border border-border p-2.5 rounded-lg text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-purple-400 font-bold">
                          P{action.priority}: {action.action}
                        </span>
                      </div>
                      <div className="text-gray-300 font-mono text-[11px] truncate">
                        {action.target}
                      </div>
                      <div className="text-emerald-400 text-[10px]">{action.impact}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-surface-elevated/70 border border-amber-800/40 rounded-lg text-[11px] text-amber-300/90 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>
                    【门禁阻断】系统检测到利润对账未平或底层证据源存在冲突，已按 Fail-Closed 策略阻断生成确定性归因结论与 Action Plan，避免在失真账本上进行错误决策。
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SSE Live Log Console if active or has logs */}
      {sseLogs.length > 0 && (
        <div className="bg-black/80 border border-gray-800 rounded-xl p-4 font-mono text-[11px] text-gray-300 space-y-1 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between text-gray-500 pb-2 border-b border-gray-800">
            <span>📡 SSE 流式轨迹监控</span>
            <span className="text-emerald-400 font-semibold">{sseActive ? '连接中 / 流传输' : '空闲'}</span>
          </div>
          {sseLogs.map((log, idx) => (
            <div key={idx} className="text-emerald-400/90 leading-tight">
              {log}
            </div>
          ))}
        </div>
      )}

      {/* Deterministic Waterfall Attribution Card (Section 270 & 286) */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-border pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                {waterfall?.attribution?.isExactMatch ? '确定性利润归因瀑布图' : '候选归因因素排查'}
              </span>
              {waterfall?.attribution?.isExactMatch ? (
                <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>100% 封闭数学对账</span>
                </span>
              ) : (
                <span className="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded font-mono font-bold flex items-center space-x-1">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>
                    ⚠️ 归因对账未平
                    {typeof waterfall?.attribution?.residual === 'number'
                      ? ` (差额: $${Math.abs(waterfall.attribution.residual).toFixed(2)})`
                      : ''}
                  </span>
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-white mt-0.5">
              {waterfall?.attribution?.isExactMatch
                ? '第 10 周 ➔ 第 11 周 利润骤降归因瀑布图'
                : '候选归因因素 (未通过对账) • Candidate Attribution — NOT RECONCILED'}
            </h2>
            <p className="mt-1 text-xs text-fg-muted">
              总差异额:{' '}
              <span className="font-mono font-medium text-fg">
                {typeof waterfall?.totalVariance === 'number'
                  ? `${waterfall.totalVariance < 0 ? '-' : ''}$${Math.abs(waterfall.totalVariance).toFixed(2)}`
                  : 'N/A'}
              </span>
            </p>
          </div>

          <div className="bg-surface-elevated border border-border p-3 rounded-lg text-right">
            <span className="text-[10px] text-gray-400 uppercase">确定性公式验证</span>
            <div className="mt-0.5 font-mono text-sm font-medium text-fg">
              {waterfall?.attribution?.formulaString || waterfall?.formulaExplained || 'N/A'}
            </div>
          </div>
        </div>

        {/* Reconciliation Failure Alert Box (Fail-Closed Notification) */}
        {waterfall?.attribution && !waterfall.attribution.isExactMatch && (
          <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/60 text-xs text-rose-200 space-y-2.5">
            <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>对账门禁拦截：确定性利润归因校验未通过</span>
            </div>
            <p className="text-rose-200/90 leading-relaxed text-xs">
              系统检测到实际账面利润变化与五大杠杆分解合计存在数学残差。根据 Fail-Closed 对账门禁策略，已按 Fail-Closed 策略阻断生成确定性归因结论与 Action Plan。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-xs">
              <div className="bg-rose-900/30 p-2.5 rounded-lg border border-rose-700/40">
                <span className="text-rose-400 block text-[10px]">实际账面利润变化</span>
                <span className="font-bold text-white text-sm">
                  {typeof waterfall.totalVariance === 'number'
                    ? `${waterfall.totalVariance < 0 ? '-' : ''}$${Math.abs(waterfall.totalVariance).toFixed(2)}`
                    : 'N/A'}
                </span>
              </div>
              <div className="bg-rose-900/30 p-2.5 rounded-lg border border-rose-700/40">
                <span className="text-rose-400 block text-[10px]">五大杠杆分解合计</span>
                <span className="font-bold text-white text-sm">
                  ${(
                    (b.advertising || 0) +
                    (b.returns || 0) +
                    (b.inventory || 0) +
                    (b.price || 0) +
                    (b.other || 0)
                  ).toFixed(2)}
                </span>
              </div>
              <div className="bg-rose-900/30 p-2.5 rounded-lg border border-rose-700/40">
                <span className="text-rose-400 block text-[10px]">未解释残差 (Residual)</span>
                <span className="font-bold text-rose-300 text-sm">
                  ${Math.abs(waterfall.attribution.residual).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Waterfall Graphic Bars */}
        {(() => {
          const isExact = waterfall?.attribution?.isExactMatch === true;
          return (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
              {/* Advertising */}
              <div
                className={`bg-surface-elevated p-4 rounded-xl relative overflow-hidden transition-all ${
                  isExact
                    ? 'border border-rose-500/30'
                    : 'border border-dashed border-rose-800/40 opacity-80 bg-surface-elevated/60'
                }`}
              >
                <div className="text-xs font-semibold text-rose-400">1. 广告溢出 (Ads)</div>
                <div className="text-xl font-bold text-rose-400 mt-1">-${Math.abs(b.advertising)}</div>
                <p className="text-[11px] text-gray-400 mt-1">
                  泛词 &ldquo;bathroom organizer&rdquo; ACOS 93.3% 预算泄漏
                </p>
                {isExact ? (
                  <div className="mt-2 text-[10px] text-rose-300 font-semibold bg-rose-950/40 p-1.5 rounded">
                    贡献度: {waterfall?.attribution?.relativeContributions?.advertisingPercent ?? 38.3}% (首要归因)
                  </div>
                ) : (
                  <div className="mt-2 text-[10px] text-gray-400 font-normal bg-black/40 border border-dashed border-gray-700 p-1.5 rounded">
                    ⚠️ 未通过对账，仅供排查 • 因子测算: -${Math.abs(b.advertising)}
                  </div>
                )}
              </div>

              {/* Returns */}
              <div
                className={`bg-surface-elevated p-4 rounded-xl relative overflow-hidden transition-all ${
                  isExact
                    ? 'border border-amber-500/30'
                    : 'border border-dashed border-amber-800/40 opacity-80 bg-surface-elevated/60'
                }`}
              >
                <div className="text-xs font-semibold text-amber-400">2. 退货激增 (Returns)</div>
                <div className="text-xl font-bold text-amber-400 mt-1">-${Math.abs(b.returns)}</div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Grey 变体退货率升至 6.7%（电动牙刷孔径不匹配与破损）
                </p>
                {isExact ? (
                  <div className="mt-2 text-[10px] text-amber-300 font-semibold bg-amber-950/40 p-1.5 rounded">
                    贡献度: {waterfall?.attribution?.relativeContributions?.returnsPercent ?? 24.2}%
                  </div>
                ) : (
                  <div className="mt-2 text-[10px] text-gray-400 font-normal bg-black/40 border border-dashed border-gray-700 p-1.5 rounded">
                    ⚠️ 未通过对账，仅供排查 • 因子测算: -${Math.abs(b.returns)}
                  </div>
                )}
              </div>

              {/* Inventory */}
              <div
                className={`bg-surface-elevated p-4 rounded-xl relative overflow-hidden transition-all ${
                  isExact
                    ? 'border border-orange-500/30'
                    : 'border border-dashed border-orange-800/40 opacity-80 bg-surface-elevated/60'
                }`}
              >
                <div className="text-xs font-semibold text-orange-400">3. 断货与加急运费 (Inventory)</div>
                <div className="text-xl font-bold text-orange-400 mt-1">-${Math.abs(b.inventory)}</div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Green 变体爆单断货4天损失毛利 + 紧急空运补货附加费
                </p>
                {isExact ? (
                  <div className="mt-2 text-[10px] text-orange-300 font-semibold bg-orange-950/40 p-1.5 rounded">
                    贡献度: {waterfall?.attribution?.relativeContributions?.inventoryPercent ?? 19.9}%
                  </div>
                ) : (
                  <div className="mt-2 text-[10px] text-gray-400 font-normal bg-black/40 border border-dashed border-gray-700 p-1.5 rounded">
                    ⚠️ 未通过对账，仅供排查 • 因子测算: -${Math.abs(b.inventory)}
                  </div>
                )}
              </div>

              {/* Price Discount */}
              <div
                className={`bg-surface-elevated p-4 rounded-xl relative overflow-hidden transition-all ${
                  isExact
                    ? 'border border-blue-500/30'
                    : 'border border-dashed border-blue-800/40 opacity-80 bg-surface-elevated/60'
                }`}
              >
                <div className="text-xs font-semibold text-blue-400">4. 促销让利 (Price)</div>
                <div className="text-xl font-bold text-blue-400 mt-1">-${Math.abs(b.price)}</div>
                <p className="text-[11px] text-gray-400 mt-1">
                  White 主力款临时 10% 优惠券降价让利
                </p>
                {isExact ? (
                  <div className="mt-2 text-[10px] text-blue-300 font-semibold bg-blue-950/40 p-1.5 rounded">
                    贡献度: {waterfall?.attribution?.relativeContributions?.pricePercent ?? 12.1}%
                  </div>
                ) : (
                  <div className="mt-2 text-[10px] text-gray-400 font-normal bg-black/40 border border-dashed border-gray-700 p-1.5 rounded">
                    ⚠️ 未通过对账，仅供排查 • 因子测算: -${Math.abs(b.price)}
                  </div>
                )}
              </div>

              {/* Other / Packaging */}
              <div
                className={`bg-surface-elevated p-4 rounded-xl relative overflow-hidden transition-all ${
                  isExact
                    ? 'border border-emerald-500/30'
                    : 'border border-dashed border-emerald-800/40 opacity-80 bg-surface-elevated/60'
                }`}
              >
                <div className="text-xs font-semibold text-emerald-400">5. 包装返利 (Cost Savings)</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">+${b.other}</div>
                <p className="text-[11px] text-gray-400 mt-1">
                  向供应商批量定购外箱获得的纸箱阶梯返利
                </p>
                {isExact ? (
                  <div className="mt-2 text-[10px] text-emerald-300 font-semibold bg-emerald-950/40 p-1.5 rounded">
                    正向缓冲: +$140.00
                  </div>
                ) : (
                  <div className="mt-2 text-[10px] text-gray-400 font-normal bg-black/40 border border-dashed border-gray-700 p-1.5 rounded">
                    ⚠️ 未通过对账，仅供排查 • 因子测算: +$140.00
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Agent Trace Drawer (Milestone 7) */}
      <div className="bg-surface border border-border rounded-xl p-5 shadow-lg">
        <div
          onClick={() => setShowTraces(!showTraces)}
          className="flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Agent 决策轨迹与 Tool 调用抽屉 (Trace 与延迟)
            </h3>
          </div>
          <button className="text-gray-400 hover:text-white text-xs flex items-center space-x-1">
            <span>{showTraces ? '收起轨迹' : '展开轨迹'}</span>
            {showTraces ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {showTraces && (
          <div className="mt-4 pt-3 border-t border-border space-y-3">
            <p className="text-xs text-gray-400">
              CrossPilot 禁止让 LLM 瞎猜数字。以下为 Business Analyst Agent 自动编排调用的确定性工具真实入参、出参与毫秒延迟：
            </p>

            {toolTraces.length > 0 ? (
              <div className="space-y-2.5">
                {toolTraces.map((trace, idx) => (
                  <div
                    key={idx}
                    className="bg-surface-elevated border border-border rounded-lg p-3 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between text-cyan-300 font-bold mb-1">
                      <span className="flex items-center space-x-1.5">
                        <span className="w-4 h-4 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-[10px] text-cyan-400">
                          {idx + 1}
                        </span>
                        <span>Tool: {trace.tool}()</span>
                      </span>
                      <span className="text-[11px] text-gray-400 font-normal flex items-center">
                        <Clock className="w-3 h-3 mr-1" /> {trace.latencyMs}ms
                      </span>
                    </div>

                    {trace.tool === 'cross_domain_consistency_gate' ? (
                      <div className="space-y-2 text-[11px] mt-2">
                        <div className="bg-surface p-2.5 rounded border border-border/70 text-gray-400">
                          <span className="text-gray-500 font-bold block mb-1">输入参数 (6-Domain Input Flags):</span>
                          <pre className="font-mono text-[11px] whitespace-pre-wrap break-words overflow-x-auto max-h-[120px] overflow-y-auto leading-relaxed text-gray-300">
                            {JSON.stringify(trace.input, null, 2)}
                          </pre>
                        </div>
                        <div className="bg-surface p-2.5 rounded border border-border/70 text-emerald-400">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-gray-500 font-bold">对账六维检验结果 (6-Domain Gate Output & Checks):</span>
                            {trace.output?.status && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  trace.output.status === 'PASS'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                                }`}
                              >
                                {trace.output.status}
                              </span>
                            )}
                          </div>
                          <pre className="font-mono text-[11px] whitespace-pre-wrap break-words overflow-x-auto max-h-[360px] overflow-y-auto leading-relaxed bg-surface-elevated/50 p-2 rounded border border-border/40 text-emerald-300">
                            {JSON.stringify(trace.output, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] mt-2">
                        <div className="bg-surface p-2 rounded border border-border/70 text-gray-400">
                          <span className="text-gray-500 font-bold block mb-0.5">输入参数:</span>
                          <pre className="font-mono text-[11px] whitespace-pre-wrap break-words overflow-x-auto max-h-[180px] overflow-y-auto leading-relaxed text-gray-300">
                            {JSON.stringify(trace.input, null, 2)}
                          </pre>
                        </div>
                        <div className="bg-surface p-2 rounded border border-border/70 text-emerald-400">
                          <span className="text-gray-500 font-bold block mb-0.5">输出结果:</span>
                          <pre className="font-mono text-[11px] whitespace-pre-wrap break-words overflow-x-auto max-h-[180px] overflow-y-auto leading-relaxed text-emerald-300">
                            {JSON.stringify(trace.output, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-surface-elevated border border-dashed border-border text-center text-xs text-gray-400">
                暂无工具调用轨迹。点击上方「提问经营 Agent」按钮即可触发真实的跨域工具链调度，并在此实时查看入参、出参与毫秒级延迟。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
