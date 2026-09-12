import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCodes,
  type PlannedActionRecord,
  type ActionExecutionRecord,
  type CommerceActionType,
} from '@crosspilot/shared';
import {
  ActionLayerError,
  createDefaultMockRegistry,
  executeMockAction,
  planFromRecommendation,
} from '@crosspilot/domain';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { AdvertisingService } from '../advertising/advertising.service.js';

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

@Injectable()
export class ActionLayerService {
  private readonly registry = createDefaultMockRegistry();

  constructor(
    private readonly prisma: PrismaService,
    private readonly intel: IntelligenceService,
    private readonly advertising: AdvertisingService,
  ) {}

  list(workspaceId: string, recommendationId?: string) {
    return this.wrap(async () => {
      const rows = await this.prisma.plannedAction.findMany({
        where: { workspaceId, ...(recommendationId ? { recommendationId } : {}) },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((row) => this.toAction(row));
    });
  }

  get(workspaceId: string, id: string) {
    return this.wrap(async () => this.toAction(await this.requireAction(workspaceId, id)));
  }

  history(workspaceId: string, id: string) {
    return this.wrap(async () => {
      await this.requireAction(workspaceId, id);
      const rows = await this.prisma.actionExecution.findMany({
        where: { workspaceId, actionId: id },
        orderBy: { timestamp: 'asc' },
      });
      return rows.map((row) => this.toExecution(row));
    });
  }

  plan(workspaceId: string, recommendationId: string, userId?: string) {
    return this.wrap(async () => {
      const rec = await this.prisma.businessRecommendation.findFirst({
        where: { id: recommendationId, workspaceId },
      });
      if (!rec) {
        throw new ActionLayerError(ErrorCodes.RECOMMENDATION_NOT_FOUND, recommendationId);
      }
      const existing = await this.prisma.plannedAction.findFirst({
        where: {
          workspaceId,
          recommendationId,
          status: { in: ['CREATED', 'WAITING_APPROVAL', 'APPROVED', 'EXECUTING'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return this.toAction(existing);

      const hints = await this.targetHints(workspaceId);
      const draft = planFromRecommendation(rec.decision, rec.reason, hints);
      return this.insert(workspaceId, rec.id, draft, userId);
    });
  }

  planAcos(workspaceId: string, userId?: string, input?: { campaignId?: string; keyword?: string }) {
    return this.wrap(async () => {
      const campaigns = await this.advertising.getCampaigns(workspaceId);
      const campaign =
        (input?.campaignId ? campaigns.find((item) => item.id === input.campaignId) : campaigns[0]) ||
        campaigns[0];
      if (!campaign?.id) {
        throw new ActionLayerError(ErrorCodes.ACTION_TARGET_REQUIRED, 'No advertising campaign in workspace');
      }
      const fact = await this.intel.createFact(workspaceId, {
        factType: 'ADS',
        metric: 'acos',
        valueJson: { value: campaign.metrics30d?.acos ?? 0.45 },
        sourceProvider: 'action-layer',
        sourceReference: campaign.id,
      });
      const evidence = await this.intel.createEvidence(workspaceId, {
        factId: fact.id,
        sourceType: 'ADS',
        sourceId: campaign.id,
        quote: `广告活动 ${campaign.name} ACOS ${(campaign.metrics30d?.acos ?? 0).toFixed(2)}；建议关键词竞价下调 20%`,
        confidence: 0.8,
      });
      const rec = await this.intel.createRecommendation(workspaceId, {
        decision: 'DECREASE_KEYWORD_BID',
        reason: 'ACOS 上升；建议关键词竞价下调 20%',
        confidence: 0.8,
        evidenceIds: [evidence.id],
      });
      const draft = planFromRecommendation(rec.decision, rec.reason, {
        campaignId: campaign.id,
        keyword: input?.keyword || 'broad',
      });
      return this.insert(workspaceId, rec.id, draft, userId);
    });
  }

  approve(workspaceId: string, id: string, userId?: string) {
    return this.wrap(async () => {
      const row = await this.requireAction(workspaceId, id);
      if (row.status !== 'WAITING_APPROVAL') {
        throw new ActionLayerError(
          ErrorCodes.ACTION_INVALID_STATE,
          `Action ${id} is ${row.status}; only WAITING_APPROVAL can be approved`,
        );
      }
      const updated = await this.prisma.plannedAction.update({
        where: { id },
        data: { status: 'APPROVED', lastMessage: '已由 owner 批准（仍需 Mock Executor 执行）' },
      });
      await this.appendHistory(workspaceId, id, userId || 'owner', 'approved', { status: 'APPROVED' }, 1);
      return this.toAction(updated);
    });
  }

  reject(workspaceId: string, id: string, userId?: string) {
    return this.wrap(async () => {
      const row = await this.requireAction(workspaceId, id);
      if (row.status !== 'WAITING_APPROVAL' && row.status !== 'CREATED') {
        throw new ActionLayerError(
          ErrorCodes.ACTION_INVALID_STATE,
          `Action ${id} cannot be rejected from ${row.status}`,
        );
      }
      const updated = await this.prisma.plannedAction.update({
        where: { id },
        data: { status: 'FAILED', lastMessage: '已被 owner 拒绝；未调用 Mock Executor' },
      });
      await this.appendHistory(workspaceId, id, userId || 'owner', 'rejected', { status: 'FAILED' }, 1);
      return this.toAction(updated);
    });
  }

  execute(workspaceId: string, id: string, userId?: string) {
    return this.wrap(async () => {
      const row = await this.requireAction(workspaceId, id);
      if (row.status !== 'APPROVED') {
        throw new ActionLayerError(
          ErrorCodes.ACTION_INVALID_STATE,
          `Action ${id} is ${row.status}; only APPROVED actions can execute`,
        );
      }
      await this.prisma.plannedAction.update({
        where: { id },
        data: { status: 'EXECUTING', lastMessage: 'Mock Executor 已启动' },
      });
      await this.appendHistory(workspaceId, id, userId || 'owner', 'execution_started', asObject(row.parameters), 1);

      const outcome = await executeMockAction(this.registry, {
        actionType: row.actionType as CommerceActionType,
        target: asObject(row.target),
        parameters: asObject(row.parameters),
      });

      for (const attempt of outcome.attempts) {
        await this.appendHistory(
          workspaceId,
          id,
          userId || 'owner',
          attempt.result.success ? 'SUCCESS' : attempt.result.retryable ? 'RETRY' : 'FAILED',
          {
            success: attempt.result.success,
            message: attempt.result.message,
          },
          attempt.attempt,
          attempt.result.success ? undefined : attempt.result.message,
        );
      }

      const updated = await this.prisma.plannedAction.update({
        where: { id },
        data: {
          status: outcome.status,
          lastMessage: String(outcome.output.message || outcome.error || outcome.status),
        },
      });
      return this.toAction(updated);
    });
  }

  private async insert(
    workspaceId: string,
    recommendationId: string,
    draft: ReturnType<typeof planFromRecommendation>,
    userId?: string,
  ): Promise<PlannedActionRecord> {
    const status = draft.needApproval ? 'WAITING_APPROVAL' : 'APPROVED';
    const row = await this.prisma.plannedAction.create({
      data: {
        workspaceId,
        recommendationId,
        actionType: draft.actionType,
        target: draft.target as Prisma.InputJsonValue,
        parameters: draft.parameters as Prisma.InputJsonValue,
        riskLevel: draft.riskLevel,
        needApproval: draft.needApproval,
        status,
        lastMessage: draft.summary,
        createdBy: userId,
      },
    });
    await this.appendHistory(
      workspaceId,
      row.id,
      userId || 'system',
      'created',
      { actionType: draft.actionType, status },
      1,
    );
    return this.toAction(row);
  }

  private async targetHints(workspaceId: string) {
    const campaigns = await this.advertising.getCampaigns(workspaceId);
    return {
      campaignId: campaigns[0]?.id,
      keyword: 'broad',
      skuCode: undefined as string | undefined,
    };
  }

  private async requireAction(workspaceId: string, id: string) {
    const row = await this.prisma.plannedAction.findFirst({ where: { id, workspaceId } });
    if (!row) {
      throw new ActionLayerError(ErrorCodes.ACTION_NOT_FOUND, id);
    }
    return row;
  }

  private async appendHistory(
    workspaceId: string,
    actionId: string,
    operator: string,
    status: string,
    input: Record<string, unknown>,
    attempt: number,
    error?: string,
  ) {
    await this.prisma.actionExecution.create({
      data: {
        workspaceId,
        actionId,
        operator,
        status,
        input: input as Prisma.InputJsonValue,
        output: input as Prisma.InputJsonValue,
        attempt,
        error,
      },
    });
  }

  private toAction(row: {
    id: string;
    workspaceId: string;
    recommendationId: string | null;
    actionType: string;
    target: Prisma.JsonValue;
    parameters: Prisma.JsonValue;
    riskLevel: string;
    needApproval: boolean;
    status: string;
    lastMessage: string | null;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PlannedActionRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      recommendationId: row.recommendationId ?? undefined,
      actionType: row.actionType as CommerceActionType,
      target: asObject(row.target),
      parameters: asObject(row.parameters),
      riskLevel: row.riskLevel as PlannedActionRecord['riskLevel'],
      needApproval: row.needApproval,
      status: row.status as PlannedActionRecord['status'],
      lastMessage: row.lastMessage ?? undefined,
      createdBy: row.createdBy ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toExecution(row: {
    id: string;
    actionId: string;
    operator: string;
    timestamp: Date;
    input: Prisma.JsonValue;
    output: Prisma.JsonValue | null;
    status: string;
    error: string | null;
    attempt: number;
  }): ActionExecutionRecord {
    return {
      id: row.id,
      actionId: row.actionId,
      operator: row.operator,
      timestamp: row.timestamp.toISOString(),
      input: asObject(row.input),
      output: row.output ? asObject(row.output) : undefined,
      status: row.status,
      error: row.error ?? undefined,
      attempt: row.attempt,
    };
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ActionLayerError) {
        if (err.code === ErrorCodes.ACTION_NOT_FOUND || err.code === ErrorCodes.RECOMMENDATION_NOT_FOUND) {
          throw new NotFoundException({ code: err.code, message: err.message });
        }
        if (err.code === ErrorCodes.ACTION_INVALID_STATE) {
          throw new ConflictException({ code: err.code, message: err.message });
        }
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }
}
