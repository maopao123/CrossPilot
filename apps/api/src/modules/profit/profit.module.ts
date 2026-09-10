import { Module } from '@nestjs/common';
import { ProfitController } from './profit.controller.js';
import { ProfitService } from './profit.service.js';

@Module({
  controllers: [ProfitController],
  providers: [ProfitService],
  exports: [ProfitService],
})
export class ProfitModule {}
