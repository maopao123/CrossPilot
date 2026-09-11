# CrossPilot V8 → V9 增量升级代码映射与架构对接分析报告 (V8_TO_V9_MAPPING.md)

> **版本**：V9.0.0-PROPOSAL  
> **日期**：2026-09-11  
> **依据**：`docs/V9_Final_跨境电商AI工作平台_增量升级开发方案.md` 与现有 V8 交付代码库  
> **执行原则**：V8 核心逻辑完全冻结，绝不推倒重构；新增能力以增量包和适配器接入；一份能力多入口复用（Tool First）。

---

## 1. 现有 Tool / Skill 的定义位置与调用链分析

### 1.1 现有业务工具（纯领域层）
在当前 `@crosspilot/domain`（路径 `packages/domain/src`）中，沉淀了 8 大核心纯业务计算与判决服务，全部为**纯函数 / 确定性状态机**，无数据库与框架依赖，具备天然的工具化属性：

| 现有服务 (`packages/domain/src`) | 核心方法 | 输入参数摘要 | 业务价值 | V9 Tool 映射标识 |
| :--- | :--- | :--- | :--- | :--- |
| `profit/profit-calculation.service.ts` | `calculateNetProfit(params)` | `revenue, cogs, referralFeeRate, fbaFee, adSpend, returnLoss` | 财务净利润与利润率精确核算 | `finance.profit.calculate` |
| `variance/variance-attribution.service.ts` | `attributeVariance(params)` | `previousProfit, currentProfit, advertisingImpact, returnsImpact...` | 多维杜邦/瀑布归因分析，零残差闭环 | `bi.variance.attribute` |
| `compliance/compliance-judge.service.ts` | `evaluateListing(params)` | `title, bulletPoints, description` | 亚马逊合规与宣称真实性判决（拦截 FDA 等） | `compliance.listing.check` |
| `advertising/ad-optimizer.service.ts` | `analyzeSearchTerm(params)` | `searchTerm, impressions, clicks, spend, orders, sales` | 搜索词过滤与否定精准词推荐 | `advertising.searchterm.analyze` |
| `advertising/ad-optimizer.service.ts` | `recommendBidAdjustments(params)` | `campaignMetrics, targetAcos` | 关键词出价与预算动态优化 | `operation.bid.adjust` |
| `inventory/inventory-planning.service.ts` | `calculateReplenishment(params)` | `availableStock, inTransitStock, dailyVelocity, leadTimeDays...` | FBA 库位补货水位与建议采购量 | `inventory.replenishment.calculate` |
| `inventory/inventory-movement.service.ts` | `calculateReceiptInbound(params)` / `calculateOrderFulfillment(params)` | `balance, delta` | 原子库存加减法与超卖阻断 | `inventory.stock.transact` |
| `purchase/purchase-order.state-machine.ts` | `transition(currentStatus, action)` | `currentStatus, action` | 采购订单合规状态机转移 | `supply.po.transition` |

### 1.2 现有 API 层工具调用链
在 `apps/api/src/modules/` 中，各业务控制器已通过依赖注入调用领域服务：
- `ListingService` (`modules/listing/listing.service.ts`)：在生成文案后立即同步调用 `ComplianceJudgeService.evaluateListing` 进行前置安全审计；
- `AdvertisingService` (`modules/advertising/advertising.service.ts`)：遍历 `SearchTermMetricDaily` 时逐条调用 `AdOptimizerService.analyzeSearchTerm`；
- `AnalystService` (`modules/analyst/analyst.service.ts`)：从数据库读取或回退到 `ScenarioGeneratorService`，调用 `VarianceAttributionService.attributeVariance`；
- `AgentTaskService` (`modules/agent-task/agent-task.service.ts`)：在 SSE 流和任务追踪中，已规划了 `query_profit_summary`, `query_ad_metrics`, `query_return_summary`, `query_inventory_risk`, `calculate_variance` 五类工具的轨迹记录。

---

## 2. Copilot / Planner 调 Tool 的入口分析

### 2.1 现有调用入口
- **控制器端点**：`apps/api/src/modules/agent-task/agent-task.controller.ts`
  - `GET /api/v1/agent-tasks`：拉取工作区下的 Agent 任务执行历史；
  - `GET /api/v1/agent-tasks/:id/trace`：按 Step 和 ToolExecution 结构下钻执行明细；
  - `GET /api/v1/agent-tasks/stream`：服务端推送（SSE）实时推演任务轨迹。
- **业务分析智能体端点**：`apps/api/src/modules/analyst/analyst.controller.ts`
  - `GET /api/v1/analyst/waterfall`：提供净利润波动归因与诊断发现；
  - `GET /api/v1/analyst/trajectory`：向前端返回 Agent 执行的具体步骤与工具入参出参。
- **前端调用组件**：`apps/web/src/app/app/business-analyst/page.tsx`
  - 内置 `TraceDrawer`，实时接收并解析 SSE 数据流，透明展示 `TASK_START`、`STEP_START`、`TOOL_CALL`、`TOOL_RESULT`、`TASK_COMPLETE`。

### 2.2 V9 对接策略
- V8 已经具备了完整的**任务-步骤-工具调用三层追踪模型**；
- V9 不推倒此结构，而是让 Copilot / Planner 的底层执行器统一重定向到 `ToolPlatform.executeTool(toolId, params, context)`，实现单点执行、统一审计与统一计费。

---

## 3. Workflow 的定义方式与执行方式分析

### 3.1 现有模式
- **领域事件流 (Scenario Flow)**：`packages/domain/src/scenario/scenario-generator.ts` 定义了 90 天确定性业务演进序列（E01~E10：上架 → 放量 → 爆单 → 断货预警 → 真实断货 → 退货潮 → VOC 定位 → Listing 优化 → 补货入库 → 归因诊断）；
- **任务状态模型 (Data Schema)**：
  - `AgentTask` 表（`taskType` 涵盖 `LISTING_GENERATE`, `COMPLIANCE_CHECK`, `VOC_ANALYZE`, `VARIANCE_ATTRIBUTION`, `INVENTORY_PLAN`）；
  - `AgentStep` 表（记录有序的执行步骤与摘要）；
  - `Approval` 表（记录挂起的人工审批，支持 `PENDING`, `APPROVED`, `REJECTED`）。

### 3.2 V9 对接策略
- 保持现有状态机与数据库模型不变；
- 引入增量工作流编排：
  1. `WF-Creative-01`：Amazon Creative Pack 生产流（产品图 → 白底转场景图 → 智能去背 → 尺寸裁剪）；
  2. `WF-Operation-01`：Listing Publish 自动化上架流（文案生成 → 合规质检 → 人工审批 → RPA 填报 → 状态回验）；
  3. `WF-05-Upgrade`：经营诊断行动闭环（Observe → Analyze → Diagnose → Recommend → Human Approval → Tool/RPA Execute → Verify）。

---

## 4. Worker / Queue 的任务执行方式分析

### 4.1 现有 Worker 实现
- 路径：`apps/worker/src/worker.service.ts` 与 `apps/worker/src/processors/agent-task.processor.ts`；
- 集成方式：连接 Redis (`@crosspilot/integrations` 的 `RedisService`)；
- 数据载荷：
  ```typescript
  export interface AgentTaskJobData {
    taskId: string;
    workspaceId: string;
    taskType: string;
    payload: Record<string, unknown>;
  }
  ```
- 结果返回：
  ```typescript
  export interface AgentTaskJobResult {
    taskId: string;
    success: boolean;
    result?: Record<string, unknown>;
    error?: string;
  }
  ```

### 4.2 V9 对接策略
- 长耗时任务（如批量文生图、视频生成、大批量搜索词挖掘、RPA 自动化表单填写）无需在 API 主进程同步阻塞；
- 复用现有 `apps/worker`，新增两类处理器：
  - `creative-task.processor.ts`：处理图片多尺寸渲染、去背与图生图；
  - `rpa-task.processor.ts`：调度 RPA 适配器执行长链路自动化发布，轮询或接收 Webhook 回调。

---

## 5. Integration 层的组织方式分析

### 5.1 现有组织
`packages/integrations/src/` 目前包含：
- `redis/redis.service.ts`：基于 `ioredis` 的缓存与键值操作；
- `vector/vector-store.interface.ts`：向量数据库标准契约；
- `vector/milvus-vector-store.ts`：Milvus 向量检索实现。

### 5.2 V9 RPA 增量扩展点
按 V9 规范在 `packages/integrations/src/` 中新增 `rpa/` 目录：
```text
packages/integrations/src/rpa/
├── rpa.interface.ts         # 统一 RPA 适配契约 (execute, cancel, getStatus)
├── rpa.registry.ts          # 多引擎注册表 (Yingdao, ShadowBot, Mock)
├── yingdao.adapter.ts       # 影刀 RPA 真实 HTTP/Webhook 适配器
├── mock-rpa.adapter.ts      # 本地/CI 确定性模拟适配器（用于无真实 RPA 账号时的自测与回归）
├── task.mapper.ts           # CrossPilot 业务载荷 -> RPA 任务字段映射
└── result.parser.ts         # RPA 运行日志与截图结果解析
```

---

## 6. 当前 Trace / Logging / Error Handling 分析

### 6.1 现有模型与字段
- **数据库 Trace 实体**：
  - `AgentTask`：记录 `id`, `workspaceId`, `userId`, `taskType`, `status`, `inputJson`, `resultJson`, `errorCode`, `errorMessage`, `startedAt`, `completedAt`；
  - `AgentStep`：记录 `taskId`, `stepNumber`, `stepType`, `name`, `status`, `inputSummary`, `outputSummary`；
  - `ToolExecution`：记录 `taskId`, `agentStepId`, `toolName`, `inputJson`, `outputJson`, `status`, `latencyMs`, `errorMessage`；
  - `Approval`：记录 `actionType`, `targetType`, `targetId`, `requestedPayload`, `status`, `requestedBy`, `approvedBy`, `comment`。
- **全局错误处理**：
  - `packages/shared/src/constants/error-codes.ts` 定义了业务错误码；
  - `apps/api/src/common/filters/http-exception.filter.ts` 提供统一结构化报错；
  - `apps/api/src/common/interceptors/transform.interceptor.ts` 提供统一 `{ code: 0, data, message: 'success' }` 响应包装。

### 6.2 V9 对齐方式
- V9 要求标准错误类别：`VALIDATION_ERROR`, `AUTH_ERROR`, `PERMISSION_DENIED`, `INTEGRATION_ERROR`, `TIMEOUT`, `RPA_ELEMENT_NOT_FOUND`, `HUMAN_REJECTED` 等；
- 将这些标准类别扩展至 `packages/shared/src/constants/error-codes.ts`，并让 `ToolExecution` 实体原样记录执行 trace。

---

## 7. Web 前端导航与页面结构分析

### 7.1 现有导航结构
文件：`apps/web/src/components/sidebar.tsx`
已具备 13 个功能页面：
1. `01 经营驾驶舱` (`/app/overview`)
2. `02 市场与选品` (`/app/market-research`)
3. `03 产品中心` (`/app/products`)
4. `04 竞品与 VOC` (`/app/competitors`)
5. `06 供应链与采购` (`/app/suppliers`)
6. `07 Listing 工作台` (`/app/listings`)
7. `09 广告运营` (`/app/advertising`)
8. `10 订单与履约` (`/app/orders`)
9. `11 库存 / FBA` (`/app/inventory`)
10. `12 评论与退货` (`/app/reviews`)
11. `13 利润中心` (`/app/profit`)
12. `14 AI 经营分析` (`/app/business-analyst`)
13. `15 架构与答辩` (`/app/architecture`)

### 7.2 V9 新增路由计划
在保持既有 13 个菜单不被破坏的前提下，在 Sidebar 对应位置平滑追加 V9 核心工作台：
1. **工具中心**：`/app/tool-center`（P0 - 统一呈现 Creative、Product Research、Operation、Data、Utility 五大类工具，动态 Form 输入与即时结果预览）；
2. **素材工坊**：`/app/creative`（P0 - 针对主图、白底变场景、智能去背、信息图与视频的专用创意工作台）；
3. **运营自动化**：`/app/operations/automation`（P0 - Listing Publish RPA 编排、关键词批量组合与出价自动化执行流水线）；
4. **经营洞察 / 深度诊断**：`/app/insights`（P1 - 扩展 WF-05 的推荐审批执行闭环）。

---

## 8. 哪些现有组件可以直接复用于 Tool Platform

经全面代码扫描，以下现有能力**无需重写，只需编写 Adapter/Wrapper 即可 100% 复用**：

1. **`ComplianceJudgeService.evaluateListing`**
   - 直接包装为工具 `compliance.listing.check`；
   - 输入：`{ title: string, bulletPoints: string[], description: string }`；
   - 输出：`{ status: 'PASS' | 'REJECTED', violations: Violation[], score: number }`。
2. **`AdOptimizerService.analyzeSearchTerm`**
   - 直接包装为工具 `advertising.searchterm.analyze`；
   - 输入：`{ searchTerm: string, impressions: number, clicks: number, spend: number, orders: number, sales: number }`；
   - 输出：`{ action: 'ADD_NEGATIVE_EXACT' | 'KEEP_MONITORING' | 'PROMOTE_TO_EXACT', reason: string, acos: number }`。
3. **`AdOptimizerService.recommendBidAdjustments`**
   - 直接包装为工具 `operation.bid.adjust`；
   - 输入：`{ campaignId: string, currentBid: number, targetAcos: number, currentAcos: number }`；
   - 输出：`{ recommendedBid: number, changeReason: string, deltaPercent: number }`。
4. **`ProfitCalculationService.calculateNetProfit`**
   - 直接包装为工具 `finance.profit.calculate`；
   - 彻底屏蔽浮点数误差，提供统一财务测算。
5. **`VarianceAttributionService.attributeVariance`**
   - 直接包装为工具 `bi.variance.attribute`；
   - 提供严密数学闭环的利润波动多因子归因。
6. **`InventoryPlanningService.calculateReplenishment`**
   - 直接包装为工具 `inventory.replenishment.calculate`；
   - 确定性输出断货风险等级、安全库存量与补货推荐单。
7. **`PurchaseOrderStateMachine.transition`**
   - 直接包装为工具 `supply.po.transition`；
   - 严格阻断非法的采购单逆向或跃迁操作。

---

## 9. Tool Platform 最小侵入式接入点

为了遵守“V8 已经实现，V9 禁止推倒重构”铁律，采用**外挂式适配层**，架构设计如下：

```text
                     [ 外部调用方 (Three Gateways) ]
           ┌─────────────────────┼─────────────────────┐
           ↓                     ↓                     ↓
       AI Agent              Tool Center           Workflows
     (自然语言提问)         (人工在网页单点点击)    (自动流/SOP批处理)
           │                     │                     │
           └─────────────────────┼─────────────────────┘
                                 ↓
                  [ @crosspilot/tool-platform ]
                  ├── ToolRegistry (内存单例 + Schema 校验)
                  ├── ToolExecutor (统一 Trace + 超时 + 降级)
                  └── ToolDefinitions (五大分类标准工具声明)
                                 │
           ┌─────────────────────┼─────────────────────┐
           ↓                     ↓                     ↓
    [ Domain Services ]    [ AI Services ]       [ Action Layer ]
    (现有纯函数计算引擎)    (文案/生图/Prompt)    (API/Python/RPA/Approval)
```

### 接入实现要点：
1. **新建独立包**：`packages/tool-platform`（自动纳入 pnpm workspace）；
2. **工具契约**：定义统一 `ToolDefinition<TInput, TOutput>` 接口，包含 `id`, `name`, `category`, `inputSchema`, `outputSchema`, `executor`；
3. **统一执行器**：`ToolExecutor.execute(toolId, input, ctx)` 统一负责：
   - Zod / JSON Schema 入参合法性校验；
   - 计时与生成 `traceId`；
   - 捕获异常并映射为 `ToolExecutionResult`；
   - 写入 `ToolExecution` 记录或持久化审计日志；
4. **NestJS 模块无缝挂载**：在 `apps/api` 中新增 `ToolCenterModule`，仅需注入 `ToolRegistry` 与 `ToolExecutor`，对外暴露：
   - `GET /api/v1/tools`：供前端 Tool Center 获取工具目录与输入 Schema；
   - `POST /api/v1/tools/:toolId/execute`：供前端或外部调度方同步/异步触发工具；
   - `GET /api/v1/tools/executions`：工具历史执行记录下钻。

---

## 10. 预计新增与修改目录清单 (Scope Matrix)

| 操作类型 | 路径 | 说明 | 是否影响旧代码 |
| :--- | :--- | :--- | :--- |
| **新增包** | `packages/tool-platform/` | Tool Platform 核心契约、注册表与统一执行器 | 否（纯增量） |
| **新增包** | `packages/actions/` | 动作执行层（AIAction, ApiAction, RpaAction, HumanApproval） | 否（纯增量） |
| **新增目录** | `packages/integrations/src/rpa/` | 影刀/Mock RPA 适配器、任务映射与结果解析 | 否（纯增量） |
| **新增模块** | `apps/api/src/modules/tool-center/` | 工具中心 Controller、Service 与 DTO | 否（纯增量） |
| **新增模块** | `apps/api/src/modules/creative/` | 素材工坊图像生成与处理模块（P0） | 否（纯增量） |
| **新增模块** | `apps/api/src/modules/operation-automation/`| 运营自动化与 Listing Publish RPA 模块（P0） | 否（纯增量） |
| **修改** | `apps/api/src/app.module.ts` | 挂载上述 3 个新增模块 | 否（仅追加导入） |
| **修改** | `apps/web/src/components/sidebar.tsx` | 追加 Tool Center、Creative Studio、Automation 侧边导航 | 否（仅追加链接） |
| **新增页面** | `apps/web/src/app/app/tool-center/page.tsx` | 工具中心 UI（分类过滤、Schema 表单、执行结果卡片） | 否（纯新增路由） |
| **新增页面** | `apps/web/src/app/app/creative/page.tsx` | 素材工坊 UI（多场景图、去背、尺寸规格批量处理） | 否（纯新增路由） |
| **新增页面** | `apps/web/src/app/app/operations/automation/page.tsx` | 运营自动化 UI（发布工作流、审批挂起与执行轨迹） | 否（纯新增路由） |
| **新增测试** | `packages/tool-platform/test/` | Tool Platform 单元测试与 Schema 校验测试 | 否（纯增量测试） |
| **新增测试** | `apps/api/test/tool-platform.integration.spec.ts` | 工具中心与 Action Layer 跨模块集成回归套件 | 否（纯增量测试） |

---

## 11. 阶段推进路线确认

依据 V9 升级方案约束，后续实施严格遵循以下阶段，每个阶段必须通过现有全量测试验证后方可进入下一阶段：

```text
【已完成】 Phase 0: 代码扫描与兼容性确认 (输出 V8_TO_V9_MAPPING.md，业务代码 0 修改)
      ↓
【即将执行】 Phase 1: Tool Platform 核心框架搭建与首批 5 个已有 Tool 包装接入
      ↓
【即将执行】 Phase 2: Tool Center 前端 (/app/tool-center) 与统一执行体验闭环
      ↓
【即将执行】 Phase 3: Creative Studio (P0: 生成图、生活图、去背、尺寸裁剪与 Amazon Creative Pack)
      ↓
【即将执行】 Phase 4: Action Layer 建设与 RPA 适配器对接 (Yingdao + Mock)
      ↓
【即将执行】 Phase 5: Operation Automation (P0: Amazon Listing Publish 自动化流水线 + 人工审批)
      ↓
【后续规划】 Phase 6: Business Intelligence 闭环 (WF-05 升级)
      ↓
【后续规划】 Phase 7: Product Research & Customer Service Lite
```
