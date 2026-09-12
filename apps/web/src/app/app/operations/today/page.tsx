'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DailyOperationTaskSummaryDto,
  RecommendedAction,
  BusinessSignal,
  DiagnosisMode,
  WorkflowExecutionStatus,
  DailyOperationWorkflowEvent,
} from '@crosspilot/shared';
import {
  DailyDiagnosisApiClient,
  DailyDiagnosisApiError,
} from '@/lib/daily-diagnosis.api';
import { ApiClient } from '@/lib/api-client';
import {
  OperationsHeader,
  BusinessHealthSummary,
  WorkflowProgressBanner,
  ActionList,
  ActionDetailDrawer,
  ApprovalConfirmationModal,
  OccConflictModal,
  SkuRiskRankingTable,
  EmptyAndHealthyState,
} from './components/index';
import { Sparkles, Bot, ShieldCheck } from 'lucide-react';
import { useBusinessContext } from '@/components/business-context-provider';

export default function OperationsTodayPage() {
  const { marketplaceId: contextMarketplace, skuId: contextSkuId } = useBusinessContext();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [summary, setSummary] = useState<DailyOperationTaskSummaryDto | null>(null);
  const [actions, setActions] = useState<RecommendedAction[]>([]);
  const [signals, setSignals] = useState<BusinessSignal[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastEventMessage, setLastEventMessage] = useState<string>('');
  const [selectedSkuFilter, setSelectedSkuFilter] = useState<string | null>(null);
  const [drawerAction, setDrawerAction] = useState<RecommendedAction | null>(null);
  const [highRiskActionToApprove, setHighRiskActionToApprove] = useState<RecommendedAction | null>(null);
  const [occConflict, setOccConflict] = useState<{
    isOpen: boolean;
    message?: string;
    isActionAlreadyDecided?: boolean;
  }>({ isOpen: false });

  const [marketplaceId, setMarketplaceId] = useState(contextMarketplace || 'AMAZON_US');
  const [inflightActionId, setInflightActionId] = useState<string | null>(null);
  const inflightRef = useRef<string | null>(null);
  const [mode, setMode] = useState<DiagnosisMode>('WORKSPACE');
  const [dateRange] = useState({
    from: '2026-03-01T00:00:00Z',
    to: '2026-03-14T00:00:00Z',
  });
  const [baselinePeriod] = useState({
    from: '2026-02-15T00:00:00Z',
    to: '2026-02-28T00:00:00Z',
  });

  const [isViewer, setIsViewer] = useState(false);
  const disconnectSseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsViewer(ApiClient.isViewer());
      const savedTaskId = sessionStorage.getItem('crosspilot_active_op_task');
      if (savedTaskId) {
        setTaskId(savedTaskId);
      }
    }
  }, []);

  useEffect(() => {
    if (contextMarketplace) {
      setMarketplaceId(contextMarketplace);
    }
  }, [contextMarketplace]);

  // Fetch task details from API
  const refreshTask = useCallback(async (targetTaskId: string) => {
    try {
      const data = await DailyDiagnosisApiClient.getTaskSummary(
        targetTaskId,
        'actions,signals,diagnoses,stepTraces,contexts'
      );
      setSummary(data);
      if (data.actions) {
        setActions(data.actions);
      }
      if (data.signals) {
        setSignals(data.signals);
      }
      if (data.status === 'RUNNING') {
        setIsRunning(true);
      } else {
        setIsRunning(false);
      }
    } catch (err: any) {
      if (err instanceof DailyDiagnosisApiError && err.status === 404) {
        // Task no longer exists
        sessionStorage.removeItem('crosspilot_active_op_task');
        setTaskId(null);
        setSummary(null);
      } else {
        console.error('[OperationsToday] Error refreshing task:', err);
      }
    }
  }, []);

  // Connect SSE Stream
  const setupSse = useCallback(
    (activeTaskId: string) => {
      // Disconnect existing
      if (disconnectSseRef.current) {
        disconnectSseRef.current();
        disconnectSseRef.current = null;
      }

      setIsStreaming(true);

      const closeFn = DailyDiagnosisApiClient.connectEvents(activeTaskId, {
        onSnapshot: (snapshot) => {
          setSummary(snapshot);
          if (snapshot.actions) setActions(snapshot.actions);
          if (snapshot.signals) setSignals(snapshot.signals);
          if (snapshot.status !== 'RUNNING') {
            setIsRunning(false);
          }
        },
        onEvent: (event: DailyOperationWorkflowEvent) => {
          if (event.message) {
            setLastEventMessage(event.message);
          }

          if (
            event.type === 'workflow.checkpoint' ||
            event.type === 'approval.required' ||
            event.type === 'action.approved' ||
            event.type === 'action.rejected' ||
            event.type === 'action.dismissed' ||
            event.type === 'workflow.completed'
          ) {
            refreshTask(activeTaskId);
          }

          if (event.type === 'workflow.completed' || event.type === 'workflow.failed') {
            setIsRunning(false);
            setIsStreaming(false);
            if (disconnectSseRef.current) {
              disconnectSseRef.current();
              disconnectSseRef.current = null;
            }
          }
        },
        onError: () => {
          setIsStreaming(false);
          if (disconnectSseRef.current) {
            disconnectSseRef.current();
            disconnectSseRef.current = null;
          }
          void refreshTask(activeTaskId);
        },
      });

      disconnectSseRef.current = closeFn;
    },
    [refreshTask]
  );

  // Hook SSE to active task
  useEffect(() => {
    if (taskId) {
      refreshTask(taskId);
      setupSse(taskId);
    }
    return () => {
      if (disconnectSseRef.current) {
        disconnectSseRef.current();
      }
    };
  }, [taskId, refreshTask, setupSse]);

  // Handle Run Diagnosis
  const handleRunDiagnosis = async (chosenMode: DiagnosisMode) => {
    if (isRunning || isViewer) return;
    if (chosenMode === 'SKU' && !contextSkuId) {
      alert('请先在顶栏选择 SKU');
      return;
    }

    setIsRunning(true);
    setLastEventMessage('正在初始化日常运营诊断工作流...');

    try {
      const res = await DailyDiagnosisApiClient.startDiagnosis({
        marketplaceId,
        mode: chosenMode,
        skuId: chosenMode === 'SKU' ? contextSkuId || undefined : undefined,
        dateRange,
        baselinePeriod,
        options: {
          waitForCompletion: false,
          workflowVersion: 'WF05_V1',
        },
      });

      setTaskId(res.taskId);
      sessionStorage.setItem('crosspilot_active_op_task', res.taskId);
      setupSse(res.taskId);
    } catch (err: any) {
      setIsRunning(false);
      console.error('[OperationsToday] Error starting diagnosis:', err);
      alert(err.message || '启动工作流诊断失败，请检查服务状态');
    }
  };

  // Decision Handlers
  const openOccConflict = async (actionAlreadyDecided: boolean) => {
    if (taskId) {
      await refreshTask(taskId);
    }
    setOccConflict({
      isOpen: true,
      isActionAlreadyDecided: actionAlreadyDecided,
      message: actionAlreadyDecided
        ? '该行动已被其他操作完成。已刷新为最新状态，请勿重复提交。'
        : '当前任务已被其他操作更新。请刷新最新状态后重新操作。',
    });
  };

  const handleExecuteApproval = async (action: RecommendedAction, note?: string) => {
    if (!taskId || !summary || inflightRef.current) return;
    inflightRef.current = action.actionId;
    setInflightActionId(action.actionId);

    try {
      await DailyDiagnosisApiClient.approveAction(taskId, action.actionId, {
        expectedVersion: summary.checkpointVersion,
        note,
      });

      setActions((prev) =>
        prev.map((a) => (a.actionId === action.actionId ? { ...a, status: 'APPROVED' } : a))
      );

      if (drawerAction && drawerAction.actionId === action.actionId) {
        setDrawerAction((prev) => (prev ? { ...prev, status: 'APPROVED' } : null));
      }

      setHighRiskActionToApprove(null);
      await refreshTask(taskId);
    } catch (err: any) {
      if (err instanceof DailyDiagnosisApiError) {
        if (err.code === 'INVALID_ACTION_STATE') {
          await openOccConflict(true);
        } else if (err.code === 'CHECKPOINT_VERSION_CONFLICT' || err.status === 409) {
          await openOccConflict(false);
        } else {
          alert(err.message);
        }
      } else {
        alert('审批操作失败');
      }
    } finally {
      inflightRef.current = null;
      setInflightActionId(null);
    }
  };

  const handleApproveAction = (action: RecommendedAction, note?: string) => {
    if (action.riskLevel === 'HIGH') {
      setHighRiskActionToApprove(action);
    } else {
      handleExecuteApproval(action, note);
    }
  };

  const handleRejectAction = async (action: RecommendedAction, note?: string) => {
    if (!taskId || !summary || inflightRef.current) return;
    inflightRef.current = action.actionId;
    setInflightActionId(action.actionId);

    try {
      await DailyDiagnosisApiClient.rejectAction(taskId, action.actionId, {
        expectedVersion: summary.checkpointVersion,
        note,
      });

      setActions((prev) =>
        prev.map((a) => (a.actionId === action.actionId ? { ...a, status: 'REJECTED' } : a))
      );

      if (drawerAction && drawerAction.actionId === action.actionId) {
        setDrawerAction((prev) => (prev ? { ...prev, status: 'REJECTED' } : null));
      }

      await refreshTask(taskId);
    } catch (err: any) {
      if (err instanceof DailyDiagnosisApiError && err.status === 409) {
        await openOccConflict(err.code === 'INVALID_ACTION_STATE');
      } else {
        alert(err?.message || '驳回操作失败');
      }
    } finally {
      inflightRef.current = null;
      setInflightActionId(null);
    }
  };

  const handleDismissAction = async (action: RecommendedAction, note?: string) => {
    if (!taskId || !summary || inflightRef.current) return;
    inflightRef.current = action.actionId;
    setInflightActionId(action.actionId);

    try {
      await DailyDiagnosisApiClient.dismissAction(taskId, action.actionId, {
        expectedVersion: summary.checkpointVersion,
        note,
      });

      setActions((prev) =>
        prev.map((a) => (a.actionId === action.actionId ? { ...a, status: 'DISMISSED' } : a))
      );

      if (drawerAction && drawerAction.actionId === action.actionId) {
        setDrawerAction((prev) => (prev ? { ...prev, status: 'DISMISSED' } : null));
      }

      await refreshTask(taskId);
    } catch (err: any) {
      if (err instanceof DailyDiagnosisApiError && err.status === 409) {
        await openOccConflict(err.code === 'INVALID_ACTION_STATE');
      } else {
        alert(err?.message || '忽略操作失败');
      }
    } finally {
      inflightRef.current = null;
      setInflightActionId(null);
    }
  };

  return (
    <div className="space-y-2 max-w-7xl mx-auto pb-12">
      {/* 1. Page Header */}
      <OperationsHeader
        marketplaceId={marketplaceId}
        onMarketplaceChange={setMarketplaceId}
        dateRange={dateRange}
        baselinePeriod={baselinePeriod}
        workflowStatus={summary?.status || null}
        lastUpdated={summary?.updatedAt || summary?.startedAt || null}
        isRunning={isRunning}
        onRunDiagnosis={handleRunDiagnosis}
        mode={mode}
        onModeChange={setMode}
        isViewer={isViewer}
      />

      {/* 2. Real-time Workflow Progress Banner */}
      <WorkflowProgressBanner
        status={summary?.status || (isRunning ? 'RUNNING' : null)}
        currentStep={summary?.currentStep}
        stepTraces={summary?.stepTraces}
        lastEventMessage={lastEventMessage}
        isStreaming={isStreaming}
      />

      {/* 3. Business Health Summary */}
      <BusinessHealthSummary summary={summary} isLoading={isRunning} />

      {/* 4. SKU Risk Ranking Table */}
      {summary && (
        <SkuRiskRankingTable
          summary={summary}
          actions={actions}
          signals={signals}
          selectedSku={selectedSkuFilter}
          onSelectSku={(skuId) => {
            setSelectedSkuFilter(selectedSkuFilter === skuId ? null : skuId);
          }}
        />
      )}

      {/* 5. Today's Action List */}
      {summary && actions.length > 0 ? (
        <ActionList
          actions={actions}
          onSelectAction={(action) => setDrawerAction(action)}
          onApproveAction={handleApproveAction}
          onRejectAction={handleRejectAction}
          onDismissAction={handleDismissAction}
          selectedSkuFilter={selectedSkuFilter}
          onClearSkuFilter={() => setSelectedSkuFilter(null)}
          isViewer={isViewer}
          busyActionId={inflightActionId}
        />
      ) : (
        <EmptyAndHealthyState
          summary={summary}
          onRetry={() => handleRunDiagnosis(mode)}
          isRunning={isRunning}
        />
      )}

      {/* 6. Action Detail Drawer */}
      <ActionDetailDrawer
        action={drawerAction}
        onClose={() => setDrawerAction(null)}
        onApprove={(action, note) => {
          handleApproveAction(action, note);
        }}
        onReject={handleRejectAction}
        onDismiss={handleDismissAction}
        isViewer={isViewer}
        busyActionId={inflightActionId}
      />

      {/* 7. High Risk Approval Confirmation Modal */}
      <ApprovalConfirmationModal
        action={highRiskActionToApprove}
        busy={!!inflightActionId}
        onConfirm={() => {
          if (highRiskActionToApprove) {
            handleExecuteApproval(highRiskActionToApprove);
          }
        }}
        onCancel={() => setHighRiskActionToApprove(null)}
      />

      {/* 8. OCC Version Conflict Modal */}
      <OccConflictModal
        isOpen={occConflict.isOpen}
        message={occConflict.message}
        isActionAlreadyDecided={occConflict.isActionAlreadyDecided}
        onRefresh={() => {
          setOccConflict({ isOpen: false });
          if (taskId) refreshTask(taskId);
        }}
        onClose={() => setOccConflict({ isOpen: false })}
      />
    </div>
  );
}
