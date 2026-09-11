import { Module } from '@nestjs/common';
import { ToolCenterController } from './tool-center.controller.js';
import { ToolCenterService } from './tool-center.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ToolCenterController],
  providers: [ToolCenterService],
  exports: [ToolCenterService],
})
export class ToolCenterModule {}
