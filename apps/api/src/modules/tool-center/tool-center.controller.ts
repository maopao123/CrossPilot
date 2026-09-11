import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ToolCenterService } from './tool-center.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtPayload } from '@crosspilot/shared';

@Controller('tools')
export class ToolCenterController {
  constructor(private readonly toolCenterService: ToolCenterService) {}

  @Get()
  listTools(@Query('category') category?: string) {
    return this.toolCenterService.listTools(category);
  }

  @Get('executions')
  listExecutions(
    @CurrentWorkspace() workspaceId: string,
    @Query('limit') limit?: string,
  ) {
    return this.toolCenterService.listExecutions(
      limit ? parseInt(limit, 10) : 20,
      workspaceId,
    );
  }

  @Get(':id')
  getTool(@Param('id') id: string) {
    return this.toolCenterService.getTool(id);
  }

  @Post(':id/execute')
  executeTool(
    @Param('id') id: string,
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: JwtPayload,
    @Body() payload: { input: any; source?: 'TOOL_CENTER' | 'AGENT' | 'WORKFLOW' },
  ) {
    return this.toolCenterService.executeTool(
      id,
      payload.input || {},
      workspaceId,
      user.sub,
      payload.source || 'TOOL_CENTER',
    );
  }
}
