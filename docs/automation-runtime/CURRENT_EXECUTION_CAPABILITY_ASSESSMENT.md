# CrossPilot 当前自动化执行能力审计与缺口评估报告
## Current Execution Capability Assessment (Phase 0)

> **项目**：CrossPilot  
> **依据方案**：`CrossPilot_Automation_Reliability_Observability_Implementation_Plan_V2.md`  
> **代码库根路径**：`/Users/zls/AiSecondBrain/vault/Work/Projects/CrossPilot`  
> **审计基线 HEAD**：`4758bc5`（当前主分支）  
> **审计日期**：2026-09-19  
> **审计状态**：✅ **Phase 0 完成，执行环境已就绪，等待人工复核确认**  
> **核心原则**：**增强现有 Automation Runtime，不重建，不重复造轮子，保留所有已验证能力。**

---

## 1. 核心结论与执行摘要 (Executive Summary)

依据《CrossPilot 自动化可靠性 + 可观测性实施方案 V2》要求，我们对 CrossPilot 代码库实施了全面的深层代码级扫描与执行链路审查。

### 1.1 核心发现
1. **统一 Execution Domain 已由 `AutomationOperation` 承载**：
   - 数据库模型 `model AutomationOperation`（`packages/db/prisma/schema.prisma:1844-1877`）已完整包含状态机（`phase`）、副作用（`effect`）、恢复策略（`recovery`）、幂等键（`idempotencyKey`）、OCC 乐观并发版本号（`version`）、租约恢复（`leaseOwner`, `leaseUntil`）、重试计数（`attemptCount`, `nextAttemptAt`）、载荷防篡改哈希（`payloadHash`, `approvedPayloadHash`）及证据（`evidence Json`）。
   - **绝对禁止新建第二套 `Execution` 主表。**

2. **后台恢复与 Worker 运行时已稳定运行**：
   - `apps/worker/src/worker.service.ts` 集中管理 5 大 BullMQ 队列与 Worker：`crosspilot-tasks`、`crosspilot-simulator-tick`、`crosspilot-closed-loop-v2`、`crosspilot-outcome-evaluator` 和 `crosspilot-automation-recovery`。
   - `automation-recovery.processor.ts` 已实现租约认领、远端反查比对、载荷防篡改比对、本地单据回写、指数退避重试与 `NEEDS_ATTENTION` 升级。
   - **绝对禁止重建 Worker 框架或重复注册队列。**

3. **真正的技术缺口集中在 5 个方向**：
   - ❌ **错误分类未统一**：Adapter 与 Worker 散落着私有错误与字符串前缀判断（如 `startsWith('CONFIG_ERROR')`、`errorCode === 'NOT_FOUND'`），缺乏统一的 `NormalizedExecutionError` 与 `ExecutionErrorClass`。
   - ❌ **Timeout 与 AbortSignal 未连通**：Shopify 的 `fetch` 缺乏任何超时与 `AbortSignal`；Playwright 仅有内部定时器且无取消连通；ERP 内部有 `AbortController` 但不可由外部调用方协同取消。
   - ❌ **结构化日志与指标完全缺失**：全库有 169 处原始 `console.log/warn/error`，未安装 Pino/Winston；`prom-client` 未引入，零运行指标与 `/metrics` 端点。
   - ❌ **执行尝试历史 (Attempt History) 与人工审计流 (Audit Trail) 未表化**：每次重试会覆盖 `AutomationOperation` 上的错误与证据，无法还原每次尝试的耗时/Worker/错误；人工 `resolveNeedsAttention` 仅追加在 JSON 内，缺乏不可变审计表。
   - ❌ **统一 Execution Center 前端页面缺失**：`apps/web` 下仅有演示性质的 `operations/automation`（单流程固定 Demo），缺乏全局执行列表、多维筛选、执行详情抽屉、真实 Timeline、Evidence 查阅器与人工干预工作台。

---

## 2. 当前真实调用链全貌 (Current Execution Call Chains)

当前 CrossPilot 包含三条并行的执行链路：

```
                              [Agent / User / Workflow]
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  │                       │                       │
           [1. RPA Listing]       [2. ERP Procurement]    [3. Shopify Read]
                  │                       │                       │
      ListingPublishWorkflow              │              resolveCommerceAdapter
                  │                       │                       │
         Human Approval Gate              │                 ShopifyAdapter
                  │                       │                       │
          ActionRouter.dispatch           │             Client Credentials OAuth
                  │                       │                       │
        PlaywrightRpaAdapter              │             GraphQL Admin API 2026-07
                  │                       │                       │
         ListingUpdateWorkflow            │             ChannelIdentity Mapping
                  │                       │              (Product/Variant/SKU)
           Headless Chromium              │                       │
                  │                       │             channel_identities (DB)
          Read-back Verify                │                       │
                  │                       │              [WRITE_FORBIDDEN]
          ActionExecutionResult           │
                  │                       ▼
                  │           AutomationOperationStore
                  │           .createOrReplay()
                  │                       │
                  │              AutomationOperation (DB)
                  │              Unique: (ws, conn, kind, key)
                  │                       │
                  │           BullMQ Repeatable Sweep
                  │           (crosspilot-automation-recovery)
                  │                       │
                  │           automation-recovery.processor
                  │                       │
                  │              claim(OCC Lease 30s)
                  │                       │
                  │           Remote Reality Check (Query)
                  │                       │
                  │           Payload Verification (D-R1)
                  │                       │
                  └──────────────► Local DB Sync / Evidence
                                          │
                               COMPLETED / NEEDS_ATTENTION
```

### 链路 1：Amazon RPA 上架发布链路 (`ActionRouter` + `PlaywrightRpaAdapter`)
- **入口**：`OperationAutomationService.startListingPublishWorkflow()` -> 创建 `Approval` 记录并落库标准 SHA-256 `payloadHash`。
- **审批**：`approveAndExecute()` 强校验 `targetId`、`actionType`，核验权限（`OWNER`/`ADMIN` 严格 Fail-Closed），阻断 Demo 载荷进入 LIVE，解耦重构执行参数。
- **分派**：`ActionRouter.dispatch()` 校验内存幂等缓存、校验已审批载荷不可变绑定（`verifyApprovedPayloadBinding`）、模式隔离（MOCK/LIVE）。
- **执行**：`PlaywrightRpaAdapter.execute()` -> 调度 `ListingUpdateWorkflow.run()` 启动 Headless Chromium、DOM 交互、输入参数、保存。
- **验真**：页面重载回读验真（Read-back Verify）提取真实 SKU/Price，抓取前后截图（PNG > 35KB），保存 `trace.zip`，回传 `ActionExecutionResult`（`isVerified ? 'COMPLETED' / 'APPLIED' : 'SUBMITTED' / 'UNKNOWN'`）。

### 链路 2：ERP 采购单自动化与自愈链路 (`AutomationOperationStore` + `automation-recovery.processor`)
- **入口**：采购单动作调用 `AutomationOperationStore.createOrReplay()`，在数据库层依据 `(workspaceId, connectionId, operationKind, idempotencyKey)` 实施严格幂等插入。
- **后台扫描**：`worker.service.ts` 注册 BullMQ 重复任务 `automation-recovery-sweep`（默认每 5 分钟），调用 `processAutomationRecovery()`。
- **认领租约**：`AutomationOperationStore.claim()` 基于 OCC 乐观锁更新 `version = version + 1`，占用 30 秒租约。
- **远端反查**：针对 `SUBMITTED`/`VERIFYING`/`QUERY` 状态，调用 `adapter.getPurchaseOrder()` 查证远端实际状态。
- **真实性对账 (D-R1)**：若远端存在，严格比对 `supplierId`、`totalAmountMinor`、`totalQuantity`：
  - 若内容不符：立即置入 `NEEDS_ATTENTION`，`errorCode: 'REMOTE_PAYLOAD_MISMATCH'`，拦截本地入库；
  - 若内容相符但本地入库失败：进入 `NEEDS_ATTENTION`，`errorCode: 'LOCAL_SYNC_FAILED'`；
  - 若远端确不存在（`NOT_FOUND`）：在 `attemptCount < 3` 时安排指数退避重试（`READY`/`RETRY`），达 3 次则升级 `NEEDS_ATTENTION`；
  - 若网络超时：保持 `SUBMITTED`/`QUERY`，`effect: 'UNKNOWN'`。

### 链路 3：Shopify 官方 API 读取与多变体映射链路 (`ShopifyAdapter`)
- **入口**：`resolveCommerceAdapter(prisma, 'shopify')` 产出 `ShopifyAdapter`。
- **认证**：通过 Client Credentials Grant OAuth 换取 Access Token，支持 24 小时内存安全缓存。
- **GraphQL**：直连 Shopify Admin GraphQL API（2026-07），全量游标分页拉取 Products / Variants / Inventory / Orders。
- **标识对齐**：精确解耦 Product GID（`entityType: 'product'`）与 Variant GID / SKU（`entityType: 'offer'`），写入 PostgreSQL `channel_identities` 表，彻底根治多变体覆写缺陷。写操作严格 `WRITE_FORBIDDEN`。

---

## 3. 必须检查组件审查盘点 (13 项核心组件定位)

| 序号 | 检查项 | 实际物理文件路径 | 当前代码状态与职责 |
|------|--------|----------------|-------------------|
| 1 | `AutomationOperation` | `packages/db/prisma/schema.prisma:1844-1877` | ✅ **统一执行实体**。包含完整状态字段，已与 `Workspace`、`PlannedAction` 外键关联。 |
| 2 | `AutomationOperationStore` | `packages/db/src/automation/automation-operation-store.ts` | ✅ **完整持久化层**。支持 `createOrReplay`、OCC `claim`、`recordEvidence`、`listDue`、`listNeedsAttention`。 |
| 3 | `ActionRouter` | `packages/actions/src/action.router.ts` | ✅ **核心分派网关**。集成 Human Gate、进程内幂等缓存、审批不可变绑定、LIVE 模式守卫、RPA 适配器调度。 |
| 4 | `automation-recovery.processor` | `apps/worker/src/processors/automation-recovery.processor.ts` | ✅ **自愈与重试处理器**。租约扫描、远端反查、载荷比对、本地单据同步、退避重试、升级 `NEEDS_ATTENTION`。 |
| 5 | `worker.service` | `apps/worker/src/worker.service.ts` | ✅ **统一 Worker 服务**。基于 BullMQ 管理 5 个并发/定时队列，包含 `crosspilot-automation-recovery`。 |
| 6 | `Shopify Adapter` | `packages/db/src/commerce/shopify-adapter.ts` | ✅ **真实 GraphQL 适配器**。2026-07 协议、OAuth 凭证置换、游标分页、多变体映射、写保护。 |
| 7 | `Playwright Adapter` | `packages/integrations/src/rpa/playwright.adapter.ts` | ✅ **真实浏览器适配器**。POM 模式、截图取证、回读验真、`trace.zip` 打包、17 国 Seller Central 域名白名单。 |
| 8 | `ERP Adapter` | `packages/integrations/src/erp/http-erp.adapter.ts` | ✅ **外部 ERP HTTP 适配器**。`createPurchaseOrder`、`getPurchaseOrder`、`receivePurchaseOrder`，具备内部超时与状态码转换。 |
| 9 | `Outcome Tracking` | `packages/domain/src/outcome/` & `apps/worker/src/processors/outcome-evaluator.processor.ts` | ✅ **业务闭环效果评估**。7/14/30 天业务指标窗口评估，独立于执行层。 |
| 10 | `Trace` | 贯穿各层上下文（`ActionDispatcherContext`, `ToolExecutionContext` 等） | ⚠️ **部分实现**。有 `traceId` 字符串在调用链传递，但 `AutomationOperation` 表未设单独索引列，无全局 Trace 追踪框架。 |
| 11 | `Evidence` | `packages/shared/src/contracts/automation-contracts.ts` & 各执行器 | ⚠️ **部分实现**。存为 JSON，包含截图与 trace 路径，但**缺乏统一 JSON Schema 校验，缺乏自动敏感信息脱敏 (Redaction)**。 |
| 12 | `NEEDS_ATTENTION` | `automation-contracts.ts` & `automation-recovery.processor.ts` | ✅ **已作为业务 DLQ 运行**。重试超限（>=3）、远端比对冲突、本地落库失败均精准沉淀至此状态。 |
| 13 | `resolveNeedsAttention` | `apps/api/src/modules/operation-automation/operation-automation.service.ts:683-850` | ⚠️ **部分实现**。支持 `FORCE_ADOPT`、`DISMISS`、`RETRY_SYNC`，但审计记录仅覆写于 `evidence.manualResolution`，无独立 Audit 表。 |

---

## 4. 核心问题深度回答 (5.2 必须回答)

### 4.1 Execution：AutomationOperation 当前完整状态机是什么？
`AutomationOperation` 采用 **Phase × Effect × Recovery** 三维正交状态机（定义于 `packages/shared/src/contracts/automation-contracts.ts`）：

```text
               ┌────────────────────────────────────────┐
               │                 READY                  │
               │        (effect: NOT_APPLIED)           │
               └───────────────────┬────────────────────┘
                                   │
                                   ▼
               ┌────────────────────────────────────────┐
               │               SUBMITTED                │
               │            (effect: UNKNOWN)           │
               └───────────────────┬────────────────────┘
                                   │
                                   ▼
               ┌────────────────────────────────────────┐
               │               VERIFYING                │
               │            (effect: UNKNOWN)           │
               └───────┬────────────────────────┬───────┘
                       │                        │
       [Verify Success]│                        │[Mismatch / Exceeded / Conflict]
                       ▼                        ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│          COMPLETED           │        │       NEEDS_ATTENTION        │
│       (effect: APPLIED)      │        │  (recovery: MANUAL/REAUTHOR) │
│       (recovery: NONE)       │        └──────────────┬───────────────┘
└──────────────────────────────┘                       │
                                                       │ [Manual Resolve]
                                       ┌───────────────┴───────────────┐
                                       ▼                               ▼
                         FORCE_ADOPT / RETRY_SYNC                   DISMISS
                                       │                               │
                                       ▼                               ▼
                                   COMPLETED                         FAILED
```

- **生命周期阶段 (AutomationPhase)**：
  - `READY`：新建或重试就绪，待 Worker 认领或分派执行；
  - `SUBMITTED`：外部请求已发出，外部系统已受理但未回读证实；
  - `VERIFYING`：正在执行回读比对（Read-back Verify）或远端反查；
  - `COMPLETED`：已在远端证实生效（`effect: APPLIED`, `recovery: NONE`）；
  - `FAILED`：明确失败且确认未产生副作用（`effect: NOT_APPLIED`, `recovery: NONE`）；
  - `NEEDS_ATTENTION`：异常挂起状态（等价于业务 DLQ），包括：重试 3 次耗尽、远端与本地参数不符（`REMOTE_PAYLOAD_MISMATCH`）、远端生效但本地落库失败（`LOCAL_SYNC_FAILED`）。需人工干预。
- **副作用分类 (AutomationEffect)**：
  - `NOT_APPLIED`：确认未在远端产生变更；
  - `APPLIED`：确认已在远端产生有效变更；
  - `PARTIALLY_APPLIED`：部分产生副作用；
  - `UNKNOWN`：网络超时或未知异常，无法确定是否生效（**禁止直接重试，强制先查后验**）。
- **恢复策略 (RecoveryAction)**：
  - `NONE`（无需处理）、`RETRY`（自动重试）、`QUERY`（远端反查）、`REAUTHORIZE`（凭证失效需重新授权）、`MANUAL`（人工介入）。

---

### 4.2 Retry：哪些错误会 retry？retry 决策在哪里？是否仍依赖字符串 error code？
1. **哪些错误会 retry**：
   - 远端反查返回明确的 `NOT_FOUND` 且 `attemptCount < 3` 时，转为 `READY` + `RETRY`，安排指数退避（$2^n \times 1000$ ms）；
   - 反查接口网络波动/超时且 `attemptCount < 3` 时，保持 `SUBMITTED` + `QUERY`，安排指数退避下一次查询；
   - 采购单重试失败且累积次数 `< 3` 时，转为 `READY` + `RETRY`。
2. **哪些错误坚决不 retry**：
   - `attemptCount >= 3`：坚决不盲目重试，立即升级为 `NEEDS_ATTENTION`；
   - 鉴权错误（`AUTH_FAILED`、`AUTH_REQUIRED`）：转为 `REAUTHORIZE`，不自动盲重试；
   - 验证冲突（`REMOTE_PAYLOAD_MISMATCH`）：远端金额/数量与本地请求不符，立即置入 `NEEDS_ATTENTION`；
   - 配置与参数错误（`CONFIG_ERROR`、`VALIDATION_ERROR`）：直接阻断或人工处理。
3. **retry 决策在哪里**：
   - 目前集中硬编码在 `apps/worker/src/processors/automation-recovery.processor.ts` 的 `processAutomationRecovery()` 中（约 150 行条件分支）。
4. **是否仍依赖字符串 error code**：
   - **是的，严重依赖散落的字符串比对！**
   - 例如：`checkRes.errorCode === 'NOT_FOUND'`、`rpaResult.error?.startsWith('CONFIG_ERROR')`、`rpaResult.error?.startsWith('PAGE_TIMEOUT')`、`err.name === 'AbortError'`。
   - 缺乏强类型的 `NormalizedExecutionError` 结构，极易因外部服务文案微调而导致判定失效。

---

### 4.3 Timeout：Shopify / ERP / Playwright 分别在哪里 timeout？AbortSignal 是否真正传递到底层？
1. **Shopify 适配器超时现状**：
   - `packages/db/src/commerce/shopify-adapter.ts:140`：`HttpShopifyGraphQLTransport.query()` 直接调用原生 Node `fetch(url, { ... })`，**完全没有传入任何 timeout 选项，也没有绑定 AbortController**！
   - 一旦远端网络连接挂起，该 HTTP 请求将永久阻塞直到底层 TCP 保活失败。
2. **ERP 适配器超时现状**：
   - `packages/integrations/src/erp/http-erp.adapter.ts:60`：通过 `options.timeout || 10000`（默认 10 秒）在内部构造 `const controller = new AbortController()`，在定时器触发时调用 `controller.abort()`。
   - 超时后捕获 `AbortError` 并映射为 `{ success: false, errorCode: 'TIMEOUT' }`。
3. **Playwright 适配器超时现状**：
   - `packages/integrations/src/rpa/playwright.adapter.ts:219`：取 `input.timeoutMs || params.timeoutMs || 15000`（默认 15 秒），通过 `page.setDefaultTimeout(timeoutMs)` 传递给 Playwright；
   - 超时抛出 `TimeoutError`，被捕获后将状态置为 `TIMEOUT`，`effect: UNKNOWN`。
4. **AbortSignal 是否真正传递到底层**：
   - **否，链路完全没有贯通！**
   - 上层 Worker 或 ActionRouter **无法向 Adapter 注入外部的 `AbortSignal`**；
   - 若上层任务被用户取消或 Worker 关闭，底层运行中的 Playwright 浏览器或 HTTP 请求无法被外部信号立即中断，可能造成孤儿进程或隐蔽副作用。

---

### 4.4 Attempt：当前能否完整还原 Attempt 历史？
**当前完全无法还原！**
- **存储现状**：`AutomationOperation` 表仅有单一整型标量 `attemptCount`，以及单值字段 `lastErrorCode`、`nextAttemptAt`、`evidence`（覆盖式写入）。
- **信息覆写丢失**：
  - 当 Attempt 1 发生网络超时写入 `lastErrorCode: 'TIMEOUT'` 后，Attempt 2 发起重试，若重试成功，`recordEvidence()` 会直接将 `evidence` 和状态覆写为 `COMPLETED`，`lastErrorCode` 被置空；
  - 外部可观测系统无法回答：Attempt 1 何时开始？耗时多少？由哪台 Worker 认领？当时的确切报错堆栈是什么？为什么发起了 Attempt 2？
- **评估结论**：现有标量字段不足以支持生产级可观测性与排障，**必须建立结构化的 Attempt 追踪机制（推荐新增 `ExecutionAttempt` 表或在 `evidence` 中结构化沉淀不可变的 attempts 数组）**。

---

### 4.5 Audit：人工 Retry / Resolve / Approve / Cancel 当前是否有完整历史？
**当前缺乏独立的不可变审计历史！**
- **当前机制**：
  - 审批：`Approval` 表记录 `status`、`approvedBy`、`resolvedAt`，并在单行 `comment` 字段内以 JSON 字符串覆盖记录分派状态；
  - 解决：`resolveNeedsAttention` 接收到 `FORCE_ADOPT` / `DISMISS` / `RETRY_SYNC` 后，构造 `manualResolution` 对象，直接覆写合并到 `AutomationOperation.evidence` 的 JSON 字段中。
- **缺口**：
  - 若同一操作被多次驳回、重置、或多人协同介入，历史人工操作记录会被覆盖；
  - 没有 `ExecutionAudit` 独立审计表，无法按操作人、时间范围、动作类型聚合审计报表；
  - 当前甚至缺少人工 `Cancel` 与人工立即 `Retry` 的专用 API。

---

### 4.6 Logging：console.log 分布情况？是否已经有 logger？
1. **分布情况**：全库检索到 **169 处** `console.log` / `console.warn` / `console.error`。
   - `apps/worker`（42 处）：各个 processor 和调度器全部直接使用 `console.log` 打印 emoji 格式日志；
   - `packages/integrations`（24 处）：Playwright 适配器使用 `console.warn` 打印日志；
   - `apps/api`（35 处）：业务服务散落调试输出。
2. **是否已有统一 logger**：
   - **完全缺失**。`package.json` 中既未安装 `pino`，也未安装 `winston`；
   - 只有 NestJS `apps/api/src/main.ts` 引入了内置的 `new Logger('CrossPilotBootstrap')`，未用于业务或执行层；
   - 日志既没有 JSON 格式输出，也没有统一绑定 `traceId` / `operationId` / `workspaceId`，更没有敏感信息脱敏（Token / Cookie 过滤）。

---

### 4.7 Metrics：是否已有 prom-client / metrics endpoint？
**完全缺失！**
- 全库无 `prom-client` 依赖；
- API 与 Worker 均无 `/metrics` 端点；
- 没有任何执行相关的 Prometheus 计数器（如 `crosspilot_execution_total`）或耗时直方图（如 `crosspilot_execution_duration_ms`）。

---

### 4.8 Frontend：是否已经存在统一 Execution / Automation 页面？
**不存在统一的 Execution Center！**
- 当前 `apps/web/src/app/app/operations/automation/page.tsx` 是针对 `WF-Operation-01: Amazon Listing 发布流程` 的固定前端交互原型（6 步节点展示）；
- 它既不能查看全量 `AutomationOperation` 执行历史，也不能查看失败重试队列，更没有针对 `NEEDS_ATTENTION` 的管理卡片、Timeline 展示、Trace / Screenshot 查阅抽屉或多维筛选列表；
- 缺少真正的全局执行监控中枢。

---

## 5. 能力状态对照与判定矩阵 (Capability Matrix)

| 核心维度 | 需求项 | 当前状态 | 判定 | 处理建议 |
|---------|--------|---------|------|---------|
| **Execution Model** | 统一 Execution 表 | 已有 `AutomationOperation` | ✅ **已实现** | **禁止新建 Execution 表**，复用并增强现有模型。 |
| **Worker Runtime** | BullMQ 队列与 Worker | 已有 5 个 Worker + recovery | ✅ **已实现** | **禁止推翻现有 Worker**，在当前处理器上增量注入观测与规范。 |
| **Idempotency** | 幂等控制与 OCC | 复合唯一约束 + version CAS | ✅ **已实现** | **保留现有机制**，补充自动化回归验证。 |
| **Crash Recovery** | 崩溃恢复与租约锁定 | `leaseOwner` + `leaseUntil` 30s | ✅ **已实现** | **保留现有机制**，后续补充 timeline 展现与日志。 |
| **Read-back Verify** | 回读验真 | RPA DOM 回读 + ERP 反查 | ✅ **已实现** | **保留现有机制**，统一其输出的 Evidence 契约。 |
| **Outcome Tracking** | 7/14/30 天业务成效跟踪 | 独立闭环评估 Worker | ✅ **已实现** | **本阶段不改动**。 |
| **Trace** | 全链路跟踪 ID | `traceId` 散落传递 | ⚠️ **部分实现** | 统一在日志、Metrics、Execution 实体中贯穿，无需重造框架。 |
| **Error Classification** | 统一错误分类 | 各 Provider 散落字符串 | ❌ **严重缺失** | **Phase 1 核心攻坚**：落地 `NormalizedExecutionError`。 |
| **Timeout & Abort** | 超时配置与信号取消 | 各自为政，无 AbortSignal 传递 | ❌ **严重缺失** | **Phase 2 核心攻坚**：统一配置，打通 `AbortSignal`。 |
| **Structured Logs** | 结构化日志与脱敏 | 169 处原始 `console.log` | ❌ **严重缺失** | **Phase 3 核心攻坚**：引入标准轻量结构化日志 + 脱敏。 |
| **Metrics** | 运行时指标与 `/metrics` | 无 prom-client，零指标 | ❌ **严重缺失** | **Phase 4 核心攻坚**：集成 prom-client 与标准指标。 |
| **Attempt History** | 每次尝试明细追溯 | 仅有当前计数与最新覆盖 | ❌ **严重缺失** | **Phase 5 评估与实施**：建立不可变的 Attempt 历史。 |
| **Human Audit Trail** | 人工干预不可变历史 | 仅在 JSON 内覆写 | ❌ **严重缺失** | **Phase 6 核心攻坚**：新增 `ExecutionAudit` 审计流。 |
| **Evidence Schema** | 证据强校验与脱敏 | 仅为非受控 JSON | ⚠️ **部分实现** | **Phase 7 核心攻坚**：细化类型与自动脱敏过滤器。 |
| **Execution Center API** | 执行中心 CRUD & 控制 API | 仅有少量业务特定接口 | ❌ **严重缺失** | **Phase 8 核心攻坚**：提供通用 List / Detail / Action API。 |
| **Execution Center UI** | 执行中心可视化前端工作台 | 仅有单流程演示 Demo | ❌ **严重缺失** | **Phase 9 核心攻坚**：在 Web 端构建完整 Execution Center。 |

---

## 6. 后续 Phase 1 至 Phase 11 最终执行清单

按照方案 V2 的实施路线，后续实施计划明确如下：

```text
Phase 1: 统一 Error Classification (P0)
   ├── 定义 NormalizedExecutionError & ExecutionErrorClass (packages/shared)
   ├── 改造 Shopify / ERP / Playwright 适配器输出标准化错误
   └── 改造 automation-recovery.processor 基于 errorClass 决策
   
Phase 2: Timeout + AbortSignal 统一 (P0)
   ├── 集中化超时配置环境变量 (HTTP / Browser / Execution / Verify)
   ├── 在 ActionDispatcherContext 与 Adapter 调用链打通 AbortSignal
   ├── 为 ShopifyAdapter fetch 补齐超时控制与 AbortController
   └── 强化 Timeout 后的 UNKNOWN 副作用防盲目重试逻辑
   
Phase 3: Structured Logging (P0)
   ├── 选型引入高性能轻量结构化 Logger (Pino / 自研零依赖 JSON Logger)
   ├── 定义标准 Event Schema (execution.*, adapter.*, verify.*)
   ├── 绑定 traceId, workspaceId, operationId, attemptNo, durationMs
   └── 增加敏感词自动脱敏拦截器 (Token, Secret, Cookie, Password)

Phase 4: Metrics 运行时指标 (P0)
   ├── 引入 prom-client，定义执行 Counters 与 Histograms
   ├── 控制 Label 基数（仅允许 provider, adapter, actionType, errorClass, status）
   └── 暴露安全受控的 GET /metrics 端点

Phase 5: Execution Attempt History 细化 (P1)
   ├── 在 packages/db 增加 ExecutionAttempt 模型 (operationId, attemptNo, durationMs, errorClass, workerId)
   └── 在每次重试与执行完成时持久化明细，保留每一次尝试的现场现场

Phase 6: Human Audit Trail 人工操作审计 (P1)
   ├── 在 packages/db 增加 ExecutionAudit 模型 (operationId, actorId, action, reason, beforeState, afterState)
   └── 在 resolveNeedsAttention、人工 Retry、Cancel 时原子落库审计日志

Phase 7: Evidence 结构化增强与脱敏 (P1)
   ├── 规范化 Evidence 子类型 (REQUEST, RESPONSE, SCREENSHOT, VERIFY_RESULT, ERROR)
   └── 落地证据保存前强制敏感数据自动脱敏

Phase 8: Execution Center API (P0)
   ├── GET /api/v1/operations/executions (支持分页、状态、提供方、错误类型筛选)
   ├── GET /api/v1/operations/executions/:id (返回 Operation, Attempts, Evidence, Audit, Trace)
   ├── POST /api/v1/operations/executions/:id/retry (重新入队进入现有运行时，禁止直接调适配器)
   └── POST /api/v1/operations/executions/:id/cancel (安全取消并记入审计)

Phase 9: Execution Center 前端工作台 (P0)
   ├── 新建 /app/operations/executions 页面 (列表、过滤器、状态徽标)
   ├── 新建详情抽屉与 Timeline 轨迹图
   ├── 集成截图 / Playwright Trace 查阅器
   └── 集成 NEEDS_ATTENTION 处理面板 (Force Adopt / Retry / Dismiss 弹窗)

Phase 10: 回归测试、混沌演练与真实 E2E 验证
   ├── 现有测试回归全绿 (零旧测试删除)
   ├── 幂等性重复投递测试 (Duplicate Delivery)
   ├── 进程崩溃与租约过期测试 (Worker Crash & Lease Expiration)
   ├── 超时与 UNKNOWN 状态流转测试 (Timeout & Side-effect Safety)
   ├── 校验不符阻断测试 (Verify Mismatch Safety)
   ├── Shopify Real API 读取回归 (真实 Dev Store)
   └── Playwright 安全 E2E 执行回归

Phase 11: 架构归档与正式冻结 (Documentation & Freeze)
   ├── 输出 AUTOMATION_RUNTIME_ARCHITECTURE.md
   ├── 输出 FAILURE_CLASSIFICATION.md
   ├── 输出 EXECUTION_STATE_MACHINE.md
   ├── 输出 METRICS_REFERENCE.md
   └── 正式标记 AUTOMATION RUNTIME FROZEN
```

---

## 7. 现有代码禁止重写清单 (Strict Non-Rewritable Rules)

为防止破坏已有成果，以下既有代码在后续所有 Phase 中**绝对禁止推翻或重写**：

1. **禁止新建第二套 Execution 主模型**：
   - 严禁创建 `Execution`、`TaskExecution` 等新表来取代 `AutomationOperation`；
   - 所有的状态流转、OCC 锁控制必须以 `AutomationOperation` 为单一事实源。
2. **禁止重写 BullMQ 框架或重复创建队列**：
   - `crosspilot-automation-recovery` 队列及 `worker.service.ts` 是 Worker 体系中枢，严禁另起一套任务分发服务。
3. **禁止破坏已有的幂等性机制**：
   - 数据库复合唯一索引 `(workspaceId, connectionId, operationKind, idempotencyKey)` 及 `payloadHash` 校验严禁弱化或绕过。
4. **禁止推翻 Crash Recovery 租约机制**：
   - `AutomationOperationStore.claim()` 的 OCC 版本累加与 30 秒租约锁定逻辑必须完整保留。
5. **禁止推翻已验证的 Provider 业务核心**：
   - `ShopifyAdapter`：GraphQL 查询协议、OAuth 置换逻辑、多变体 `ChannelIdentity` 映射结构禁止改动（仅允许接入超时控制与错误标准化）；
   - `PlaywrightRpaAdapter`：DOM 行定位器、防重定向检查、回读验真算法禁止推翻；
   - 业务层：Planner、Agent、Approval 鉴权、选品分析、财务计算逻辑原封不动。
6. **禁止删除既有测试**：
   - 不得以跑通新逻辑为借口删除或 skip 已有测试用例（如 50 个 actions 测试与 12 个 publish truth 测试）。

---

## 8. Phase 0 验收与停止说明 (Stop Condition Check)

依据实施方案 V2 第 5.4 节与第 23 节规定：
- **Phase 0 目标已全部达成**：完成真实代码扫描，回答所有 8 项核心问题，形成完整能力对比矩阵与后续 11 阶段实施清单，明确禁止重写边界；
- **严格触发 STOP 条件**：
  - **当前不进入 Phase 1**；
  - **未修改任何业务代码**；
  - **未提前生成 Prisma Migration**；
- **请用户/评审人员查阅本报告，确认后续执行清单后指示进入 Phase 1**。
