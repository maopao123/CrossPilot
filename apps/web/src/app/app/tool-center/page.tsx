'use client';

import React, { useEffect, useState, useCallback } from 'react';
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
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  Check,
  Download,
  ExternalLink,
  X,
  Eye,
  Camera,
  RefreshCw,
} from 'lucide-react';

const CATEGORIES = [
  { id: 'ALL', label: '全部工具' },
  { id: 'CREATIVE', label: '素材生产 (Creative)' },
  { id: 'OPERATION', label: '运营管理 (Operation)' },
  { id: 'DATA', label: '数据与财务 (Data & Finance)' },
  { id: 'PRODUCT_RESEARCH', label: '选品调研 (Research)' },
];

const CATEGORY_LABELS: Record<string, string> = {
  CREATIVE: '素材生产',
  OPERATION: '运营管理',
  DATA: '数据与财务',
  PRODUCT_RESEARCH: '选品调研',
};

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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [executionHistory, setExecutionHistory] = useState<any[]>([]);

  // Lightbox & Zoom state
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Live timer while running
  useEffect(() => {
    let timer: any = null;
    if (isRunning) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning]);

  // Keyboard shortcut for Lightbox (ESC to exit, +/- to zoom)
  useEffect(() => {
    if (!lightboxUrl) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === '=' || e.key === '+') {
        setZoomScale((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))));
      } else if (e.key === '-' || e.key === '_') {
        setZoomScale((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))));
      } else if (e.key === '0') {
        setZoomScale(1);
        setPanOffset({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxUrl]);

  useEffect(() => {
    async function loadCatalogAndHistory() {
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

      try {
        const runs = await ApiClient.get<any[]>('/api/v1/tools/executions?limit=10');
        if (Array.isArray(runs) && runs.length > 0) {
          setExecutionHistory(
            runs.map((r: any) => ({
              id: r.id,
              toolId: r.toolId,
              toolName: r.toolName,
              status: r.status,
              durationMs: r.durationMs || 0,
              cost: r.cost ? `$${(r.cost.amount || 0).toFixed(2)}` : '$0.00',
              time: new Date(r.createdAt).toLocaleTimeString(),
              rawRecord: r,
            })),
          );
        }
      } catch {
        // Ignore fallback
      }
    }
    loadCatalogAndHistory();
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

  const handleSelectHistory = (item: any) => {
    if (item.rawRecord) {
      const out = item.rawRecord.output || {};
      const isSuccess = item.rawRecord.status === 'SUCCESS';
      setExecutionResult({
        success: isSuccess,
        data: out,
        durationMs: item.rawRecord.durationMs,
        traceId: item.rawRecord.traceId,
        cost: item.rawRecord.cost,
      });
      const tool = catalogTools.find((t) => t.id === item.rawRecord.toolId);
      if (tool) setSelectedTool(tool);
    }
  };

  const extractImageUrl = useCallback((result: any): string | null => {
    if (!result) return null;
    const target = result.data || result.output || result;
    if (typeof target.imageUrl === 'string') return target.imageUrl;
    if (typeof target.lifestyleImageUrl === 'string') return target.lifestyleImageUrl;
    if (typeof target.processedImageUrl === 'string') return target.processedImageUrl;
    if (typeof target.infographicImageUrl === 'string') return target.infographicImageUrl;
    if (Array.isArray(target.variants) && target.variants[0]?.url) return target.variants[0].url;
    return null;
  }, []);

  const handleCopyUrl = (url: string) => {
    const fullUrl = url.startsWith('http')
      ? url
      : typeof window !== 'undefined'
      ? `${window.location.origin}${url}`
      : url;
    navigator.clipboard.writeText(fullUrl);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const openLightbox = (url: string) => {
    setLightboxUrl(url);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const closeLightbox = () => {
    setLightboxUrl(null);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomScale <= 1) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoomScale((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))));
    } else {
      setZoomScale((prev) => {
        const next = Math.max(0.5, Number((prev - 0.25).toFixed(2)));
        if (next <= 1) setPanOffset({ x: 0, y: 0 });
        return next;
      });
    }
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

      const isSuccess = data?.success !== false && !data?.error;
      setExecutionResult(data);
      setExecutionHistory((prev) => [
        {
          id: `hist_${Date.now()}`,
          toolName: selectedTool.name,
          status: isSuccess ? 'SUCCESS' : 'FAILED',
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
                  V9 Tool 平台
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
              {executionHistory.length === 0 ? (
                <div className="text-[11px] text-gray-500 py-2 text-center">暂无近期执行记录</div>
              ) : (
                executionHistory.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectHistory(item)}
                    className="flex items-center justify-between p-2 rounded-lg bg-surface-elevated border border-border/60 hover:border-blue-500/50 hover:bg-surface-elevated/80 text-gray-400 cursor-pointer transition"
                    title="点击载入该条执行记录并即时预览结果"
                  >
                    <div className="truncate pr-2">
                      <span className="text-gray-200 block truncate">{item.toolName}</span>
                      <span className="text-[10px] text-gray-500">{item.time} · {item.durationMs}ms</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0 ${
                      item.status === 'SUCCESS'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {getStatusLabel(item.status)}
                    </span>
                  </div>
                ))
              )}
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
                    {CATEGORY_LABELS[selectedTool.category] || selectedTool.category}
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

          {/* Live Progress Card while Tool is Running */}
          {isRunning && (
            <div className="bg-surface border border-blue-500/40 rounded-xl p-6 space-y-4 animate-in fade-in duration-200 shadow-lg shadow-blue-500/5">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center space-x-2.5">
                  <RotateCcw className="w-4 h-4 text-blue-400 animate-spin" />
                  <span className="text-sm font-bold text-white">AI 素材生成与持久化流水线正在执行...</span>
                </div>
                <div className="text-xs text-blue-300 font-mono">
                  已耗时: <strong className="text-white text-sm">{elapsedSeconds}</strong> 秒
                </div>
              </div>

              <div className="p-4 bg-surface-elevated rounded-lg border border-border/70 space-y-3">
                {/* Stage description */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 font-medium">
                    {elapsedSeconds < 5
                      ? '1/3 正在校验创意提示词与输入参数...'
                      : elapsedSeconds < 35
                      ? '2/3 阿里云 DashScope (qwen-image-3.0-pro) 正在渲染 2000×2000 超清商品图...'
                      : '3/3 图像生成完成，正在自动转存至 MinIO 对象存储生成持久化访问链接...'}
                  </span>
                  <span className="text-blue-400 font-mono text-[11px]">
                    {elapsedSeconds < 35 ? '高精渲染中' : '持久化转存中'}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-surface rounded-full h-2 overflow-hidden border border-border">
                  <div
                    className="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(95, elapsedSeconds * 2.5 + 10)}%` }}
                  />
                </div>

                {/* Animated Placeholder Canvas */}
                <div className="relative rounded-xl border border-dashed border-border/80 bg-surface/50 h-56 flex flex-col items-center justify-center text-center p-4 space-y-2 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/5 to-transparent animate-pulse" />
                  <Camera className="w-8 h-8 text-blue-400/70 animate-bounce" />
                  <p className="text-xs text-gray-200 font-medium">
                    正在生成 2000×2000 亚马逊主图画幅，完成后将自动呈现高清实时预览并支持点击放大
                  </p>
                  <p className="text-[11px] text-gray-500">
                    高精画幅渲染通常需 30~45 秒，请耐心等待，切勿关闭或刷新页面
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Execution Result Card */}
          {executionResult && (() => {
            const isFailed = executionResult.status === 'FAILED' || executionResult.success === false || !!executionResult.error;
            const imageUrl = extractImageUrl(executionResult);
            const data = executionResult.data || executionResult.output || executionResult;

            return (
              <div className="bg-surface border border-border rounded-xl p-6 space-y-5 animate-in fade-in duration-200">
                {/* Result Header */}
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center space-x-2">
                    {isFailed ? (
                      <>
                        <AlertCircle className="w-4 h-4 text-rose-400" />
                        <span className="text-sm font-bold text-rose-400">执行失败</span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          {executionResult.error?.code || 'FAILED'}
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-bold text-white">执行成功</span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          200 OK
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center space-x-4 text-xs text-gray-400">
                    <span>耗时: <strong className="text-white font-mono">{executionResult.durationMs || 120} ms</strong></span>
                    {executionResult.traceId && (
                      <span>Trace ID: <strong className="text-white font-mono">{executionResult.traceId}</strong></span>
                    )}
                  </div>
                </div>

                {isFailed && (
                  <div className="p-4 bg-rose-500/10 rounded-lg border border-rose-500/20 text-xs text-rose-300 space-y-1">
                    <div className="font-semibold">错误信息</div>
                    <p>{typeof executionResult.error === 'string' ? executionResult.error : executionResult.error?.message || '未知执行错误'}</p>
                  </div>
                )}

                {/* Enhanced Image Showcase & Real-Time Preview */}
                {imageUrl && (
                  <div className="p-5 bg-surface-elevated rounded-xl border border-border space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-semibold text-white">生成素材高分辨率实时预览</span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          MinIO 持久化
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => openLightbox(imageUrl)}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition shadow-sm cursor-pointer"
                          title="全屏放大查看细节"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>放大查看</span>
                        </button>

                        <button
                          onClick={() => handleCopyUrl(imageUrl)}
                          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-gray-300 hover:text-white hover:border-gray-600 transition cursor-pointer"
                          title="复制图片永久访问链接"
                        >
                          {copiedUrl === imageUrl ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>复制链接</span>
                            </>
                          )}
                        </button>

                        <a
                          href={imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-gray-300 hover:text-white hover:border-gray-600 transition cursor-pointer"
                          title="在新标签页打开高清原图"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>新标签打开</span>
                        </a>

                        <a
                          href={imageUrl}
                          download={`crosspilot-${Date.now()}.png`}
                          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-gray-300 hover:text-white hover:border-gray-600 transition cursor-pointer"
                          title="下载原图"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>下载</span>
                        </a>
                      </div>
                    </div>

                    {/* Main Image Canvas Preview with Click-to-Zoom */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                      <div
                        onClick={() => openLightbox(imageUrl)}
                        className="md:col-span-6 relative group rounded-xl overflow-hidden border border-border/80 bg-neutral-950/70 aspect-square flex items-center justify-center cursor-pointer shadow-inner hover:border-blue-500/60 transition duration-200"
                        title="点击展开全屏放大预览"
                      >
                        {/* Transparent checkerboard background */}
                        <div
                          className="absolute inset-0 opacity-15"
                          style={{
                            backgroundImage:
                              'linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)',
                            backgroundSize: '16px 16px',
                            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                          }}
                        />
                        <img
                          src={imageUrl}
                          alt="生成的素材预览"
                          className="relative max-h-full max-w-full object-contain p-1 transition duration-300 group-hover:scale-[1.02]"
                        />

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition duration-200 flex flex-col items-center justify-center text-white space-y-2">
                          <div className="p-3 rounded-full bg-white/20 backdrop-blur-md shadow-lg">
                            <Maximize2 className="w-6 h-6 text-white" />
                          </div>
                          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-black/60 border border-white/20">
                            点击全屏放大与细节缩放
                          </span>
                        </div>

                        {/* Bottom-right zoom badge */}
                        <div className="absolute bottom-2.5 right-2.5 px-2 py-1 rounded-md bg-black/75 backdrop-blur-sm border border-white/10 text-[10px] text-gray-200 flex items-center space-x-1 shadow">
                          <ZoomIn className="w-3 h-3 text-blue-400" />
                          <span>点击放大</span>
                        </div>
                      </div>

                      {/* Metadata & Direct Link Box */}
                      <div className="md:col-span-6 space-y-3.5 text-xs text-gray-400">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="p-2.5 rounded-lg bg-surface border border-border/80">
                            <span className="text-gray-500 block text-[10px] uppercase">视觉风格</span>
                            <span className="text-white font-medium mt-0.5 block">{data?.style || '亚马逊标准白底棚拍'}</span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-surface border border-border/80">
                            <span className="text-gray-500 block text-[10px] uppercase">渲染画幅尺寸</span>
                            <span className="text-white font-medium mt-0.5 block">
                              {data?.dimensions?.width ? `${data.dimensions.width} x ${data.dimensions.height}` : '2000 x 2000'} ({data?.aspectRatio || '1:1'})
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-surface border border-border/80">
                            <span className="text-gray-500 block text-[10px] uppercase">渲染模型引擎</span>
                            <span className="text-emerald-400 font-mono mt-0.5 block">{data?.model || 'qwen-image-3.0-pro'}</span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-surface border border-border/80">
                            <span className="text-gray-500 block text-[10px] uppercase">存储服务</span>
                            <span className="text-blue-400 font-medium mt-0.5 block">MinIO S3 (永久保存)</span>
                          </div>
                        </div>

                        {/* Permanent URL input */}
                        <div className="space-y-1.5 pt-1">
                          <label className="text-[11px] font-medium text-gray-300 flex items-center justify-between">
                            <span>素材永久访问地址 (URL)</span>
                            <span className="text-[10px] text-emerald-400">直接引用不丢图</span>
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              readOnly
                              value={imageUrl.startsWith('http') ? imageUrl : typeof window !== 'undefined' ? `${window.location.origin}${imageUrl}` : imageUrl}
                              className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none select-all"
                            />
                            <button
                              onClick={() => handleCopyUrl(imageUrl)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition cursor-pointer flex items-center space-x-1"
                            >
                              {copiedUrl === imageUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedUrl === imageUrl ? '已复制' : '复制'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Prompt note if available */}
                        {data?.promptUsed && (
                          <div className="p-2.5 rounded-lg bg-surface border border-border/60 space-y-1">
                            <span className="text-[10px] text-gray-500 uppercase block">生效提示词 (Prompt)</span>
                            <p className="text-[11px] text-gray-300 line-clamp-3 leading-relaxed font-mono">
                              {data.promptUsed}
                            </p>
                          </div>
                        )}
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
            );
          })()}
          </>
          )}
        </div>
      </div>

      {/* Interactive Zoom / Pan Lightbox Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-200 select-none"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {/* Lightbox Top Header */}
          <div className="h-14 px-6 border-b border-white/10 bg-neutral-950/80 flex items-center justify-between z-10 flex-shrink-0">
            <div className="flex items-center space-x-3">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-white">素材原画高分辨率预览</span>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {Math.round(zoomScale * 100)}% 缩放
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {/* Zoom Controls */}
              <button
                onClick={() => setZoomScale((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition cursor-pointer"
                title="缩小 (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-xs text-gray-300 hover:text-white font-mono transition cursor-pointer"
                title="重置为适应屏幕 (0)"
              >
                100%
              </button>
              <button
                onClick={() => setZoomScale((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))))}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition cursor-pointer"
                title="放大 (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setZoomScale(2);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition cursor-pointer"
                title="200% 细节特写"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              <div className="h-4 w-px bg-white/10 mx-1" />

              <button
                onClick={() => handleCopyUrl(lightboxUrl)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white transition cursor-pointer"
              >
                {copiedUrl === lightboxUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制链接</span>
                  </>
                )}
              </button>

              <a
                href={lightboxUrl}
                download={`crosspilot-${Date.now()}.png`}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下载原图</span>
              </a>

              <a
                href={lightboxUrl}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition cursor-pointer"
                title="新标签页打开"
              >
                <ExternalLink className="w-4 h-4" />
              </a>

              <div className="h-4 w-px bg-white/10 mx-1" />

              <button
                onClick={closeLightbox}
                className="p-2 rounded-lg bg-white/10 hover:bg-rose-500/80 text-gray-300 hover:text-white transition cursor-pointer"
                title="关闭 (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Canvas Image Container */}
          <div
            className={`flex-1 relative overflow-hidden flex items-center justify-center ${
              zoomScale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
            }`}
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
            onDoubleClick={() => {
              if (zoomScale > 1) {
                setZoomScale(1);
                setPanOffset({ x: 0, y: 0 });
              } else {
                setZoomScale(2);
              }
            }}
          >
            <img
              src={lightboxUrl}
              alt="原画放大预览"
              draggable={false}
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                maxWidth: '90vw',
                maxHeight: '82vh',
              }}
              className="object-contain shadow-2xl rounded"
            />
          </div>

          {/* Lightbox Footer Bar */}
          <div className="h-10 px-6 border-t border-white/10 bg-neutral-950/80 flex items-center justify-between text-[11px] text-gray-400 z-10 flex-shrink-0">
            <div className="flex items-center space-x-3">
              <span>滚轮缩放：<strong className="text-white">向上放大 / 向下缩小</strong></span>
              <span>·</span>
              <span>按住鼠标左键：<strong className="text-white">自由平移查看局部细节</strong></span>
              <span>·</span>
              <span>双击：<strong className="text-white">切换 100% / 200%</strong></span>
            </div>
            <div className="flex items-center space-x-2 text-gray-500">
              <span>按 ESC 键即可退出预览</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
