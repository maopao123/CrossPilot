import { Controller, Get, Param, Query, Sse } from '@nestjs/common';
import { AgentTaskService } from './agent-task.service.js';
import { Observable } from 'rxjs';

@Controller('api/v1/agent-tasks')
export class AgentTaskController {
  constructor(private readonly taskService: AgentTaskService) {}

  @Get()
  listTasks(@Query('workspaceId') workspaceId?: string) {
    return this.taskService.listTasks(workspaceId);
  }

  @Get(':id/trace')
  getTaskTrace(@Param('id') taskId: string) {
    return this.taskService.getTaskTrace(taskId);
  }

  @Sse('stream')
  streamExecution(@Query('taskType') taskType?: string): Observable<MessageEvent> {
    return this.taskService.streamTaskExecution(taskType);
  }
}
