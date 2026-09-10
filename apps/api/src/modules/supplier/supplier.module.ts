import { Module } from '@nestjs/common';
import { SupplierController } from './supplier.controller.js';
import { SupplierService } from './supplier.service.js';

@Module({
  controllers: [SupplierController],
  providers: [SupplierService],
  exports: [SupplierService],
})
export class SupplierModule {}
