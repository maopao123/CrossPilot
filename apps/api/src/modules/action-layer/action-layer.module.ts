import { Module } from '@nestjs/common';
import { ActionLayerController } from './action-layer.controller.js';
import { ActionLayerService } from './action-layer.service.js';
import { IntelligenceModule } from '../intelligence/intelligence.module.js';
import { AdvertisingModule } from '../advertising/advertising.module.js';

@Module({
  imports: [IntelligenceModule, AdvertisingModule],
  controllers: [ActionLayerController],
  providers: [ActionLayerService],
  exports: [ActionLayerService],
})
export class ActionLayerModule {}
