# CrossPilot V9.1 Phase 2.1 — Persistent Idempotency Hardening Report

> **阶段**：V9.1 Phase 2.1 只处理 V91-017（WF-05 跨进程幂等）  
> **基线**：`V9_1_FULL_PRODUCT_BUG_AUDIT.md` + `V9_1_PHASE1_P0_P1_FIX_REPORT.md` + `V9_1_PHASE2_STABILITY_FIX_REPORT.md` §19 + `CURRENT_SYSTEM_AUDIT_BASELINE.md`  
> **日期**：2026-09-12  
> **边界**：未启动 Phase 3 / Epic 4；未改 WF-05 DAG / Detector / Diagnosis / Recommendation / 补货公式 / 利润方差 / OCC `updateMany`；Prisma 仅新增 `WorkflowIdempotency`

---

## 1. Current Problem

Phase 2 留下的事实（§19）：

`DailyDiagnosisService.idempotencyMap` 是进程内：

```ts
Map<string, { taskId, timestamp }>
```

后果：

1. 进程重启后幂等丢失，同一 `workspaceId + idempotencyKey` 会再开一条 Workflow。
2. 多实例不共享 Map，竞态可创建多条 Workflow。
3. key 未作为 `(workspaceId, scope, key)` 持久化主键。
4. 与「PostgreSQL = Production Workflow SoT」不一致。

这不是跨租户读检查点（checkpoint 仍校验 `workspaceId`），所以不是 P0 泄漏。本阶段要解决的是**生产级跨进程幂等**。

本轮已删除 `idempotencyMap`。API 源码中该符号为 0 命中。

---

## 2. Existing Data Model Review

审查对象：`packages/db/prisma/schema.prisma`、`AgentTask`、`WorkflowCheckpoint`（实现为 `AgentTask.resultJson` + `PrismaWorkflowDatabaseAdapter`）、`Approval`。

| 结构 | 能否承载 V91-017 | 结论 |
| :--- | :--- | :--- |
| `AgentTask` | 有 `workspaceId`，无 `idempotencyKey`；同一表承载 LISTING_GENERATE / COMPLIANCE_CHECK / VOC_ANALYZE / VARIANCE_ATTRIBUTION / INVENTORY_PLAN / DAILY_OPERATION_WF05 | 不适合加唯一键 |
| Checkpoint metadata / `resultJson` | JSON，无 DB unique；要扫全表；无法原子 claim | 禁止 |
| 进程 Map / 文件 / 单实例锁 | 与目标相反 | 禁止 |
| 新表 `WorkflowIdempotency` | `(workspaceId, scope, idempotencyKey)` unique；claim 可在 `AgentTask` 行出现之前完成 | **采用** |

`AgentTask` 不能作为 claim 锚点：幂等记录必须在 `execute()` 写第一份 checkpoint **之前**占住 key。`execute()` 第一份 checkpoint 在 `DailyOperationWorkflowService` 初始化 state 之后（`checkpointStore.save`），若先 `create AgentTask` 再写 mapping，崩溃会留下无 mapping 的 task（重复执行）。若把 key 建在 `AgentTask` 上，claim 时 task 还不存在。

---

## 3. Chosen Design

```text
workspaceId + scope='daily-diagnosis' + idempotencyKey
        ↓
INSERT workflow_idempotency  (unique)
        ↓
P2002 → 读已有 taskId 并 replay
成功 → execute() 写 checkpoint / AgentTask
```

语义：

- 同一 workspace + key：有效窗口内返回同一个 `taskId`，只创建一条 Workflow。
- 不同 workspace + 相同 key：两条独立 mapping、两个 task。
- 重启 / 第二实例：读 Postgres，不读进程内存。
- 只服务 Daily Diagnosis。`scope` 固定 `'daily-diagnosis'`。不是全平台万能幂等框架。

失败补偿：

- mapping 已在、poll 后既无 checkpoint 也无同 workspace 的 `AgentTask` → `deleteMany` 该 mapping，允许重新 claim。
- mapping 已在、`AgentTask` 已在但 checkpoint 尚未可读 → **不删** mapping，返回该 `taskId` / `RUNNING`，避免把正在执行的 winner 清掉。

---

## 4. Why Alternative Was Rejected

| 方案 | 拒绝原因 |
| :--- | :--- |
| `AgentTask.idempotencyKey` + unique | 其它 taskType 共用此表，唯一索引会串类型；claim 时 task 行还不存在 |
| checkpoint JSON / 扫 `resultJson` | 无 unique，无法挡住并发 INSERT |
| 继续用 Map | 重启 / 多实例失效，正是本 bug |
| 文件系统 / 单实例锁 | 违反 Postgres SoT |
| 为避免 migration 把 key 塞进随意 JSON | 命令明确禁止 |

---

## 5. Prisma Changes

仅新增模型与 Workspace 反向关系。未改 `AgentTask` 列、未改 `WorkflowCheckpoint` 适配器、未改其它业务表。

```prisma
model WorkflowIdempotency {
  id             String   @id @default(uuid())
  workspaceId    String   @map("workspace_id")
  scope          String
  idempotencyKey String   @map("idempotency_key")
  taskId         String   @map("task_id")
  createdAt      DateTime @default(now()) @map("created_at")

  workspace      Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, scope, idempotencyKey])
  @@index([taskId])
  @@index([workspaceId])
  @@map("workflow_idempotency")
}
```

`Workspace.workflowIdempotencyKeys` 为关系字段。

**无 `expiresAt`**：见 §8。

**无 FK 到 `agent_tasks`**：claim 发生在 task 行创建之前，不能引用尚不存在的 task。

工作区 `schema.prisma` 相对 git HEAD 还包含 Epic 3 Phase 6.2 已落地、从未 commit 的 `AgentTask` checkpoint 字段（`checkpointVersion` 等）。那些**不是本阶段改动**；本阶段 migration 也不重建 `agent_tasks`。

---

## 6. Migration

文件：`packages/db/prisma/migrations/20260912120000_workflow_idempotency/migration.sql`

- 只 `CREATE TABLE workflow_idempotency`
- unique：`(workspace_id, scope, idempotency_key)`
- index：`task_id`、`workspace_id`
- FK：`workspace_id → workspaces(id)` `ON DELETE CASCADE`
- **无 DROP / 无重建生产表**

这是仓库里第一份 Prisma migration 目录。现有环境若一直用 `db push`：

1. 对空库：`prisma migrate deploy` 只加这一张表。
2. 对已有库且表还不存在：直接执行该 SQL（additive），然后  
   `prisma migrate resolve --applied 20260912120000_workflow_idempotency`
3. 回滚风险：`DROP TABLE workflow_idempotency`；不影响 `agent_tasks` / checkpoints。已发出去的幂等保证会丢失，行为退回 Phase 2 Map。

验证记录：

```text
npx prisma validate     PASS  (schema at prisma/schema.prisma is valid)
pnpm exec prisma generate
  WorkflowIdempotency 出现在 generated Prisma Client
  (node_modules/.pnpm/@prisma+client@6.19.3_.../.prisma/client)
```

本机未对真实 Postgres 执行 `migrate deploy`（无强制连库步骤）。SQL 与 schema 字段一一对应。

---

## 7. Concurrency Semantics

禁止 `SELECT → 空 → CREATE`。实现是：

```text
Request A ─┐
           ├─ same workspace + key
Request B ─┘

A INSERT 成功 → 成为 winner，随后 execute()
B INSERT P2002 → findUnique 读 A 的 taskId → replay checkpoint
```

`claimIdempotency` 只把 `P2002` 当「已有 winner」。其它 DB 错误上抛。

测试 mock 的 `workflowIdempotency.create` 在 `has(key)` 与 `set(key)` 之间无 await，等价于 unique 的原子性。

---

## 8. Workspace Isolation

Unique 含 `workspaceId`。A/B 即使用同一个 `idempotencyKey` 也是两行。

`replayIdempotentTask` 额外要求 `state.workspaceId === workspaceId`（或 `AgentTask.workspaceId`）。A 调 `getTaskSummary(B.taskId)` 仍是 `403 WORKSPACE_ACCESS_DENIED`。

---

## 9. Restart Verification

测试：`survives service restart by reading Postgres instead of process memory`

1. instance 1 `startDiagnosis(ws-a, restart-key)` → taskId T
2. `setDailyOperationWorkflowService(null)`，**new** `DailyDiagnosisService`（空内存）
3. instance 2 同一 key → `taskId === T`，`agentTasks.size === 1`

---

## 10. Multi-instance Verification

测试：两个 `DailyDiagnosisService` 共享同一 mock Prisma，`Promise.all` 同一 key。

结果：同一 `taskId`，`idempotency.size === 1`，`agentTasks.size === 1`。

同实例 `Promise.all` 再测一次，结果相同。unique 挡住 race，不是单实例锁。

---

## 11. Regression Tests

新增：`apps/api/test/v91-phase2-1-idempotency.spec.ts`（6 tests）

| # | 场景 | 结果 |
| :--- | :--- | :--- |
| 1 | 同 workspace + 同 key 连续两次 | 同一 taskId，1 workflow，1 mapping |
| 2 | 不同 workspace + 同 key | 两个 task，2 mapping |
| 3 | Restart：新 service 实例 | 仍返回原 taskId |
| 4 | 两实例并发 | 1 workflow / 1 mapping / 同 taskId |
| 5 | 同实例 `Promise.all` | 同上 |
| 6 | A 不得 `getTaskSummary` B 的 task | `ForbiddenException` |

既有 WF-05：

```text
daily-diagnosis.integration.spec.ts          PASS（含原 idempotencyKey 同 task）
operations-today-workbench.integration.spec.ts PASS
domain daily-operation-workflow / OCC / checkpoint  PASS
tool-platform operation-daily-diagnosis.tools        PASS
```

未改 approve / reject / dismiss / resume / OCC `updateMany`。

---

## 12. Full Quality Gate

```text
pnpm -r typecheck                         10/10 PASS
pnpm --filter @crosspilot/api test        12 suites / 83 tests PASS
pnpm --filter @crosspilot/domain test     24 suites / 228 tests PASS
pnpm --filter @crosspilot/web test        17 PASS
pnpm --filter @crosspilot/actions test    2 PASS
pnpm --filter @crosspilot/ai test         6 PASS
pnpm --filter @crosspilot/tool-platform   16 PASS
node scripts/run-evals.cjs                9/9 PASS
pnpm --filter @crosspilot/web run build   23/23 PASS
Epic 1/2/3 golden                         0 Regression
V9.1 Phase 1 / Phase 2 contracts          0 Regression
Browser E2E                               NOT RUN（本阶段禁止）
```

`pnpm -r test` **在 `@crosspilot/integrations` 失败**：

```text
provider-framework.test.cjs
  resHealth.data.totalReviewCount
  actual 5151 !== expected 5147
```

这是工作区里**既有、未提交**的 XYDC / Provider Framework 脏文件 + 硬编码评论数，**本阶段零修改**。冻结域禁止改 Provider Framework / XYDC。不把 5147 改成 5151 来「刷绿」。

Phase 2.1 范围内的测试（API / domain / web contracts / evals / typecheck / web build）全绿。

---

## 13. Frozen Architecture Diff

本阶段 **未修改**：

- `Sku360ContextLoader`
- `OperationAnomalyDetector`
- `CrossDomainDiagnosisService`
- `ActionRecommendationService`
- `DailyOperationWorkflowService` DAG 拓扑
- 补货公式 / Profit / Variance
- OCC `expectedVersion` + `updateMany`
- Real Milvus RAG
- Unified LLM Runtime
- Provider Framework / XYDC Provider
- Phase 1 / Phase 2 已完成业务语义

本阶段修改：

- `packages/db/prisma/schema.prisma`（仅 `WorkflowIdempotency` + Workspace 关系）
- `packages/db/prisma/migrations/20260912120000_workflow_idempotency/`
- `apps/api/src/modules/daily-diagnosis/daily-diagnosis.service.ts`
- `apps/api/test/daily-diagnosis.integration.spec.ts`（mock 增加 `workflowIdempotency`）
- `apps/api/test/v91-phase2-1-idempotency.spec.ts`
- 本报告

仓库里另有既有 XYDC / Listing DAG / 未 commit 的 Epic 3 文件，**不是 Phase 2.1 提交范围**。

---

## 14. Remaining Phase 3 Issues

未做，按命令停：

| ID | 主题 |
| :--- | :--- |
| V91-022 | Workspace / Marketplace / SKU Switcher |
| V91-023 | OCC UX polish |
| V91-025 | Accessibility |
| V91-026 | Overview hardcoded copy |
| V91-027 | Shell visual / copy |
| V91-028 | Duplicate WorkspaceGuard cleanup |
| V91-029 | Documentation Drift |

---

## 15. Known Gaps

不变：Approval ≠ Execute、Epic 4 SUSPENDED、WF-03/04 PARTIAL、Launch MISSING、Creative Mock、无 Scheduler、无 Amazon 自动执行。

幂等窗口：原 `idempotencyMap` **存了 `timestamp`，源码从未用它做 TTL 过期**。本阶段不发明 24h / 7d，表上也没有 `expiresAt`。当前语义是：**在 mapping 仍存在且对应 task/checkpoint 可恢复时，同一 key 一直复用**。若 mapping 成为孤儿（无 checkpoint、无 AgentTask），允许清理后重新 claim。

未做：浏览器点选、多 Node 真实集群、对生产库 `migrate deploy`。

---

## 16. Stop Boundary

V91-017 完成并停止。

未自动：Phase 3、V91-022–029、Epic 4、UX polish、Browser 全站验收、新 Feature、改冻结算法。

```text
CrossPilot V9.1 Phase 2.1
Persistent Idempotency Hardening
COMPLETED / WAITING FOR HUMAN ACCEPTANCE
```
