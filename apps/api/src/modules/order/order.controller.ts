import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { OrderService } from './order.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { CreateOrderInput, CreateOrderSchema } from '@crosspilot/shared';

@Controller('orders')
export class OrderController {
  constructor(private orderService: OrderService) {}

  @Get()
  async listOrders(
    @CurrentWorkspace() workspaceId: string,
    @Query('limit') limit?: string,
  ) {
    return this.orderService.listOrders(
      workspaceId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get(':id')
  async getOrder(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.orderService.getOrderById(workspaceId, id);
  }

  /**
   * AC 2: Order -> Inventory -
   */
  @Post()
  async createOrder(
    @CurrentWorkspace() workspaceId: string,
    @Body() body: CreateOrderInput,
  ) {
    const validated = CreateOrderSchema.parse(body);
    return this.orderService.createOrder(workspaceId, validated);
  }
}
