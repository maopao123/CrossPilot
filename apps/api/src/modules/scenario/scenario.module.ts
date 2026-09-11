import { Module } from '@nestjs/common';
import { ScenarioController, DemoController } from './scenario.controller.js';
import { ScenarioService } from './scenario.service.js';

@Module({
  controllers: [ScenarioController, DemoController],
  providers: [ScenarioService],
  exports: [ScenarioService],
})
export class ScenarioModule {}
