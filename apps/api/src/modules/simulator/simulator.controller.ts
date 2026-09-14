import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { SimulatorService } from './simulator.service.js';

@Controller('simulator')
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  /** Create an isolated closed-loop-v2 SimulationRun. */
  @Post('runs')
  createRun(
    @CurrentWorkspace() controlWorkspaceId: string,
    @Body() body: { modelVersion?: string; seed?: number; scenarioId?: string; idempotencyKey?: string; customConfig?: any },
    @Req() req: any,
  ) {
    if (req.workspaceMember?.role === 'VIEWER') {
      throw new ForbiddenException('VIEWER role cannot create simulation runs.');
    }
    const userId = req.user?.sub ?? req.user?.id;
    return this.simulatorService.createRun(controlWorkspaceId, userId, body);
  }

  /** List v2 SimulationRuns in control workspace. */
  @Get('runs')
  listRuns(@CurrentWorkspace() controlWorkspaceId: string) {
    return this.simulatorService.listRuns(controlWorkspaceId);
  }

  /** Update autopilot policy configuration for a run. Restricted to OWNER / ADMIN. */
  @Post('runs/:id/policy')
  updateRunPolicy(
    @CurrentWorkspace() controlWorkspaceId: string,
    @Param('id') runId: string,
    @Body() body: { policyEnabled: boolean; policyLimits?: any },
    @Req() req: any,
  ) {
    const role = req.workspaceMember?.role ?? 'VIEWER';
    return this.simulatorService.updateRunPolicy(controlWorkspaceId, runId, role, body);
  }

  /** Get summary of a v2 SimulationRun. */
  @Get('runs/:id')
  getRun(
    @CurrentWorkspace() controlWorkspaceId: string,
    @Param('id') runId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.simulatorService.getRun(controlWorkspaceId, runId, userId);
  }

  /** Advance a v2 SimulationRun by one day. */
  @Post('runs/:id/tick')
  tickRun(
    @CurrentWorkspace() controlWorkspaceId: string,
    @Param('id') runId: string,
    @Body() body?: { targetDate?: string },
    @Req() req?: any,
  ) {
    if (req?.workspaceMember?.role === 'VIEWER') {
      throw new ForbiddenException('VIEWER role cannot tick simulation runs.');
    }
    const userId = req?.user?.sub ?? req?.user?.id;
    return this.simulatorService.tickRun(controlWorkspaceId, runId, body?.targetDate, userId);
  }

  /** Advance a v2 SimulationRun by N days (1–90). Returns 202 with jobId (spec §9). */
  @Post('runs/:id/advance')
  @HttpCode(HttpStatus.ACCEPTED)
  advanceRun(
    @CurrentWorkspace() controlWorkspaceId: string,
    @Param('id') runId: string,
    @Body() body: { days?: number; mode?: 'synchronous' | 'asynchronous' },
    @Req() req: any,
  ) {
    if (req?.workspaceMember?.role === 'VIEWER') {
      throw new ForbiddenException('VIEWER role cannot advance simulation runs.');
    }
    const days = body?.days;
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 90) {
      throw new BadRequestException('days must be an integer between 1 and 90.');
    }
    const userId = req?.user?.sub ?? req?.user?.id;
    return this.simulatorService.advanceRun(controlWorkspaceId, runId, days, body?.mode, userId);
  }

  /** Pause a v2 SimulationRun at day boundary. */
  @Post('runs/:id/pause')
  pauseRun(
    @CurrentWorkspace() controlWorkspaceId: string,
    @Param('id') runId: string,
    @Req() req: any,
  ) {
    if (req?.workspaceMember?.role === 'VIEWER') {
      throw new ForbiddenException('VIEWER role cannot pause simulation runs.');
    }
    return this.simulatorService.pauseRun(controlWorkspaceId, runId);
  }

  /** Inject external events into a v2 SimulationRun. Restricted to OWNER / ADMIN. Past events immutable. */
  @Post('runs/:id/events')
  injectEvents(
    @CurrentWorkspace() controlWorkspaceId: string,
    @Param('id') runId: string,
    @Body() body: { events: any[] },
    @Req() req: any,
  ) {
    const role = req?.workspaceMember?.role ?? 'VIEWER';
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Only workspace OWNER or ADMIN can inject simulation events.');
    }
    if (!Array.isArray(body?.events)) {
      throw new BadRequestException('events must be an array.');
    }
    return this.simulatorService.injectEvents(controlWorkspaceId, runId, body.events);
  }

  /** Advance the simulated world by one day and persist the dataset. */
  @Post('tick')
  tick(@CurrentWorkspace() workspaceId: string) {
    return this.simulatorService.tick(workspaceId);
  }

  /** Advance N days (1–90). */
  @Post('advance')
  advance(@CurrentWorkspace() workspaceId: string, @Body() body: { days?: number }) {
    const days = body?.days;
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 90) {
      throw new BadRequestException('days must be an integer between 1 and 90.');
    }
    return this.simulatorService.advance(workspaceId, days);
  }

  /** Reset the simulated world. Restricted to workspace OWNER / ADMIN. */
  @Post('reset')
  reset(@CurrentWorkspace() workspaceId: string, @Req() req: any) {
    const member = req.workspaceMember;
    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      throw new ForbiddenException('Only workspace OWNER or ADMIN can reset the simulator.');
    }
    return this.simulatorService.reset(workspaceId);
  }

  /** Current sim clock, recent events and the 14-day channel funnel. */
  @Get('state')
  getState(@CurrentWorkspace() workspaceId: string) {
    return this.simulatorService.getState(workspaceId);
  }

  /** Create a three-group experiment (Control, Rule, CrossPilot) with budget constraints. */
  @Post('experiments')
  createExperiment(
    @CurrentWorkspace() controlWorkspaceId: string,
    @Body()
    body: {
      name?: string;
      scenarioIds?: string[];
      seeds?: number[];
      policyVersion?: string;
      evaluationVersion?: string;
      maxLlmCalls?: number;
      maxCostUSD?: number;
    },
    @Req() req: any,
  ) {
    if (req.workspaceMember?.role === 'VIEWER') {
      throw new ForbiddenException('VIEWER role cannot create experiments.');
    }
    const userId = req.user?.sub ?? req.user?.id;
    return this.simulatorService.createExperiment(controlWorkspaceId, userId, body);
  }

  /** Get details of a simulation experiment. */
  @Get('experiments/:id')
  getExperiment(
    @CurrentWorkspace() controlWorkspaceId: string,
    @Param('id') experimentId: string,
  ) {
    return this.simulatorService.getExperiment(controlWorkspaceId, experimentId);
  }
}
