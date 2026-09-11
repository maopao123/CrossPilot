import { Controller, Get, Post, Body } from '@nestjs/common';
import { ScenarioService } from './scenario.service.js';

@Controller('api/v1/scenario')
export class ScenarioController {
  constructor(private readonly scenarioService: ScenarioService) {}

  @Get('timeline')
  getTimeline() {
    return this.scenarioService.getTimeline();
  }

  @Get('daily')
  getDailyAggregates() {
    return this.scenarioService.getDailyAggregates();
  }

  @Get('waterfall')
  getWaterfall() {
    return this.scenarioService.getWaterfallWeek11();
  }

  @Post('reset')
  resetDemo(@Body('workspaceSlug') workspaceSlug?: string) {
    return this.scenarioService.resetDemo(workspaceSlug || 'crosspilot-demo');
  }
}

@Controller('api/v1/demo')
export class DemoController {
  constructor(private readonly scenarioService: ScenarioService) {}

  @Post('reset')
  resetDemo(@Body('workspaceSlug') workspaceSlug?: string) {
    return this.scenarioService.resetDemo(workspaceSlug || 'crosspilot-demo');
  }
}
