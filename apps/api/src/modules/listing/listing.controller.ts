import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ListingService } from './listing.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';

@Controller('listings')
export class ListingController {
  constructor(private readonly listingService: ListingService) {}

  @Get('sku/:skuId')
  getListingBySkuId(
    @Param('skuId') skuId: string,
    @CurrentWorkspace() workspaceId: string,
  ) {
    return this.listingService.getListingBySkuId(skuId, workspaceId);
  }

  @Post('generate')
  generateListing(
    @CurrentWorkspace() workspaceId: string,
    @Body('skuId') skuId: string,
    @Body('customDirectives') customDirectives?: string,
  ) {
    return this.listingService.generateListing(skuId, workspaceId, customDirectives);
  }

  @Post('compliance-check')
  checkCompliance(
    @Body() payload: { title: string; bulletPoints: string[]; description?: string },
  ) {
    return this.listingService.checkCompliance(payload);
  }
}
