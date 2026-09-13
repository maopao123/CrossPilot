import { Module } from '@nestjs/common';
import { OutcomeTrackingController } from './outcome-tracking.controller.js';
import { OutcomeTrackingService } from './outcome-tracking.service.js';

@Module({
  controllers: [OutcomeTrackingController],
  providers: [OutcomeTrackingService],
  exports: [OutcomeTrackingService],
})
export class OutcomeTrackingModule {}
