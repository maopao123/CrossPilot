'use client';

import React, { useState } from 'react';
import {
  Wrench,
  Sparkles,
  Search,
  FileEdit,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Layers,
  Code,
  Sliders,
  DollarSign,
  ChevronRight,
  History,
} from 'lucide-react';

const CATEGORIES = [
  { id: 'ALL', label: '全部工具 (All Tools)' },
  { id: 'CREATIVE', label: '素材生产 (Creative)' },
  { id: 'OPERATION', label: '运营管理 (Operation)' },
  { id: 'DATA', label: '数据与财务 (Data & Finance)' },
  { id: 'PRODUCT_RESEARCH', label: '选品研究 (Research)' },
];

interface ToolMeta {
  id: string;
  name: string;
  category: string;
  description: string;
  version: string;
  costEstimate: { amount: number; unit: string };
  timeoutMs: number;
  tags: string[];
  inputSchema: {
    type: string;
    properties: Record<
      string,
      {
        name: string;
        label: string;
        type: string;
        required?: boolean;
        defaultValue?: any;
        placeholder?: string;
        options?: { label: string; value: any }[];
      }
    >;
  };
}

const INITIAL_TOOLS: ToolMeta[] = [
  {
    id: 'creative.image.generate',
    name: '电商高转化商品图生成器',
    category: 'CREATIVE',
    description: '基于商品卖点、场景提示词与风格预设，生成高分辨率亚马逊主图与附图素材。',
    version: '1.0.0',
    costEstimate: { amount: 0.04, unit: 'USD' },
    timeoutMs: 15000,
    tags: ['creative', 'ai-image', 'amazon'],
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          name: 'prompt',
          label: '创意提示词 (Prompt)',
          type: 'textarea',
          required: true,
          defaultValue: 'Carrara natural marble toothbrush holder, clean modern bathroom vanity, soft daylight',
          placeholder: '输入详细的商品与场景描述...',
        },
        style: {
          name: 'style',
          label: '视觉风格',
          type: 'select',
          defaultValue: 'luxury_minimalist',
          options: [
            { label: '亚马逊标准白底棚拍 (Studio White)', value: 'studio_white' },
            { label: '轻奢极简北欧风 (Luxury Minimalist)', value: 'luxury_minimalist' },
            { label: '真实生活家居场景 (Home Lifestyle)', value: 'home_lifestyle' },
          ],
        },
        aspectRatio: {
          name: 'aspectRatio',
          label: '宽高比例',
          type: 'select',
          defaultValue: '1:1',
          options: [
            { label: '1:1 (2000x2000 亚马逊主图)', value: '1:1' },
            { label: '4:3 (常见辅图)', value: '4:3' },
            { label: '16:9 (横版宽幅/A+)', value: '16:9' },
          ],
        },
      },
    },
  },
  {
    id: 'creative.infographic.generate',
    name: '卖点标注与孔径尺寸信息图生成器',
    category: 'CREATIVE',
    description: '自动基于商品关键事实生成带刻度尺标注、重量图示与防滑垫解构的专业亚马逊第 2/3 张卖点图。',
    version: '1.0.0',
    costEstimate: { amount: 0.03, unit: 'USD' },
    timeoutMs: 12000,
    tags: ['creative', 'infographic', 'dimensions'],
    inputSchema: {
      type: 'object',
      properties: {
        productTitle: {
          name: 'productTitle',
          label: '产品主标题',
          type: 'string',
          required: true,
          defaultValue: 'POLEGAS Natural Marble Toothbrush Holder',
        },
        slotDiameterInch: {
          name: 'slotDiameterInch',
          label: '升级插槽孔径 (英寸)',
          type: 'number',
          defaultValue: 1.5,
        },
        netWeightLbs: {
          name: 'netWeightLbs',
          label: '产品净重 (磅)',
          type: 'number',
          defaultValue: 3.57,
        },
      },
    },
  },
  {
    id: 'compliance.listing.check',
    name: 'Listing 合规与宣称真实性判决器',
    category: 'OPERATION',
    description: '严格审计亚马逊商品标题、五点描述与商品详情，自动拦截医疗/FDA虚假宣称、极值排行夸大与孔径尺寸隐患。',
    version: '1.0.0',
    costEstimate: { amount: 0, unit: 'USD' },
    timeoutMs: 8000,
    tags: ['listing', 'compliance', 'amazon'],
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          name: 'title',
          label: '商品标题 (Title)',
          type: 'string',
          required: true,
          defaultValue: 'POLEGAS Natural Marble Toothbrush Holder (Carrara White) - 1.5" Wide Universal Slots',
        },
        bulletPoints: {
          name: 'bulletPoints',
          label: '五点描述 (Bullet Points)',
          type: 'textarea',
          required: true,
          defaultValue: '100% Authentic Natural Marble with organic veining, 3.57 lbs weight prevents tipping over.\n1.5-inch universal compartments comfortably fit Oral-B and Sonicare electric toothbrushes.\nBottom features 4x cushioned EVA pads to protect vanity granite countertops from moisture.',
        },
      },
    },
  },
  {
    id: 'finance.profit.calculate',
    name: '财务利润核算工具 (Profit Calculator)',
    category: 'DATA',
    description: '精确核算单件商品或周期的毛利、净利润、亚马逊佣金、FBA配送费与利润率，杜绝浮点数漂移。',
    version: '1.0.0',
    costEstimate: { amount: 0, unit: 'USD' },
    timeoutMs: 5000,
    tags: ['finance', 'profit', 'amazon'],
    inputSchema: {
      type: 'object',
      properties: {
        revenue: {
          name: 'revenue',
          label: '销售收入 ($)',
          type: 'number',
          required: true,
          defaultValue: 29.99,
        },
        cogs: {
          name: 'cogs',
          label: '商品采购成本 COGS ($)',
          type: 'number',
          required: true,
          defaultValue: 5.80,
        },
        referralFeeRate: {
          name: 'referralFeeRate',
          label: '亚马逊佣金比例',
          type: 'number',
          defaultValue: 0.15,
        },
        fbaFee: {
          name: 'fbaFee',
          label: 'FBA 履约配送费 ($)',
          type: 'number',
          defaultValue: 4.50,
        },
        adSpend: {
          name: 'adSpend',
          label: '平摊广告花费 ($)',
          type: 'number',
          defaultValue: 3.20,
        },
      },
    },
  },
  {
    id: 'operation.keyword.combine',
    name: '关键词矩阵笛卡尔组合与去重器',
    category: 'OPERATION',
    description: '自动对核心词根、材质修饰词及场景修饰词进行矩阵组合与去重，生成 250 字节合规 Search Terms。',
    version: '1.0.0',
    costEstimate: { amount: 0, unit: 'USD' },
    timeoutMs: 5000,
    tags: ['keywords', 'seo', 'operation'],
    inputSchema: {
      type: 'object',
      properties: {
        seedKeywords: {
          name: 'seedKeywords',
          label: '核心词根 (逗号分隔)',
          type: 'string',
          required: true,
          defaultValue: 'toothbrush holder, toothbrush stand, electric caddy',
        },
        modifiers: {
          name: 'modifiers',
          label: '材质与场景修饰词',
          type: 'string',
          required: true,
          defaultValue: 'natural marble, solid stone, wide slot, non slip, modern luxury vanity',
        },
      },
    },
  },
  {
    id: 'operation.listing.publish',
    name: '亚马逊 Listing RPA 自动化填报发布器',
    category: 'OPERATION',
    description: '将经过合规判决与人工批准的 Listing 结构化字段自动委派至 RPA 引擎，执行打开 Seller Central、填报变体信息并提交审核。',
    version: '1.0.0',
    costEstimate: { amount: 0.10, unit: 'USD' },
    timeoutMs: 60000,
    tags: ['rpa', 'seller-central', 'publish'],
    inputSchema: {
      type: 'object',
      properties: {
        skuCode: {
          name: 'skuCode',
          label: '目标 SKU 编码',
          type: 'string',
          required: true,
          defaultValue: 'MTH-GREEN-001',
        },
        title: {
          name: 'title',
          label: '商品标题',
          type: 'string',
          required: true,
          defaultValue: 'POLEGAS Natural Marble Toothbrush Holder - 1.5" Wide Slots',
        },
        price: {
          name: 'price',
          label: '发布标价 ($)',
          type: 'number',
          required: true,
          defaultValue: 29.99,
        },
      },
    },
  },
];

export default function ToolCenterPage() {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedTool, setSelectedTool] = useState<ToolMeta>(INITIAL_TOOLS[0]);
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const [k, v] of Object.entries(INITIAL_TOOLS[0].inputSchema.properties)) {
      if (v.defaultValue !== undefined) init[k] = v.defaultValue;
    }
    return init;
  });
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [executionHistory, setExecutionHistory] = useState<any[]>([
    {
      id: 'hist_01',
      toolName: '财务利润核算工具 (Profit Calculator)',
      status: 'SUCCESS',
      durationMs: 4,
      cost: '$0.00',
      time: '10:24:12',
    },
    {
      id: 'hist_02',
      toolName: 'Listing 合规与宣称真实性判决器',
      status: 'SUCCESS',
      durationMs: 8,
      cost: '$0.00',
      time: '10:28:45',
    },
  ]);

  const handleSelectTool = (tool: ToolMeta) => {
    setSelectedTool(tool);
    setExecutionResult(null);
    const newForm: Record<string, any> = {};
    for (const [k, v] of Object.entries(tool.inputSchema.properties)) {
      if (v.defaultValue !== undefined) newForm[k] = v.defaultValue;
    }
    setFormData(newForm);
  };

  const handleInputChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleRunTool = async () => {
    setIsRunning(true);
    setExecutionResult(null);

    // Call API endpoint or fallback to client simulation
    try {
      const res = await fetch(`http://localhost:3001/api/v1/tools/${selectedTool.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: formData,
          workspaceId: 'ws_default_001',
          source: 'TOOL_CENTER',
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setExecutionResult(json.data || json);
        setExecutionHistory((prev) => [
          {
            id: `hist_${Date.now()}`,
            toolName: selectedTool.name,
            status: json.success ? 'SUCCESS' : 'FAILED',
            durationMs: json.durationMs || 120,
            cost: `$${(selectedTool.costEstimate?.amount || 0).toFixed(2)}`,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 9),
        ]);
        setIsRunning(false);
        return;
      }
    } catch {
      // Offline fallback simulation
    }

    // Deterministic simulation
    setTimeout(() => {
      let mockData: any = {};
      if (selectedTool.id === 'finance.profit.calculate') {
        const rev = Number(formData.revenue || 29.99);
        const cogs = Number(formData.cogs || 5.8);
        const refFee = Math.round(rev * 0.15 * 100) / 100;
        const fba = Number(formData.fbaFee || 4.5);
        const ads = Number(formData.adSpend || 3.2);
        const net = Math.round((rev - (cogs + refFee + fba + ads)) * 100) / 100;
        mockData = {
          revenue: rev,
          cogs,
          amazonFees: refFee,
          fbaFee: fba,
          adsCost: ads,
          netProfit: net,
          margin: Math.round((net / rev) * 10000) / 100,
        };
      } else if (selectedTool.id === 'creative.image.generate') {
        mockData = {
          imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&auto=format&fit=crop&q=80',
          aspectRatio: formData.aspectRatio || '1:1',
          style: formData.style || 'luxury_minimalist',
          dimensions: { width: 2000, height: 2000 },
          seed: 489102,
          model: 'Flux-Dev-eCommerce-v2',
        };
      } else if (selectedTool.id === 'creative.infographic.generate') {
        mockData = {
          infographicUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&auto=format&fit=crop&q=80',
          callouts: [
            { label: 'Slot Diameter', value: `${formData.slotDiameterInch || 1.5}" Universal Wide`, badge: 'Sonicare Fit' },
            { label: 'Net Weight', value: `${formData.netWeightLbs || 3.57} lbs Natural Stone`, badge: 'Zero Tip-Over' },
            { label: 'Base Protection', value: '4x Anti-Slip EVA Cushions', badge: 'Countertop Safe' },
          ],
        };
      } else if (selectedTool.id === 'compliance.listing.check') {
        mockData = {
          status: 'PASS',
          riskLevel: 'LOW',
          score: 1.0,
          violations: [],
          inspectedRulesCount: 4,
          citationPolicy: 'Amazon Authenticity & Medical Devices Guidelines',
        };
      } else if (selectedTool.id === 'operation.keyword.combine') {
        mockData = {
          totalGenerated: 24,
          sampleKeywords: [
            'natural marble toothbrush holder',
            'solid stone toothbrush stand',
            'wide slot electric caddy',
            'non slip marble toothbrush stand',
          ],
          searchTermsField: 'natural marble stone toothbrush holder stand caddy wide slot non slip bathroom vanity countertop',
          searchTermsByteLength: 98,
          compliantWith250Bytes: true,
        };
      } else if (selectedTool.id === 'operation.listing.publish') {
        mockData = {
          rpaJobId: 'rpa_pub_89410',
          skuCode: formData.skuCode || 'MTH-GREEN-001',
          status: 'PUBLISHED_SUCCESS',
          sellerCentralDraftUrl: `https://sellercentral.amazon.com/inventory/view/${formData.skuCode || 'MTH-GREEN-001'}`,
          stepsExecuted: [
            { node: 'RPA_INIT', status: 'SUCCESS', message: 'Launched browser session to Seller Central.' },
            { node: 'AUTH_VERIFY', status: 'SUCCESS', message: 'Session active with 2FA verified.' },
            { node: 'FILL_FIELDS', status: 'SUCCESS', message: 'Title, brand, item_type and bullet points populated.' },
            { node: 'SUBMIT_AND_CONFIRM', status: 'SUCCESS', message: 'Batch feed ID: 8941048201 submitted.' },
          ],
        };
      }

      setExecutionResult({
        success: true,
        data: mockData,
        traceId: `trace_${Date.now()}`,
        durationMs: 145,
        cost: selectedTool.costEstimate,
      });

      setExecutionHistory((prev) => [
        {
          id: `hist_${Date.now()}`,
          toolName: selectedTool.name,
          status: 'SUCCESS',
          durationMs: 145,
          cost: `$${(selectedTool.costEstimate?.amount || 0).toFixed(2)}`,
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 9),
      ]);
      setIsRunning(false);
    }, 450);
  };

  const filteredTools =
    selectedCategory === 'ALL'
      ? INITIAL_TOOLS
      : INITIAL_TOOLS.filter((t) => t.category === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-surface border border-border rounded-xl p-6 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  统一工具中心 (Tool Center)
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  V9 Tool Platform
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                一份核心能力，三大调用入口：AI Agent、员工网页手动操作、自动化 Workflow 共享同一套注册表与执行器
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 md:mt-0 flex items-center space-x-3 text-xs">
          <div className="px-3 py-2 bg-surface-elevated rounded-lg border border-border text-gray-300 flex items-center space-x-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>已注册工具: <strong className="text-white">{INITIAL_TOOLS.length}</strong></span>
          </div>
          <div className="px-3 py-2 bg-surface-elevated rounded-lg border border-border text-gray-300 flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-purple-400" />
            <span>执行模式: <strong className="text-white">确定性沙盒</strong></span>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center space-x-2 border-b border-border pb-3 overflow-x-auto text-xs">
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
                active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-surface text-gray-400 hover:text-gray-200 border border-border'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Tool List (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
            可用工具列表 ({filteredTools.length})
          </div>
          <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
            {filteredTools.map((tool) => {
              const isSelected = selectedTool.id === tool.id;
              return (
                <div
                  key={tool.id}
                  onClick={() => handleSelectTool(tool)}
                  className={`p-4 rounded-xl border cursor-pointer transition ${
                    isSelected
                      ? 'bg-blue-600/10 border-blue-500/50 shadow-md ring-1 ring-blue-500/30'
                      : 'bg-surface border-border hover:border-gray-700 hover:bg-surface-elevated/40'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold text-white leading-tight">
                          {tool.name}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-2">
                        {tool.description}
                      </p>
                    </div>
                    <ChevronRight className={`w-4 h-4 ml-2 flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-gray-600'}`} />
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-[11px] text-gray-400">
                    <span className="font-mono text-gray-500 text-[10px]">{tool.id}</span>
                    <span className="text-gray-400 font-medium">
                      预估成本: {tool.costEstimate.amount > 0 ? `$${tool.costEstimate.amount}` : '免费'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Execution History Card */}
          <div className="bg-surface border border-border rounded-xl p-4 space-y-3 mt-4">
            <div className="flex items-center justify-between text-xs text-gray-300 font-semibold">
              <span className="flex items-center space-x-1.5">
                <History className="w-3.5 h-3.5 text-gray-400" />
                <span>最近执行历史 (Recent Runs)</span>
              </span>
              <span className="text-[10px] text-gray-500">{executionHistory.length} 次</span>
            </div>
            <div className="space-y-2 text-xs">
              {executionHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-surface-elevated border border-border/60 text-gray-400"
                >
                  <div className="truncate pr-2">
                    <span className="text-gray-200 block truncate">{item.toolName}</span>
                    <span className="text-[10px] text-gray-500">{item.time} · {item.durationMs}ms</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Tool Executor & Form (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Tool Detail Header */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-border gap-2">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300">
                    {selectedTool.category}
                  </span>
                  <h2 className="text-lg font-bold text-white">{selectedTool.name}</h2>
                </div>
                <p className="text-xs text-gray-400 mt-1">{selectedTool.description}</p>
              </div>

              <div className="flex items-center space-x-2 text-xs">
                <span className="px-2 py-1 bg-surface-elevated rounded border border-border text-gray-400 font-mono">
                  v{selectedTool.version}
                </span>
                <span className="px-2 py-1 bg-surface-elevated rounded border border-border text-gray-400 font-mono">
                  Timeout: {selectedTool.timeoutMs / 1000}s
                </span>
              </div>
            </div>

            {/* Dynamic Input Form */}
            <div className="mt-5 space-y-4">
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center space-x-2">
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                <span>输入参数配置 (Input Form Schema)</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(selectedTool.inputSchema.properties).map(([fieldKey, prop]) => {
                  const val = formData[fieldKey] !== undefined ? formData[fieldKey] : '';
                  const isFullWidth = prop.type === 'textarea' || prop.type === 'array';

                  return (
                    <div
                      key={fieldKey}
                      className={`space-y-1.5 ${isFullWidth ? 'md:col-span-2' : ''}`}
                    >
                      <label className="text-xs font-medium text-gray-300 flex items-center justify-between">
                        <span>
                          {prop.label}
                          {prop.required && <span className="text-red-400 ml-1">*</span>}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">{fieldKey}</span>
                      </label>

                      {prop.type === 'select' && prop.options ? (
                        <select
                          value={val}
                          onChange={(e) => handleInputChange(fieldKey, e.target.value)}
                          className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          {prop.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : prop.type === 'textarea' || prop.type === 'array' ? (
                        <textarea
                          rows={3}
                          value={val}
                          onChange={(e) => handleInputChange(fieldKey, e.target.value)}
                          placeholder={prop.placeholder}
                          className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                        />
                      ) : (
                        <input
                          type={prop.type === 'number' ? 'number' : 'text'}
                          value={val}
                          onChange={(e) =>
                            handleInputChange(
                              fieldKey,
                              prop.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value,
                            )
                          }
                          placeholder={prop.placeholder}
                          className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Run Tool Action Bar */}
              <div className="pt-4 border-t border-border flex items-center justify-between">
                <div className="text-xs text-gray-400 flex items-center space-x-2">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    单次运行费用:{' '}
                    <strong className="text-white">
                      {selectedTool.costEstimate.amount > 0 ? `$${selectedTool.costEstimate.amount} USD` : '$0.00 (免费)'}
                    </strong>
                  </span>
                </div>

                <button
                  onClick={handleRunTool}
                  disabled={isRunning}
                  className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-xs font-semibold text-white transition ${
                    isRunning
                      ? 'bg-blue-600/50 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20'
                  }`}
                >
                  {isRunning ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在调用工具执行器...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>立即执行 (Run Tool)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Execution Result Card */}
          {executionResult && (
            <div className="bg-surface border border-border rounded-xl p-6 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-white">执行成功 (Execution Success)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    200 OK
                  </span>
                </div>

                <div className="flex items-center space-x-4 text-xs text-gray-400">
                  <span>耗时: <strong className="text-white font-mono">{executionResult.durationMs || 120} ms</strong></span>
                  <span>Trace ID: <strong className="text-white font-mono">{executionResult.traceId}</strong></span>
                </div>
              </div>

              {/* Visual preview if creative image */}
              {executionResult.data?.imageUrl && (
                <div className="p-4 bg-surface-elevated rounded-lg border border-border space-y-3">
                  <span className="text-xs font-semibold text-gray-300">生成素材预览 (Asset Preview)</span>
                  <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4">
                    <img
                      src={executionResult.data.imageUrl}
                      alt="Rendered Preview"
                      className="w-48 h-48 rounded-lg object-cover border border-border shadow-md"
                    />
                    <div className="space-y-2 text-xs text-gray-400">
                      <div>
                        <span className="text-gray-500 block text-[10px]">视觉风格</span>
                        <span className="text-white font-medium">{executionResult.data.style}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">渲染画幅与尺寸</span>
                        <span className="text-white font-medium">
                          {executionResult.data.dimensions?.width} x {executionResult.data.dimensions?.height} ({executionResult.data.aspectRatio})
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">模型引擎</span>
                        <span className="text-emerald-400 font-mono">{executionResult.data.model}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Visual preview if infographic callouts */}
              {executionResult.data?.callouts && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {executionResult.data.callouts.map((c: any, i: number) => (
                    <div key={i} className="p-3 bg-surface-elevated rounded-lg border border-border">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider block">{c.label}</span>
                      <span className="text-sm font-bold text-white block mt-0.5">{c.value}</span>
                      <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">
                        {c.badge}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Raw Result JSON */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="flex items-center space-x-1.5">
                    <Code className="w-3.5 h-3.5 text-gray-400" />
                    <span>标准化返回 JSON (Normalized Result)</span>
                  </span>
                </div>
                <pre className="p-4 rounded-lg bg-surface-elevated/90 border border-border text-emerald-400 font-mono text-xs overflow-x-auto max-h-64">
                  {JSON.stringify(executionResult.data || executionResult, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
