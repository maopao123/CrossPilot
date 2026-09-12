# Code Review Result — CrossPilot V9

- 审查日期：2026-09-11
- 审查基线：`docs/90_historical/CrossPilot_V9_FINAL_完整无损融合版_代码审查基线.md`（§339 审查规则；冲突以 Part II §338.* 为准）
- 审查范围：apps/api、apps/web、apps/worker、packages/{db,domain,shared,tool-platform,actions,integrations}、infra、docker-compose、CI、测试

**Overall: FAIL**

存在多条 P0 Blocker（跨 Workspace 泄漏、高风险 Action 无审批门、双写/双扣、写死经营数字冒充确定性计算），且 AI 业务脊柱（VOC→Listing→Analyst→Trace）当前整体为写死实现。构建与既有测试全绿（见 Verification），但绿测试中有固化错误期望值的用例。

## P0 Blockers

1. **跨 Workspace 数据泄漏（多点、确定性）**
   - `market`、`advertising` 两个模块完全未挂 `WorkspaceGuard`，且 service 层 `where = workspaceId ? { workspaceId } : {}`——不传 workspaceId 即返回**全部 workspace** 数据：`apps/api/src/modules/market/market.controller.ts:4-31`、`market.service.ts:51,76,139`、`advertising/advertising.controller.ts:4-28`、`advertising.service.ts:10,83-84`（`getNegativeRecommendations` 完全无过滤）
   - `apps/api/src/modules/analyst/analyst.service.ts:10`（waterfall findFirst 无 workspace 条件）、`apps/api/src/modules/agent-task/agent-task.service.ts:18-20,43`、`apps/api/src/modules/listing/listing.service.ts:10`（按 skuId 查 Listing 无 workspace 校验，IDOR）
   - 根因：`WorkspaceGuard` 未注册为全局 APP_GUARD，仅 7/17 个 controller 手挂（`apps/api/src/app.module.ts:55-68`）；且 `apps/api/src/common/guards/workspace.guard.ts:27-30` 无 workspaceId 时直接放行，Prisma 对 `undefined` 退化为全表查询
   - 基线：§29、§41、§112；§339 P0「跨 Workspace 数据泄漏」

2. **高风险 Action 审批门形同虚设**
   - `apps/api/src/modules/operation-automation/operation-automation.controller.ts:11-36` 三个端点全 `@Public()`，客户端传 `autoApprove: true` 即跳过 Human Gate 直接执行 RPA 发布（`operation-automation.service.ts:121,135,186-189` 无条件 `isApproved: true`）；`POST /operations/approve/:approvalId` 无鉴权、无落库、无 workspace 归属校验
   - `operation.listing.publish` 作为 Action Tool 注册进统一 Registry，经 `POST /tools/:id/execute` 无审批直接执行，并返回**伪造的** `PUBLISHED_SUCCESS` + Feed ID（`packages/tool-platform/src/tools/operation-automation.tools.ts:71-139`）
   - `apps/api/src/modules/advertising/advertising.controller.ts:23-28` `apply-negative` 直接落库 AdTarget，不校验 campaign 归属（`advertising.service.ts:115-130`）
   - 基线：§106、§210、§212；§339 P0「高风险 Action 未审批」

3. **Tool Center 全公开端点 + workspace 伪装**：`apps/api/src/modules/tool-center/tool-center.controller.ts:16,22,28,34` 全 `@Public()`，execute 的 workspaceId 取自请求体、缺省硬编码 `'ws_default_001'`（`:40`）；`ToolDefinition.permissions` 字段定义了但 Executor 全流程无 Permission Check（`packages/tool-platform/src/executor/tool.executor.ts:50-108`）。基线：§213、§338.6 6.3

4. **重复执行导致双写/双扣/双提交**
   - `apps/api/src/modules/order/order.service.ts:93-276`：扣库存→建单→写利润全程无 `$transaction`、无 Idempotency-Key，重复提交即双扣库存双计利润
   - `apps/api/src/modules/purchase/purchase.service.ts:221-287` Receive PO：库存 upsert、PO item、PO 状态多次独立写，部分失败无回滚（违反 §103 事务边界）；ship 同样无事务（`:169-200`）
   - `packages/actions/src/action.router.ts:17-66` 无 operationId/幂等概念，审批重复点击即重复 RPA 提交（§214）
   - `apps/api/src/modules/profit/profit.service.ts:127-198` createReturn 无幂等可重复累加 returnLoss

5. **业务事实/资金数据错误**
   - **Reorder 公式缺 SafetyStock 项**：`packages/domain/src/inventory/inventory-planning.service.ts:48-52` 推荐量未加安全库存，基线 §194.3 为 `TargetCoverageDemand + SafetyStock − Available − Inbound`；自带测试把错误值 330 固化为期望（正确应为 470）——公式性错误且被测试锁定
   - **审批后价格被篡改**：`apps/api/src/modules/operation-automation/operation-automation.service.ts:158` `approveAndExecute` 硬编码 29.99，丢弃用户提交的 targetPrice——审批内容与实际执行载荷不一致
   - **真实订单利润用写死参数**：`apps/api/src/modules/order/order.service.ts:201-213`（unitCost 回退 8.5、referral 0.15、fbaFee 4.5）直接落 `profitDaily` 事实表

6. **关键经营数字为伪造，冒充确定性计算/真实执行**（§131 禁止项的系统性命中）
   - `apps/api/src/modules/analyst/analyst.service.ts:22-23,116-184`：`askAnalyst` 完全忽略 question，五个「toolExecutions」从未执行，answer/actionPlan 全字面量；previousProfit 按 totalVariance 正负号瞎猜 4120/4000
   - `apps/api/src/modules/agent-task/agent-task.service.ts:84-168`：SSE Trace 为 setTimeout 播放的预制脚本（注释自述 simulating）
   - 前端：`apps/web/src/app/app/business-analyst/page.tsx:344-349` 默认渲染 5 条写死的假 Tool 轨迹；`apps/web/src/app/app/operations/automation/page.tsx:43-218` API 失败时纯前端伪造整条发布流水线（假审批通过、假 Feed ID）；`apps/web/src/app/app/profit/page.tsx` 8 处写死回退资金数据；`apps/web/src/app/app/tool-center/page.tsx:363-398` 离线时**浏览器自算** refFee/netProfit/margin 冒充 Tool 输出
   - 基线：§131（7305-7337）、§16.1「绝不让 LLM 自己估算金额」、§339 P0「LLM 直接生成并落库关键经营数字」的等价违规

7. **任意已认证用户可清空任意 Workspace 全部业务数据**：`apps/api/src/modules/scenario/scenario.controller.ts:23-36` reset 端点仅要 JWT，按客户端 workspaceSlug 执行 40+ 表 deleteMany（`scenario.service.ts:81-124`），无 Role 校验。基线：§112、§29

8. **JWT 密钥硬编码兜底**：`apps/api/src/modules/auth/jwt.strategy.ts:13-14`、`auth.module.ts:12-13` `|| 'crosspilot_jwt_secret_key_change_me_in_production'`，公网漏配即全量鉴权可伪造；另有 `docker-compose.yml:110-111` 把生产 JWT_SECRET/SESSION_SECRET 提交进仓库（§244「Secret 不进 Git」）

## P1 Major

1. **8 个 controller 路由双前缀**：`apps/api/src/main.ts:17` 已 `setGlobalPrefix('api/v1')`，market/agent-task/advertising/scenario/analyst/listing/eval 又写 `@Controller('api/v1/...')` → 实际 `/api/v1/api/v1/...`，契约路径 404，且两套风格并存（§77）
2. **第二套 Workflow 基础设施（触红线 8）+ 不可 Retry/Resume**：`apps/api/src/modules/operation-automation/operation-automation.service.ts:34` 内存 workflow runner 重启即丢 WAITING_APPROVAL；worker processor 为空壳直接返回 success（`apps/worker/src/processors/agent-task.processor.ts:15-30`）；Redis 故障时 worker 静默降级仍谎报 running（`apps/worker/src/worker.service.ts:24-29,69-74`）
3. **Listing 生成不 Grounding**：`apps/api/src/modules/listing/listing.service.ts:60-77` title/bullets 全硬编码（含 "Oral-B/Sonicare 兼容" 等），与 SKU Facts 无关，注释自称 "Fact-grounded"；无 `claims[].factIds`（§189/§190）
4. **Compliance 状态契约错误且已扩散**：`packages/domain/src/compliance/compliance-judge.service.ts:51,115` 用 `REJECTED` 而非 `BLOCK`，无 `INSUFFICIENT` 路径（违反 §9「证据不足不能强行判定」）；消费方 eval/operation-automation 已按错误契约编写
5. **利润计算违反「禁止 Float」**：`packages/domain/src/profit/profit-calculation.service.ts:60-101` 全程 JS number 累加（§101.1 核心规则）；`packages/domain/src/scenario/scenario-generator.ts:207,256,293` 内联复制利润公式，同包两套公式漂移风险
6. **Variance 归因杠杆只实现 5/9 类**：`packages/domain/src/variance/variance-attribution.service.ts:19-25` 缺 Revenue/COGS/FBA Fee/Freight/Promotion（§198、§101.8）；因子拆解全部依赖外部传入，服务本身不拆解
7. **DB 异常时静默返回编造经营数字**：`apps/api/src/modules/profit/profit.service.ts:41-60,235-248`、`order.service.ts:38-64`、`inventory.service.ts:18-33,69-70`（缺数据时 fulfillable=450/ADS=8.5 写死再算补货）、`product.service.ts:37-91,234-254`（SKU 360 profitSummary 虚构参数）、`market.service.ts:9-24,46,66-71`——破坏 PostgreSQL SoT 且错误不可 Trace
8. **审批/执行溯源失真**：`packages/actions/src/action.router.ts:8,25-37` 仅信任调用方 `isApproved` 布尔，审批不落库；`apps/api/src/modules/tool-center/tool-center.service.ts:104-125` ToolExecution 挂到「该 workspace 最新一条 task」（张冠李戴），`catch {}` 吞错，内存 buffer 仅 50 条
9. **同一能力两套实现**：listing publish 同时存在于 Tool（无审批、伪造成功）与 Workflow 路径（有审批）——正是 §2.2 明令禁止的模式
10. **鉴权/隔离在故障时静默降级为伪造身份**：`apps/api/src/modules/auth/auth.service.ts:174-201` DB 离线时用真密钥签发幽灵 token（role 取客户端值）；`apps/api/src/modules/workspace/workspace.service.ts:136-145` catch 后返回硬编码 `ws_demo_preview` + OWNER
11. **Eval 两套并存且已漂移**：`scripts/run-evals.cjs`（7 用例）与 `apps/api/src/modules/eval/eval.service.ts:45-153`（5 用例）重复实现且断言不一致；`/eval/benchmarks` 元数据宣称 10 用例实跑 5 个
12. **全库 DateTime 无 TIMESTAMPTZ**（§62 系统性违规）；**AgentTask.status 默认 `COMPLETED`**（`packages/db/prisma/schema.prisma:1036`，应为 PENDING，且缺 WAITING_APPROVAL/CANCELLED；同款问题在 VocAnalysisRun/MarketResearchProject/LaunchAction/EvalRun）
13. **异常过滤器外泄内部错误**：`apps/api/src/common/filters/http-exception.filter.ts:46-47` 非 HttpException 原样返回 `exception.message`；controller 手动 `Schema.parse` 的 ZodError 全部落成 500 而非 400 VALIDATION_ERROR（§77/§111）
14. **RPA 默认静默走 mock**（`packages/integrations/src/rpa/rpa.registry.ts:9,22`、`yingdao.adapter.ts:25` 无 key 静默 fallback），无运行模式标识——演示中「已发布」可能是 mock_job
15. **PO 状态机与基线不符**：缺 PRODUCTION/INSPECTION/FBA Received（§7、§88）；receive 可为不在 PO 上的 SKU 注入库存、receivedQuantity 覆盖式写入无超收校验（`apps/api/src/modules/purchase/purchase.service.ts:221-272`）
16. **前端三页绕过 ApiClient 裸 fetch**（无 token/workspace 头、body 写死 `ws_default_001`）：`apps/web/src/app/app/tool-center/page.tsx:331-338`、`creative/page.tsx:78-82`、`operations/automation/page.tsx:117-125`——与后端 `@Public` 互为表里
17. **全局 SKU/日期上下文机制缺失**：TopBar 写死 Active SKU 与日期（`apps/web/src/components/top-bar.tsx:57-73`），无 URL State，Inventory 页永远请求写死 SKU（`apps/web/src/app/app/inventory/page.tsx:21-24`）；SSE 事件契约 `data.type==='TASK_COMPLETE'` 与基线 `event`/`task.completed` 不一致（§110，前后端必有一方需改）

## P2 Minor

- §65 核心索引多处缺项（order_items(sku_id)、orders(workspace_id,ordered_at)、reviews 复合索引、agent_tasks/tool_executions 复合索引等）
- 派生指标落库（`SearchTermMetricDaily.acos`、`InventorySnapshot.daysCover`），与 §64 Derived Data 原则相悖
- JSON 字段全用 `String @db.Text` 而非 JSONB；部分金额事实表缺 `currency_code`；`ReturnRecord.skuId` 无外键；Review 缺 `external_review_id` 幂等键；`returns` 表名与基线 `return_records` 不符
- 分页/排序规范未落地（无 page/pageSize/sortBy，§78.1/78.3）；状态机抛裸 Error 不映射错误码；无全局 ValidationPipe
- CORS `origin:true+credentials:true`；demo 密码硬编码源码；登录不校验 user.status；JwtStrategy 不回查库（7 天 token 期内权限变更不生效）；requestId 成功/错误响应各生成一个不可关联；register 公网开放无开关
- HealthService 绕过 DI 直接 new 依赖；`degraded` 掩盖故障级别；`docker-compose.yml` 生产默认 `DEMO_MODE:"true"`；`infra/docker/` 仅 3 行占位 README
- 「集成测试」全部 mock Prisma 不触真实 DB（§229 名不副实）；CI 起了 postgres/redis 服务但测试不连接
- ActionRouter 对 API/PYTHON/AI/BROWSER 类型假执行直接回显 `executed:true`；`ad-optimizer.service.ts:39` sales=0 时 ACOS 固定 1.0 丢信息；`advertising.service.ts:107` `savingsProjectedMonthly = spend*4` 拍脑袋系数；`variance` formulaString `toFixed(0)` 丢分位
- 前端：死链（/app/reviews、/app/skus）、乱码按钮「新建旡牝」、无效 class、浏览器端自行聚合 margin/ACOS、四态设计缺失（错误仅 console.error + 写死回退掩盖）、未采用 TanStack Query / RHF+Zod、无路由守卫、Sidebar IA 无分组缺入口、AI Copilot 仅静态标签
- ADS 计算在 API 层且窗口 30 天（基线 §194 默认 N=14，应在 Domain）；`creative.service.ts:36-37` SKU 查不到静默回退继续生成；Registry 重复注册仅 console.warn 覆盖；Executor 把 `err.stack` 泄进响应；`finance.profit.calculate` 使用 schema 未声明的隐式入参 quantity

## Architecture Compliance

- **符合**：依赖方向无倒置（web→api→packages；domain 不依赖 integrations/actions）；无任何 Controller 直查 Prisma；**单一计算源**——tool-platform 全部计算类 Tool 委托 `@crosspilot/domain`，未发现同一计算在三轨各写一份（唯一反例是 listing publish 两套，见 P1-9）；RPA 厂商（影刀）封装在 integrations，未泄漏进 Domain；统一 Tool Contract/Registry/Executor 骨架符合 §338.6；统一响应包装 `{data,meta,requestId}` 与错误包装格式符合 §77；全局 JwtAuthGuard + @Public 白名单机制本身正确；金额字段全 Decimal 无 Float 列；关键防双写唯一约束齐备（orders/skus/inventory_balances/profit_daily/ad_metrics_daily）
- **不符合**：WorkspaceGuard/权限校验覆盖面失守（P0-1/2/3）；内存 workflow runner 属第二套基础设施（红线 8）；业务规则散落 API 层（金额合计、ADS 计算、幽灵身份）；无 Repository 层（§75.4 为推荐，记观察项）

## Regression Risk

- V8 冻结区未见推倒式重构（红线 1/2/3/5/6 未触）；核心交易链（PO confirm/ship/receive→库存+、Order→库存−、Return→Profit 重算）有 Domain 服务与状态机保护，属真实打通
- 高风险回归点：① Compliance 状态契约改名（REJECTED→BLOCK）需联动 eval.service、operation-automation；② 修 Reorder 公式必须同步改固化了错误期望值的测试；③ 收紧 WorkspaceGuard 全局化后，market/advertising/tool-center 等模块与前端三个裸 fetch 页面需同步改造，否则全 401/403；④ 撤掉各 service 的假数据回退分支后，前端大量写死 fallback 会暴露为空态——前后端需一起改

## Missing Against CrossPilot V9 FINAL

- **真实 LLM/Agent 链路完全缺失**：全库无 OpenAI/Anthropic 客户端；Listing/VOC/Analyst「AI」全为硬编码；无 Prompt 模板与版本（§200-206）；无 LLM 结构化输出校验；§35/§132 的 AI 验收条目不成立
- **Read Tool Catalog P0 几乎全缺**（§211）：14 个 Tool 全是纯计算/生成型，无任何从 PostgreSQL 读业务事实的 Read Tool——Agent 经 Tool 获取事实的通道不存在；Agent 入口未接线（无 `source:'AGENT'` 调用方）
- **Schema 缺口**：`SkuCostProfile`（§54.1，利润输入无表承载）、`profit_calculation_runs`（§54.3，公式版本不可审计）、`AuditLog`（§60，模型与写入点全缺）；**无 migrations 目录**，schema 落库不可重复（§249 硬缺口）
- **Demo Seed 几乎全部缺失**（§66/§232-238）：无大理石牙刷架三 SKU、竞品、300-800 条 Review、90 天订单、Green 断货/退货率事件、E01-E10 时间线、§235 不变量自检
- **Compliance L2（Policy RAG）/L3（Evidence Judge）与 Evidence Gate 缺失**（§191-192）；WF-01/02/04 工作流本体缺失；Inventory ROI/Landed Cost/Break-even ACOS/What-if 引擎缺失（§6.2/6.3）
- **Worker §114 任务类型全缺**（8 类任务无枚举无 processor，API 端无 enqueue）；Golden Dataset/Tool Selection Eval/Regression Gate 未建且未接 CI（§219-226）；无 Playwright E2E、无 CD workflow
- **Rate Limit（§254）、结构化日志（§261）、Error Tracking（§262）、RolesGuard（§112 高风险 Role 检查）全缺**
- **前端整页缺失**：/app/profit-calculator（§147）、/app/agent-tasks Trace 页（§158）、/app/reviews（§155，sidebar 已挂死链）、/app/products/[id]、/app/purchase-orders/[id]、/app/launch、/app/knowledge、/app/eval；Listing Studio 缺 Context Panel/SSE 进度/版本 Compare；Overview 缺趋势图/风险卡片/AI Insight
- **API 契约缺口**：§82 market-research 异步任务、§84 VOC analyze、§86 profit/calculate 预览、§91 campaigns 契约路径、§93 convert-to-po、§95 profit/recalculate、§78.4 幂等框架等

## Fix Order

1. **安全收口（P0-1/2/3/7/8）**：WorkspaceGuard 提升为全局 APP_GUARD；摘除 operation-automation/tool-center/creative 的 `@Public`；scenario reset 加 Role 校验；移除 JWT 硬编码密钥并启动期强校验；清除 compose 中提交的 secret
2. **审批与幂等落地（P0-2/4）**：Approval 落库 + dispatch 校验真实审批记录；ActionRouter 加 operationId；删除伪造发布成功的 `operation.listing.publish` Tool，统一到 Workflow 路径（顺带消掉 P1-9 两套实现）
3. **交易事务（P0-4）**：createOrder / Receive PO / shipPO / createReturn 包 `$transaction`；Receive PO 补 Inventory Snapshot + Audit Log
4. **公式修正（P0-5）**：Reorder 补 SafetyStock（同步改测试期望值）；利润计算改 Decimal 路径；移除 order/SKU360/库存补货中的全部硬编码经营参数
5. **拆除假数据（P0-6，P1-3/7）**：analyst 接真实 Domain/Tool；SSE 接真实 task 事件；前后端全部写死回退改为 §166 四态（Error/Empty 显式展示）；Listing 接 Grounding
6. **契约对齐**：路由双前缀、Compliance 状态枚举（BLOCK/INSUFFICIENT）、PO 状态机补齐、SSE 事件契约、AgentTask 默认状态、TIMESTAMPTZ 迁移
7. **Missing 补齐按 Phase 顺序**：SkuCostProfile/AuditLog/migrations + Demo Seed → Read Tool Catalog → Worker 接线 → LLM/Prompt 层 → 缺失页面

## Verification

- `pnpm -r build`：全部 packages + apps（含 Next.js）**构建成功**
- `pnpm --filter @crosspilot/domain test`：**8 套件 15 用例全过**（注意：inventory-planning spec 固化了 P0-5 的错误期望值，绿≠正确）
- `pnpm --filter @crosspilot/api test`：6 套件 25 用例全过（但「集成测试」全 mock Prisma，未触真实 DB）
- `pnpm --filter @crosspilot/worker test`：2 用例全过；`node scripts/run-evals.cjs`：7/7 PASS（与 eval.service 存在断言漂移，见 P1-11）
- CI 骨架（lint→typecheck→test→build）存在但无 Regression Gate 步骤；docker-compose 含 postgres/redis/milvus/etcd/minio 且 healthcheck 齐备；seed.ts 全 upsert 幂等

---

**一句话结论**：工程骨架（分层、单一计算源、防双写唯一约束、构建测试链路）方向正确且链 1 真实打通；但安全边界（workspace 隔离、审批门、密钥）多处失守，且当前 Demo 的 AI 展示面（Analyst/Trace/Listing/发布流）系统性地以写死数据冒充真实执行——这正是基线 §131 明令禁止、面试验真时最先被戳穿的部分。建议按 Fix Order 先修安全与公式，再拆假数据。
