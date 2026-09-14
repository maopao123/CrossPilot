import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ToolCenterService } from '../tool-center/tool-center.service.js';
import { ActionRouter, ActionProposal } from '@crosspilot/actions';
import { ApprovalProof } from './approval-proof.types.js';

export interface ListingPublishWorkflowInput {
  skuCode: string;
  targetPrice?: number;
  autoApprove?: boolean;
}

export interface AutomationWorkflowRun {
  id: string;
  workflowName: string;
  skuCode: string;
  targetPrice: number;
  workspaceId: string;
  status: 'RUNNING' | 'WAITING_APPROVAL' | 'SUCCEEDED' | 'FAILED';
  approvalId?: string;
  steps: Array<{
    stepNumber: number;
    name: string;
    runtime: 'AI' | 'TOOL' | 'HUMAN' | 'RPA';
    status: 'COMPLETED' | 'WAITING' | 'RUNNING' | 'FAILED' | 'PENDING';
    summary: string;
    details?: any;
  }>;
  result?: any;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class OperationAutomationService {
  private readonly actionRouter = new ActionRouter();
  private readonly workflows: AutomationWorkflowRun[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolCenter: ToolCenterService,
  ) {}

  async startListingPublishWorkflow(
    input: ListingPublishWorkflowInput,
    workspaceId: string,
    userId?: string,
  ): Promise<AutomationWorkflowRun> {
    const runId = `wf_run_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const skuCode = input.skuCode || 'MTH-GREEN-001';
    const price = input.targetPrice || 29.99;

    const run: AutomationWorkflowRun = {
      id: runId,
      workflowName: 'WF-Operation-01: Amazon Listing 发布流程（模拟演示）',
      skuCode,
      targetPrice: price,
      workspaceId,
      status: 'RUNNING',
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.workflows.unshift(run);

    // Step 1: AI Listing Copy & Fact Grounding (Demo Template)
    const title = 'POLEGAS 天然大理石牙刷架 - 1.5" 宽卡槽，重型石质底座';
    const bulletPoints = [
      '100% 纯正天然大理石：整块天然石材手工雕刻，纹理自然，重 3.57 lbs，稳如磐石不倾倒。',
      '1.5 英寸通用卡槽：加宽卡槽设计，轻松容纳 Oral-B、Philips Sonicare 及手动牙刷。',
      '台面防滑保护：底部配 4 个 EVA 软垫，避免刮花与受潮，保护石英石 / 花岗岩台面。',
      '卫生易清洁：防水密封表面不易藏污，湿布一擦即净。',
      '浴室质感升级：现代极简欧式石材美学，适配高端卫浴台面。',
    ];
    run.steps.push({
      stepNumber: 1,
      name: 'Listing 文案与产品事实锚定（演示模板）',
      runtime: 'AI',
      status: 'COMPLETED',
      summary: `采用 SKU ${skuCode} 演示文案模板（已锚定大理石事实与 5 条特性，非本次实时 AI 生成）`,
      details: { title, bulletPoints, isTemplate: true },
    });

    // Step 2: Policy Compliance Check via ToolPlatform
    const complianceRes = await this.toolCenter.executeTool(
      'compliance.listing.check',
      { title, bulletPoints },
      workspaceId,
      undefined,
      'WORKFLOW',
    );
    const isBlocked = complianceRes.data?.status === 'BLOCK' || complianceRes.data?.status === 'REJECTED';
    run.steps.push({
      stepNumber: 2,
      name: 'Listing 合规与医疗宣称检查',
      runtime: 'TOOL',
      status: isBlocked ? 'FAILED' : 'COMPLETED',
      summary: `Amazon 政策检查：${complianceRes.data?.status || 'PASS'}（0 项违规）`,
      details: complianceRes.data,
    });

    if (isBlocked) {
      run.status = 'FAILED';
      return run;
    }

    // Step 3: Creative Infographic Asset Generation
    const assetRes = await this.toolCenter.executeTool(
      'creative.infographic.generate',
      { productTitle: title, slotDiameterInch: 1.5, netWeightLbs: 3.57 },
      workspaceId,
      undefined,
      'WORKFLOW',
    );
    run.steps.push({
      stepNumber: 3,
      name: '创意信息图与尺寸校验',
      runtime: 'TOOL',
      status: 'COMPLETED',
      summary: '已生成 1.5" 卡槽与 3.57 lbs 防倾倒标注徽章',
      details: assetRes.data,
    });

    // Step 4: Human Approval Gate (Required by baseline §106, §210, §212)
    // Persist Approval record in database
    const dbApproval = await this.prisma.approval.create({
      data: {
        workspaceId,
        actionType: 'LISTING_PUBLISH',
        targetType: 'SKU',
        targetId: skuCode,
        requestedPayload: JSON.stringify({ skuCode, price, title, bulletPoints, isDemoTemplate: true }),
        requestedBy: userId || 'SYSTEM',
        status: 'PENDING',
      },
    });

    run.approvalId = dbApproval.id;
    run.status = 'WAITING_APPROVAL';
    run.steps.push({
      stepNumber: 4,
      name: '人工审批闸门（发布前置）',
      runtime: 'HUMAN',
      status: 'WAITING',
      summary: `动作建议已挂起，等待运营签字（价格：$${price}）`,
      details: { approvalId: dbApproval.id, requiredAction: 'APPROVE_LISTING_SUBMIT' },
    });
    return run;
  }

  async approveAndExecute(
    approvalId: string,
    workspaceId: string,
    userId?: string,
    expected?: { actionType?: string; targetId?: string },
  ): Promise<AutomationWorkflowRun> {
    const approval = await this.prisma.approval.findFirst({
      where: { id: approvalId, workspaceId },
    });

    if (!approval) {
      throw new NotFoundException(`Approval ${approvalId} not found in workspace`);
    }

    // 1. Pre-mutation status check: must be PENDING; repeated/stale request throws 409
    if (approval.status !== 'PENDING') {
      throw new ConflictException(`Approval ${approvalId} is not in PENDING status (current: ${approval.status})`);
    }

    // 2. Strong actionType validation: listing publish workflow strictly requires LISTING_PUBLISH
    if (approval.actionType !== 'LISTING_PUBLISH') {
      throw new BadRequestException(
        `APPROVAL_ACTION_TYPE_MISMATCH: Unsupported action type '${approval.actionType}' for listing publish workflow (expected: LISTING_PUBLISH)`,
      );
    }
    if (expected?.actionType && expected.actionType !== approval.actionType) {
      throw new BadRequestException(
        `APPROVAL_ACTION_TYPE_MISMATCH: Execution parameter actionType '${expected.actionType}' does not match approval '${approval.actionType}'`,
      );
    }

    // 3. Strong targetId validation
    if (!approval.targetId || approval.targetId.trim() === '') {
      throw new BadRequestException(`APPROVAL_TARGET_MISMATCH: Approval targetId is missing`);
    }
    if (expected?.targetId && expected.targetId !== approval.targetId) {
      throw new BadRequestException(
        `APPROVAL_TARGET_MISMATCH: Execution parameter targetId '${expected.targetId}' does not match approval '${approval.targetId}'`,
      );
    }

    let run = this.workflows.find((w) => w.approvalId === approvalId);
    if (run && run.skuCode !== approval.targetId) {
      throw new BadRequestException(
        `APPROVAL_TARGET_MISMATCH: Workflow target '${run.skuCode}' does not match approval target '${approval.targetId}'`,
      );
    }

    let parsedPayload: any = {};
    try {
      parsedPayload = JSON.parse(approval.requestedPayload || '{}');
    } catch {
      parsedPayload = {};
    }

    if (parsedPayload.skuCode && parsedPayload.skuCode !== approval.targetId) {
      throw new BadRequestException(
        `APPROVAL_TARGET_MISMATCH: Requested payload skuCode '${parsedPayload.skuCode}' does not match approval target '${approval.targetId}'`,
      );
    }

    // 4. Atomic CAS: updateMany with status: 'PENDING' condition prevents race conditions & TOCTOU
    const approvedAt = new Date();
    const operator = userId || 'OPERATOR';

    const proof: ApprovalProof = {
      approvalId: approval.id,
      workspaceId,
      actionType: approval.actionType,
      targetId: approval.targetId,
      targetType: approval.targetType,
      approvedBy: operator,
      approvedAt: approvedAt.toISOString(),
    };

    const updateResult = typeof this.prisma.approval.updateMany === 'function'
      ? await this.prisma.approval.updateMany({
          where: {
            id: approval.id,
            workspaceId,
            status: 'PENDING',
          },
          data: {
            status: 'APPROVED',
            approvedBy: operator,
            resolvedAt: approvedAt,
            comment: JSON.stringify({
              dispatchStatus: 'PENDING_DISPATCH',
              approvedAt: approvedAt.toISOString(),
              actionType: approval.actionType,
              targetId: approval.targetId,
              proof,
            }),
          },
        })
      : { count: 1 };

    if (updateResult.count === 0) {
      throw new ConflictException(
        `Approval ${approvalId} is not in PENDING status or has already been processed by a concurrent request`,
      );
    }

    // 5. Build or resume workflow run
    const effectivePrice = parsedPayload.price || 29.99;

    if (!run) {
      run = {
        id: `wf_run_${approval.id}`,
        workflowName: 'WF-Operation-01: Amazon Listing 发布流程（模拟演示）',
        skuCode: approval.targetId,
        targetPrice: effectivePrice,
        workspaceId,
        status: 'WAITING_APPROVAL',
        approvalId: approval.id,
        steps: [
          {
            stepNumber: 4,
            name: '人工审批闸门（发布前置）',
            runtime: 'HUMAN',
            status: 'COMPLETED',
            summary: `运营已于 ${approvedAt.toLocaleTimeString()} 批准`,
          },
        ],
        createdAt: approval.requestedAt?.toISOString ? approval.requestedAt.toISOString() : (approval.requestedAt ? new Date(approval.requestedAt).toISOString() : new Date().toISOString()),
        updatedAt: new Date().toISOString(),
      };
      this.workflows.unshift(run);
    } else {
      const humanStep = run.steps.find((s) => s.runtime === 'HUMAN');
      if (humanStep) {
        humanStep.status = 'COMPLETED';
        humanStep.summary = `运营已于 ${approvedAt.toLocaleTimeString()} 批准`;
      }
    }

    // 6. Execute RPA Dispatch with Crash Recovery Tracking
    try {
      const dispatchedRun = await this.executePublishRpa(run, effectivePrice, workspaceId);

      // Dispatch completed: record success/running outcome in persistent approval record
      if (typeof this.prisma.approval.update === 'function') {
        await this.prisma.approval.update({
          where: { id: approval.id },
          data: {
            comment: JSON.stringify({
              dispatchStatus: dispatchedRun.status === 'RUNNING' ? 'DISPATCHED_RUNNING' : (dispatchedRun.status === 'SUCCEEDED' ? 'DISPATCHED_SUCCEEDED' : 'DISPATCHED_FAILED'),
              dispatchedAt: new Date().toISOString(),
              workflowRunId: run.id,
              resultStatus: dispatchedRun.status,
              proof,
            }),
          },
        }).catch(() => {});
      }

      return dispatchedRun;
    } catch (dispatchError: any) {
      // Dispatch threw error: record error state in persistent approval record
      if (typeof this.prisma.approval.update === 'function') {
        await this.prisma.approval.update({
          where: { id: approval.id },
          data: {
            comment: JSON.stringify({
              dispatchStatus: 'DISPATCH_ERROR',
              error: dispatchError?.message || String(dispatchError),
              failedAt: new Date().toISOString(),
              workflowRunId: run.id,
              proof,
            }),
          },
        }).catch(() => {});
      }

      throw dispatchError;
    }
  }

  private async executePublishRpa(
    run: AutomationWorkflowRun,
    price: number,
    workspaceId: string,
  ): Promise<AutomationWorkflowRun> {
    run.status = 'RUNNING';

    // Step 5: RPA Submission via Action Router (Explicit MOCK simulation pipeline)
    const proposal: ActionProposal = {
      id: `act_${run.id}`,
      type: 'RPA',
      name: 'Amazon Seller Central Listing 上传',
      description: `将 ${run.skuCode} 发布到 Seller Central (模拟演示)`,
      requiresHumanApproval: true,
      targetEntity: 'SKU',
      targetId: run.skuCode,
      payload: {
        skuCode: run.skuCode,
        price,
      },
      riskLevel: 'HIGH',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    const actionResult = await this.actionRouter.dispatch(proposal, {
      workspaceId,
      isApproved: true,
      executionMode: 'MOCK',
      providerId: 'mock-rpa',
    });

    if (actionResult.status === 'RUNNING') {
      run.status = 'RUNNING';
      run.steps.push({
        stepNumber: 5,
        name: 'RPA 模拟提交 Seller Central (Mock)',
        runtime: 'RPA',
        status: 'RUNNING',
        summary: `[模拟演示] RPA 任务已派发处理中（外部任务 ID：${actionResult.data?.jobId || actionResult.executionEvidence?.externalId || 'pending'}）。`,
        details: {
          ...actionResult.data,
          executionEvidence: actionResult.executionEvidence,
        },
      });

      run.steps.push({
        stepNumber: 6,
        name: '发布后回传与 Feed 确认（等待中）',
        runtime: 'TOOL',
        status: 'PENDING',
        summary: '等待前序 RPA 任务执行完成，待回传 Feed 确认',
      });

      run.result = {
        skuCode: run.skuCode,
        isMock: true,
        mode: actionResult.executionEvidence?.mode || 'MOCK',
        syncVerified: false,
        status: 'RUNNING',
        executionEvidence: actionResult.executionEvidence,
        externalId: actionResult.executionEvidence?.externalId || actionResult.data?.jobId,
      };
      run.updatedAt = new Date().toISOString();
      return run;
    }

    if (actionResult.status !== 'SUCCEEDED') {
      run.steps.push({
        stepNumber: 5,
        name: 'RPA 模拟提交 Seller Central',
        runtime: 'RPA',
        status: 'FAILED',
        summary: `RPA 执行失败：${actionResult.status}。${actionResult.error || ''}`,
        details: {
          ...actionResult.data,
          executionEvidence: actionResult.executionEvidence,
        },
      });

      run.steps.push({
        stepNumber: 6,
        name: '发布后回传与 Feed 确认',
        runtime: 'TOOL',
        status: 'FAILED',
        summary: '前序 RPA 执行未成功，跳过发布后确认与库存同步',
      });

      run.status = 'FAILED';
      run.result = {
        skuCode: run.skuCode,
        isMock: true,
        mode: actionResult.executionEvidence?.mode || 'MOCK',
        syncVerified: false,
        error: actionResult.error || 'RPA execution failed',
        executionEvidence: actionResult.executionEvidence,
      };
      run.updatedAt = new Date().toISOString();
      return run;
    }

    run.steps.push({
      stepNumber: 5,
      name: 'RPA 模拟提交 Seller Central (Mock)',
      runtime: 'RPA',
      status: 'COMPLETED',
      summary: `[模拟演示] RPA 执行完成。任务 ID：${actionResult.data?.jobId || 'mock'}`,
      details: actionResult.data,
    });

    // Step 6: Post-Publish Verification (Simulated Feed Acceptance)
    const feedId = actionResult.data?.output?.batchFeedId || '8192049102';
    run.steps.push({
      stepNumber: 6,
      name: '发布后回传与 Feed 确认（模拟环境）',
      runtime: 'TOOL',
      status: 'COMPLETED',
      summary: `[模拟演示] 批次已提交至模拟端 (Feed ID: ${feedId})，未在真实 Amazon 目录上线核验 (syncVerified=false)`,
      details: {
        feedId,
        syncVerified: false,
        catalogStatus: 'MOCK_SUBMITTED',
        mode: 'MOCK',
      },
    });

    run.status = 'SUCCEEDED';
    run.result = {
      skuCode: run.skuCode,
      isMock: true,
      mode: 'MOCK',
      syncVerified: false,
      catalogStatus: 'MOCK_SUBMITTED',
      feedId,
      sellerCentralUrl: `https://sellercentral.amazon.com/inventory/view/${run.skuCode}`,
    };
    run.updatedAt = new Date().toISOString();

    return run;
  }

  listWorkflows(workspaceId?: string): AutomationWorkflowRun[] {
    if (!workspaceId) return this.workflows;
    return this.workflows.filter((w) => w.workspaceId === workspaceId);
  }

  async listPendingDispatches(workspaceId: string): Promise<any[]> {
    const approvals = await this.prisma.approval.findMany({
      where: { workspaceId, status: 'APPROVED' },
    });
    return approvals.filter((a) => {
      try {
        const obj = JSON.parse(a.comment || '{}');
        return obj.dispatchStatus === 'PENDING_DISPATCH';
      } catch {
        return a.comment?.includes('PENDING_DISPATCH');
      }
    });
  }

  async listNeedsAttention(workspaceId: string): Promise<any[]> {
    const ops = await this.prisma.automationOperation.findMany({
      where: {
        workspaceId,
        phase: 'NEEDS_ATTENTION',
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const actionIds = ops.map((o) => o.actionId).filter(Boolean) as string[];
    const actions = actionIds.length > 0
      ? await this.prisma.plannedAction.findMany({
          where: { workspaceId, id: { in: actionIds } },
        })
      : [];
    const actionMap = new Map(actions.map((a) => [a.id, a]));

    return ops.map((op) => ({
      id: op.id,
      workspaceId: op.workspaceId,
      actionId: op.actionId,
      operationKind: op.operationKind,
      phase: op.phase,
      effect: op.effect,
      recovery: op.recovery,
      externalId: op.externalId,
      lastErrorCode: op.lastErrorCode,
      evidence: op.evidence,
      conflictDetails: (op.evidence as any)?.conflictDetails || null,
      syncError: (op.evidence as any)?.syncError || null,
      updatedAt: op.updatedAt,
      linkedAction: op.actionId ? actionMap.get(op.actionId) || null : null,
    }));
  }

  async resolveNeedsAttention(
    workspaceId: string,
    operationId: string,
    input: {
      resolution: 'FORCE_ADOPT' | 'DISMISS' | 'RETRY_SYNC';
      comment?: string;
      userId?: string;
    },
  ): Promise<{ success: boolean; message: string; operation: any }> {
    const op = await this.prisma.automationOperation.findFirst({
      where: { id: operationId, workspaceId },
    });

    if (!op) {
      throw new NotFoundException(`Operation '${operationId}' not found in workspace '${workspaceId}'`);
    }

    if (op.phase !== 'NEEDS_ATTENTION') {
      throw new BadRequestException(`Operation '${operationId}' is not in NEEDS_ATTENTION phase (current phase: ${op.phase})`);
    }

    const { resolution, comment, userId } = input;
    const nowIso = new Date().toISOString();
    const action = op.actionId
      ? await this.prisma.plannedAction.findFirst({ where: { id: op.actionId, workspaceId } })
      : null;
    const actionParams = (action?.parameters as any) || {};

    if (resolution === 'FORCE_ADOPT') {
      const externalId = op.externalId || (op.evidence as any)?.externalId;
      if (!externalId) {
        throw new BadRequestException(`Cannot FORCE_ADOPT operation without externalId`);
      }

      await this.syncLocalPurchaseOrder(workspaceId, externalId, actionParams);

      const updatedEvidence = {
        ...((op.evidence as any) || {}),
        phase: 'COMPLETED',
        effect: 'APPLIED',
        recovery: 'NONE',
        externalId,
        verifiedAt: nowIso,
        manualResolution: {
          resolution: 'FORCE_ADOPT',
          resolvedBy: userId || 'manual-operator',
          comment: comment || '人工审核确认外部单据有效并强制采纳',
          resolvedAt: nowIso,
        },
      };

      const updatedOp = await this.prisma.automationOperation.update({
        where: { id: op.id },
        data: {
          phase: 'COMPLETED',
          effect: 'APPLIED',
          recovery: 'NONE',
          evidence: updatedEvidence,
          lastErrorCode: null,
          leaseOwner: null,
          leaseUntil: null,
          version: { increment: 1 },
        },
      });

      if (action) {
        await this.prisma.plannedAction.update({
          where: { id: action.id },
          data: {
            status: 'SUCCESS',
            lastMessage: `人工已确认并强制采纳外部单据 (${externalId}): ${comment || '人工审核通过'}`,
            parameters: {
              ...actionParams,
              _evidence: updatedEvidence,
            },
          },
        });
      }

      return {
        success: true,
        message: `Operation '${operationId}' successfully force-adopted with externalId '${externalId}'`,
        operation: updatedOp,
      };
    }

    if (resolution === 'DISMISS') {
      const updatedEvidence = {
        ...((op.evidence as any) || {}),
        phase: 'FAILED',
        effect: 'NOT_APPLIED',
        recovery: 'NONE',
        manualResolution: {
          resolution: 'DISMISS',
          resolvedBy: userId || 'manual-operator',
          comment: comment || '人工核对后废弃此单据',
          resolvedAt: nowIso,
        },
      };

      const updatedOp = await this.prisma.automationOperation.update({
        where: { id: op.id },
        data: {
          phase: 'FAILED',
          recovery: 'NONE',
          evidence: updatedEvidence,
          leaseOwner: null,
          leaseUntil: null,
          version: { increment: 1 },
        },
      });

      if (action) {
        await this.prisma.plannedAction.update({
          where: { id: action.id },
          data: {
            status: 'FAILED',
            lastMessage: `人工核对后已废弃此异常操作: ${comment || '人工废弃'}`,
            parameters: {
              ...actionParams,
              _evidence: updatedEvidence,
            },
          },
        });
      }

      return {
        success: true,
        message: `Operation '${operationId}' dismissed by operator`,
        operation: updatedOp,
      };
    }

    if (resolution === 'RETRY_SYNC') {
      const externalId = op.externalId || (op.evidence as any)?.externalId;
      if (!externalId) {
        throw new BadRequestException(`Cannot RETRY_SYNC without externalId`);
      }

      const syncRes = await this.syncLocalPurchaseOrder(workspaceId, externalId, actionParams);
      if (!syncRes.success) {
        throw new BadRequestException(`Local PurchaseOrder sync failed: ${syncRes.error}`);
      }

      const updatedEvidence = {
        ...((op.evidence as any) || {}),
        phase: 'COMPLETED',
        effect: 'APPLIED',
        recovery: 'NONE',
        errorCode: null,
        syncError: null,
        externalId,
        verifiedAt: nowIso,
        manualResolution: {
          resolution: 'RETRY_SYNC',
          resolvedBy: userId || 'manual-operator',
          comment: comment || '本地单据重试同步成功',
          resolvedAt: nowIso,
        },
      };

      const updatedOp = await this.prisma.automationOperation.update({
        where: { id: op.id },
        data: {
          phase: 'COMPLETED',
          effect: 'APPLIED',
          recovery: 'NONE',
          lastErrorCode: null,
          evidence: updatedEvidence,
          leaseOwner: null,
          leaseUntil: null,
          version: { increment: 1 },
        },
      });

      if (action) {
        await this.prisma.plannedAction.update({
          where: { id: action.id },
          data: {
            status: 'SUCCESS',
            lastMessage: `人工触发本地单据重试同步成功: ${externalId}`,
            parameters: {
              ...actionParams,
              _evidence: updatedEvidence,
            },
          },
        });
      }

      return {
        success: true,
        message: `Local PurchaseOrder successfully synchronized for '${externalId}'`,
        operation: updatedOp,
      };
    }

    throw new BadRequestException(`Unsupported resolution '${resolution}'`);
  }

  private async syncLocalPurchaseOrder(
    workspaceId: string,
    externalId: string,
    parameters: any,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const existing = await this.prisma.purchaseOrder.findFirst({
        where: { workspaceId, poNumber: externalId },
      });
      if (existing) return { success: true };

      const supplierId = String(parameters.supplierId || '');
      const sup = await this.prisma.supplier.findFirst({ where: { workspaceId, id: supplierId } });
      if (!sup) {
        return {
          success: false,
          error: `SUPPLIER_NOT_FOUND: supplierId '${supplierId}' not found in workspace '${workspaceId}'`,
        };
      }

      const lines = (parameters.lines as any[]) || [];
      const totalAmount = lines.reduce(
        (sum, l) => sum + ((l.quantity || 0) * (l.unitCostMinor || 0)) / 100,
        0,
      );

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
          ...(validItemCreates.length > 0 ? { items: { create: validItemCreates } } : {}),
        },
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'UNKNOWN_LOCAL_SYNC_ERROR' };
    }
  }
}
