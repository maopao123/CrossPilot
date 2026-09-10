import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { WorkspaceModule } from './modules/workspace/workspace.module.js';
import { ProductModule } from './modules/product/product.module.js';
import { SupplierModule } from './modules/supplier/supplier.module.js';
import { PurchaseModule } from './modules/purchase/purchase.module.js';
import { OrderModule } from './modules/order/order.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { ProfitModule } from './modules/profit/profit.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    WorkspaceModule,
    ProductModule,
    SupplierModule,
    PurchaseModule,
    OrderModule,
    InventoryModule,
    ProfitModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
