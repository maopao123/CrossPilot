import { Module } from '@nestjs/common';
import { OperationAutomationController } from './operation-automation.controller.js';
import { OperationAutomationService } from './operation-automation.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ToolCenterModule } from '../tool-center/tool-center.module.js';

@Module({
  imports: [PrismaModule, ToolCenterModule],
  controllers: [OperationAutomationController],
  providers: [OperationAutomationService],
  exports: [OperationAutomationService],
})
export class OperationAutomationModule {}
