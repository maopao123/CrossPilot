import { Controller, Get, Post, Body } from '@nestjs/common';
import { AnalystService } from './analyst.service.js';

@Controller('api/v1/analyst')
export class AnalystController {
  constructor(private readonly analystService: AnalystService) {}

  @Get('waterfall')
  getWaterfall() {
    return this.analystService.getWaterfall();
  }

  @Post('ask')
  askAnalyst(@Body('question') question: string) {
    return this.analystService.askAnalyst(question || 'Why did profit drop this week?');
  }
}
