import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
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
  computeSha256,
  createDefaultMockRegistry,
  executeMockAction,
  planFromRecommendation,
  evaluateSimulatorPolicy,
} from '@crosspilot/domain';
import {
  resolveCommerceAdapter,
  V2RunStore,
  AutomationOperationStore,
} from '@crosspilot/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { AdvertisingService } from '../advertising/advertising.service.js';
import { OutcomeTrackingService } from '../outcome-tracking/outcome-tracking.service.js';
import { SimulatorERPAdapter } from '@crosspilot/integrations';

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

@Injectable()
export class ActionLayerService {
  private readonly logger = new Logger(ActionLayerService.name);
  private readonly registry = createDefaultMockRegistry();
  private readonly v2Store: V2RunStore;
  private readonly operationStore: AutomationOperationStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly intel: IntelligenceService,
    private readonly advertising: AdvertisingService,
    @Optional() private readonly outcomeTracking?: OutcomeTrackingService,
  ) {
    this.v2Store = new V2RunStore(prisma);
    this.operationStore = new AutomationOperationStore(prisma);
  }

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

      const target = asObject(row.target);
      const parameters = asObject(row.parameters);

      let approvalMetadata: any = undefined;
      if (target.runId || row.actionType === 'CREATE_PURCHASE_ORDER') {
        const cleanParameters = { ...parameters };
        delete (cleanParameters as any)._approval;
        const payloadHash = computeSha256({
          actionType: row.actionType,
          target,
          parameters: cleanParameters,
        });
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        if (target.runId) {
          const expectedTargetVersion = target.expectedTargetVersion ?? parameters.expectedTargetVersion;
          if (expectedTargetVersion === undefined || expectedTargetVersion === null) {
            throw new ActionLayerError(
              ErrorCodes.ACTION_INVALID_STATE,
              `expectedTargetVersion is required to approve closed-loop v2 action ${id}`,
            );
          }
          approvalMetadata = {
            payloadHash,
            expectedTargetVersion: Number(expectedTargetVersion),
            expiresAt,
          };
        } else {
          approvalMetadata = {
            payloadHash,
            expiresAt,
          };
        }
      }

      const updated = await this.prisma.plannedAction.update({
        where: { id },
        data: {
          status: 'APPROVED',
          parameters: (approvalMetadata ? { ...parameters, _approval: approvalMetadata } : parameters) as Prisma.InputJsonValue,
          lastMessage: '已由 owner 批准（仍需 Mock Executor 执行）',
        },
      });
      await this.appendHistory(
        workspaceId,
        id,
        userId || 'owner',
        'approved',
        { status: 'APPROVED', ...(approvalMetadata ? { approval: approvalMetadata } : {}) },
        1,
      );
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
      const target = asObject(row.target);
      const parameters = asObject(row.parameters);

      // Idempotent retry / timeout recovery for closed-loop v2 actions
      if (target.runId && row.status === 'SUCCESS') {
        const cleanParameters = { ...parameters };
        delete (cleanParameters as any)._approval;
        const payloadHash = computeSha256({
          actionType: row.actionType,
          target,
          parameters: cleanParameters,
        });
        const existingReceipt = await this.prisma.simulationExecutionReceipt.findFirst({
          where: {
            runId: String(target.runId),
            actionId: row.id,
            operationKind: 'APPLY',
          },
        });
        if (existingReceipt && existingReceipt.status === 'APPLIED') {
          if (existingReceipt.payloadHash === payloadHash) {
            return this.toAction(row);
          } else {
            throw new ConflictException('IDEMPOTENCY_CONFLICT: same actionId with different payload');
          }
        }
      }

      if (row.status !== 'APPROVED') {
        throw new ActionLayerError(
          ErrorCodes.ACTION_INVALID_STATE,
          `Action ${id} is ${row.status}; only APPROVED actions can execute`,
        );
      }

      // Verify approval metadata if target.runId or CREATE_PURCHASE_ORDER
      if (target.runId || row.actionType === 'CREATE_PURCHASE_ORDER') {
        const approval = (parameters as any)?._approval;
        if (!approval) {
          throw new ActionLayerError(
            ErrorCodes.ACTION_INVALID_STATE,
            `Action ${id} missing approval metadata`,
          );
        }
        if (approval.expiresAt && new Date() > new Date(approval.expiresAt)) {
          throw new ActionLayerError(
            ErrorCodes.ACTION_INVALID_STATE,
            `Approval for action ${id} has expired (expired at ${approval.expiresAt})`,
          );
        }
        const cleanParameters = { ...parameters };
        delete (cleanParameters as any)._approval;
        const currentPayloadHash = computeSha256({
          actionType: row.actionType,
          target,
          parameters: cleanParameters,
        });
        if (approval.payloadHash && approval.payloadHash !== currentPayloadHash) {
          throw new ConflictException(`PAYLOAD_HASH_MISMATCH: action parameters changed after approval`);
        }
        if (target.runId) {
          const expectedTargetVersion =
            target.expectedTargetVersion ??
            cleanParameters.expectedTargetVersion ??
            approval.expectedTargetVersion;
          if (expectedTargetVersion === undefined || expectedTargetVersion === null) {
            throw new ActionLayerError(
              ErrorCodes.ACTION_INVALID_STATE,
              `expectedTargetVersion is required for closed-loop v2 action ${id}`,
            );
          }
        }
      }

      // Branch: Closed-loop v2 Simulator action execution
      if (target.runId) {
        return await this.executeV2SimulatorAction(workspaceId, row, target, parameters, userId);
      }

      // Branch: CREATE_PURCHASE_ORDER automation execution
      if (row.actionType === 'CREATE_PURCHASE_ORDER') {
        return await this.executeCreatePurchaseOrderAction(workspaceId, row, target, parameters, userId);
      }

      await this.prisma.plannedAction.update({
        where: { id },
        data: { status: 'EXECUTING', lastMessage: 'Mock Executor 已启动' },
      });
      await this.appendHistory(workspaceId, id, userId || 'owner', 'execution_started', parameters, 1);

      const outcome = await executeMockAction(this.registry, {
        actionType: row.actionType as CommerceActionType,
        target,
        parameters,
      });

      let successExecution: { timestamp?: Date } | null = null;
      for (const attempt of outcome.attempts) {
        const record = await this.appendHistory(
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
        if (attempt.result.success) successExecution = record;
      }

      const updated = await this.prisma.plannedAction.update({
        where: { id },
        data: {
          status: outcome.status,
          lastMessage: String(outcome.output.message || outcome.error || outcome.status),
        },
      });

      // V10 Epic A：执行成功即创建 7/14/30 天观察窗 ActionOutcome（T0 = 执行时刻所在日）。
      // 创建失败只打日志，绝不影响 execute 主流程。
      if (outcome.status === 'SUCCESS') {
        await this.outcomeTracking?.createForExecution(
          workspaceId,
          { id: row.id, target: asObject(row.target) },
          successExecution?.timestamp ?? new Date(),
        );
      }

      return this.toAction(updated);
    });
  }

  private async executeCreatePurchaseOrderAction(
    workspaceId: string,
    row: any,
    target: Record<string, unknown>,
    parameters: Record<string, unknown>,
    userId?: string,
  ) {
    const connectionId = String(target.connectionId || 'default-erp');
    const idempotencyKey = String(target.idempotencyKey || row.id);
    const cleanParameters = { ...parameters };
    delete (cleanParameters as any)._approval;
    const payloadHash = computeSha256({
      actionType: row.actionType,
      target,
      parameters: cleanParameters,
    });
    const approvedPayloadHash = (parameters as any)?._approval?.payloadHash;

    const opResult = await this.operationStore.createOrReplay(
      { workspaceId, connectionId },
      {
        actionId: row.id,
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey,
        payloadHash,
        approvedPayloadHash,
        mode: String(target.mode || 'SIMULATOR'),
        provider: String(target.provider || 'simulator-erp'),
      },
    );

    if (opResult.kind === 'REPLAYED') {
      const existing = opResult.operation;
      if (existing.phase === 'COMPLETED' && existing.effect === 'APPLIED') {
        const evidence = (existing.evidence as any) || {
          mode: existing.mode,
          provider: existing.provider,
          operationId: existing.id,
          phase: existing.phase,
          effect: existing.effect,
          recovery: existing.recovery,
          externalId: existing.externalId,
        };
        const updated = await this.prisma.plannedAction.update({
          where: { id: row.id },
          data: {
            status: 'SUCCESS',
            lastMessage: `ERP 采购单已通过幂等重放确认: ${existing.externalId}`,
            parameters: {
              ...parameters,
              _evidence: evidence,
            },
          },
        });
        return this.toAction(updated);
      }
    }

    const claimedOp = await this.operationStore.claim(
      workspaceId,
      opResult.operation.id,
      opResult.operation.version,
      userId || 'owner',
      30000,
      'SUBMITTED',
    );

    const isSync = Boolean(target.syncExecution || target.erpBaseUrl);
    if (!isSync) {
      const updated = await this.prisma.plannedAction.update({
        where: { id: row.id },
        data: { status: 'EXECUTING', lastMessage: 'ERP 采购单创建操作已落库并认领' },
      });
      await this.appendHistory(
        workspaceId,
        row.id,
        userId || 'owner',
        'execution_started',
        {
          operationId: claimedOp.id,
          version: claimedOp.version,
          leaseOwner: claimedOp.leaseOwner,
        },
        1,
      );
      return this.toAction(updated);
    }

    // Synchronous execution against ERP endpoint
    const mode = String(target.mode || 'SIMULATOR');
    const erpBaseUrl = String(target.erpBaseUrl || process.env.SIMULATOR_ERP_URL || '');
    const adapter = new SimulatorERPAdapter({ baseUrl: erpBaseUrl || undefined });

    const erpRes = await adapter.createPurchaseOrder({
      scope: { workspaceId, connectionId },
      operationId: claimedOp.id,
      idempotencyKey,
      supplierId: String(parameters.supplierId),
      lines: (parameters.lines as any) || [],
      notes: String(parameters.notes || ''),
    });

    if (!erpRes.success) {
      const isTimeout = erpRes.errorCode === 'TIMEOUT' || erpRes.errorCode === 'UNKNOWN_ERROR';
      const isRateLimited = erpRes.errorCode === 'RATE_LIMITED';
      const isAuthFailed = erpRes.errorCode === 'AUTH_FAILED';

      const phase = isTimeout ? 'SUBMITTED' : 'FAILED';
      const effect = isTimeout ? 'UNKNOWN' : 'NOT_APPLIED';
      const recovery = isTimeout ? 'QUERY' : isRateLimited ? 'RETRY' : isAuthFailed ? 'REAUTHORIZE' : 'MANUAL';

      const evidenceData: any = {
        mode: mode as any,
        provider: String(target.provider || 'simulator-erp'),
        operationId: claimedOp.id,
        phase,
        effect,
        recovery,
        errorCode: erpRes.errorCode || 'UNKNOWN_ERROR',
      };

      await this.operationStore.recordEvidence(
        workspaceId,
        claimedOp.id,
        claimedOp.version,
        evidenceData,
      );

      const actionStatus = isTimeout ? 'EXECUTING' : 'FAILED';
      const actionMessage = isTimeout
        ? `ERP 采购单提交超时，远端状态未知，已置入 QUERY 恢复队列等待 Worker 自愈`
        : `ERP 采购单创建失败: ${erpRes.errorMessage || erpRes.errorCode}`;

      const failedAction = await this.prisma.plannedAction.update({
        where: { id: row.id },
        data: {
          status: actionStatus,
          lastMessage: actionMessage,
          parameters: {
            ...parameters,
            _evidence: evidenceData,
          },
        },
      });

      await this.appendHistory(
        workspaceId,
        row.id,
        userId || 'owner',
        actionStatus,
        { error: erpRes.errorMessage, errorCode: erpRes.errorCode, evidence: evidenceData },
        1,
        erpRes.errorMessage || actionMessage,
      );

      return this.toAction(failedAction);
    }

    // Success path
    const externalId = erpRes.data!.externalId;
    const evidenceData: any = {
      mode: mode as any,
      provider: String(target.provider || 'simulator-erp'),
      operationId: claimedOp.id,
      phase: 'COMPLETED',
      effect: 'APPLIED',
      recovery: 'NONE',
      externalId,
      verifiedAt: new Date().toISOString(),
    };

    await this.operationStore.recordEvidence(
      workspaceId,
      claimedOp.id,
      claimedOp.version,
      evidenceData,
    );

    // Sync or create local PurchaseOrder in DB if supplier exists
    let syncError: string | null = null;
    try {
      const lines = (parameters.lines as any[]) || [];
      const totalAmount = lines.reduce((sum, l) => sum + (l.quantity || 0) * (l.unitCostMinor || 0) / 100, 0);
      const supplierId = String(parameters.supplierId);
      const sup = await this.prisma.supplier.findFirst({ where: { workspaceId, id: supplierId } });
      if (sup) {
        const validItemCreates = [];
        for (const l of lines) {
          const skuInDb = await this.prisma.sku.findFirst({
            where: { workspaceId, id: l.skuId },
          });
          if (skuInDb) {
            validItemCreates.push({
              workspaceId,
              skuId: l.skuId,
              quantity: l.quantity,
              unitCost: (l.unitCostMinor || 0) / 100,
              receivedQuantity: 0,
            });
          }
        }

        await this.prisma.purchaseOrder.create({
          data: {
            workspaceId,
            supplierId: sup.id,
            poNumber: externalId,
            status: 'CONFIRMED',
            totalAmount,
            ...(validItemCreates.length > 0
              ? { items: { create: validItemCreates } }
              : {}),
          },
        });
      }
    } catch (err: any) {
      syncError = err.message;
      this.logger.error(`Failed to sync local PurchaseOrder for action ${row.id}: ${err.message}`);
    }

    const updatedAction = await this.prisma.plannedAction.update({
      where: { id: row.id },
      data: {
        status: syncError ? 'FAILED' : 'SUCCESS',
        lastMessage: syncError
          ? `ERP 采购单远端已创建 (${externalId})，但本地同步记账失败: ${syncError}`
          : `ERP 采购单已创建: ${externalId}`,
        parameters: {
          ...parameters,
          _evidence: evidenceData,
        },
      },
    });

    await this.appendHistory(
      workspaceId,
      row.id,
      userId || 'owner',
      'SUCCESS',
      {
        operationId: claimedOp.id,
        externalId,
        version: claimedOp.version,
      },
      1,
    );

    return this.toAction(updatedAction);
  }

  private async executeV2SimulatorAction(
    workspaceId: string,
    row: any,
    target: Record<string, unknown>,
    parameters: Record<string, unknown>,
    userId?: string,
  ) {
    const runId = String(target.runId);

    // 1. Keyword check: campaign-level action must not specify keyword
    if (typeof target.keyword === 'string' && target.keyword.trim().length > 0) {
      throw new BadRequestException(
        'keyword targeting is not supported on campaign-level action; keyword must be empty',
      );
    }

    // 2. Adapter capabilities check (R2-10)
    const adapter = resolveCommerceAdapter(this.prisma, 'simulator');
    const capabilities = adapter.getCapabilities ? adapter.getCapabilities() : null;
    if (capabilities && !capabilities.supportedActions.includes(row.actionType)) {
      throw new BadRequestException(
        `UNSUPPORTED_CAPABILITY: action ${row.actionType} is not supported by ${adapter.platform} adapter`,
      );
    }

    const cleanParameters = { ...parameters };
    delete (cleanParameters as any)._approval;

    // 3. Payload hash
    const payloadHash = computeSha256({
      actionType: row.actionType,
      target,
      parameters: cleanParameters,
    });

    // 4. Check existing receipt for idempotent replay
    if (this.prisma.simulationExecutionReceipt?.findFirst) {
      const existingReceipt = await this.prisma.simulationExecutionReceipt.findFirst({
        where: {
          runId,
          actionId: row.id,
          operationKind: 'APPLY',
        },
      });

      if (existingReceipt && existingReceipt.status === 'APPLIED') {
        if (existingReceipt.payloadHash === payloadHash) {
          // Idempotent replay: return success without mutating world state again
          const updated = await this.prisma.plannedAction.update({
            where: { id: row.id },
            data: {
              status: 'SUCCESS',
              lastMessage: 'Simulator v2 Action APPLIED (idempotent replay)',
            },
          });
          return this.toAction(updated);
        } else {
          throw new ConflictException('IDEMPOTENCY_CONFLICT: same actionId with different payload');
        }
      }
    }

    // 5. Load SimulationRun
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      throw new NotFoundException(`SimulationRun not found: ${runId}`);
    }
    if (run.status !== 'RUNNING') {
      throw new ConflictException(`SimulationRun ${runId} is not in RUNNING status (${run.status})`);
    }

    // Target storeId check against run.storeId (FIX-6)
    if (target.storeId && target.storeId !== run.storeId) {
      throw new ForbiddenException(
        `Target storeId ${target.storeId} does not match SimulationRun storeId ${run.storeId}`,
      );
    }

    const worldState = run.stateSnapshot as any;
    if (!worldState || !Array.isArray(worldState.campaigns)) {
      throw new BadRequestException('SimulationRun stateSnapshot has invalid campaigns');
    }

    const campaignId = String(target.campaignId);
    const campaign = worldState.campaigns.find((c: any) => c.id === campaignId);
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found in SimulationRun ${runId}`);
    }

    // 6. Version check (FIX-6: expectedTargetVersion missing directly rejected)
    const expectedTargetVersion =
      target.expectedTargetVersion ??
      cleanParameters.expectedTargetVersion ??
      (parameters as any)?._approval?.expectedTargetVersion;

    if (expectedTargetVersion === undefined || expectedTargetVersion === null) {
      throw new BadRequestException('expectedTargetVersion is required for v2 simulation action execution');
    }

    if (Number(expectedTargetVersion) !== campaign.targetVersion) {
      throw new ConflictException(
        `VERSION_CONFLICT: expected targetVersion ${expectedTargetVersion} but found ${campaign.targetVersion}`,
      );
    }

    // 7. Policy guard for automatic mode (R2-3)
    const approval = (parameters as any)?._approval;
    if (approval?.mode === 'POLICY_AUTO' || (row.metadata as any)?.source === 'SIMULATOR_AUTOPILOT') {
      const limits = (run.policyLimits as any) ?? {};
      const history = (worldState.actionHistory as any[]) || [];
      const pastMetrics = this.prisma.adMetricDaily?.findMany
        ? await this.prisma.adMetricDaily.findMany({
            where: { campaignId },
            take: 7,
          })
        : [];
      const clicks = pastMetrics.reduce((sum: number, m: any) => sum + Number(m.clicks || 0), 0);
      const policyCheck = evaluateSimulatorPolicy({
        actionType: row.actionType,
        campaignId,
        currentDate: worldState.nextDate || new Date().toISOString().slice(0, 10),
        currentBidCents: campaign.bidCents,
        initialBidCents: campaign.bidCents,
        percentage: Number(cleanParameters.percentage || 10),
        recent7DayClicks: clicks,
        actionHistory: history,
        policyLimits: {
          maxSingleDecreasePct: limits.maxSingleBidChangePct ?? 0.20,
          maxCumulativeDecreasePct: limits.maxCumulativeBidChangePct ?? 0.30,
          cooldownDays: limits.cooldownDays ?? 3,
          maxActionsPerDay: limits.maxDailyActionsPerTarget ?? 3,
          min7DayClicks: limits.min7DayClicks ?? 100,
          minBidFloorCents: Math.round((limits.minBidUSD ?? 0.20) * 100),
        },
      });

      if (policyCheck.decision === 'REJECT') {
        throw new BadRequestException(
          `POLICY_VIOLATION: ${policyCheck.reason || 'POLICY_REJECT'}`,
        );
      }
    }

    // 8. Atomic execution via V2RunStore (R2-10, R2-4)
    let applyRes: any;
    try {
      applyRes = await this.v2Store.applyAction({
        runId,
        actionId: row.id,
        actionType: row.actionType,
        target,
        parameters: cleanParameters,
        userId,
        payloadHash,
        expectedTargetVersion: Number(expectedTargetVersion),
      });
    } catch (err: any) {
      if (err?.code === 'CONFLICT' || err?.message?.includes('conflict') || err?.message?.includes('VERSION_CONFLICT')) {
        throw new ConflictException(err.message);
      }
      if (err?.code === 'BAD_REQUEST' || err?.message?.includes('percentage must be')) {
        throw new BadRequestException(err.message);
      }
      if (err?.code === 'P2002') {
        throw new ConflictException(`Unique constraint conflict: ${err.message}`);
      }
      throw err;
    }

    // 9. Safe Outcome creation with recoverable recording (FIX-12 / R2-5)
    try {
      await this.outcomeTracking?.createForExecution(
        workspaceId,
        { id: row.id, target },
        applyRes.appliedDate,
        { evaluationVersion: 'closed-loop-v2' },
      );
    } catch (err: any) {
      this.logger.error(`Failed to create outcome for action ${row.id}: ${err?.message}`, err?.stack);
      try {
        if (this.prisma.agentTask?.create) {
          await this.prisma.agentTask.create({
            data: {
              workspaceId,
              taskType: 'OUTCOME_CREATION_RETRY',
              status: 'PENDING',
              inputJson: JSON.stringify({
                actionId: row.id,
                target,
                appliedDate: applyRes.appliedDate.toISOString(),
                evaluationVersion: 'closed-loop-v2',
              }),
            },
          });
        }
      } catch (taskErr: any) {
        this.logger.error(`Failed to record outcome creation retry task: ${taskErr?.message}`);
      }
    }

    const updatedAction = await this.prisma.plannedAction.findUnique({ where: { id: row.id } });
    return this.toAction(updatedAction || row);
  }

  compensate(workspaceId: string, id: string, userId?: string) {
    return this.wrap(async () => {
      const row = await this.requireAction(workspaceId, id);
      const target = asObject(row.target);
      if (!target.runId) {
        throw new BadRequestException('Compensation is only supported for v2 simulator actions');
      }

      const runId = String(target.runId);
      const applyReceipt = await this.prisma.simulationExecutionReceipt.findFirst({
        where: { runId, actionId: id, operationKind: 'APPLY' },
      });
      if (!applyReceipt || applyReceipt.status !== 'APPLIED') {
        throw new BadRequestException(`No APPLIED receipt found for action ${id}`);
      }

      const run = await this.prisma.simulationRun.findUnique({ where: { id: runId } });
      if (!run) throw new NotFoundException('SimulationRun not found');
      const worldState = run.stateSnapshot as any;
      const campaign = worldState.campaigns.find((c: any) => c.id === target.campaignId);
      if (!campaign) throw new NotFoundException('Campaign not found in run');

      if (campaign.targetVersion !== applyReceipt.targetVersion) {
        throw new ConflictException(
          `VERSION_CONFLICT: target has version ${campaign.targetVersion} but receipt has ${applyReceipt.targetVersion}; subsequent modification detected`,
        );
      }

      const attempt = (applyReceipt.attempt ?? 1) + 1;

      // P1 #5: Append execution_started history
      await this.appendHistory(
        workspaceId,
        id,
        userId || 'owner',
        'execution_started',
        { operation: 'COMPENSATE' },
        attempt,
      );

      const beforeState = {
        bidCents: campaign.bidCents,
        status: campaign.status,
        targetVersion: campaign.targetVersion,
      };

      const originalBefore = applyReceipt.beforeState as any;
      if (originalBefore.bidCents !== undefined) campaign.bidCents = originalBefore.bidCents;
      if (originalBefore.status !== undefined) campaign.status = originalBefore.status;
      campaign.targetVersion += 1;

      const afterState = {
        bidCents: campaign.bidCents,
        status: campaign.status,
        targetVersion: campaign.targetVersion,
      };

      let updatedAction: any;
      await this.prisma.$transaction(async (tx: any) => {
        await tx.simulationExecutionReceipt.create({
          data: {
            runId,
            actionId: id,
            operationKind: 'COMPENSATE',
            payloadHash: applyReceipt.payloadHash,
            appliedDate: new Date(`${worldState.nextDate}T00:00:00.000Z`),
            targetVersion: campaign.targetVersion,
            status: 'APPLIED',
            beforeState,
            afterState,
            attempt,
          },
        });
        const updateCount = await tx.simulationRun.updateMany({
          where: { id: run.id, stateVersion: run.stateVersion },
          data: {
            stateSnapshot: worldState,
            stateVersion: { increment: 1 },
          },
        });
        if (updateCount.count === 0) {
          throw new ConflictException('VERSION_CONFLICT: SimulationRun stateVersion conflict during compensation');
        }
        await tx.actionExecution.create({
          data: {
            workspaceId,
            actionId: id,
            operator: userId || 'owner',
            status: 'SUCCESS',
            attempt,
            input: { operation: 'COMPENSATE' },
            output: { beforeState, afterState },
          },
        });
        updatedAction = await tx.plannedAction.update({
          where: { id },
          data: {
            status: 'COMPENSATED',
            lastMessage: 'Simulator v2 Action COMPENSATED',
          },
        });
      });

      return this.toAction(updatedAction || row);
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
    return this.prisma.actionExecution.create({
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
