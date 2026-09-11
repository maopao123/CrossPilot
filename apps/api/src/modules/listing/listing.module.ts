import { Module } from '@nestjs/common';
import { ListingController } from './listing.controller.js';
import { ListingService } from './listing.service.js';

@Module({
  controllers: [ListingController],
  providers: [ListingService],
  exports: [ListingService],
})
export class ListingModule {}
