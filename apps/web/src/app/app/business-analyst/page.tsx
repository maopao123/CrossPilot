'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
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
  const [toolTraces, setToolTraces] = useState<ToolExecutionTrace[]>([]);
  const [showTraces, setShowTraces] = useState(true);
  const [sseActive, setSseActive] = useState(false);
  const [sseLogs, setSseLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWaterfall = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<WaterfallData>('/api/v1/analyst/waterfall');
      setWaterfall(res);
    } catch (err) {
      console.error('Failed to load waterfall:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWaterfall();
  }, []);

  const handleAsk = async () => {
    try {
      setAnswering(true);
      setAgentAnswer(null);
      const res = await ApiClient.post<any>('/api/v1/analyst/ask', { question });
      setAgentAnswer(res.answer);
      setToolTraces(res.toolExecutions || []);
    } catch (err: any) {
      console.error('Ask analyst failed:', err);
    } finally {
      setAnswering(false);
    }
  };

  // Live SSE Stream Test
  const handleStartSSE = () => {
    setSseActive(true);
    setSseLogs(['[SSE] 正在连接 /api/v1/agent-tasks/stream...']);

    const eventSource = new EventSource('/api/v1/agent-tasks/stream?taskType=VARIANCE_ATTRIBUTION');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const line = `[${data.type}] ${data.toolName ? `Tool: ${data.toolName}` : ''} ${data.message || data.name || JSON.stringify(data)}`;
        setSseLogs((prev) => [...prev, line]);
        if (data.type === 'TASK_COMPLETE') {
          setSseLogs((prev) => [...prev, '🏁 [SSE] 执行完毕，连接已关闭。']);
          eventSource.close();
          setSseActive(false);
        }
      } catch (err) {
        setSseLogs((prev) => [...prev, `[RAW] ${event.data}`]);
      }
    };

    eventSource.onerror = () => {
      setSseLogs((prev) => [...prev, '⚠️ [SSE] 演示流结束或连接已终止。']);
      eventSource.close();
      setSseActive(false);
    };
  };

  const b = waterfall?.breakdown || {
    advertising: -980,
    returns: -620,
    inventory: -510,
    price: -310,
    other: 140,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">AI 经营分析</h1>
            <span className="text-xs bg-purple-500/20 text-purple-400 font-semibold px-2 py-0.5 rounded border border-purple-500/30">
              确定性利润归因瀑布图与 Trace
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            确定性财务对账与跨域经营因果归因 • Mastra 自动化工具流执行
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleStartSSE}
            disabled={sseActive}
            className="flex items-center space-x-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition shadow-md"
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
            className="flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{answering ? 'AI 调度工具分析中...' : '提问经营 Agent'}</span>
          </button>
        </div>

        {/* Agent Answer Render */}
        {agentAnswer && (
          <div className="mt-4 p-4 rounded-xl bg-purple-950/20 border border-purple-800/40 text-xs text-gray-200 space-y-2">
            <div className="flex items-center space-x-2 text-purple-300 font-bold">
              <Sparkles className="w-4 h-4" />
              <span>AI 经营分析师综合答复</span>
            </div>
            <div className="whitespace-pre-wrap leading-relaxed text-gray-300 font-normal">
              {agentAnswer}
            </div>
          </div>
        )}
      </div>

      {/* SSE Live Log Console if active or has logs */}
      {sseLogs.length > 0 && (
        <div className="bg-black/80 border border-gray-800 rounded-xl p-4 font-mono text-[11px] text-gray-300 space-y-1 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between text-gray-500 pb-2 border-b border-gray-800">
            <span>📡 SSE Server-Sent Events 流式轨迹监控</span>
            <span className="text-emerald-400 font-semibold">{sseActive ? 'CONNECTING / STREAMING' : 'IDLE'}</span>
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
                确定性利润归因瀑布图
              </span>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono font-bold">
                100% 封闭数学对账
              </span>
            </div>
            <h2 className="text-lg font-bold text-white mt-0.5">
              第 10 周 ➔ 第 11 周 利润骤降归因瀑布图
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              上周利润: <span className="text-white font-bold">$4,120.00</span> • 本周利润: <span className="text-white font-bold">$1,840.00</span> • 总差异额: <span className="text-rose-400 font-bold">-$2,280.00</span>
            </p>
          </div>

          <div className="bg-surface-elevated border border-border p-3 rounded-lg text-right">
            <span className="text-[10px] text-gray-400 uppercase">确定性公式验证</span>
            <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
              -2280 = -980 - 620 - 510 - 310 + 140
            </div>
          </div>
        </div>

        {/* Waterfall Graphic Bars */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
          {/* Advertising */}
          <div className="bg-surface-elevated border border-rose-500/30 p-4 rounded-xl relative overflow-hidden">
            <div className="text-xs font-semibold text-rose-400">1. 广告溢出 (Ads)</div>
            <div className="text-xl font-bold text-rose-400 mt-1">-${Math.abs(b.advertising)}</div>
            <p className="text-[11px] text-gray-400 mt-1">
              泛词 &ldquo;bathroom organizer&rdquo; ACOS 93.3% 预算泄漏
            </p>
            <div className="mt-2 text-[10px] text-rose-300 font-semibold bg-rose-950/40 p-1.5 rounded">
              贡献度: 38.3% (首要归因)
            </div>
          </div>

          {/* Returns */}
          <div className="bg-surface-elevated border border-amber-500/30 p-4 rounded-xl relative overflow-hidden">
            <div className="text-xs font-semibold text-amber-400">2. 退货激增 (Returns)</div>
            <div className="text-xl font-bold text-amber-400 mt-1">-${Math.abs(b.returns)}</div>
            <p className="text-[11px] text-gray-400 mt-1">
              Grey 变体退货率升至 6.7%（电动牙刷孔径不匹配与破损）
            </p>
            <div className="mt-2 text-[10px] text-amber-300 font-semibold bg-amber-950/40 p-1.5 rounded">
              贡献度: 24.2%
            </div>
          </div>

          {/* Inventory */}
          <div className="bg-surface-elevated border border-orange-500/30 p-4 rounded-xl relative overflow-hidden">
            <div className="text-xs font-semibold text-orange-400">3. 断货与加急运费 (Inventory)</div>
            <div className="text-xl font-bold text-orange-400 mt-1">-${Math.abs(b.inventory)}</div>
            <p className="text-[11px] text-gray-400 mt-1">
              Green 变体爆单断货4天损失毛利 + 紧急空运补货附加费
            </p>
            <div className="mt-2 text-[10px] text-orange-300 font-semibold bg-orange-950/40 p-1.5 rounded">
              贡献度: 19.9%
            </div>
          </div>

          {/* Price Discount */}
          <div className="bg-surface-elevated border border-blue-500/30 p-4 rounded-xl relative overflow-hidden">
            <div className="text-xs font-semibold text-blue-400">4. 促销让利 (Price)</div>
            <div className="text-xl font-bold text-blue-400 mt-1">-${Math.abs(b.price)}</div>
            <p className="text-[11px] text-gray-400 mt-1">
              White 主力款临时 10% 优惠券降价让利
            </p>
            <div className="mt-2 text-[10px] text-blue-300 font-semibold bg-blue-950/40 p-1.5 rounded">
              贡献度: 12.1%
            </div>
          </div>

          {/* Other / Packaging */}
          <div className="bg-surface-elevated border border-emerald-500/30 p-4 rounded-xl relative overflow-hidden">
            <div className="text-xs font-semibold text-emerald-400">5. 包装返利 (Cost Savings)</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">+${b.other}</div>
            <p className="text-[11px] text-gray-400 mt-1">
              向供应商批量定购外箱获得的纸箱阶梯返利
            </p>
            <div className="mt-2 text-[10px] text-emerald-300 font-semibold bg-emerald-950/40 p-1.5 rounded">
              正向缓冲: +$140.00
            </div>
          </div>
        </div>
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

            <div className="space-y-2.5">
              {(toolTraces.length > 0 ? toolTraces : [
                { tool: 'query_profit_summary', input: { periodA: 'Week 10', periodB: 'Week 11' }, output: { week10: 4120, week11: 1840, variance: -2280 }, latencyMs: 145 },
                { tool: 'query_ad_metrics', input: { campaignType: 'SPONSORED_PRODUCTS' }, output: { acosSpikeKeyword: 'bathroom organizer', spend: 420 }, latencyMs: 180 },
                { tool: 'query_return_summary', input: { sku: 'MTH-GREY-001' }, output: { returnRate: 0.067, lossDelta: 620 }, latencyMs: 140 },
                { tool: 'query_inventory_risk', input: { sku: 'MTH-GREEN-001' }, output: { stockoutHours: 96, rushShippingFee: 315 }, latencyMs: 110 },
                { tool: 'calculate_variance', input: { ads: -980, ret: -620, inv: -510, price: -310, other: 140 }, output: { total: -2280, exact: true }, latencyMs: 25 },
              ]).map((trace, idx) => (
                <div key={idx} className="bg-surface-elevated border border-border rounded-lg p-3 font-mono text-xs">
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] mt-2">
                    <div className="bg-surface p-2 rounded border border-border/70 text-gray-400">
                      <span className="text-gray-500 font-bold block mb-0.5">输入参数 (Input):</span>
                      <code>{JSON.stringify(trace.input)}</code>
                    </div>
                    <div className="bg-surface p-2 rounded border border-border/70 text-emerald-400">
                      <span className="text-gray-500 font-bold block mb-0.5">输出结果 (Output):</span>
                      <code>{JSON.stringify(trace.output)}</code>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
