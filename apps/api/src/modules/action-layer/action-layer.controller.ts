import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { ActionLayerService } from './action-layer.service.js';
import { OutcomeTrackingService } from '../outcome-tracking/outcome-tracking.service.js';

@Controller('actions')
export class ActionLayerController {
  constructor(
    private readonly actions: ActionLayerService,
    private readonly outcomeTracking: OutcomeTrackingService,
  ) {}

  @Get()
  list(
    @CurrentWorkspace() workspaceId: string,
    @Query('recommendationId') recommendationId?: string,
  ) {
    return this.actions.list(workspaceId, recommendationId);
  }

  @Get(':id/outcomes')
  outcomes(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.outcomeTracking.forAction(workspaceId, id);
  }

  @Get(':id/history')
  history(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.actions.history(workspaceId, id);
  }

  @Get(':id')
  get(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.actions.get(workspaceId, id);
  }

  @Post('plan')
  plan(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser('sub') userId: string | undefined,
    @Body() body: { recommendationId?: string },
  ) {
    return this.actions.plan(workspaceId, String(body?.recommendationId || ''), userId);
  }

  @Post('plan-acos')
  planAcos(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser('sub') userId: string | undefined,
    @Body() body: { campaignId?: string; keyword?: string },
  ) {
    return this.actions.planAcos(workspaceId, userId, body);
  }

  @Post(':id/approve')
  approve(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser('sub') userId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.actions.approve(workspaceId, id, userId);
  }

  @Post(':id/reject')
  reject(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser('sub') userId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.actions.reject(workspaceId, id, userId);
  }

  @Post(':id/execute')
  execute(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser('sub') userId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.actions.execute(workspaceId, id, userId);
  }
}
