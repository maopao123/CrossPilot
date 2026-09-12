/**
 * Daily Diagnosis Controller (Epic 3 Phase 7)
 *
 * Exposes WF-05 Daily Operation Workflow via REST & Server-Sent Events (SSE).
 * Enforces:
 * - JWT & WorkspaceGuard on all endpoints
 * - RBAC: VIEWER forbidden on mutations (403 AUTH_FORBIDDEN)
 * - Safe DTO Response Sizes (<4KB default summary)
 * - Strict Separation of Concerns (Approval != Execute)
 * - SSE observation channel decoupled from Postgres state
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { DailyDiagnosisService } from './daily-diagnosis.service.js';
import {
  DailyOperationStartRequestDto,
  DailyOperationStartResponseDto,
  DailyOperationTaskSummaryDto,
  DailyOperationActionDecisionDto,
  DailyOperationActionDecisionResponseDto,
  DailyOperationResumeResponseDto,
} from '@crosspilot/shared';

@Controller('operations/daily-diagnosis')
export class DailyDiagnosisController {
  constructor(private readonly dailyDiagnosisService: DailyDiagnosisService) {}

  /**
   * 1. Start Workflow Diagnosis (202 Accepted)
   * POST /operations/daily-diagnosis
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async startDiagnosis(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser('sub') userId: string | undefined,
    @Body() dto: DailyOperationStartRequestDto,
    @Req() req: any,
  ): Promise<DailyOperationStartResponseDto> {
    const member = req.workspaceMember;
    if (member?.role === 'VIEWER') {
      throw new ForbiddenException({
        code: 'AUTH_FORBIDDEN',
        message: 'Viewer role cannot trigger daily diagnosis workflows',
      });
    }

    return this.dailyDiagnosisService.startDiagnosis(
      workspaceId,
      dto,
      userId,
    );
  }

  /**
   * 2. Inspect Task Status & Summary
   * GET /operations/daily-diagnosis/:taskId
   */
  @Get(':taskId')
  async getTaskSummary(
    @Param('taskId') taskId: string,
    @CurrentWorkspace() workspaceId: string,
    @Query('include') include?: string,
  ): Promise<DailyOperationTaskSummaryDto> {
    return this.dailyDiagnosisService.getTaskSummary(
      taskId,
      workspaceId,
      include,
    );
  }

  /**
   * 3. Stream Real-Time Workflow Events via SSE
   * GET /operations/daily-diagnosis/:taskId/events
   */
  @Get(':taskId/events')
  async streamEvents(
    @Param('taskId') taskId: string,
    @CurrentWorkspace() workspaceId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // 1. Workspace isolation & existence verification before opening stream
    const initialSummary = await this.dailyDiagnosisService.getTaskSummary(
      taskId,
      workspaceId,
    );

    // 2. Configure SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // 3. Emit Initial Snapshot Event
    res.write(`event: snapshot\ndata: ${JSON.stringify(initialSummary)}\n\n`);

    // 4. Heartbeat interval every 15 seconds to prevent gateway timeouts
    const heartbeatTimer = setInterval(() => {
      res.write(`event: ping\ndata: {"timestamp":"${new Date().toISOString()}"}\n\n`);
    }, 15000);

    // 5. Subscribe to live workflow domain events
    const unsubscribe = this.dailyDiagnosisService.subscribeTaskEvents(
      taskId,
      (event) => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      },
    );

    // 6. Cleanup on client disconnect
    req.on('close', () => {
      clearInterval(heartbeatTimer);
      unsubscribe();
      res.end();
    });
  }

  /**
   * 4. Approve Action (HITL Decision, Zero External Execution)
   * POST /operations/daily-diagnosis/:taskId/actions/:actionId/approve
   */
  @Post(':taskId/actions/:actionId/approve')
  async approveAction(
    @Param('taskId') taskId: string,
    @Param('actionId') actionId: string,
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser('sub') userId: string | undefined,
    @Body() dto: DailyOperationActionDecisionDto,
    @Req() req: any,
  ): Promise<DailyOperationActionDecisionResponseDto> {
    const member = req.workspaceMember;
    return this.dailyDiagnosisService.approveAction(
      taskId,
      actionId,
      workspaceId,
      member?.role,
      { ...dto, decidedBy: dto?.decidedBy || userId },
    );
  }

  /**
   * 5. Reject Action (HITL Decision)
   * POST /operations/daily-diagnosis/:taskId/actions/:actionId/reject
   */
  @Post(':taskId/actions/:actionId/reject')
  async rejectAction(
    @Param('taskId') taskId: string,
    @Param('actionId') actionId: string,
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser('sub') userId: string | undefined,
    @Body() dto: DailyOperationActionDecisionDto,
    @Req() req: any,
  ): Promise<DailyOperationActionDecisionResponseDto> {
    const member = req.workspaceMember;
    return this.dailyDiagnosisService.rejectAction(
      taskId,
      actionId,
      workspaceId,
      member?.role,
      { ...dto, decidedBy: dto?.decidedBy || userId },
    );
  }

  /**
   * 6. Dismiss Action (HITL Decision)
   * POST /operations/daily-diagnosis/:taskId/actions/:actionId/dismiss
   */
  @Post(':taskId/actions/:actionId/dismiss')
  async dismissAction(
    @Param('taskId') taskId: string,
    @Param('actionId') actionId: string,
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser('sub') userId: string | undefined,
    @Body() dto: DailyOperationActionDecisionDto,
    @Req() req: any,
  ): Promise<DailyOperationActionDecisionResponseDto> {
    const member = req.workspaceMember;
    return this.dailyDiagnosisService.dismissAction(
      taskId,
      actionId,
      workspaceId,
      member?.role,
      { ...dto, decidedBy: dto?.decidedBy || userId },
    );
  }

  /**
   * 7. Resume Workflow After Approvals
   * POST /operations/daily-diagnosis/:taskId/resume
   */
  @Post(':taskId/resume')
  async resumeWorkflow(
    @Param('taskId') taskId: string,
    @CurrentWorkspace() workspaceId: string,
    @Body() body: { expectedVersion?: number },
    @Req() req: any,
  ): Promise<DailyOperationResumeResponseDto> {
    const member = req.workspaceMember;
    return this.dailyDiagnosisService.resumeWorkflow(
      taskId,
      workspaceId,
      member?.role,
      body,
    );
  }
}
