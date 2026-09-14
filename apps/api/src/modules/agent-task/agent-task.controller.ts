import { Controller, Get, Param, Query, Sse } from '@nestjs/common';
import { AgentTaskService } from './agent-task.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { Observable } from 'rxjs';

@Controller('agent-tasks')
export class AgentTaskController {
  constructor(private readonly taskService: AgentTaskService) {}

  @Get()
  listTasks(@CurrentWorkspace() workspaceId: string) {
    return this.taskService.listTasks(workspaceId);
  }

  @Get(':id/trace')
  getTaskTrace(
    @Param('id') taskId: string,
    @CurrentWorkspace() workspaceId: string,
  ) {
    return this.taskService.getTaskTrace(taskId, workspaceId);
  }

  @Sse('stream')
  streamExecution(
    @CurrentWorkspace() workspaceId: string,
    @Query('taskType') taskType?: string,
    @Query('executionId') executionId?: string,
  ): Observable<MessageEvent> {
    return this.taskService.streamTaskExecution(workspaceId, taskType, executionId);
  }

}
