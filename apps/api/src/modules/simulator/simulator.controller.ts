import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
} from '@nestjs/common';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { SimulatorService } from './simulator.service.js';

@Controller('simulator')
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

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
}
