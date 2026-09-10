import { Module } from '@nestjs/common';
import { PurchaseController } from './purchase.controller.js';
import { PurchaseService } from './purchase.service.js';

@Module({
  controllers: [PurchaseController],
  providers: [PurchaseService],
  exports: [PurchaseService],
})
export class PurchaseModule {}
