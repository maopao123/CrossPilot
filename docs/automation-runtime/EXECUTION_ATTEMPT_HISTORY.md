# Execution Attempt History (Phase 5)

## 一、概述

在 Phase 5 之前，CrossPilot 的 `AutomationOperation` 作为唯一的运行时状态实体，仅包含累计的 `attemptCount` 以及单槽位覆盖的 `evidence` JSON。每当重试或反查发生并调用 `AutomationOperationStore.recordEvidence()` 时，先前的执行证据与瞬态错误信息便会被新数据覆盖。

Phase 5 正式引入持久化的 **Execution Attempt History（执行尝试历史）**，为每次自动化操作的首次执行、故障重试、远端反查以及恢复尝试提供独立持久化的明细追踪记录。

### 核心架构原则

1. **唯一状态源（Single Source of Truth）**：
   - `AutomationOperation` 永远且继续作为 Automation Runtime 的**唯一运行时状态真相**。
   - `ExecutionAttempt` 仅作为**历史明细投影（Historical Projection）**，仅供可观测性、审计溯源与未来 Execution Center 聚合展示使用。
   - 严格禁止由 `ExecutionAttempt.status` 反向驱动或篡改 `AutomationOperation.phase`。

2. **单调编号与真实尝试不变式（Concrete Attempt Invariant）**：
   - **核心不变式**：`1 concrete external execution/query attempt = 1 ExecutionAttempt row`（不是 “1 次 claim = 1 条 attempt”）。
   - 非同步预约操作认领（如 `action-layer.service.ts` 的 `isSync = false` 路径）仅锁定租约并流转状态至 `EXECUTING`，因未发生任何真实外部调用，**严禁伪造外部 Attempt 记录**。
   - 后续由 Worker 执行反查（QUERY）或重试（RETRY）认领时直接继承原子累加后的 `claimed.attemptCount`（例如 Attempt #2）。历史尝试编号稀疏（例如仅有 `[Attempt #2]`）完全合法且真实反映外部物理交互。
   - 数据库层通过 `@@unique([operationId, attemptNo])` 约束提供并发唯一性保护。

3. **写操作与只读反查明确区分（Distinguishable Query vs Write）**：
   - 首次真实外部写操作标记为 `EXECUTE`；
   - 超时自愈反查远端真实状态标记为 `QUERY`；
   - 确认未生效后的重放执行标记为 `RETRY`；
   - 避免将读反查错误统计为二次写操作。

4. **历史记录写入安全（Fail-Safe Recording）**：
   - Attempt 属于观测与历史明细，其数据库写入或更新失败**绝不允许影响业务主流程**，绝不引发重复的外部写操作（Fail-Safe）。

---

## 二、模型定义与 Schema

### 1. Prisma Schema (`packages/db/prisma/schema.prisma`)

```prisma
model AutomationOperation {
  id                  String         @id @default(uuid())
  workspaceId         String         @map("workspace_id")
  actionId            String?        @map("action_id")
  connectionId        String         @map("connection_id")
  operationKind       String         @map("operation_kind")
  idempotencyKey      String         @map("idempotency_key")
  payloadHash         String         @map("payload_hash")
  approvedPayloadHash String?        @map("approved_payload_hash")
  mode                String
  provider            String
  phase               String         @default("READY")
  effect              String         @default("UNKNOWN")
  recovery            String         @default("NONE")
  version             Int            @default(1)
  leaseOwner          String?        @map("lease_owner")
  leaseUntil          DateTime?      @map("lease_until")
  attemptCount        Int            @default(0) @map("attempt_count")
  nextAttemptAt       DateTime?      @map("next_attempt_at")
  lastErrorCode       String?        @map("last_error_code")
  evidence            Json?          @map("evidence")
  createdAt           DateTime       @default(now()) @map("created_at")
  updatedAt           DateTime       @updatedAt @map("updated_at")

  workspace           Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  action              PlannedAction? @relation(fields: [actionId], references: [id], onDelete: Cascade)
  attempts            ExecutionAttempt[]

  @@unique([id, workspaceId])
  @@unique([workspaceId, connectionId, operationKind, idempotencyKey])
  @@index([workspaceId])
  @@index([actionId])
  @@index([phase, nextAttemptAt])
  @@map("automation_operations")
}

model ExecutionAttempt {
  id           String    @id @default(uuid())
  workspaceId  String    @map("workspace_id")
  operationId  String    @map("operation_id")
  attemptNo    Int       @map("attempt_no")
  attemptType  String    @map("attempt_type") // EXECUTE | RETRY | QUERY | VERIFY | RECOVERY
  provider     String
  workerId     String?   @map("worker_id")
  traceId      String?   @map("trace_id")
  status       String    // RUNNING | SUCCEEDED | FAILED | TIMEOUT | CANCELLED | UNKNOWN
  startedAt    DateTime  @map("started_at")
  finishedAt   DateTime? @map("finished_at")
  durationMs   Int?      @map("duration_ms")
  errorClass   String?   @map("error_class")
  errorCode    String?   @map("error_code")
  errorMessage String?   @map("error_message")
  effect       String?
  recovery     String?
  evidence     Json?
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  operation    AutomationOperation @relation(fields: [operationId, workspaceId], references: [id, workspaceId], onDelete: Cascade)

  @@unique([operationId, attemptNo])
  @@index([workspaceId, operationId])
  @@index([operationId, startedAt])
  @@index([workspaceId, startedAt])
  @@map("execution_attempts")
}
```

### 2. 数据库迁移

- **Phase 5 (`20260919230000_add_execution_attempt_history`)**：新增 `execution_attempts` 数据表及基础外键索引；
- **Phase 5.1 (`20260919235000_add_execution_attempt_tenant_integrity`)**：建立 `(operation_id, workspace_id) -> automation_operations(id, workspace_id)` 复合外键约束，将租户隔离直接内化为数据库层物理硬约束。
- **级联删除（Cascade Delete）**：父表 `automation_operations` 被清理时自动清理关联的历史尝试记录，避免产生孤儿数据。

---

## 三、Attempt 生命周期与状态机

```
                      +----------------------------------+
                      |   store.claim(leaseDuration)     |
                      +----------------------------------+
                                       |
                     (Atomically increments attemptCount)
                                       |
                                       v
                      +----------------------------------+
                      |       startAttempt()             |
                      |   status: RUNNING                |
                      |   attemptNo: claimed.attemptCount|
                      +----------------------------------+
                                       |
                  +--------------------+--------------------+
                  |                                         |
         [ Synchronous API ]                       [ Recovery Worker ]
                  |                                         |
     external write (ERP/Shopify)               query remote / retry write
                  |                                         |
                  v                                         v
       +---------------------------------------------------------+
       |                     finishAttempt()                     |
       |  - Calculates durationMs = finishedAt - startedAt       |
       |  - Sanitizes and truncates errorMessage (<= 1000 chars) |
       |  - Sanitizes evidence payload (redacts secrets)         |
       |  - Sets status: SUCCEEDED | FAILED | TIMEOUT            |
       +---------------------------------------------------------+
                                       |
                                       v
                      +----------------------------------+
                      |       recordEvidence()           |
                      |   (Updates AutomationOperation   |
                      |    phase, effect, recovery)      |
                      +----------------------------------+
```

### 尝试类型映射（Attempt Type Matrix）

| 场景 | `attemptType` | 触发时机 | 语义说明 |
| :--- | :--- | :--- | :--- |
| **首次外部写执行** | `EXECUTE` | `action-layer.service.ts` 同步调用 ERP 采购单接口 | 真实的外部实体创建写操作 |
| **超时远端状态反查** | `QUERY` | `automation-recovery.processor.ts` 反查外部单据（`SUBMITTED`/`VERIFYING`/`recovery=QUERY`） | **只读探测**，确认远端是否真实生成单据，绝非二次写操作 |
| **确认未生效重试** | `RETRY` | 反查确认远端不存在（`NOT_FOUND`）后重新执行写操作（`READY`/`recovery=RETRY`） | 确认外部无副作用后的幂等重试写操作 |
| **主动远端核验** | `VERIFY` | 单据创建后的内容一致性校验 | 校验供应商、总金额、数量等字段是否严格一致 |
| **人工自愈恢复** | `RECOVERY` | 运营人工介入触发的主动恢复操作 | 管理员在工单中心触发的人工补偿调用 |

### 尝试状态映射（Attempt Status Matrix）

| `status` | 触发条件 | 说明 |
| :--- | :--- | :--- |
| `RUNNING` | `startAttempt()` 被调用 | 正在执行外部调用或反查；若进程崩溃且租约过期，保持 `RUNNING` 标明被中断 |
| `SUCCEEDED` | 外部写操作成功，或远端反查确认存在 | 执行完成，`effect: APPLIED`, `recovery: NONE` |
| `FAILED` | 外部调用返回明确错误，或反查发现单据内容校验不匹配 | 记录具体 `errorClass` 与 `errorCode` |
| `TIMEOUT` | HTTP/RPC/Playwright 超时或信号取消 | 标记执行超时，`effect: UNKNOWN`, `recovery: QUERY` |
| `CANCELLED` | 上层上下文主动取消（AbortSignal） | 任务取消中断 |

---

## 四、核心安全与隔离机制

### 1. 密钥与敏感信息脱敏（Secret Redaction & Sanitization）

复用 Phase 3 的双层防御机制（`log-redaction.ts`），在落入数据库前对 `errorMessage` 和 `evidence` 进行严格过滤：

1. **错误信息截断与脱敏（`errorMessage`）**：
   - 自动匹配并抹除 Bearer Token、Basic Auth、Shopify 访问令牌（`shpat_...`）、数据库连接串密码（`postgresql://user:pass@host/db`）及键值对密码（`password=...`）；
   - 最大字符长度限制为 **1000 字符**，超出自动截断，防止海量堆栈或恶意响应填满数据库。
2. **证据载荷脱敏（`evidence`）**：
   - 递归扫描对象与数组中的敏感键（`authorization`, `cookie`, `password`, `secret`, `apiKey`, `clientSecret`, `privateKey` 等），统一替换为 `[REDACTED]`；
   - 限制遍历深度（最大 8 层），防止循环引用或超深嵌套。

### 2. 工作区租户隔离（Workspace Isolation & Tenant Integrity）

`ExecutionAttemptStore` 在 Store 层与数据库约束层建立双重租户隔离防线：

1. **数据库层硬约束（DB-level Composite Foreign Key）**：
   - `AutomationOperation` 建立 `@@unique([id, workspaceId])`；
   - `ExecutionAttempt` 通过 `(operation_id, workspace_id) REFERENCES automation_operations(id, workspace_id)` 复合外键关联，从底层数据库层面杜绝跨租户数据串接。
2. **父操作存在性与租户校验**：
   - `startAttempt()` 执行前优先检索 `automationOperation.findFirst({ where: { id: operationId, workspaceId } })`，若不存在或跨租户抛出 `AutomationOperationNotFoundError`。
3. **P2002 并发重放防泄露与身份验真**：
   - 捕获 `(operationId, attemptNo)` 冲突时，严格限制在当前 `workspaceId` 范围内反查；若属于跨租户冲突，拒绝返回外部租户数据，直接抛出 `AutomationOperationConflictError`；
   - 对本工作区内的重复调用，严格校验 `attemptType` 与 `provider` 必须与已有记录完全吻合，防止异构参数静默覆盖。
4. **终态校验与日志映射修正**：
   - `finishAttempt()` 严格拒绝 `status: 'RUNNING'`（必须为终态 `SUCCEEDED | FAILED | TIMEOUT | CANCELLED | UNKNOWN`）；
   - `safeFinishAttempt()` 仅在 `SUCCEEDED` 时触发 `EXECUTION_ATTEMPT_COMPLETED` 日志，其他终态（`FAILED` / `TIMEOUT` / `CANCELLED` / `UNKNOWN`）均触发 `EXECUTION_ATTEMPT_FAILED` 日志。

### 3. 故障容错保证（Fail-Safe Guarantee）

`ExecutionAttemptStore` 提供了安全无异常包装方法：

- `safeStartAttempt(params, logger)`
- `safeFinishAttempt(params, logger)`

若底层数据库发生临时连接超时、行级死锁或不可预见异常：
1. 内部自动捕获并输出结构化告警日志（`RuntimeEvents.EXECUTION_ATTEMPT_RECORD_FAILED`）；
2. 绝不向外抛出异常中断上层业务逻辑；
3. **绝不允许因为历史记录写入失败而重新执行外部写操作或造成数据重复。**

---

## 五、异常与崩溃语义（Crash Semantics）

### 进程意外崩溃与中途退出

如果 Worker 或 API 在完成 `startAttempt()`（状态为 `RUNNING`）后进程发生崩溃（OOM、容器重启、网络中断）：

1. 该尝试记录在数据库中保持 `status: "RUNNING"`；
2. 父操作 `AutomationOperation` 的 30 秒 OCC 租约随时间自然过期（`leaseUntil < now()`）；
3. 后台恢复进程 `automation-recovery.processor.ts` 在下一轮 Sweep 中重新认领租约：
   - 原子累加 `attemptCount`，生成新的序号（例如 Attempt #2）；
   - 启动新的尝试记录；
   - **历史 Attempt #1 不会被篡改或强行伪造状态**。
4. 在未来的 Execution Center UI 中，`status: RUNNING` 且所属 Operation 租约过期的记录，可以直接投影推导为 `INTERRUPTED / STALE`，无需引入第二套复杂的分布式状态修复系统。

---

## 六、存量历史数据策略（Legacy Data Policy）

在 Phase 5 部署之前，现有数据库中已有大量 `attemptCount > 0` 的存量 `AutomationOperation`。

- **禁止自动伪造回填（No Fake Backfill）**：因为历史每次执行的时间戳、持续时长、错误原因与执行 Worker ID 均已不可考，严禁通过脚本合成虚假的 Attempt 记录。
- **查询兼容性**：存量 Operation 调用 `listAttempts(workspaceId, operationId)` 正常返回空数组 `[]`。
- **未来 UI 展现**：Execution Center 对 Phase 5 之前的操作统一标注：`“Historical attempt details unavailable before Phase 5”`。

---

## 七、Prometheus 指标正交性（Zero High-Cardinality Impact）

根据 Phase 4 冻结规则：
- 严禁将 `attemptNo`、`operationId`、`traceId` 作为 Prometheus 指标 Label；
- Attempt History 纯粹作为持久化明细存储（数据库明细）与日志上下文使用；
- Prometheus 指标保持低基数与系统级聚合特性，不受 Attempt 细化影响。

---

## 八、验收与验证覆盖

测试体系分为 Store 层单元测试与应用层 Runtime 真实接线测试：

1. **Store 层全量边界测试**（`packages/actions/test/execution-attempt-history.spec.ts`，25 项测试全通）：
   - [x] **真实外部交互不变式**：仅在外部物理交互发生时落 Attempt；
   - [x] **幂等性与唯一保护**：重复调用 `startAttempt()` 返回已有记录，校验 `attemptType` 与 `provider` 一致性；
   - [x] **工作区隔离与父表校验**：父操作跨租户或不存在时拒绝创建 Attempt；并发重放杜绝跨租户泄露；
   - [x] **执行耗时计算**：`durationMs` 准确反映 `startedAt` 到 `finishedAt` 的耗时；
   - [x] **终态严格校验**：`finishAttempt()` 拒绝 `RUNNING`；
   - [x] **日志事件映射**：仅 `SUCCEEDED` 触发 `COMPLETED`，其他终态均触发 `FAILED`；
   - [x] **敏感信息脱敏**：密码、Bearer Token、Shopify 密钥、Postgres URL 自动抹除，超长错误截断；
   - [x] **写入容错机制**：Attempt Store 数据库异常不阻断外部执行，绝不导致重复副作用。

2. **API ActionLayer 真实接线测试**（`apps/api/test/action-layer-attempt-wiring.spec.ts`，3 项测试全通）：
   - [x] **非同步预约不落伪 Attempt**：`syncExecution=false` 认领租约并流转 `EXECUTING`，`listAttempts` 为 0；
   - [x] **同步 ERP 执行成功**：记录 Attempt #1（`attemptType: 'EXECUTE'`, `status: 'SUCCEEDED'`, `effect: 'APPLIED'`）；
   - [x] **同步 ERP 执行超时**：记录 Attempt #1（`attemptType: 'EXECUTE'`, `status: 'TIMEOUT'`, `effect: 'UNKNOWN'`, `recovery: 'QUERY'`）。

3. **Worker 恢复自愈真实接线测试**（`apps/worker/test/automation-recovery-attempt-wiring.spec.ts`，2 项测试全通）：
   - [x] **SUBMITTED + QUERY 链路**：认领后生成 Attempt #2（`attemptType: 'QUERY'`），远端单据核验一致后流转 `SUCCEEDED`；
   - [x] **READY + RETRY 链路**：认领后生成 Attempt #2（`attemptType: 'RETRY'`），重试创建成功后流转 `SUCCEEDED`。
