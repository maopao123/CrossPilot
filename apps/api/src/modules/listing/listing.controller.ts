import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ListingService } from './listing.service.js';

@Controller('api/v1/listings')
export class ListingController {
  constructor(private readonly listingService: ListingService) {}

  @Get('sku/:skuId')
  getListingBySkuId(@Param('skuId') skuId: string) {
    return this.listingService.getListingBySkuId(skuId);
  }

  @Post('generate')
  generateListing(
    @Body('skuId') skuId: string,
    @Body('customDirectives') customDirectives?: string,
  ) {
    return this.listingService.generateListing(skuId, customDirectives);
  }

  @Post('compliance-check')
  checkCompliance(
    @Body() payload: { title: string; bulletPoints: string[]; description?: string },
  ) {
    return this.listingService.checkCompliance(payload);
  }
}
