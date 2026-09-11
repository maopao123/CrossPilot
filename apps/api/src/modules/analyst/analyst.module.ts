import { Module } from '@nestjs/common';
import { AnalystController } from './analyst.controller.js';
import { AnalystService } from './analyst.service.js';

@Module({
  controllers: [AnalystController],
  providers: [AnalystService],
  exports: [AnalystService],
})
export class AnalystModule {}
