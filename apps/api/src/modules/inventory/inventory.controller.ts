import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { InventoryService } from './inventory.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';

@Controller()
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('inventory')
  async listInventory(@CurrentWorkspace() workspaceId: string) {
    return this.inventoryService.listInventory(workspaceId);
  }

  @Get('skus/:skuId/inventory')
  async getSkuInventory(
    @CurrentWorkspace() workspaceId: string,
    @Param('skuId') skuId: string,
  ) {
    return this.inventoryService.getSkuInventory(workspaceId, skuId);
  }

  @Post('skus/:skuId/reorder-recommendation')
  async getReorderRecommendation(
    @CurrentWorkspace() workspaceId: string,
    @Param('skuId') skuId: string,
    @Body() body?: { leadTimeDays?: number; targetDaysCover?: number },
  ) {
    return this.inventoryService.getReorderRecommendation(
      workspaceId,
      skuId,
      body,
    );
  }
}
