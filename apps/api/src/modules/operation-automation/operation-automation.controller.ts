import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { OperationAutomationService } from './operation-automation.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtPayload } from '@crosspilot/shared';

@Controller('operations')
export class OperationAutomationController {
  constructor(
    private readonly automationService: OperationAutomationService,
  ) {}

  @Post('listing-publish')
  startPublishWorkflow(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: JwtPayload,
    @Body() payload: { skuCode?: string; targetPrice?: number },
  ) {
    return this.automationService.startListingPublishWorkflow(
      {
        skuCode: payload.skuCode || 'MTH-GREEN-001',
        targetPrice: payload.targetPrice,
      },
      workspaceId,
      user.sub,
    );
  }

  @Post('approve/:approvalId')
  approveAndExecute(
    @Param('approvalId') approvalId: string,
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body?: { actionType?: string; targetId?: string },
  ) {
    return this.automationService.approveAndExecute(
      approvalId,
      workspaceId,
      user?.sub,
      body,
    );
  }

  @Get('workflows')
  listWorkflows(@CurrentWorkspace() workspaceId: string) {
    return this.automationService.listWorkflows(workspaceId);
  }

  @Get('pending-dispatches')
  listPendingDispatches(@CurrentWorkspace() workspaceId: string) {
    return this.automationService.listPendingDispatches(workspaceId);
  }

  @Get('needs-attention')
  listNeedsAttention(@CurrentWorkspace() workspaceId: string) {
    return this.automationService.listNeedsAttention(workspaceId);
  }

  @Post('needs-attention/:operationId/resolve')
  resolveNeedsAttention(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: JwtPayload,
    @Param('operationId') operationId: string,
    @Body() body: { resolution: 'FORCE_ADOPT' | 'DISMISS' | 'RETRY_SYNC'; comment?: string },
  ) {
    return this.automationService.resolveNeedsAttention(workspaceId, operationId, {
      ...body,
      userId: user?.sub,
    });
  }
}

