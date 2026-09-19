import { Module } from '@nestjs/common';
import { InternalMetricsController } from './metrics.controller.js';

@Module({
  controllers: [InternalMetricsController],
})
export class InternalModule {}
