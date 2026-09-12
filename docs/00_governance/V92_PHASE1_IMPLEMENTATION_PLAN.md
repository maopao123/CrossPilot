# V9.2 Phase 1 Implementation Plan — Playbook Framework

**Date:** 2026-09-12  
**Status:** PLAN ONLY — no application code, no migration applied, no deploy  
**Reads:** Architecture Spec, Implementation Spec, `V92_PHASE1_REPO_AUDIT.md`, this prompt  

```text
CODING = NOT STARTED
WAIT FOR CONFIRMATION
```

本文件是编码前的唯一施工单。与 `V92_PHASE1_REPO_AUDIT.md` 冲突时，**以本文件为准**（本轮指令覆盖审计里的 DRAFT/PUBLISHED、`completeRun`、独立 version API）。

---

## Locked decisions (do not reopen in coding)

| 项 | 决定 | 原因 |
| :--- | :--- | :--- |
| Package layout | `packages/domain/src/playbook` + `apps/api/src/modules/playbook` | 仓库没有 `packages/services`；不新建包 |
| Playbook vs Workflow | 两套模型、两套 API；禁止 extends / 禁止写入 `AgentTask` | 冻结 WF-05；执行状态只在 PlaybookRun |
| Playbook.status | `REGISTERED` \| `ACTIVE` \| `DISABLED` | 本轮指令 |
| 创建默认 status | `REGISTERED` | 对应 “注册” |
| startRun 允许的 Playbook status | `REGISTERED` 或 `ACTIVE`；`DISABLED` → `PLAYBOOK_DISABLED` | 避免再加 activate API |
| PlaybookRun.status 本阶段写入 | 只写 `CREATED` | 不执行业务，故不进入 RUNNING/COMPLETED/FAILED |
| RUNNING / COMPLETED / FAILED | 类型保留，Phase 1 不赋值 | 给 Phase 2+ 留口，本阶段无副作用 |
| `definition` | JSON 原样存储，Phase 1 **不解析、不执行** | 本轮字段；不是 Workflow DAG |
| `id` vs `run_id` | `PlaybookRun.id` = PK；`run_id` = 独立业务 id（新 uuid，`@@unique`） | AC-04 |
| 查 run | `GET /playbook-runs/:id` 按 **`run_id`** 查（即 POST 返回值） | 与 “返回 run_id” 对齐 |
| 无 complete API | 不实现 `completeRun` | 本轮最小 API；output 保持 null |
| Output schema AC-03 | 注册时校验 schema 形态；domain `validateAgainstSchema` 单测覆盖 output 数据校验 | 无 complete 端点也能证明 output schema 可校验 |
| 不新增 npm 依赖 | JSON object schema 子集，自写校验器 | 已有 zod，但不引入 ajv |
| Prisma `Workspace` | 只加 relation 字段，**不 ALTER `workspaces` 表** | additive only |
| 本机 | 不起 Postgres / API / Web / 浏览器 | 既有铁律 |
| 部署 / push | 不做 | 本阶段结束仍是本地 |

若编码时必须改冻结文件、加 Fact/Evidence 表、调 Workflow/Tool/XYDC/SP-API：停，不自行扩 scope。

---

## 1. 当前相关代码结构

```text
apps/api/src/
  app.module.ts                          # 注册 Nest modules（将加 PlaybookModule）
  main.ts                                # 全局前缀 /api/v1
  common/guards/                         # JWT / Workspace / ViewerWrite  — 复用
  common/filters/http-exception.filter.ts # 将映射 PLAYBOOK_* 错误码
  modules/tool-center/                   # 模块形态模板（controller + service + PrismaModule）
  modules/daily-diagnosis/               # WF-05 HTTP — 禁止改
  modules/agent-task/                    # AgentTask — 禁止改 / 禁止复用存 Playbook
  modules/commerce-store/                # Epic 4 — 禁止改

packages/domain/src/
  operations/workflow/                   # WF-05 — 禁止改
  listing/listing-workflow-dag.service.ts
  research/opportunity-score.*           # 冻结
  index.ts                               # 将 export playbook

packages/tool-platform/src/
  registry/tool.registry.ts              # 注册模式参考；Playbook 不是 Tool
  executor/tool.executor.ts              # Phase 1 禁止调用
  contracts/tool.types.ts                # ToolInputSchema 形态参考

packages/shared/src/
  constants/error-codes.ts
  contracts/                             # 将加 playbook-contracts.ts
  index.ts

packages/db/prisma/
  schema.prisma                          # 将加 Playbook / PlaybookRun
  migrations/20260912180000_epic4_store_foundation/

packages/integrations/                   # Provider / Amazon — 禁止改
```

HEAD：本地 `85f5b94`（Epic 4，未 push）；云机 / origin `e457d5a`。  
Playbook 代码：**不存在**（仅 knowledge seed 标题含 “Playbook” 字样）。

---

## 2. 可复用模块

| 复用 | 用法 |
| :--- | :--- |
| `JwtAuthGuard` + `WorkspaceGuard` + `ViewerWriteGuard` | 全部 Playbook API；VIEWER 写操作 403 `AUTH_FORBIDDEN` |
| `CurrentWorkspace` / `CurrentUser` | workspace_id / created_by |
| `PrismaModule` / `PrismaService` | Nest 持久化 |
| `TransformInterceptor` + `HttpExceptionFilter` | 统一 envelope；filter 增 PLAYBOOK_* 映射 |
| `ToolInputSchema` 形态 | Playbook JSON schema 子集（`type: object` + `properties` + `required`） |
| Epic 4 migration 风格 | `CREATE TABLE IF NOT EXISTS`，additive |
| `packages/domain/test/*.spec.ts` | 纯 domain Jest，不启 Nest |
| `apps/api/test/epic4-commerce-store.spec.ts` | Nest service + mock Prisma 的测试形态 |

**禁止复用为实现：** `DailyOperationWorkflowService`、`ToolExecutor`、`IntegrationGateway`、`AgentTask`、`WorkflowIdempotency`、`Approval`。

---

## 3. 新增文件

```text
packages/shared/src/contracts/playbook-contracts.ts

packages/domain/src/playbook/playbook.types.ts
packages/domain/src/playbook/playbook-schema.validator.ts
packages/domain/src/playbook/playbook-engine.ts
packages/domain/src/playbook/index.ts
packages/domain/test/playbook-framework.spec.ts

packages/db/prisma/migrations/20260912210000_v92_playbook_framework/migration.sql

apps/api/src/modules/playbook/playbook.module.ts
apps/api/src/modules/playbook/playbook.service.ts
apps/api/src/modules/playbook/playbook.controller.ts
apps/api/test/v92-phase1-playbook.spec.ts

docs/00_governance/V92_PHASE1_IMPLEMENTATION_EVIDENCE.md   # 编码完成后写，本计划不写
```

**不创建：** `packages/services/**`、任何 `apps/web/**`、Fact/Evidence/Recommendation 文件。

---

## 4. 数据模型设计

### 4.1 Playbook（定义，不含执行状态）

Prisma / SQL 表 `playbooks`：

| 字段 | 类型 | 约束 |
| :--- | :--- | :--- |
| `id` | uuid PK | `@default(uuid())` |
| `workspace_id` | string | FK `workspaces.id` ON DELETE CASCADE |
| `name` | string | 非空 |
| `version` | string | `MAJOR.MINOR.PATCH`（`/^\d+\.\d+\.\d+$/`） |
| `status` | string | `REGISTERED` \| `ACTIVE` \| `DISABLED`，默认 `REGISTERED` |
| `input_schema` | Json | 必须是合法 PlaybookJsonSchema |
| `output_schema` | Json | 必须是合法 PlaybookJsonSchema |
| `definition` | Json | 默认 `{}`；不解析 |
| `created_at` | DateTime | default now |
| `updated_at` | DateTime | `@updatedAt` |

Unique: `@@unique([workspaceId, name, version])`  
Index: `workspaceId`

Playbook **不得** 存 `run_id`、input payload、output payload。

### 4.2 PlaybookRun（唯一执行状态容器）

表 `playbook_runs`：

| 字段 | 类型 | 约束 |
| :--- | :--- | :--- |
| `id` | uuid PK | 内部主键，不作为对外 run_id |
| `workspace_id` | string | FK workspace CASCADE |
| `playbook_id` | string | FK playbooks CASCADE |
| `run_id` | string | **独立 uuid**，`@unique`，API 返回这个 |
| `status` | string | 类型含 `CREATED` \| `RUNNING` \| `COMPLETED` \| `FAILED`；Phase 1 只写 `CREATED` |
| `input` | Json | startRun 校验通过后的输入快照 |
| `output` | Json? | Phase 1 恒为 null |
| `created_by` | string? | JWT `sub` |
| `created_at` | DateTime | default now |
| `updated_at` | DateTime | `@updatedAt` |

Index: `workspaceId`, `playbookId`, `runId`（unique 已覆盖）

### 4.3 Schema 方言（PlaybookJsonSchema）

```ts
interface PlaybookJsonSchema {
  type: 'object';
  properties: Record<string, { type: 'string' | 'number' | 'boolean' | 'object' | 'array' }>;
  required?: string[];
}
```

校验规则：

- 根必须 `type === 'object'` 且 `properties` 为对象
- `required` 中每个 key 必须出现在 `properties`
- 校验数据时：缺 required → 失败；已出现字段 JSON typeof 不匹配 → 失败
- `object` / `array`：只检查顶层类型，不递归
- 不引入 ajv

### 4.4 SQL（additive only）

只 `CREATE TABLE` `playbooks`、`playbook_runs` + index + FK。  
**不** `ALTER` `workspaces` / `agent_tasks` / Epic 4 表。  
Prisma `Workspace` 仅增加 relation：`playbooks Playbook[]`、`playbookRuns PlaybookRun[]`（无新列）。

### 4.5 Domain 引擎（无 Nest）

`PlaybookEngine` + `IPlaybookStore`：

- `createPlaybook(workspaceId, CreatePlaybookInput)` → Playbook
- `getPlaybook(workspaceId, id)`
- `listPlaybooks(workspaceId)`
- `startRun(workspaceId, playbookId, input, createdBy?)` → `{ runId, run }`

`startRun` 顺序：

1. load playbook（workspace 隔离）
2. status 为 `DISABLED` → `PLAYBOOK_DISABLED`
3. `validateAgainstSchema(input, input_schema)`
4. 生成独立 `run_id`（`crypto.randomUUID()`）
5. persist PlaybookRun `status=CREATED`，`output=null`
6. 返回 `run_id`

禁止 import：`@nestjs/*`、`@crosspilot/tool-platform`、workflow / integrations。

---

## 5. API 设计

全局前缀已有：`/api/v1`。JWT + `x-workspace-id`。VIEWER：GET 可，POST 403。

| Method | Path | Body | 行为 |
| :--- | :--- | :--- | :--- |
| POST | `/playbooks` | `CreatePlaybookInput` | 注册 |
| GET | `/playbooks` | — | 当前 workspace 列表 |
| GET | `/playbooks/:id` | — | 详情；跨 workspace → 404 |
| POST | `/playbooks/:id/runs` | `StartPlaybookRunInput` | 校验 input，建 run，返回 `runId` |
| GET | `/playbook-runs/:id` | — | `:id` = **run_id** |

**不实现：** version 子资源、complete、execute-workflow、SSE、UI。

### 5.1 Contracts

```ts
type PlaybookStatus = 'REGISTERED' | 'ACTIVE' | 'DISABLED';
type PlaybookRunStatus = 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

interface CreatePlaybookInput {
  name: string;
  version: string;
  status?: PlaybookStatus;          // default REGISTERED
  inputSchema: PlaybookJsonSchema;
  outputSchema: PlaybookJsonSchema;
  definition?: Record<string, unknown>; // default {}
}

interface StartPlaybookRunInput {
  input: Record<string, unknown>;
}
```

POST `/playbooks` 响应：Playbook 记录（含 id/status/version/schemas）。  
POST `/playbooks/:id/runs` 响应：

```ts
{ runId: string; playbookId: string; status: 'CREATED' }
```

GET run 响应：含 `runId`、`status`、`input`、`output: null`。

### 5.2 Error codes（只追加，不改旧码）

```text
PLAYBOOK_NOT_FOUND
PLAYBOOK_VERSION_INVALID
PLAYBOOK_VERSION_CONFLICT      // same workspace+name+version
PLAYBOOK_SCHEMA_INVALID
PLAYBOOK_DISABLED
PLAYBOOK_INPUT_INVALID
PLAYBOOK_RUN_NOT_FOUND
```

HTTP：404 / 409 / 400。`HttpExceptionFilter` 按 `error.code` 映射（同 `WORKFLOW_NOT_FOUND` 模式）。

---

## 6. 测试计划

### 6.1 Unit（`packages/domain/test/playbook-framework.spec.ts`）

| 用例 | 期望 |
| :--- | :--- |
| create playbook | 得到 id，status=`REGISTERED` |
| 自定义 status=`ACTIVE` | 保存 ACTIVE |
| version 非 `x.y.z` | `PLAYBOOK_VERSION_INVALID` |
| 重复 workspace+name+version | `PLAYBOOK_VERSION_CONFLICT` |
| input_schema 不是 object | `PLAYBOOK_SCHEMA_INVALID` |
| output_schema 非法 | `PLAYBOOK_SCHEMA_INVALID` |
| `validateAgainstSchema` 缺 required | 失败（input 与 output 各一例，覆盖 AC-03） |
| `validateAgainstSchema` 类型错误 | 失败 |
| startRun | 返回独立 `runId` ≠ playbook.id ≠ run PK（内存 store 可令 pk≠runId） |
| startRun 不改 Playbook 行 | Playbook.status 仍是原值 |
| startRun DISABLED | `PLAYBOOK_DISABLED` |
| startRun 坏 input | `PLAYBOOK_INPUT_INVALID`，无 run |
| 跨 workspace get | not found |
| startRun 不调用任何 workflow/tool | 引擎无那些 import（静态/行为：run.status=`CREATED`，output null） |

### 6.2 Integration（`apps/api/test/v92-phase1-playbook.spec.ts`，mock Prisma）

```text
POST /playbooks  → 201/200 得到 id
POST /playbooks/:id/runs  { input }  → 得到 runId
GET  /playbook-runs/:runId  → status CREATED, output null
VIEWER POST → 403 AUTH_FORBIDDEN
错误 input → 400 PLAYBOOK_INPUT_INVALID
```

Controller 测试用 mock service，或直接测 service + mock Prisma（与 epic4 相同）。不启真实 Postgres。

### 6.3 Regression（必须仍绿）

```text
pnpm --filter @crosspilot/domain test -- playbook-framework.spec.ts
pnpm --filter @crosspilot/domain test -- daily-operation-workflow.spec.ts
pnpm --filter @crosspilot/api test -- v92-phase1-playbook.spec.ts
pnpm --filter @crosspilot/api test -- v91-phase1.regression.spec.ts
pnpm --filter @crosspilot/db exec prisma validate
```

`git diff` 不得包含：

```text
packages/domain/src/operations/**
packages/domain/src/listing/listing-workflow-dag.service.ts
packages/domain/src/research/**
apps/api/src/modules/daily-diagnosis/**
apps/api/src/modules/agent-task/**
apps/api/src/modules/tool-center/**
apps/api/src/modules/commerce-store/**
packages/tool-platform/**
packages/integrations/**
```

---

## 7. 文件修改列表

### Create

见 §3。

### Modify（仅这些）

| 文件 | 改动 |
| :--- | :--- |
| `packages/shared/src/constants/error-codes.ts` | 追加 PLAYBOOK_* |
| `packages/shared/src/index.ts` | export playbook-contracts |
| `packages/domain/src/index.ts` | export `./playbook/index.js` |
| `packages/db/prisma/schema.prisma` | 新 model + Workspace relation（无旧表列变更） |
| `apps/api/src/app.module.ts` | `imports: [PlaybookModule]` |
| `apps/api/src/common/filters/http-exception.filter.ts` | PLAYBOOK_* → 400/404/409 |

### Do not modify

V9.1 冻结资产、WF-05、Agent Runtime、Workflow Engine、Tool Center、Provider Framework、Epic 4 Amazon 链路、Web UI、临时命令.txt、`.runtime-pg/`、`docs/_ops_*`。

---

## Coding sequence (after confirmation only)

```text
Step 1  Shared contracts + error codes
Step 2  Domain TDD (engine + in-memory store)
Step 3  Prisma models + SQL migration + prisma validate
Step 4  Nest module (no workflow calls)
Step 5  Tests + regression + evidence doc
```

完成后输出（编码阶段，不是现在）：

```text
Summary / Changed files / Migration / API / Tests
AC-01 … AC-06  PASS/FAIL
Remaining risks
READY_FOR_PHASE2 = YES/NO
```

Phase 2（Fact/Evidence）**不在本次确认范围内**。

---

## Stop

```text
PLAN COMPLETE
NO CODE CHANGED
WAITING FOR CONFIRMATION TO CODE
```
