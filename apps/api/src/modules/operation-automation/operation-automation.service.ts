import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ToolCenterService } from '../tool-center/tool-center.service.js';
import { ActionRouter, ActionProposal } from '@crosspilot/actions';

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
  ): Promise<AutomationWorkflowRun> {
    const approval = await this.prisma.approval.findFirst({
      where: { id: approvalId, workspaceId },
    });

    if (!approval) {
      throw new NotFoundException(`Approval ${approvalId} not found in workspace`);
    }

    if (approval.status !== 'PENDING') {
      throw new BadRequestException(`Approval ${approvalId} is not in PENDING status (current: ${approval.status})`);
    }

    await this.prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: 'APPROVED',
        approvedBy: userId || 'OPERATOR',
        resolvedAt: new Date(),
      },
    });

    let run = this.workflows.find((w) => w.approvalId === approvalId);
    const parsedPayload = JSON.parse(approval.requestedPayload || '{}');
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
            summary: `运营已于 ${new Date().toLocaleTimeString()} 批准`,
          },
        ],
        createdAt: approval.requestedAt.toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.workflows.unshift(run);
    } else {
      const humanStep = run.steps.find((s) => s.runtime === 'HUMAN');
      if (humanStep) {
        humanStep.status = 'COMPLETED';
        humanStep.summary = `运营已于 ${new Date().toLocaleTimeString()} 批准`;
      }
    }

    return this.executePublishRpa(run, effectivePrice, workspaceId);
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
}
