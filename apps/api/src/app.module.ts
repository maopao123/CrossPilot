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
import { ScenarioModule } from './modules/scenario/scenario.module.js';
import { MarketModule } from './modules/market/market.module.js';
import { ListingModule } from './modules/listing/listing.module.js';
import { AdvertisingModule } from './modules/advertising/advertising.module.js';
import { AnalystModule } from './modules/analyst/analyst.module.js';
import { AgentTaskModule } from './modules/agent-task/agent-task.module.js';
import { EvalModule } from './modules/eval/eval.module.js';
import { ToolCenterModule } from './modules/tool-center/tool-center.module.js';
import { CreativeModule } from './modules/creative/creative.module.js';
import { OperationAutomationModule } from './modules/operation-automation/operation-automation.module.js';
import { DailyDiagnosisModule } from './modules/daily-diagnosis/daily-diagnosis.module.js';
import { CommerceStoreModule } from './modules/commerce-store/commerce-store.module.js';
import { PlaybookModule } from './modules/playbook/playbook.module.js';
import { IntelligenceModule } from './modules/intelligence/intelligence.module.js';
import { SimulatorModule } from './modules/simulator/simulator.module.js';
import { OperationsTodayModule } from './modules/operations-today/operations-today.module.js';
import { ActionLayerModule } from './modules/action-layer/action-layer.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { WorkspaceGuard } from './common/guards/workspace.guard.js';
import { ViewerWriteGuard } from './common/guards/viewer-write.guard.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor.js';
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
    ScenarioModule,
    MarketModule,
    ListingModule,
    AdvertisingModule,
    AnalystModule,
    AgentTaskModule,
    EvalModule,
    ToolCenterModule,
    CreativeModule,
    OperationAutomationModule,
    DailyDiagnosisModule,
    CommerceStoreModule,
    PlaybookModule,
    IntelligenceModule,
    SimulatorModule,
    OperationsTodayModule,
    ActionLayerModule,
    StorageModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: WorkspaceGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ViewerWriteGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
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
