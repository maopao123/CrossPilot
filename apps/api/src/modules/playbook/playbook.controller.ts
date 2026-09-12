import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreatePlaybookInput, JwtPayload, StartPlaybookRunInput } from '@crosspilot/shared';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PlaybookService } from './playbook.service.js';

@Controller()
export class PlaybookController {
  constructor(private readonly playbooks: PlaybookService) {}

  @Post('playbooks')
  create(
    @CurrentWorkspace() workspaceId: string,
    @Body() body: CreatePlaybookInput,
  ) {
    return this.playbooks.create(workspaceId, body);
  }

  @Get('playbooks')
  list(@CurrentWorkspace() workspaceId: string) {
    return this.playbooks.list(workspaceId);
  }

  @Get('playbooks/:id')
  get(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.playbooks.get(workspaceId, id);
  }

  @Post('playbooks/:id/runs')
  startRun(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: StartPlaybookRunInput,
  ) {
    return this.playbooks.startRun(workspaceId, id, body || { input: {} }, user?.sub);
  }

  @Get('playbook-runs/:id')
  getRun(@CurrentWorkspace() workspaceId: string, @Param('id') runId: string) {
    return this.playbooks.getRun(workspaceId, runId);
  }

  @Post('playbook-runs/:id/execute')
  executeRun(@CurrentWorkspace() workspaceId: string, @Param('id') runId: string) {
    return this.playbooks.executeRun(workspaceId, runId);
  }
}
