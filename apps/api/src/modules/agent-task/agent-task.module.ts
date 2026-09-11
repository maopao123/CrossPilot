import { Module } from '@nestjs/common';
import { AgentTaskController } from './agent-task.controller.js';
import { AgentTaskService } from './agent-task.service.js';

@Module({
  controllers: [AgentTaskController],
  providers: [AgentTaskService],
  exports: [AgentTaskService],
})
export class AgentTaskModule {}
