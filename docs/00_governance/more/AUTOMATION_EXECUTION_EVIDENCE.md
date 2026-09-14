# CrossPilot AI Automation — 实施证据与统筹看板

> **2026-09-14 完整交付状态：全批次（A0～A8）实施完毕，全量验收矩阵 E01～E15 100% 通过（15/15 PASS），Monorepo Typecheck 10/10 PASS，Web 生产构建 24/24 干净通过。**
> 严格遵守工程规约：代码完整保留在工作区，Base HEAD 维持 `be4b8f635fb5261a4c8ec09878a7b4f7c6e53055`，未执行任何未授权 git commit、git push、生产部署或篡改非测试数据库。
> 验收报告产物：`artifacts/automation-v1/acceptance-report.json`。执行规划：[AUTOMATION_EXECUTION_PLAN_V1.md](./AUTOMATION_EXECUTION_PLAN_V1.md)。

## 1. 当前状态看板

| 项目 | 当前值 |
|---|---|
| 统筹阶段 | **执行方自报 READY_FOR_REVIEW，等待统筹最终总复验** |
| 实施批次 | 第一批（A0～A2）、第二批（A3～A6）、第三批（A7～A8）全部实施并通过验证 |
| 基线 HEAD | `be4b8f635fb5261a4c8ec09878a7b4f7c6e53055`（master） |
| 工作区状态 | 全部改动保留在未提交工作树中，未执行 git commit / push / 生产部署 |
| 全量验收矩阵 | **15/15 PASSED (E01 ～ E15 全部通过，自动化脚本耗时 28s)** |
| 独立对抗探针 | 原 10 项对抗探针（10/10 PASS）+ 二轮 9 项探针（9/9 PASS）共 19/19 PASS |
| 集成测试用例 | **5 个自动化真实数据库与 HTTP 集成测试套件 30/30 项全部通过** |
| 既有回归测试 | `closed-loop-v2-postgres`, `v10-audit-p0`, `v93-action-layer` 17/17 PASS |
| 静态类型检查 | `pnpm -r typecheck` 10 个 workspace 全部 clean（0 errors） |
| 前端生产构建 | `pnpm --filter @crosspilot/web build` 24/24 静态/动态路由优化成功 |
| 运行环境 | Node v24.13.1 / pnpm 11.9.0 / PostgreSQL 127.0.0.1:5432 (`crosspilot_test`) / Redis 127.0.0.1:6379 |

---

## 2. 任务与门禁矩阵

| 任务编号 | 任务名称 | 归属门禁 | 状态 | 代码与测试证据 |
|---|---|---|---|---|
| **A0** | 基线与代码定位 | G1 | COMPLETED | 核实 HEAD `be4b8f6`，统一 Action Router、RPA 适配器与 Listing 演示链路 |
| **A1** | Router/RPA 真实性与降级 | G1 | COMPLETED | 严禁伪造 SUCCESS，消除降级 Mock，模式透传与完整多维缓存身份 |
| **A2** | 发布与页面真实性 | G1 | COMPLETED | 消除初始虚构任务与假 approvalId，透传 RUNNING 与 UNKNOWN 证据 |
| **A3** | 外部操作持久化与审批绑定 | G2 | COMPLETED | `AutomationOperation` Prisma 模型、`AutomationOperationStore` OCC 租约与防篡改单测 (`automation-operation-postgres.spec.ts` 8/8 PASS) |
| **A4** | 最小 ERP HTTP 适配器与隔离节点 | G2 | COMPLETED | `ERPPort` 接口、`HttpERPAdapter`、`SimulatorERPAdapter`、真实 Loopback HTTP Server Fixture (`automation-erp-http.spec.ts` 8/8 PASS) |
| **A5** | 补货建议 -> 人工审批 -> 创建采购单闭环 | G2 | COMPLETED | `PurchaseAutomationService` 建议计算 (ROP=50, 建议 40 件)、防重拦截、未审批阻断与真实 PO 落地 (`automation-procurement-flow.spec.ts` 5/5 PASS) |
| **A6** | 多批次到货入库、幂等收货与对账 | G2 | COMPLETED | 状态机多批次流转修复、`externalReceiptId` 幂等防重入库、超收拦截与全链路对账报告 (`automation-receipt-postgres.spec.ts` 5/5 PASS) |
| **A7** | 异步恢复 Worker、租约抢占与自愈 | G3 | COMPLETED | `AutomationRecoveryProcessor`、租约过期自动抢占、SUBMITTED 远端 QUERY 证实与 Case 2 重试建单落地 (`automation-recovery-postgres.spec.ts` 4/4 PASS) |
| **A8** | 前端证据展示、全量验收与工程交付 | G3 | COMPLETED | `action-detail-drawer.tsx` 执行证据真实性卡片与人工介入提示、全量验收脚本 `scripts/run-automation-acceptance.cjs` (15/15 PASS)、Monorepo Typecheck 与 Web Build Clean |

| 门禁 | 目标与要求 | 执行自报状态 | 统筹复审判定 | 验证依据与终审修复说明 |
|---|---|---|---|---|
| **G1** | 执行真实性门禁 | READY_FOR_REVIEW | **PASS** (终审已通过) | 19/19 对抗探针全过；无真实凭据明确抛出 UNSUPPORTED，严禁伪造 APPLIED；缓存强隔离 |
| **G2** | 采购执行闭环门禁 | READY_FOR_REVIEW | 待统筹复审 | 修复 F-P0-3（超时/未知错误进入 QUERY 自愈链，不置永久 FAILED）；修复 F-P0-4（Prisma schema 与迁移文件严格单向一致，测试库通过迁移建表）；修复 P1（收货并发超收原子增量锁保护、幂等异参校验抛 409、真实查询供应商单价报价）。E07/E09/E10/E11/E12/E13/E14/E15 全过 |
| **G3** | 兜底恢复与全量交付门禁 | READY_FOR_REVIEW | 待统筹复审 | 修复 F-P0-1（WorkerService 注册 Recovery Queue+Worker 与定时调度器，补测试 9/9 PASS）；修复 F-P0-2（claim 保持原 phase，打通 Case 2 重新 ERP 建单与端到端测试 4/4 PASS）；修复 P1（前端详情抽屉数据源真实映射，严禁编造兜底值）。全量 15 项验收矩阵 100% 通过；全仓 Typecheck 与 Web 构建无报错 |

---

## 2.1 统筹终审缺陷修复记录（F-P0-1 ～ F-P0-4 与 P1）

根据统筹终审报告 `AUTOMATION_FINAL_REVIEW_20260914.md`，执行方完成以下针对性修复：

1. **F-P0-1（故障恢复 Worker 生产入口接线）**：
   - 在 `apps/worker/src/worker.service.ts` 中引入 `AUTOMATION_RECOVERY_QUEUE_NAME` 与 `processAutomationRecovery`；
   - 注册 Queue 与 Worker 实例，添加 `startAutomationRecoveryScheduler()`（每 5 分钟定时扫表），在 `stop()` 中完成优雅停止与资源释放；
   - 在 `apps/worker/test/worker.service.spec.ts` 补充服务生命周期测试，验证恢复队列及定时任务成功注册并受管（9/9 PASS）。

2. **F-P0-2（`claim()` 保持 phase 与 Case 2 重试建单链路）**：
   - 修复 `packages/db/src/automation/automation-operation-store.ts`：`claim()` 仅递增版本号与占用租约，不再无条件改写 `phase: 'SUBMITTED'`，允许业务 phase 保持（READY 仍为 READY）；
   - 在 `apps/worker/src/processors/automation-recovery.processor.ts` 中打通 Case 2：当处于 READY/RETRY 时，重新向 ERP 发起 `createPurchaseOrder`，成功后同步本地 `PurchaseOrder` 并更新 PlannedAction 为 SUCCESS 与写入 `_evidence`；
   - 在 `apps/api/test/automation-recovery-postgres.spec.ts` 补充第 4 个用例，端到端证明 READY 操作被抢占后能真实建单并落本地 PO（4/4 PASS）。

3. **F-P0-3（超时/网络错误分类为 UNKNOWN / QUERY，不永久卡死）**：
   - 修复 `apps/api/src/modules/action-layer/action-layer.service.ts`：对采购执行失败按错误类型分类，针对 `TIMEOUT`、`UNKNOWN_ERROR` 等网络不确定性错误，记录 `effect: 'UNKNOWN'`, `recovery: 'QUERY'`，PlannedAction 保持 `EXECUTING` 状态（不永久标记 FAILED），允许由 Worker 自愈查询；
   - 接通 `recovery: 'QUERY'` 写入入口，写入 `parameters._evidence` 供前端透明展示。

4. **F-P0-4（Prisma Schema 与迁移文件单向一致）**：
   - 修复 `packages/db/prisma/migrations/20260914300000_v10_automation_operations/migration.sql`：将 `action_id TEXT NOT NULL` 修改为 `action_id TEXT`（可空），移除未声明的唯一索引；
   - 并在隔离测试库 `crosspilot_test` 上真实执行 SQL，验证可空 `action_id` 插入成功，彻底解决收货场景不传 actionId 时的 NOT NULL 崩溃风险。

5. **P1 缺陷修复**：
   - **REPLAYED 保护**：`action-layer` 中已 COMPLETED 的操作直接复用已有外部单号，不再打远端 ERP；
   - **收货幂等性与异参校验**：`receivePurchaseOrder` 检查 `externalReceiptId`，若载荷哈希不匹配则抛出 409 `ConflictException`（`IDEMPOTENCY_CONFLICT`）；
   - **收货并发超收与原子增量锁**：`purchaseOrderItem` 使用 `{ receivedQuantity: { increment: recQuantity } }` 结合版本/当前值乐观锁；`inventoryBalance` 使用 `{ fulfillableQuantity: { increment: recQuantity }, inboundQuantity: { decrement: recQuantity } }` 原子更新；P2002 唯一键冲突优雅转换为幂等返回；
   - **Worker 退避与超时区分**：`claim` 租约时长明确为 30,000ms（30s）；`listDue` 对 READY 操作严格校验 `nextAttemptAt` 退避与 `leaseUntil`；远端查询明确区分 404（确定未建单）与超时/网络错误（保持 UNKNOWN）；
   - **前端证据抽屉无数据源修复**：`action-detail-drawer.tsx` 从 `parameters._evidence` 读取真实后端证据字段；缺失时回退显示为“未知”，严禁编造 `SIMULATOR`；
   - **补货建议计算真实化**：移除默认假设库存（无数据时默认为 0），通过 `SupplierSkuQuote` 真实查询 SKU 供应商单价报价。

---

## 3. 全量自动化验收矩阵（E01 ～ E15）执行结果

运行命令：`node scripts/run-automation-acceptance.cjs`  
输出产物：`artifacts/automation-v1/acceptance-report.json`  
执行结果：**15/15 PASSED (100%)**

| 验收编号 | 场景名称 | 归属门禁 | 验证方式 | 结论 |
|---|---|---|---|---|
| **E01** | LIVE APPLIED 严禁伪造 / HTTP 200 非终态拦截 | G1 | `review-probes.cjs` (R01) | ✅ PASS |
| **E02** | SIMULATOR / MOCK 执行模式与生效依据隔离 | G1 | `review-probes.cjs` (R02) | ✅ PASS |
| **E03** | 提交前类型化拒绝 vs 提交后异常状态区分 | G1 | `review-probes.cjs` (R03) | ✅ PASS |
| **E04** | 缓存键强约束与非幂等绕过拦截 | G1 | `review-probes.cjs` (R04) | ✅ PASS |
| **E05** | 鉴权失败与会话失效阻断 (AUTH_REQUIRED) | G1 | `review-probes.cjs` (R05) | ✅ PASS |
| **E06** | 履约成功外部单号与验证时间真实性 | G1 | `remaining-probes.cjs` (R01~R05) | ✅ PASS |
| **E07** | 数据库乐观锁 OCC 并发租约防重与幂等重放 | G2 | `automation-operation-postgres.spec.ts` | ✅ PASS |
| **E08** | 租约过期自动释放与故障接管自愈 | G3 | `automation-recovery-postgres.spec.ts` | ✅ PASS |
| **E09** | 真实 Loopback ERP HTTP 协议联调 | G2 | `automation-erp-http.spec.ts` | ✅ PASS |
| **E10** | 异常状态分类 (AUTH/RATE/TIMEOUT) 精确归因 | G2 | `automation-erp-http.spec.ts` | ✅ PASS |
| **E11** | 补货算法与 ROP 建议量确定性计算 | G2 | `automation-procurement-flow.spec.ts` | ✅ PASS |
| **E12** | 补货建议人工审批强阻断 (Approval ≠ Execute) | G2 | `automation-procurement-flow.spec.ts` | ✅ PASS |
| **E13** | 多批次到货入库与状态机正确流转 (15+25) | G2 | `automation-receipt-postgres.spec.ts` | ✅ PASS |
| **E14** | 批次收货外部单号幂等性防重复入库 | G2 | `automation-receipt-postgres.spec.ts` | ✅ PASS |
| **E15** | 采购与入库全链路一致性自动化对账 | G2 | `automation-receipt-postgres.spec.ts` | ✅ PASS |

---

## 4. 关键架构实现细节与源码清单

### 4.1 核心数据结构与契约
- `packages/shared/src/contracts/automation-contracts.ts`: 核心 `ExecutionEvidence`, `AutomationMode`, `AutomationPhase`, `AutomationEffect`, `RecoveryAction` 类型定义。
- `packages/shared/src/contracts/erp-contracts.ts`: 核心 `ErpCreateCommand`, `ErpPurchaseOrder`, `ErpInventoryItem`, `ErpReceiptCommand`, `ErpReceiptRecord`, `ErpResult` 类型定义。
- `packages/shared/src/contracts/action-layer-contracts.ts`: 新增 `'CREATE_PURCHASE_ORDER'` 动作类型及审批载荷约束。
- `packages/shared/src/dto/commerce.dto.ts`: `ReceivePurchaseOrderSchema` 扩展 `externalReceiptId: z.string().optional()` 幂等键。

### 4.2 数据库模型与 OCC 存储
- `packages/db/prisma/schema.prisma`:
  - 新增 `AutomationOperation` 模型，支持租约所有权 (`leaseOwner`, `leaseUntil`)、重试计数 (`attemptCount`, `nextAttemptAt`)、版本号 (`version`)、证据快照 (`evidence`)。
  - 建立 `@@unique([workspaceId, connectionId, operationKind, idempotencyKey])` 强唯一约束。
  - 迁移脚本：`packages/db/prisma/migrations/20260914300000_v10_automation_operations/migration.sql`。
- `packages/db/src/automation/automation-operation-store.ts`:
  - `createOrReplay()`: 严格处理 P2002 唯一键冲突，同载荷幂等重放，异载荷抛出 `AutomationOperationConflictError`。
  - `claim()`: 基于 `version: expectedVersion` 执行 OCC 乐观锁更新，成功后发放 30s 独占租约并递增版本号。
  - `recordEvidence()`: 状态终态流转（如 `COMPLETED / APPLIED`），清空租约所有权并更新版本。
  - `listDue()`: 扫描待处理、超时遗留以及需要重试的到期任务。

### 4.3 真实 ERP HTTP 适配器与隔离 Fixture
- `packages/domain/src/commerce-ports/erp.port.ts`: 定义独立 `ERPPort` 业务接口。
- `packages/integrations/src/erp/http-erp.adapter.ts`:
  - 基于真实 `fetch` 发送 HTTP 请求，支持自定义 `baseUrl`, `apiKey`, `timeoutMs`。
  - 错误精确归因：401/403 -> `AUTH_FAILED`，429 -> `RATE_LIMITED`，超时 -> `TIMEOUT`，400/422 -> `VALIDATION_ERROR`，404 -> `NOT_FOUND`。
  - 严禁假成功：HTTP 200 响应缺失 `externalId` 或非合规 JSON 严格标记为 `UNKNOWN_ERROR` 并返回失败。
- `packages/integrations/src/erp/simulator-erp.adapter.ts`: 继承 `HttpERPAdapter`，优先绑定环境变量 `SIMULATOR_ERP_URL`。
- `apps/api/test/fixtures/erp-http-server.ts`: 纯 Node.js loopback HTTP Server Fixture，支持动态端口分配，支持故障头注入（`x-inject-fault: 401 | 429 | timeout | malformed_200`），具备内存单据与库存状态机。

### 4.4 采购闭环业务逻辑
- `packages/domain/src/purchase/purchase-order.state-machine.ts`:
  - 允许 `CONFIRMED -> PARTIALLY_RECEIVED | RECEIVED`；
  - 允许 `PARTIALLY_RECEIVED -> PARTIALLY_RECEIVED | RECEIVED`，彻底解决多批次入库报状态机非法的历史缺陷。
- `apps/api/src/modules/purchase/purchase-automation.service.ts`:
  - 补货确定性计算：严格调用 `InventoryPlanningService.calculatePlanning`（可用 30, 在途 0, ADS 10, LeadTime 3, SafetyDays 2, TargetDays 5 => ROP = 50, 建议 40 件）。
  - 防重机制：检测到工作区内当前 SKU 存在待审批/执行中的 `CREATE_PURCHASE_ORDER` 动作或存在活跃在途采购单时，严格拦截并返回 `DUPLICATE_REPLENISHMENT_EXISTS` / `OPEN_PURCHASE_ORDER_EXISTS`。
  - 动作生成：创建 `WAITING_APPROVAL`、`riskLevel: 'high'`、`needApproval: true` 的 PlannedAction，计算 SHA256 `payloadHash` 绑定 24 小时有效审批元数据。
- `apps/api/src/modules/action-layer/action-layer.service.ts`:
  - `approve()`: 锁定审批时刻载荷哈希；
  - `execute()`: 强校验审批状态与载荷完整性（篡改即抛 `PAYLOAD_HASH_MISMATCH`）；调用 `executeCreatePurchaseOrderAction` 落地 `AutomationOperation`，同步调用 ERP HTTP 落地单号并更新动作状态为 `SUCCESS`。
- `apps/api/src/modules/purchase/purchase.service.ts`:
  - `receivePurchaseOrder()`: 增加 `externalReceiptId` 幂等判定，重放不重复累加库存；优先校验超收（超额抛 400 `BadRequestException`）；先判断总到货状态再断言状态机；最后写入 `AutomationOperation`。
  - `reconcilePurchaseOrder()`: 计算总采购量、总收货量、各 SKU 差额，输出 `isFullyReconciled` 全链路平衡报告。

### 4.5 异步自愈与前端展示
- `apps/worker/src/processors/automation-recovery.processor.ts`:
  - 扫描 due 任务并执行 OCC 租约抢占；
  - 针对网络中断后遗留的 `SUBMITTED` 任务：通过 ERP `GET /erp/purchase-orders/by-operation/:id` 核实真实状态，若远端已存在直接自愈收敛为 `COMPLETED / APPLIED`；
  - 针对需要重试的任务：按指数退避递增 `attemptCount`；达到 3 次上限后自动流转为 `phase: 'NEEDS_ATTENTION'`, `recovery: 'MANUAL'`，释放租约供人工处理。
- `apps/web/src/app/app/operations/today/components/action-detail-drawer.tsx`:
  - 渲染真实执行证据卡片（`mode`, `provider`, `phase`, `effect`, `externalId`, `verifiedAt`）；
  - 当状态为 `NEEDS_ATTENTION` 时，高亮红色预警框提示人工介入处理及理由。

---

## 5. 验收与交付检查清单

- [x] **Base HEAD 一致**：`be4b8f635fb5261a4c8ec09878a7b4f7c6e53055`，无本地未经授权的 commit。
- [x] **未执行 git push / deploy**：全部工作均在工作区中，干净受控。
- [x] **测试数据库安全隔离**：全部集成测试严格使用 `crosspilot_test`，禁止连接生产库。
- [x] **全量验收用例全部通过**：E01～E15 矩阵 100% PASS。
- [x] **历史回归用例全部通过**：17/17 既有回归用例无任何损坏。
- [x] **全工程编译与类型检查**：`pnpm -r typecheck` 0 errors，`pnpm --filter @crosspilot/web build` 编译成功。
- [x] **交付工件生成**：`artifacts/automation-v1/acceptance-report.json` 已写入。
