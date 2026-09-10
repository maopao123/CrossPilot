import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProfitService } from './profit.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { CreateReturnInput, CreateReturnSchema } from '@crosspilot/shared';

@Controller()
@UseGuards(WorkspaceGuard)
export class ProfitController {
  constructor(private profitService: ProfitService) {}

  @Get('profit/daily')
  async getDailyProfit(
    @CurrentWorkspace() workspaceId: string,
    @Query('skuId') skuId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.profitService.getDailyProfit(workspaceId, {
      skuId,
      startDate,
      endDate,
    });
  }

  @Get('profit/summary')
  async getProfitSummary(
    @CurrentWorkspace() workspaceId: string,
    @Query('skuId') skuId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.profitService.getProfitSummary(workspaceId, {
      skuId,
      startDate,
      endDate,
    });
  }

  /**
   * AC 3: Return -> Profit Recalculate
   */
  @Post('returns')
  async createReturn(
    @CurrentWorkspace() workspaceId: string,
    @Body() body: CreateReturnInput,
  ) {
    const validated = CreateReturnSchema.parse(body);
    return this.profitService.createReturn(workspaceId, validated);
  }

  @Get('skus/:skuId/returns')
  async listSkuReturns(
    @CurrentWorkspace() workspaceId: string,
    @Param('skuId') skuId: string,
  ) {
    return this.profitService.listSkuReturns(workspaceId, skuId);
  }

  @Get('skus/:skuId/return-summary')
  async getSkuReturnSummary(
    @CurrentWorkspace() workspaceId: string,
    @Param('skuId') skuId: string,
  ) {
    return this.profitService.getSkuReturnSummary(workspaceId, skuId);
  }
}
