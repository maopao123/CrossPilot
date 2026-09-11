import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { AdvertisingService } from './advertising.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';

@Controller('advertising')
export class AdvertisingController {
  constructor(private readonly advertisingService: AdvertisingService) {}

  @Get('campaigns')
  getCampaigns(@CurrentWorkspace() workspaceId: string) {
    return this.advertisingService.getCampaigns(workspaceId);
  }

  @Get('search-terms')
  getSearchTerms(
    @CurrentWorkspace() workspaceId: string,
    @Query('campaignId') campaignId?: string,
  ) {
    return this.advertisingService.getSearchTerms(workspaceId, campaignId);
  }

  @Get('negative-recommendations')
  getNegativeRecommendations(@CurrentWorkspace() workspaceId: string) {
    return this.advertisingService.getNegativeRecommendations(workspaceId);
  }

  @Post('apply-negative')
  applyNegativeKeyword(
    @CurrentWorkspace() workspaceId: string,
    @Body() payload: { campaignId: string; searchTerm: string },
  ) {
    return this.advertisingService.applyNegativeKeyword({
      campaignId: payload.campaignId,
      searchTerm: payload.searchTerm,
      workspaceId,
    });
  }
}
