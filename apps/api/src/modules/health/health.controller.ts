import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Public()
  @Get()
  async getHealth() {
    return this.healthService.checkHealth();
  }

  @Public()
  @Get('ai')
  async getAiHealth() {
    return this.healthService.checkAi();
  }
}
