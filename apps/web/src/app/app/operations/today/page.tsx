'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { OperationsTodayDto } from '@crosspilot/shared';
import { ApiClient } from '@/lib/api-client';
import { DailyDiagnosisApiClient, DailyDiagnosisApiError } from '@/lib/daily-diagnosis.api';
import { PageHeader, StatusPill } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { InlineError, PageLoading } from '@/components/ui/skeleton';
import { useBusinessContext } from '@/components/business-context-provider';
import { HealthStrip } from './cockpit/health-strip';
import { InsightStack } from './cockpit/insight-stack';
import { RecommendationCenter } from './cockpit/recommendation-center';
import { VocPanel } from './cockpit/voc-panel';
import { RecentDecisions } from './cockpit/recent-decisions';

export default function OperationsTodayPage() {
  const { skuId } = useBusinessContext();
  const [data, setData] = useState<OperationsTodayDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isViewer, setIsViewer] = useState(false);
  const [busyRecId, setBusyRecId] = useState<string | null>(null);
  const [vocBusy, setVocBusy] = useState(false);
  const [diagBusy, setDiagBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  useEffect(() => {
    setIsViewer(ApiClient.isViewer());
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const payload = await ApiClient.get<OperationsTodayDto>('/api/v1/operations/today');
    setData(payload);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '无法载入今日运营');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const handleApprove = async (id: string) => {
    if (isViewer) return;
    setBusyRecId(id);
    setNotice(null);
    try {
      await ApiClient.post(`/api/v1/recommendations/${id}/approve`);
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : '确认失败');
    } finally {
      setBusyRecId(null);
    }
  };

  const handleVoc = async () => {
    if (isViewer || !data?.voc?.recentReviews.length) return;
    setVocBusy(true);
    setNotice(null);
    try {
      await ApiClient.post('/api/v1/voc/analyze', { reviews: data.voc.recentReviews });
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'VOC 分析失败');
    } finally {
      setVocBusy(false);
    }
  };

  const handleDraftFromVoc = async () => {
    if (isViewer || !data?.voc?.recentReviews.length) return;
    setDraftBusy(true);
    setNotice(null);
    try {
      const voc = await ApiClient.post<{
        factId: string;
        painPoints: string[];
        outputs: { productImprovement: string; listingImprovement: string };
      }>('/api/v1/voc/analyze', { reviews: data.voc.recentReviews });
      const evidence = await ApiClient.post<{ id: string }>('/api/v1/evidence', {
        factId: voc.factId,
        sourceType: 'VOC',
        sourceId: voc.factId,
        quote: voc.outputs?.listingImprovement || voc.painPoints?.[0] || 'VOC sample',
        confidence: 0.7,
      });
      await ApiClient.post('/api/v1/recommendations', {
        decision: voc.painPoints?.length ? 'IMPROVE_LISTING' : 'MONITOR_VOC',
        reason: voc.outputs?.productImprovement || voc.outputs?.listingImprovement || 'Review current VOC',
        confidence: 0.7,
        evidenceIds: [evidence.id],
      });
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : '无法从 VOC 生成建议');
    } finally {
      setDraftBusy(false);
    }
  };

  const handlePlan = async (recommendationId: string) => {
    if (isViewer) return;
    setActionBusyId(recommendationId);
    setNotice(null);
    try {
      await ApiClient.post('/api/v1/actions/plan', { recommendationId });
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : '无法规划 Action');
    } finally {
      setActionBusyId(null);
    }
  };

  const handlePlanAcos = async () => {
    if (isViewer) return;
    setActionBusyId('plan-acos');
    setNotice(null);
    try {
      await ApiClient.post('/api/v1/actions/plan-acos', {});
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : '无法规划 ACOS Action');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleApproveAction = async (actionId: string) => {
    if (isViewer) return;
    setActionBusyId(actionId);
    setNotice(null);
    try {
      await ApiClient.post(`/api/v1/actions/${actionId}/approve`);
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Action 审批失败');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleExecuteAction = async (actionId: string) => {
    if (isViewer) return;
    setActionBusyId(actionId);
    setNotice(null);
    try {
      await ApiClient.post(`/api/v1/actions/${actionId}/execute`);
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Mock 执行失败');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDiagnosis = async () => {
    if (isViewer || diagBusy) return;
    setDiagBusy(true);
    setNotice(null);
    try {
      const started = await DailyDiagnosisApiClient.startDiagnosis({
        marketplaceId: 'AMAZON_US',
        mode: skuId ? 'SKU' : 'WORKSPACE',
        skuId: skuId || undefined,
        dateRange: {
          from: '2026-03-01T00:00:00Z',
          to: '2026-03-14T00:00:00Z',
        },
        baselinePeriod: {
          from: '2026-02-15T00:00:00Z',
          to: '2026-02-28T00:00:00Z',
        },
        options: { waitForCompletion: true, workflowVersion: 'WF05_V1' },
      });
      if (started.taskId) {
        sessionStorage.setItem('crosspilot_active_op_task', started.taskId);
      }
      await load();
    } catch (err: unknown) {
      if (err instanceof DailyDiagnosisApiError) {
        setNotice(err.message);
      } else {
        setNotice(err instanceof Error ? err.message : '诊断启动失败');
      }
    } finally {
      setDiagBusy(false);
    }
  };

  if (loading && !data) {
    return <PageLoading />;
  }

  if (error && !data) {
    return <InlineError message={error} />;
  }

  if (!data) return null;

  const healthTone =
    data.health.inventoryHealth === 'CRITICAL' || data.criticalIssues.some((i) => i.severity === 'CRITICAL')
      ? 'danger'
      : data.criticalIssues.length
        ? 'warning'
        : 'success';

  return (
    <div className="cp-page">
      {notice ? <InlineError message={notice} /> : null}
      <PageHeader
        title="今日运营"
        description={data.headline}
        badge={
          <StatusPill tone={healthTone}>
            {data.sim.simDate ? `Sim ${data.sim.simDate}` : 'Live window'}
          </StatusPill>
        }
        actions={
          isViewer ? (
            <span className="text-[12px] text-fg-muted">只读</span>
          ) : (
            <Button variant="secondary" disabled={diagBusy} onClick={handleDiagnosis}>
              {diagBusy ? 'Diagnosing…' : 'Refresh diagnosis'}
            </Button>
          )
        }
      />

      <p className="max-w-[72ch] text-[14px] leading-relaxed text-fg">
        今天店铺发生了什么，哪些问题要处理，AI 建议是什么，下一步只需确认。确认不会对 Amazon 下发。
      </p>

      <HealthStrip health={data.health} />

      <InsightStack
        title="需要处理"
        kicker="Highest-severity issues first. Open a card to read evidence."
        cards={data.criticalIssues}
        empty="No critical operating issues in the current window."
      />

      <InsightStack
        title="AI 发现"
        kicker="Problem, evidence, impact, then a recommended next step."
        cards={data.insights}
        empty="No diagnosis or simulator events yet. Refresh diagnosis to generate WF-05 insights."
      />

      <RecommendationCenter
        items={data.recommendations}
        isViewer={isViewer}
        busyId={busyRecId}
        onApprove={handleApprove}
        onDraftFromVoc={handleDraftFromVoc}
        canDraft={!isViewer && !data.recommendations.some((item) => item.status === 'WAITING_APPROVAL')}
        draftBusy={draftBusy}
        onPlan={handlePlan}
        onPlanAcos={handlePlanAcos}
        onApproveAction={handleApproveAction}
        onExecuteAction={handleExecuteAction}
        actionBusyId={actionBusyId}
      />

      <VocPanel voc={data.voc} isViewer={isViewer} busy={vocBusy} onAnalyze={handleVoc} />

      <RecentDecisions items={data.recentDecisions} />
    </div>
  );
}
