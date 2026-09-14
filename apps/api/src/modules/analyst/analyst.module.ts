import { Module } from '@nestjs/common';
import { AnalystController } from './analyst.controller.js';
import { AnalystService } from './analyst.service.js';
import { AnalystTraceEmitter } from './analyst-trace.emitter.js';

@Module({
  controllers: [AnalystController],
  providers: [AnalystService, AnalystTraceEmitter],
  exports: [AnalystService, AnalystTraceEmitter],
})
export class AnalystModule {}

