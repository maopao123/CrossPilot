import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import {
  CreateWorkspaceInput,
  CreateWorkspaceSchema,
  JwtPayload,
} from '@crosspilot/shared';

@Controller('workspaces')
@UseGuards(WorkspaceGuard)
export class WorkspaceController {
  constructor(private workspaceService: WorkspaceService) {}

  /**
   * Section 79: GET /api/v1/workspaces/current
   * Returns current active workspace summary
   */
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

  @Post()
  async createWorkspace(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateWorkspaceInput,
  ) {
    const validated = CreateWorkspaceSchema.parse(body);
    return this.workspaceService.createWorkspace(user.sub, validated);
  }
}
