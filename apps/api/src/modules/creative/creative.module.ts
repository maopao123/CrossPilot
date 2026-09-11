import { Module } from '@nestjs/common';
import { CreativeController } from './creative.controller.js';
import { CreativeService } from './creative.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ToolCenterModule } from '../tool-center/tool-center.module.js';

@Module({
  imports: [PrismaModule, ToolCenterModule],
  controllers: [CreativeController],
  providers: [CreativeService],
  exports: [CreativeService],
})
export class CreativeModule {}
