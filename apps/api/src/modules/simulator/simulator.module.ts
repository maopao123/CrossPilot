import { Module } from '@nestjs/common';
import { SimulatorController } from './simulator.controller.js';
import { SimulatorService } from './simulator.service.js';
import { SimulatorPersistenceService } from './simulator.persistence.js';

@Module({
  controllers: [SimulatorController],
  providers: [SimulatorService, SimulatorPersistenceService],
  exports: [SimulatorService],
})
export class SimulatorModule {}
