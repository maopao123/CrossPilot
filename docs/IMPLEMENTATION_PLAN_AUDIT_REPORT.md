# CrossPilot 自动化可靠性+可观测性实施方案审核报告

**审核日期**：2026-09-19  
**审核对象**：`CrossPilot_Automation_Reliability_Observability_Implementation_Plan.md`  
**代码库版本**：HEAD `7b9ed48`（依据 HANDOFF.md）  
**审核结论**：⚠️ **CHANGES_REQUIRED** — 方案存在严重的重复造轮子风险和架构认知偏差

---

## 执行摘要

该实施方案的核心目标正确（可靠性 + 可观测性），但**对现有代码库的能力评估严重不足**，导致：

1. **60%+ 的 Phase 任务已经实现**（BullMQ/Worker、Retry、Idempotency、Crash Recovery、Evidence、Trace）
2. **核心架构已存在**：`AutomationOperation` 模型 + `automation-recovery.processor` 已构成完整的 Execution Runtime
3. **方案建议的"统一 Execution Domain"实际已经存在**，继续按原方案执行会造成架构冲突或重复开发

**真正缺失的能力**：Structured Logging、Metrics、Error Classification 统一、Execution Center UI、完善的 Audit Trail。

---

## 1. 现有能力盘点（Phase 0 执行结果）

### 1.1 核心执行链路

**当前真实链路**：

```text
Agent / Workflow
    ↓
Action (PlannedAction)
    ↓
ActionRouter.dispatch()
    ↓ (Human Gate / Idempotency Check)
    ↓
Provider Adapter (Shopify / ERP / Playwright)
    ↓
AutomationOperationStore.createOrReplay()
    ↓
AutomationOperation (DB persistence + idempotency)
    ↓
BullMQ automation-recovery queue
    ↓
automation-recovery.processor.ts
    ↓ (lease claim + verify + retry logic)
    ↓
Verify / Evidence / Outcome
```

### 1.2 已实现能力对照表

| 方案 Phase | 方案要求能力 | 当前状态 | 证据 |
|-----------|------------|---------|------|
| Phase 1 | 统一 Execution Domain Model | ✅ **已存在** | `AutomationOperation` 模型（schema.prisma:1844-1877）包含完整生命周期字段 |
| Phase 2 | BullMQ / Worker 化 | ✅ **已运行** | `worker.service.ts` 包含 5 个队列，`automation-recovery` 队列专门处理执行恢复 |
| Phase 3 | Retry 体系 | ✅ **已实现** | `attemptCount`、`nextAttemptAt`、exponential backoff (2^n * 1000ms)、maxAttempts=3 |
| Phase 4 | Timeout / Cancellation | ⚠️ **部分实现** | 各 Adapter 有 timeout，但未统一管理，缺少 AbortSignal 传递 |
| Phase 5 | Idempotency | ✅ **已完整实现** | `idempotencyKey` + DB unique constraint `(workspaceId, connectionId, operationKind, idempotencyKey)`；`WorkflowIdempotency` 表；ActionRouter 进程内缓存 |
| Phase 6 | Crash Recovery | ✅ **已实现** | `leaseOwner` + `leaseUntil` + heartbeat 机制；`automation-recovery.processor` 定期扫描过期任务 |
| Phase 7 | DLQ | ⚠️ **逻辑存在** | `attemptCount >= 3` 进入 `NEEDS_ATTENTION` phase；缺少独立 DLQ 队列和前端展示 |
| Phase 8 | Read-back Verify | ✅ **已实现** | Playwright RPA 有 DOM read-back verify；`VERIFYING` phase；ERP 有远端查询验证逻辑 |
| Phase 9 | Outcome Tracking | ✅ **已实现** | `OutcomeTracking` 模块；7/14/30 天观察窗；outcome-evaluator worker |
| Phase 10 | Execution Evidence | ✅ **已实现** | `evidence` JSON 字段；screenshot (PNG)；trace.zip (Playwright)；request/response 摘要 |
| Phase 11 | Trace | ✅ **已广泛使用** | `traceId` 在 86 处代码中传递；贯穿 Workflow → Action → Execution → Adapter |
| Phase 12 | Structured Logs | ❌ **缺失** | 大量 `console.log()`；缺少统一日志框架和结构化 event schema |
| Phase 13 | Metrics | ❌ **缺失** | 无 Prometheus/StatsD；无时序指标收集；无 Grafana dashboard |
| Phase 14 | Human Audit | ⚠️ **部分实现** | `NEEDS_ATTENTION` + `resolveNeedsAttention` API；缺少完整 audit event 表和人工操作历史 |
| Phase 15 | Execution Center UI | ❌ **缺失** | 无统一前端执行历史页面；execution detail、timeline、evidence 展示缺失 |

### 1.3 数据库模型现状

**已存在核心表**：

1. **AutomationOperation**（已是统一 Execution 模型）：
   ```prisma
   model AutomationOperation {
     id                  String    @id
     workspaceId         String
     actionId            String?
     connectionId        String
     operationKind       String
     idempotencyKey      String    // ✅ 幂等键
     payloadHash         String
     mode                String
     provider            String
     phase               String    // ✅ 状态机
     effect              String    // ✅ 副作用追踪
     recovery            String    // ✅ 恢复策略
     externalId          String?   // ✅ 远端标识
     version             Int
     leaseOwner          String?   // ✅ Crash Recovery
     leaseUntil          DateTime?
     attemptCount        Int       // ✅ Retry 计数
     nextAttemptAt       DateTime? // ✅ Retry 调度
     lastErrorCode       String?
     evidence            Json?     // ✅ Evidence 存储
     createdAt           DateTime
     updatedAt           DateTime
     
     @@unique([workspaceId, connectionId, operationKind, idempotencyKey])
   }
   ```

2. **WorkflowIdempotency**：Workflow 级别幂等性
3. **PlannedAction**：业务层 Action 定义
4. **AgentTask**：异步任务队列（包含 `OUTCOME_CREATION_RETRY`）

**缺失**：
- ❌ 独立的 `ExecutionAttempt` 表（每次尝试的详细记录）
- ❌ `ExecutionAudit` 表（人工干预审计）
- ❌ 细粒度的 timeline events

### 1.4 关键代码模块

| 模块 | 路径 | 职责 |
|-----|------|-----|
| Action Router | `packages/actions/src/action.router.ts` | 入口分派、幂等检查、Human Gate |
| Automation Store | `packages/db/src/automation/automation-operation-store.ts` | AutomationOperation CRUD、幂等冲突检测、claim lease |
| Recovery Worker | `apps/worker/src/processors/automation-recovery.processor.ts` | 扫描过期任务、verify、retry、escalate |
| Shopify Adapter | `packages/db/src/commerce/shopify-adapter.ts` | 真实 Shopify GraphQL API |
| Playwright RPA | `packages/integrations/src/rpa/playwright.adapter.ts` | 浏览器自动化 + 截图 + trace |
| ERP Adapter | `packages/integrations/src/erp/http-erp.adapter.ts` | 外部 ERP HTTP 调用 |

---

## 2. 方案问题分析

### 2.1 重复造轮子风险（Critical）

方案的 Phase 1-11 大量与现有实现重叠：

| Phase | 方案建议 | 现有实现 | 风险 |
|-------|---------|---------|------|
| 1 | "建立统一 Execution Domain" | `AutomationOperation` 已是完整 domain | 🔴 如新建 `Execution` 表会与 `AutomationOperation` 冲突 |
| 2 | "Worker 化" | 5 个 BullMQ worker 已运行 | 🔴 重复注册队列或替换现有 worker 会导致生产中断 |
| 3 | "Retry 体系" | `attemptCount` + backoff 已工作 | 🟡 可增强错误分类，但核心逻辑已存在 |
| 6 | "Crash Recovery" | lease + heartbeat + recovery 已实现 | 🔴 重新实现会与现有 `automation-recovery.processor` 冲突 |

### 2.2 架构认知偏差（High）

方案第 6 节建议的 Execution Domain 结构：

```text
Action
  └── Execution
        ├── Attempt 1
        ├── Attempt 2
        └── Evidence
```

**实际已存在结构**：

```text
PlannedAction (业务层)
  └── AutomationOperation (执行层 = 方案中的 "Execution")
        ├── attemptCount (计数器)
        ├── evidence (JSON)
        ├── phase (状态机: READY → SUBMITTED → VERIFYING → COMPLETED/NEEDS_ATTENTION)
        └── recovery (策略: RETRY / QUERY / MANUAL)
```

方案未识别出 `AutomationOperation` 就是它想要建立的"统一 Execution"。

### 2.3 Phase 0 审计指令不当（Medium）

方案要求：
> "先扫描代码，不允许直接开改"  
> "Audit 完成后，按照本文 Phase 1 → Phase 17 顺序实施"

**问题**：
- Phase 0 audit 会发现大量能力已存在，但方案 Phase 1-17 仍按"从零开始"设计
- 没有提供"如果能力已存在，如何调整后续 Phase"的指引
- 执行者会陷入"audit 说已存在，但方案说要新建"的矛盾

### 2.4 真正缺失的能力被淹没（High）

方案 Phase 12-15 才提到的**真正缺失**能力：

1. **Structured Logging**（Phase 12）
2. **Metrics**（Phase 13）
3. **Execution Center UI**（Phase 15）

这些才是真正需要新增的，但被埋在大量重复任务后面，容易被执行者忽略或延后。

---

## 3. 修订建议

### 3.1 Phase 0：Current Execution Audit（保留，调整目标）

**修订目标**：
- 不是"定位链路"（链路已清晰），而是**盘点现有能力边界与缺口**
- 输出**能力对照表**（现有 vs 方案需求）
- 明确**增强点**而非"新增点"

**输出文件**：
```text
docs/automation-runtime/CURRENT_EXECUTION_CAPABILITY_ASSESSMENT.md
```

包含：
- AutomationOperation 模型完整字段说明
- automation-recovery.processor 执行流程图
- 已实现 Gate 清单（Idempotency / Retry / Crash Recovery / Verify）
- **明确缺口**：Structured Logs / Metrics / UI / Audit Trail / Error Classification

### 3.2 调整后的 Phase 清单

| Phase | 原方案 | 修订后 | 理由 |
|-------|--------|--------|------|
| 0 | Audit | ✅ **保留**（调整目标为能力对照） | - |
| 1 | 统一 Execution Model | ❌ **删除** | AutomationOperation 已是统一模型 |
| 2 | BullMQ / Worker | ❌ **删除** | 已运行，不要重复注册 |
| 3 | Retry 体系 | 🔄 **调整为"Error Classification 统一"** | Retry 已存在，需要统一错误分类 |
| 4 | Timeout | 🔄 **调整为"Timeout 统一管理 + AbortSignal"** | 各处 timeout 需要统一配置和取消传递 |
| 5 | Idempotency | ❌ **删除** | 已完整实现 |
| 6 | Crash Recovery | ❌ **删除** | 已实现 |
| 7 | DLQ | 🔄 **调整为"DLQ 前端展示"** | 逻辑已存在（NEEDS_ATTENTION），需要 UI |
| 8 | Verify | ❌ **删除** | 已实现 |
| 9 | Outcome | ❌ **删除** | 已实现 |
| 10 | Evidence | 🔄 **调整为"Evidence 结构化增强"** | 基础已存在，可增强结构化 schema |
| 11 | Trace | ❌ **删除** | 已广泛使用 |
| 12 | Structured Logs | ✅ **保留**（P0） | **真正缺失** |
| 13 | Metrics | ✅ **保留**（P0） | **真正缺失** |
| 14 | Human Audit | 🔄 **调整为"Audit Trail 完善"** | 部分存在，需要 ExecutionAudit 表和完整记录 |
| 15 | Execution Center UI | ✅ **保留**（P0） | **真正缺失** |
| 16 | E2E Test | ✅ **保留** | - |
| 17 | Freeze | ✅ **保留** | - |

### 3.3 推荐实施顺序（修订版）

```text
Phase 0   Current Execution Capability Assessment（能力对照表）

Phase 1   Error Classification 统一
          ├─ NormalizedExecutionError 接口
          ├─ 各 Adapter 标准化错误映射
          └─ retryable / errorClass 规范

Phase 2   Timeout 统一管理
          ├─ 配置中心化（环境变量 / config）
          ├─ AbortSignal 传递链路
          └─ Timeout 分类（HTTP / Browser / Execution）

Phase 3   Structured Logging
          ├─ 日志框架选型（Winston / Pino）
          ├─ Event Schema 设计（execution.queued / started / completed）
          ├─ 全局注入 traceId / executionId
          └─ 替换 console.log

Phase 4   Metrics
          ├─ Prometheus Client 集成
          ├─ 核心指标：execution_total / execution_duration_ms / retry_total / dlq_total
          ├─ 按 adapter / actionType / errorClass 分组
          └─ /metrics 端点暴露

Phase 5   ExecutionAttempt 详细历史
          ├─ 新增 ExecutionAttempt 表（可选）
          ├─ 记录每次 attempt 的完整上下文
          └─ 关联到 AutomationOperation

Phase 6   ExecutionAudit 人工干预记录
          ├─ 新增 ExecutionAudit 表
          ├─ 记录所有人工操作（retry / resolve / dismiss）
          ├─ actor / reason / before/after state
          └─ API 层自动记录

Phase 7   Evidence 结构化增强
          ├─ Evidence schema validation
          ├─ 敏感信息 redaction 自动化
          └─ 类型化 Evidence（REQUEST / RESPONSE / SCREENSHOT / VERIFY_RESULT）

Phase 8   Execution Center API
          ├─ GET /executions（list + filter）
          ├─ GET /executions/:id（detail + attempts + evidence + audit）
          ├─ POST /executions/:id/retry
          └─ POST /executions/:id/resolve

Phase 9   Execution Center UI
          ├─ Execution List 页面
          ├─ Execution Detail 页面（Timeline / Attempts / Evidence / Errors / Audit）
          ├─ Screenshot / Trace 查看器
          └─ 人工 Retry / Resolve 操作

Phase 10  E2E / Chaos / Regression
          ├─ Duplicate delivery test
          ├─ Worker crash test
          ├─ Timeout test
          ├─ Verify mismatch test
          └─ DLQ test

Phase 11  Documentation & Freeze
          ├─ AUTOMATION_RUNTIME_ARCHITECTURE.md
          ├─ FAILURE_CLASSIFICATION.md
          ├─ EXECUTION_STATE_MACHINE.md
          └─ FROZEN 标记
```

### 3.4 关键原则调整

**原方案原则**：
> "在现有执行层'外面'增加 Reliability Runtime"

**修订原则**：
> "**AutomationOperation + automation-recovery 已是 Reliability Runtime 核心，本阶段是增强和可视化，不是重建。**"

具体：
- ✅ 增强 Error Classification
- ✅ 增强 Logging / Metrics / UI
- ✅ 完善 Audit Trail
- ❌ 不新建 Execution 表
- ❌ 不替换 BullMQ Worker
- ❌ 不重写 Retry 逻辑

---

## 4. 风险评估

### 4.1 如果按原方案执行的风险

| 风险 | 严重性 | 可能性 | 影响 |
|-----|--------|--------|------|
| 重复建表导致数据分裂 | 🔴 Critical | High | AutomationOperation 与新 Execution 表数据不一致 |
| Worker 冲突导致生产中断 | 🔴 Critical | Medium | 新 Worker 与现有 automation-recovery 争抢任务 |
| 幂等性双重实现导致漏洞 | 🔴 Critical | Medium | 新旧幂等机制不兼容，重复执行风险 |
| 开发周期浪费 | 🟡 High | High | 重复开发已有能力，实际缺口（UI/Metrics）延后 |
| 测试覆盖不足 | 🟡 High | High | 新系统测试充分，但与现有系统集成测试缺失 |

### 4.2 修订方案风险

| 风险 | 严重性 | 缓解措施 |
|-----|--------|---------|
| 现有 AutomationOperation 字段不够用 | 🟡 Medium | 可增加字段或关联 ExecutionAttempt 表，无需替换 |
| automation-recovery 逻辑需要重构 | 🟡 Medium | 增量优化，不推翻现有逻辑 |
| Error Classification 统一工作量大 | 🟢 Low | 逐个 Adapter 适配，可分阶段 |

---

## 5. 具体技术建议

### 5.1 Error Classification 统一

**新增类型**：
```typescript
// packages/shared/src/contracts/execution-contracts.ts
export type ExecutionErrorClass =
  | 'TRANSIENT'           // 网络抖动、临时不可用
  | 'RATE_LIMIT'          // 429
  | 'TIMEOUT'             // 超时
  | 'AUTH'                // 认证失败
  | 'PERMISSION'          // 授权不足
  | 'VALIDATION'          // 参数错误
  | 'CONFLICT'            // 409 冲突
  | 'NOT_FOUND'           // 404
  | 'PROVIDER_ERROR'      // 上游 5xx
  | 'RPA_SELECTOR'        // Playwright selector 失败
  | 'RPA_NAVIGATION'      // 页面导航失败
  | 'VERIFY_MISMATCH'     // 验证不匹配
  | 'UNKNOWN';

export interface NormalizedExecutionError {
  class: ExecutionErrorClass;
  code: string;              // 细粒度错误码
  message: string;
  retryable: boolean;
  provider?: string;
  originalStatus?: number;
  cause?: unknown;
}
```

**Adapter 层映射示例**：
```typescript
// packages/integrations/src/provider-framework/core/error-normalizer.ts
export function normalizeProviderError(err: ProviderError): NormalizedExecutionError {
  if (err.code === 'RATE_LIMITED') {
    return {
      class: 'RATE_LIMIT',
      code: 'PROVIDER_RATE_LIMIT',
      message: err.message,
      retryable: true,
      provider: err.provider,
    };
  }
  // ... 其他映射
}
```

### 5.2 Structured Logging

**推荐方案**：Pino（高性能 JSON logger）

```typescript
// packages/shared/src/logging/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: process.env.SERVICE_NAME || 'crosspilot',
  },
});

// 使用
logger.info({
  event: 'execution.started',
  traceId: ctx.traceId,
  executionId: execution.id,
  actionType: action.type,
  adapter: 'shopify',
}, 'Execution started');
```

### 5.3 Metrics

**推荐方案**：prom-client

```typescript
// packages/shared/src/metrics/execution-metrics.ts
import { Counter, Histogram, register } from 'prom-client';

export const executionTotal = new Counter({
  name: 'crosspilot_execution_total',
  help: 'Total number of executions',
  labelNames: ['adapter', 'actionType', 'status'],
});

export const executionDuration = new Histogram({
  name: 'crosspilot_execution_duration_ms',
  help: 'Execution duration in milliseconds',
  labelNames: ['adapter', 'actionType'],
  buckets: [100, 500, 1000, 5000, 10000, 30000],
});

// 使用
executionTotal.inc({ adapter: 'shopify', actionType: 'UPDATE_PRODUCT', status: 'success' });
executionDuration.observe({ adapter: 'shopify', actionType: 'UPDATE_PRODUCT' }, durationMs);
```

### 5.4 ExecutionAttempt 表（可选）

如果需要更细粒度的 attempt 历史：

```prisma
model ExecutionAttempt {
  id              String   @id @default(uuid())
  operationId     String   @map("operation_id")
  attemptNo       Int      @map("attempt_no")
  startedAt       DateTime @map("started_at")
  finishedAt      DateTime @map("finished_at")
  durationMs      Int      @map("duration_ms")
  status          String   // SUCCESS / FAILED / TIMEOUT
  errorClass      String?  @map("error_class")
  errorCode       String?  @map("error_code")
  errorMessage    String?  @map("error_message")
  workerId        String?  @map("worker_id")
  evidence        Json?
  
  operation AutomationOperation @relation(fields: [operationId], references: [id], onDelete: Cascade)
  
  @@unique([operationId, attemptNo])
  @@index([operationId])
  @@map("execution_attempts")
}
```

**权衡**：
- **优点**：每次尝试独立记录，查询方便
- **缺点**：增加数据库负担；现有 `evidence` JSON 可能已足够

**建议**：Phase 5 先评估现有 `evidence` + `attemptCount` 是否满足需求，不满足再建表。

---

## 6. 验收标准调整

### 6.1 Gate A — Static（保持不变）

```text
typecheck PASS
lint PASS
build PASS
```

### 6.2 Gate B — Existing Regression（保持不变）

```text
现有所有测试 PASS
不删除旧测试
```

### 6.3 Gate C — Reliability（调整）

**原方案**：
> "必须证明：Retry PASS / Timeout PASS / Idempotency PASS / Crash Recovery PASS / DLQ PASS"

**修订**：
> "必须证明**增强部分** PASS："
> - Error Classification 覆盖所有 Adapter ✅
> - Timeout 统一配置生效 ✅
> - Structured Logs 输出正确 event ✅
> - Metrics 正确上报 ✅
> - ExecutionAudit 正确记录人工操作 ✅

**保留现有能力的回归测试**：
- Idempotency 回归：`automation-erp-http.spec.ts` / `automation-receipt-postgres.spec.ts`
- Retry 回归：`automation-recovery-postgres.spec.ts`
- Crash Recovery 回归：`automation-batch-d-alignment.spec.ts`

### 6.4 Gate D — Verify（调整）

**原方案**：
> "至少 1 个真实 Shopify 写动作完成 execute → read-back → VERIFIED"

**修订**：
> "**复用现有验证**，无需重新证明："
> - Shopify Read Adapter 已验证（HANDOFF.md Phase A）
> - Playwright RPA Listing 已验证（HANDOFF.md Phase B）
> - ERP HTTP Adapter 已验证（`automation-erp-http.spec.ts`）
>
> **本阶段只需证明**：新增的 Structured Logs / Metrics 正确输出上述验证过程。

### 6.5 Gate E — Observability（调整）

**原方案**：
> "任意一次执行，可以通过 executionId 查到：Action / Status / Attempts / Evidence / Timeline / Audit / TraceId"

**修订**：
> "通过 **Execution Center UI** 查到："
> - ✅ 执行列表（筛选、分页）
> - ✅ 执行详情（Overview / Timeline / Attempts / Evidence / Errors / Audit）
> - ✅ Screenshot / Trace 查看
> - ✅ 人工 Retry / Resolve 操作
> - ✅ Structured Logs 可通过 traceId 关联
> - ✅ Metrics 正确展示在 Grafana（可选，优先级降低）

### 6.6 Gate F — Security（保持不变）

```text
repo-wide secret scan PASS
log redaction PASS
evidence redaction PASS
```

---

## 7. 最终交付清单（修订版）

### 7.1 代码交付

| 模块 | 文件 | 状态 |
|-----|------|------|
| Error Classification | `packages/shared/src/contracts/execution-contracts.ts` | 新增 |
| Error Normalizer | `packages/integrations/src/provider-framework/core/error-normalizer.ts` | 新增 |
| Structured Logger | `packages/shared/src/logging/logger.ts` | 新增 |
| Execution Metrics | `packages/shared/src/metrics/execution-metrics.ts` | 新增 |
| ExecutionAudit 表 | `packages/db/prisma/schema.prisma` | 扩展 |
| Execution API | `apps/api/src/modules/operation-automation/` | 扩展 |
| Execution Center UI | `apps/web/src/app/app/executions/` | 新增 |

### 7.2 文档交付

| 文档 | 路径 | 内容 |
|-----|------|------|
| 能力对照表 | `docs/automation-runtime/CURRENT_EXECUTION_CAPABILITY_ASSESSMENT.md` | Phase 0 输出 |
| 架构文档 | `docs/automation-runtime/AUTOMATION_RUNTIME_ARCHITECTURE.md` | AutomationOperation + automation-recovery 流程图 |
| 错误分类 | `docs/automation-runtime/FAILURE_CLASSIFICATION.md` | ExecutionErrorClass 定义 + Adapter 映射表 |
| 状态机 | `docs/automation-runtime/EXECUTION_STATE_MACHINE.md` | phase / effect / recovery 状态转移图 |
| Metrics 清单 | `docs/automation-runtime/METRICS_REFERENCE.md` | 所有指标定义 + 查询示例 |

### 7.3 测试交付

| 测试套件 | 覆盖范围 |
|---------|---------|
| Error Classification | 每个 Adapter 的错误映射正确性 |
| Structured Logs | 关键 event 正确输出（execution.started / completed / failed / retry_scheduled） |
| Metrics | 计数器和直方图正确累加 |
| ExecutionAudit | 人工操作正确记录 |
| Execution API | CRUD + 人工 retry / resolve |
| Execution UI | E2E 前端测试（列表 / 详情 / 操作） |

---

## 8. 时间估算（修订版）

| Phase | 原方案估算 | 修订后估算 | 备注 |
|-------|-----------|-----------|------|
| 0 | 1 天 | 0.5 天 | 只需盘点，不需要深度链路追踪 |
| 1-2（原） | 5-7 天 | **0 天（删除）** | BullMQ/Worker 已存在 |
| 3（Error Class） | 2-3 天 | 2 天 | 统一错误分类 + Adapter 适配 |
| 4（Timeout） | 1-2 天 | 1 天 | 统一配置 + AbortSignal |
| 5-11（原） | 10-15 天 | **0-2 天（大部分删除）** | 只保留 ExecutionAttempt 可选实现 |
| 12（Structured Logs） | 2-3 天 | 3 天 | Pino 集成 + 全局替换 console.log |
| 13（Metrics） | 2-3 天 | 2 天 | prom-client + 核心指标 |
| 14（Audit Trail） | 2 天 | 2 天 | ExecutionAudit 表 + API 集成 |
| 15（UI） | 5-7 天 | 5 天 | Execution Center 前端页面 |
| 16-17（Test + Freeze） | 3-5 天 | 3 天 | E2E / 文档 / Freeze |
| **总计** | **33-48 天** | **18-20 天** | **节省约 50% 时间** |

---

## 9. 审核结论与行动建议

### 9.1 结论

⚠️ **CHANGES_REQUIRED**

原方案目标正确，但对现有能力评估不足，存在严重的重复造轮子风险。必须调整方案，聚焦**真正缺失的能力**（Structured Logging / Metrics / UI / Audit Trail），避免重复开发已实现的核心逻辑（BullMQ / Retry / Idempotency / Crash Recovery）。

### 9.2 立即行动

**Step 1**：执行修订版 Phase 0
- 生成 `CURRENT_EXECUTION_CAPABILITY_ASSESSMENT.md`
- 与本审核报告对照，确认盘点结果

**Step 2**：确认修订后 Phase 清单
- 与团队 review 修订版 Phase 1-11
- 确认删除 / 调整 / 保留的决策

**Step 3**：按修订顺序实施
- 优先 Error Classification + Structured Logs + Metrics（P0）
- 其次 Audit Trail + UI（P1）
- 最后 E2E + Documentation

**Step 4**：每个 Phase 完成后独立 commit
- 提交信息格式：`[Automation Runtime] Phase N: <description>`
- 确保测试全绿后再进入下一 Phase

### 9.3 不建议的行动

❌ **不要新建 Execution 表**（AutomationOperation 已足够）  
❌ **不要替换 automation-recovery Worker**（核心逻辑已稳定）  
❌ **不要重写 Retry 逻辑**（只需统一错误分类）  
❌ **不要按原方案 Phase 1-17 顺序盲目执行**（会浪费大量时间）

---

## 10. 附录：现有能力快速参考

### 10.1 AutomationOperation Phase 状态机

```text
READY          初始状态，等待执行
    ↓
SUBMITTED      已提交到外部系统，等待确认
    ↓
VERIFYING      正在验证远端状态
    ↓
COMPLETED      已完成（effect = APPLIED）
    ↓
NEEDS_ATTENTION  需要人工介入（attemptCount >= 3 或验证失败）
```

### 10.2 Recovery 策略

```text
RETRY          可自动重试（TRANSIENT / RATE_LIMIT）
QUERY          需要查询远端状态（TIMEOUT / UNKNOWN）
MANUAL         需要人工解决（VALIDATION / PERMISSION）
REAUTHORIZE    需要重新授权（AUTH）
```

### 10.3 Effect 分类

```text
NOT_APPLIED    确认未产生副作用
APPLIED        确认已产生副作用
PARTIALLY_APPLIED  部分生效
UNKNOWN        无法确定（TIMEOUT 后常见）
```

### 10.4 关键代码入口

```typescript
// 创建执行记录 + 幂等检查
await automationStore.createOrReplay(scope, command);

// Claim lease（Crash Recovery）
const claimed = await automationStore.claim(workspaceId, opId, version, workerId, 30000);

// 记录 evidence
await automationStore.recordEvidence(workspaceId, opId, version, evidenceData);

// 扫描过期任务
const dueOps = await automationStore.listDue(new Date(), limit);
```

---

**审核人**：贾维斯 AI Assistant  
**审核日期**：2026-09-19  
**下一步**：等待团队确认修订方案，启动修订版 Phase 0
