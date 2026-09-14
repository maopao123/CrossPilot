import { Controller, Get, Post, Body } from '@nestjs/common';
import { AnalystService } from './analyst.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';

@Controller('analyst')
export class AnalystController {
  constructor(private readonly analystService: AnalystService) {}

  @Get('waterfall')
  getWaterfall(@CurrentWorkspace() workspaceId: string) {
    return this.analystService.getWaterfall(workspaceId);
  }

  @Post('ask')
  askAnalyst(
    @CurrentWorkspace() workspaceId: string,
    @Body('question') question: string,
    @Body('executionId') executionId?: string,
  ) {
    return this.analystService.askAnalyst(
      question || 'Why did profit drop this week?',
      workspaceId,
      executionId,
    );
  }
}

