import { Controller, Get, Post, Body, Req, ForbiddenException } from '@nestjs/common';
import { ScenarioService } from './scenario.service.js';

@Controller('scenario')
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
  resetDemo(@Req() req: any) {
    const member = req.workspaceMember;
    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      throw new ForbiddenException('Only workspace OWNER or ADMIN can reset workspace data.');
    }
    const slug = member.workspace?.slug || 'crosspilot-demo';
    return this.scenarioService.resetDemo(slug);
  }

  @Post('set-mode')
  setMode(@Req() req: any, @Body() body?: { mode?: 'RECONCILED' | 'CONFLICT_SAMPLE' }) {
    const member = req.workspaceMember;
    const slug =
      member?.workspace?.slug ||
      member?.workspace?.id ||
      req.headers['x-workspace-id'] ||
      'crosspilot-demo';
    const mode = body?.mode === 'CONFLICT_SAMPLE' ? 'CONFLICT_SAMPLE' : 'RECONCILED';
    return this.scenarioService.setScenarioMode(slug, mode);
  }
}

@Controller('demo')
export class DemoController {
  constructor(private readonly scenarioService: ScenarioService) {}

  @Post('reset')
  resetDemo(@Req() req: any) {
    const member = req.workspaceMember;
    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      throw new ForbiddenException('Only workspace OWNER or ADMIN can reset workspace data.');
    }
    const slug = member.workspace?.slug || 'crosspilot-demo';
    return this.scenarioService.resetDemo(slug);
  }

  @Post('set-mode')
  setMode(@Req() req: any, @Body() body?: { mode?: 'RECONCILED' | 'CONFLICT_SAMPLE' }) {
    const member = req.workspaceMember;
    const slug =
      member?.workspace?.slug ||
      member?.workspace?.id ||
      req.headers['x-workspace-id'] ||
      'crosspilot-demo';
    const mode = body?.mode === 'CONFLICT_SAMPLE' ? 'CONFLICT_SAMPLE' : 'RECONCILED';
    return this.scenarioService.setScenarioMode(slug, mode);
  }
}
