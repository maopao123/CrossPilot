import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { OutcomeTrackingService } from './outcome-tracking.service.js';

@Controller('outcomes')
export class OutcomeTrackingController {
  constructor(private readonly outcomes: OutcomeTrackingService) {}

  @Get()
  list(
    @CurrentWorkspace() workspaceId: string,
    @Query()
    query: { status?: string; targetType?: string; windowDays?: string; page?: string; pageSize?: string },
  ) {
    return this.outcomes.list(workspaceId, query);
  }

  /** 近 90 天各状态计数 + 累计 profit delta（Learning 的对外面孔） */
  @Get('summary')
  summary(@CurrentWorkspace() workspaceId: string) {
    return this.outcomes.summary(workspaceId);
  }

  /** OWNER/ADMIN 手动重评（数据补齐后）；观察窗未结束或并发冲突返回 409 */
  @Post(':id/reevaluate')
  reevaluate(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.outcomes.reevaluate(workspaceId, id);
  }
}
