import { Module } from '@nestjs/common';
import { PurchaseController } from './purchase.controller.js';
import { PurchaseService } from './purchase.service.js';
import { PurchaseAutomationService } from './purchase-automation.service.js';

@Module({
  controllers: [PurchaseController],
  providers: [PurchaseService, PurchaseAutomationService],
  exports: [PurchaseService, PurchaseAutomationService],
})
export class PurchaseModule {}
