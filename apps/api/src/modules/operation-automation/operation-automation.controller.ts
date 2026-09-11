import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { OperationAutomationService } from './operation-automation.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('operations')
export class OperationAutomationController {
  constructor(
    private readonly automationService: OperationAutomationService,
  ) {}

  @Public()
  @Post('listing-publish')
  startPublishWorkflow(
    @Body() payload: { skuCode?: string; targetPrice?: number; autoApprove?: boolean; workspaceId?: string },
  ) {
    return this.automationService.startListingPublishWorkflow(
      {
        skuCode: payload.skuCode || 'MTH-GREEN-001',
        targetPrice: payload.targetPrice,
        autoApprove: payload.autoApprove,
      },
      payload.workspaceId || 'ws_default_001',
    );
  }

  @Public()
  @Post('approve/:approvalId')
  approveAndExecute(
    @Param('approvalId') approvalId: string,
    @Body() payload: { workspaceId?: string },
  ) {
    return this.automationService.approveAndExecute(
      approvalId,
      payload.workspaceId || 'ws_default_001',
    );
  }

  @Public()
  @Get('workflows')
  listWorkflows() {
    return this.automationService.listWorkflows();
  }
}
