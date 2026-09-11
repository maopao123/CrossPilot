import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { SkipWorkspace } from '../../common/decorators/skip-workspace.decorator.js';
import {
  CreateWorkspaceInput,
  CreateWorkspaceSchema,
  JwtPayload,
} from '@crosspilot/shared';

@Controller('workspaces')
export class WorkspaceController {
  constructor(private workspaceService: WorkspaceService) {}

  /**
   * Section 79: GET /api/v1/workspaces/current
   * Returns current active workspace summary
   */
  @SkipWorkspace()
  @Get('current')
  async getCurrentWorkspace(
    @CurrentUser() user: JwtPayload,
    @CurrentWorkspace() currentWsId?: string,
  ) {
    return this.workspaceService.getCurrentWorkspace(
      user.sub,
      currentWsId || user.workspaceId,
    );
  }

  @SkipWorkspace()
  @Get()
  async listWorkspaces(@CurrentUser() user: JwtPayload) {
    return this.workspaceService.listUserWorkspaces(user.sub);
  }

  @Get(':workspaceId')
  async getWorkspaceById(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workspaceService.getWorkspaceById(workspaceId, user.sub);
  }

  @SkipWorkspace()
  @Post()
  async createWorkspace(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateWorkspaceInput,
  ) {
    const validated = CreateWorkspaceSchema.parse(body);
    return this.workspaceService.createWorkspace(user.sub, validated);
  }
}
