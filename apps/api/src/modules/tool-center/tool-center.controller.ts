import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ToolCenterService } from './tool-center.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('tools')
export class ToolCenterController {
  constructor(private readonly toolCenterService: ToolCenterService) {}

  @Public()
  @Get()
  listTools(@Query('category') category?: string) {
    return this.toolCenterService.listTools(category);
  }

  @Public()
  @Get('executions')
  listExecutions(@Query('limit') limit?: string) {
    return this.toolCenterService.listExecutions(limit ? parseInt(limit, 10) : 20);
  }

  @Public()
  @Get(':id')
  getTool(@Param('id') id: string) {
    return this.toolCenterService.getTool(id);
  }

  @Public()
  @Post(':id/execute')
  executeTool(
    @Param('id') id: string,
    @Body() payload: { input: any; workspaceId?: string; source?: 'TOOL_CENTER' | 'AGENT' | 'WORKFLOW' },
  ) {
    const wsId = payload.workspaceId || 'ws_default_001';
    return this.toolCenterService.executeTool(
      id,
      payload.input || {},
      wsId,
      undefined,
      payload.source || 'TOOL_CENTER',
    );
  }
}
