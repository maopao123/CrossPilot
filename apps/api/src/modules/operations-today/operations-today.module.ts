import { Module } from '@nestjs/common';
import { OperationsTodayController } from './operations-today.controller.js';
import { OperationsTodayService } from './operations-today.service.js';
import { ProfitModule } from '../profit/profit.module.js';
import { AdvertisingModule } from '../advertising/advertising.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { SimulatorModule } from '../simulator/simulator.module.js';
import { DailyDiagnosisModule } from '../daily-diagnosis/daily-diagnosis.module.js';
import { IntelligenceModule } from '../intelligence/intelligence.module.js';

@Module({
  imports: [
    ProfitModule,
    AdvertisingModule,
    InventoryModule,
    SimulatorModule,
    DailyDiagnosisModule,
    IntelligenceModule,
  ],
  controllers: [OperationsTodayController],
  providers: [OperationsTodayService],
})
export class OperationsTodayModule {}
