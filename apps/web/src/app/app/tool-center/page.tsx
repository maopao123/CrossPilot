'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '@/lib/api-client';
import { getStatusLabel } from '@/constants/ui-labels';
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
  { id: 'ALL', label: '全部工具' },
  { id: 'CREATIVE', label: '素材生产 (Creative)' },
  { id: 'OPERATION', label: '运营管理 (Operation)' },
  { id: 'DATA', label: '数据与财务 (Data & Finance)' },
  { id: 'PRODUCT_RESEARCH', label: '选品调研 (Research)' },
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

export default function ToolCenterPage() {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [catalogTools, setCatalogTools] = useState<ToolMeta[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolMeta | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
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

  useEffect(() => {
    async function loadCatalog() {
      try {
        const tools = await ApiClient.get<ToolMeta[]>('/api/v1/tools');
        const list = Array.isArray(tools) ? tools : [];
        setCatalogTools(list);
        if (list.length > 0) {
          handleSelectTool(list[0]);
        }
      } catch (err: any) {
        setCatalogError(err?.message || '无法载入工具目录');
      }
    }
    loadCatalog();
  }, []);

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
    if (ApiClient.isViewer() || !selectedTool) return;
    setIsRunning(true);
    setExecutionResult(null);

    try {
      const data = await ApiClient.post<any>(`/api/v1/tools/${selectedTool.id}/execute`, {
        input: formData,
        source: 'TOOL_CENTER',
      });

      setExecutionResult(data);
      setExecutionHistory((prev) => [
        {
          id: `hist_${Date.now()}`,
          toolName: selectedTool.name,
          status: 'SUCCESS',
          durationMs: data.durationMs || 120,
          cost: `$${(selectedTool.costEstimate?.amount || 0).toFixed(2)}`,
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 9),
      ]);
    } catch (err: any) {
      setExecutionResult({
        error: err.message || '工具调用执行失败',
        status: 'FAILED',
      });
      setExecutionHistory((prev) => [
        {
          id: `hist_${Date.now()}`,
          toolName: selectedTool.name,
          status: 'FAILED',
          durationMs: 0,
          cost: '$0.00',
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 9),
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const filteredTools =
    selectedCategory === 'ALL'
      ? catalogTools
      : catalogTools.filter((t) => t.category === selectedCategory);

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
                <h1 className="cp-title">工具中心</h1>
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
            <span>已注册工具: <strong className="text-white">{catalogTools.length}</strong></span>
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
            {catalogError && (
              <div className="text-xs text-rose-400">{catalogError}</div>
            )}
            {filteredTools.map((tool) => {
              const isSelected = selectedTool?.id === tool.id;
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
                      预估成本: {(tool.costEstimate?.amount || 0) > 0 ? `$${tool.costEstimate?.amount}` : '免费'}
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
                <span>最近执行历史</span>
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
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    item.status === 'SUCCESS'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {getStatusLabel(item.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Tool Executor & Form (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedTool ? (
            <div className="bg-surface border border-border rounded-xl p-6 text-sm text-gray-400">
              {catalogError || '正在载入工具目录...'}
            </div>
          ) : (
          <>
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
                  超时: {(selectedTool.timeoutMs || 8000) / 1000}秒
                </span>
              </div>
            </div>

            {/* Dynamic Input Form */}
            <div className="mt-5 space-y-4">
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center space-x-2">
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                <span>输入参数配置</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(selectedTool.inputSchema?.properties || {}).map(([fieldKey, prop]) => {
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
                      {(selectedTool.costEstimate?.amount || 0) > 0 ? `$${selectedTool.costEstimate?.amount} USD` : '$0.00 (免费)'}
                    </strong>
                  </span>
                </div>

                <button
                  onClick={handleRunTool}
                  disabled={isRunning || ApiClient.isViewer()}
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
                      <span>立即执行 Tool</span>
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
                  <span className="text-sm font-bold text-white">执行成功</span>
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
                  <span className="text-xs font-semibold text-gray-300">生成素材预览</span>
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
                    <span>标准化返回 JSON</span>
                  </span>
                </div>
                <pre className="p-4 rounded-lg bg-surface-elevated/90 border border-border text-emerald-400 font-mono text-xs overflow-x-auto max-h-64">
                  {JSON.stringify(executionResult.data || executionResult, null, 2)}
                </pre>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
