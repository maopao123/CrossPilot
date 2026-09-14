'use client';

import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../../lib/api-client';
import { STATUS_LABELS, getStatusLabel } from '../../../constants/ui-labels';
import {
  Play,
  FastForward,
  Pause,
  AlertTriangle,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  Activity,
  Info,
} from 'lucide-react';

interface SimulationRunDetail {
  id: string;
  controlWorkspaceId: string;
  runWorkspaceId: string;
  storeId: string;
  modelVersion: string;
  status: string;
  completedThrough: string | null;
  stateVersion: number;
  seed: number;
  configHash: string;
}

interface ExecutionReceipt {
  id: string;
  actionId: string;
  operationKind: 'APPLY' | 'ROLLBACK';
  appliedDate: string;
  targetVersion: number;
  status: 'APPLIED' | 'NOT_APPLIED' | 'UNKNOWN' | 'FAILED';
  beforeState: any;
  afterState: any;
}

interface OutcomeRecord {
  id: string;
  actionType: string;
  executionStatus: 'SUCCESS' | 'FAILED';
  businessOutcome: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'INCONCLUSIVE' | 'UNKNOWN';
  metricName: string;
  baselineValue: number;
  actualValue: number;
  changePct: number | null;
  confidence: string;
}

export default function SimulatorControlPage() {
  const [runs, setRuns] = useState<SimulationRunDetail[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [selectedRun, setSelectedRun] = useState<SimulationRunDetail | null>(null);
  const [advanceDays, setAdvanceDays] = useState<number>(7);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Execution receipts & outcomes for active run inspection (fetched from real API)
  const [receipts, setReceipts] = useState<ExecutionReceipt[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeRecord[]>([]);

  // Inject Event Form State
  const [showEventModal, setShowEventModal] = useState<boolean>(false);
  const [eventDate, setEventDate] = useState<string>('2026-09-20');
  const [eventCode, setEventCode] = useState<string>('CPC_SURGE');
  const [cpcMultiplier, setCpcMultiplier] = useState<number>(1.5);
  const [shipmentDelayDays, setShipmentDelayDays] = useState<number>(5);

  const fetchRunsList = async () => {
    try {
      const list = await ApiClient.get<SimulationRunDetail[]>('/api/v1/simulator/runs');
      setRuns(list || []);
      if (list && list.length > 0 && !selectedRunId) {
        setSelectedRunId(list[0].id);
        await fetchRunDetails(list[0].id);
      }
    } catch (err: any) {
      console.error('Could not list runs from API:', err?.message);
    }
  };

  const fetchRunDetails = async (runId: string) => {
    if (!runId) {
      setSelectedRun(null);
      setReceipts([]);
      setOutcomes([]);
      return;
    }
    try {
      setLoading(true);
      const res = await ApiClient.get<SimulationRunDetail & { receipts?: ExecutionReceipt[]; outcomes?: OutcomeRecord[] }>(
        `/api/v1/simulator/runs/${runId}`,
      );
      setSelectedRun(res);
      setReceipts(res.receipts || []);
      setOutcomes(res.outcomes || []);
      setActionMessage(null);
    } catch (err: any) {
      setSelectedRun(null);
      setReceipts([]);
      setOutcomes([]);
      setActionMessage({
        type: 'error',
        text: `获取 Run [${runId}] 失败: ${err?.message || '未知错误 (404/500)'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRunsList();
  }, []);

  const handleTick = async () => {
    if (!selectedRun) return;
    try {
      setLoading(true);
      setActionMessage({ type: 'info', text: '正在推进 1 个模拟日 (Tick)...' });
      await ApiClient.post(`/api/v1/simulator/runs/${selectedRun.id}/tick`, {});
      setActionMessage({ type: 'success', text: `Tick 推进成功！已推进到下一日。` });
      await fetchRunDetails(selectedRun.id);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Tick 失败: ${err?.message || '未知错误'}` });
    } finally {
      setLoading(false);
    }
  };

  const handleAdvance = async () => {
    if (!selectedRun) return;
    try {
      setLoading(true);
      setActionMessage({ type: 'info', text: `正在提交多日连续推进任务 (${advanceDays} 天)...` });
      const res = await ApiClient.post<{ jobId: string }>(`/api/v1/simulator/runs/${selectedRun.id}/advance`, {
        days: advanceDays,
      });
      setActionMessage({ type: 'success', text: `多日推进任务已排队 (Job ID: ${res?.jobId || 'submitted'})` });
      await fetchRunDetails(selectedRun.id);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `推进多日失败: ${err?.message || '未知错误'}` });
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    if (!selectedRun) return;
    try {
      setLoading(true);
      setActionMessage({ type: 'info', text: '正在请求暂停模拟运行...' });
      await ApiClient.post(`/api/v1/simulator/runs/${selectedRun.id}/pause`, {});
      setActionMessage({ type: 'success', text: '已暂停模拟运行！' });
      setSelectedRun((prev) => (prev ? { ...prev, status: 'PAUSED' } : null));
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `暂停失败: ${err?.message || '未知错误'}` });
    } finally {
      setLoading(false);
    }
  };

  const handleInjectEvents = async () => {
    if (!selectedRun) return;
    try {
      setLoading(true);
      const payloadEvents = [
        eventCode === 'CPC_SURGE'
          ? { code: 'CPC_SURGE', date: eventDate, cpcMultiplier }
          : { code: 'SEASONAL_DEMAND_SPIKE', date: eventDate, demandMultiplier: 2.0, shipmentDelayDays },
      ];
      await ApiClient.post(`/api/v1/simulator/runs/${selectedRun.id}/events`, {
        events: payloadEvents,
      });
      setShowEventModal(false);
      setActionMessage({ type: 'success', text: `扰动事件 [${eventCode}] 已注入到未来日期 ${eventDate}！` });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `事件注入失败: ${err?.message || '未知错误'}` });
    } finally {
      setLoading(false);
    }
  };

  const renderBadge = (status: string) => {
    const label = getStatusLabel(status);
    let colorClasses = 'bg-gray-100 text-gray-700 border-gray-200';

    switch (status) {
      case 'APPLIED':
      case 'POSITIVE':
      case 'SUCCESS':
      case 'RUNNING':
        colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        break;
      case 'NOT_APPLIED':
      case 'NEUTRAL':
        colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
        break;
      case 'PAUSED_BUDGET':
      case 'PAUSED':
        colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
        break;
      case 'INCONCLUSIVE':
      case 'UNKNOWN':
        colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
        break;
      case 'FAILED':
      case 'NEGATIVE':
        colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
        break;
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClasses}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" />
            Simulator 闭环控制台 (Closed-Loop Control)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            实时观察并干预 Commerce Simulator 运行状态、每日时钟推进、执行回执与成熟度评估
          </p>
        </div>
        <div className="flex items-center gap-3">
          {runs.length > 0 && (
            <select
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white text-gray-800 focus:ring-indigo-500 focus:border-indigo-500"
              value={selectedRunId}
              onChange={(e) => {
                setSelectedRunId(e.target.value);
                fetchRunDetails(e.target.value);
              }}
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id.slice(0, 16)}... ({r.modelVersion} | {r.status})
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-64 focus:ring-indigo-500 focus:border-indigo-500"
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
            placeholder="输入 Run ID"
          />
          <button
            onClick={() => fetchRunDetails(selectedRunId)}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition"
          >
            刷新状态
          </button>
        </div>
      </div>

      {/* Action Notification Message */}
      {actionMessage && (
        <div
          className={`p-4 rounded-md border flex items-center gap-3 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : actionMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {actionMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
          {actionMessage.type === 'error' && <XCircle className="w-5 h-5 flex-shrink-0" />}
          {actionMessage.type === 'info' && <Info className="w-5 h-5 flex-shrink-0" />}
          <span className="text-sm">{actionMessage.text}</span>
        </div>
      )}

      {/* Run Summary Cards */}
      {selectedRun && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xs text-gray-500 font-medium">运行状态 (Status)</div>
            <div className="mt-2 flex items-center gap-2">
              {renderBadge(selectedRun.status)}
              <span className="text-xs text-gray-400 font-mono">v{selectedRun.stateVersion}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xs text-gray-500 font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              已完成模拟水位 (Completed Through)
            </div>
            <div className="mt-2 text-lg font-bold text-gray-900 font-mono">
              {selectedRun.completedThrough || '尚未开始 (Day 0)'}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xs text-gray-500 font-medium">模型版本与种子 (Model & Seed)</div>
            <div className="mt-2 text-sm font-medium text-gray-800">
              {selectedRun.modelVersion} <span className="text-gray-400">| Seed: {selectedRun.seed}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="text-xs text-gray-500 font-medium">隔离租户 (Run Workspace)</div>
            <div className="mt-2 text-xs font-mono text-gray-600 truncate" title={selectedRun.runWorkspaceId}>
              {selectedRun.runWorkspaceId}
            </div>
          </div>
        </div>
      )}

      {!selectedRun && !loading && (
        <div className="bg-white p-8 rounded-lg border border-gray-200 shadow-sm text-center">
          <Info className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-gray-700">暂无选中的 Simulation Run</h3>
          <p className="text-xs text-gray-500 mt-1">
            请从上方下拉框选择或输入有效的 Run ID 并点击“刷新状态”。若 API 返回 404/500，将在上方显示真实错误。
          </p>
        </div>
      )}

      {/* Control Panel / Actions */}
      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          运行控制 (Run Controls)
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleTick}
            disabled={!selectedRun || loading || selectedRun?.status === 'PAUSED'}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-md shadow-sm transition"
          >
            <Play className="w-4 h-4" />
            单步推进 1 天 (Tick)
          </button>

          <div className="flex items-center gap-1 border border-gray-300 rounded-md p-0.5 bg-gray-50">
            <input
              type="number"
              min={1}
              max={90}
              value={advanceDays}
              onChange={(e) => setAdvanceDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
              className="w-16 px-2 py-1.5 text-sm bg-white border border-gray-200 rounded text-center focus:outline-none"
            />
            <button
              onClick={handleAdvance}
              disabled={!selectedRun || loading || selectedRun?.status === 'PAUSED'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-800 text-sm font-medium rounded transition"
            >
              <FastForward className="w-4 h-4 text-indigo-600" />
              推进多天 (Advance)
            </button>
          </div>

          <button
            onClick={handlePause}
            disabled={!selectedRun || loading || selectedRun?.status === 'PAUSED'}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium rounded-md shadow-sm transition"
          >
            <Pause className="w-4 h-4" />
            暂停模拟 (Pause)
          </button>

          <button
            onClick={() => setShowEventModal(true)}
            disabled={!selectedRun || loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-medium rounded-md shadow-sm transition"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            注入外部扰动事件 (Inject Events)
          </button>
        </div>
      </div>

      {/* Execution Receipts vs Business Outcomes Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Execution Receipts */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <Coins className="w-4 h-4 text-gray-500" />
              底层动作执行回执 (Execution Receipts)
            </h3>
            <span className="text-xs text-gray-400">按天与版本记录</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100/75 text-gray-600 uppercase border-b border-gray-200">
                <tr>
                  <th className="p-3">动作 ID</th>
                  <th className="p-3">类型</th>
                  <th className="p-3">生效日期</th>
                  <th className="p-3">版本</th>
                  <th className="p-3">执行状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-mono">
                {receipts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-400 font-sans">
                      暂无执行回执记录
                    </td>
                  </tr>
                ) : (
                  receipts.map((rcpt) => (
                    <tr key={rcpt.id} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-800">{rcpt.actionId}</td>
                      <td className="p-3 text-gray-600">{rcpt.operationKind}</td>
                      <td className="p-3 text-gray-600">{rcpt.appliedDate}</td>
                      <td className="p-3 text-gray-500">v{rcpt.targetVersion}</td>
                      <td className="p-3 font-sans">{renderBadge(rcpt.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel 2: Outcome Evaluation */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              业务效果评估 (Business Outcome Tracking)
            </h3>
            <span className="text-xs text-amber-600 font-medium">⚠️ 区分底层执行成功与业务正向</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100/75 text-gray-600 uppercase border-b border-gray-200">
                <tr>
                  <th className="p-3">观测指标</th>
                  <th className="p-3">基线 vs 实际</th>
                  <th className="p-3">变动率</th>
                  <th className="p-3">执行结果</th>
                  <th className="p-3">业务结论</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {outcomes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-400 font-sans">
                      暂无效果评估记录
                    </td>
                  </tr>
                ) : (
                  outcomes.map((out) => (
                    <tr key={out.id} className="hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-900">{out.metricName}</td>
                      <td className="p-3 font-mono text-gray-600">
                        {out.baselineValue} &rarr; {out.actualValue}
                      </td>
                      <td
                        className={`p-3 font-mono font-medium ${
                          out.changePct && out.changePct < 0 ? 'text-emerald-600' : 'text-gray-700'
                        }`}
                      >
                        {out.changePct !== null ? `${(out.changePct * 100).toFixed(1)}%` : '-'}
                      </td>
                      <td className="p-3">{renderBadge(out.executionStatus)}</td>
                      <td className="p-3">{renderBadge(out.businessOutcome)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-800 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              <strong>契约准则：</strong> 执行成功 (<code>SUCCESS</code>/<code>APPLIED</code>) 仅代表 API
              已落地；业务成效 (<code>POSITIVE</code> / <code>INCONCLUSIVE</code>) 取决于观察窗结束后指标对比。
            </span>
          </div>
        </div>
      </div>

      {/* Inject Events Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                注入外部扰动事件 (Inject External Events)
              </h3>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-700">注入日期 (Target Date)</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                />
                <p className="text-xs text-gray-400 mt-0.5">只能注入大于已完成模拟水位 ({selectedRun?.completedThrough}) 的未来日期</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">扰动类型 (Event Code)</label>
                <select
                  value={eventCode}
                  onChange={(e) => setEventCode(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                >
                  <option value="CPC_SURGE">CPC_SURGE (行业竞价飙升)</option>
                  <option value="SEASONAL_DEMAND_SPIKE">SEASONAL_DEMAND_SPIKE (需求脉冲与供应链延期)</option>
                </select>
              </div>

              {eventCode === 'CPC_SURGE' ? (
                <div>
                  <label className="block text-xs font-medium text-gray-700">CPC 乘数 (CPC Multiplier)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={1.0}
                    max={5.0}
                    value={cpcMultiplier}
                    onChange={(e) => setCpcMultiplier(parseFloat(e.target.value) || 1.0)}
                    className="mt-1 w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-700">在途补货延迟天数 (Shipment Delay Days)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={shipmentDelayDays}
                    onChange={(e) => setShipmentDelayDays(parseInt(e.target.value) || 1)}
                    className="mt-1 w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t">
              <button
                onClick={() => setShowEventModal(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                取消
              </button>
              <button
                onClick={handleInjectEvents}
                disabled={loading}
                className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium shadow-sm"
              >
                确认注入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
