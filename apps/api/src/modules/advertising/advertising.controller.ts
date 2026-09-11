import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { AdvertisingService } from './advertising.service.js';

@Controller('api/v1/advertising')
export class AdvertisingController {
  constructor(private readonly advertisingService: AdvertisingService) {}

  @Get('campaigns')
  getCampaigns(@Query('workspaceId') workspaceId?: string) {
    return this.advertisingService.getCampaigns(workspaceId);
  }

  @Get('search-terms')
  getSearchTerms(@Query('campaignId') campaignId?: string) {
    return this.advertisingService.getSearchTerms(campaignId);
  }

  @Get('negative-recommendations')
  getNegativeRecommendations() {
    return this.advertisingService.getNegativeRecommendations();
  }

  @Post('apply-negative')
  applyNegativeKeyword(
    @Body() payload: { campaignId: string; searchTerm: string; workspaceId?: string },
  ) {
    return this.advertisingService.applyNegativeKeyword(payload);
  }
}
