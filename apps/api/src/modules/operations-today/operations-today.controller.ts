import { Controller, Get } from '@nestjs/common';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { OperationsTodayService } from './operations-today.service.js';

@Controller()
export class OperationsTodayController {
  constructor(private readonly operationsToday: OperationsTodayService) {}

  @Get('operations/today')
  getToday(@CurrentWorkspace() workspaceId: string) {
    return this.operationsToday.getToday(workspaceId);
  }

  @Get('insights')
  getInsights(@CurrentWorkspace() workspaceId: string) {
    return this.operationsToday.getInsights(workspaceId);
  }
}
