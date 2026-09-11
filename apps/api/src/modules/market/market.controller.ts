import { Controller, Get, Param, Query } from '@nestjs/common';
import { MarketService } from './market.service.js';

@Controller('api/v1')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('market-research/snapshot')
  getMarketSnapshot(@Query('workspaceId') workspaceId?: string) {
    return this.marketService.getMarketSnapshot(workspaceId);
  }

  @Get('competitors')
  getCompetitors(@Query('workspaceId') workspaceId?: string) {
    return this.marketService.getCompetitors(workspaceId);
  }

  @Get('voc/topics')
  getVocTopics(@Query('workspaceId') workspaceId?: string) {
    return this.marketService.getVocTopics(workspaceId);
  }

  @Get('voc/topics/:id/evidence')
  getTopicEvidence(@Param('id') topicId: string) {
    return this.marketService.getTopicEvidence(topicId);
  }

  @Get('product-opportunities')
  getProductOpportunities(@Query('workspaceId') workspaceId?: string) {
    return this.marketService.getProductOpportunities(workspaceId);
  }
}
