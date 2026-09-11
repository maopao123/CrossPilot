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
  ) {
    return this.automationService.approveAndExecute(
      approvalId,
      workspaceId,
      user.sub,
    );
  }

  @Get('workflows')
  listWorkflows(@CurrentWorkspace() workspaceId: string) {
    return this.automationService.listWorkflows(workspaceId);
  }
}
