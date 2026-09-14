import { Module } from '@nestjs/common';
import { AgentTaskController } from './agent-task.controller.js';
import { AgentTaskService } from './agent-task.service.js';
import { AnalystModule } from '../analyst/analyst.module.js';

@Module({
  imports: [AnalystModule],
  controllers: [AgentTaskController],
  providers: [AgentTaskService],
  exports: [AgentTaskService],
})
export class AgentTaskModule {}

