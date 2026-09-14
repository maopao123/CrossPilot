import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { PurchaseService } from './purchase.service.js';
import { PurchaseAutomationService } from './purchase-automation.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import {
  CreatePurchaseOrderInput,
  CreatePurchaseOrderSchema,
  ReceivePurchaseOrderInput,
  ReceivePurchaseOrderSchema,
} from '@crosspilot/shared';

@Controller('purchase-orders')
export class PurchaseController {
  constructor(
    private purchaseService: PurchaseService,
    private purchaseAutomationService: PurchaseAutomationService,
  ) {}

  @Post('automation/proposals')
  async createReplenishmentProposal(
    @CurrentWorkspace() workspaceId: string,
    @Body() body: any,
  ) {
    return this.purchaseAutomationService.generateReplenishmentProposal(workspaceId, body);
  }

  @Get()
  async listPurchaseOrders(@CurrentWorkspace() workspaceId: string) {
    return this.purchaseService.listPurchaseOrders(workspaceId);
  }

  @Get(':id')
  async getPurchaseOrder(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.purchaseService.getPurchaseOrderById(workspaceId, id);
  }

  @Post()
  async createPurchaseOrder(
    @CurrentWorkspace() workspaceId: string,
    @Body() body: CreatePurchaseOrderInput,
  ) {
    const validated = CreatePurchaseOrderSchema.parse(body);
    return this.purchaseService.createPurchaseOrder(workspaceId, validated);
  }

  @Post(':id/confirm')
  async confirmPurchaseOrder(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.purchaseService.confirmPurchaseOrder(workspaceId, id);
  }

  @Post(':id/ship')
  async shipPurchaseOrder(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.purchaseService.shipPurchaseOrder(workspaceId, id);
  }

  /**
   * AC 1: PO Receive -> Inventory +
   */
  @Post(':id/receive')
  async receivePurchaseOrder(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() body: ReceivePurchaseOrderInput,
  ) {
    const validated = ReceivePurchaseOrderSchema.parse(body);
    return this.purchaseService.receivePurchaseOrder(
      workspaceId,
      id,
      validated,
    );
  }
}
