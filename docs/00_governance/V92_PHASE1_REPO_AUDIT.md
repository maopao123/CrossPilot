# V9.2 Phase 1 Repo Audit — Playbook Framework

**Date:** 2026-09-12  
**Status:** AUDIT + PLAN ONLY — no application code, no migration applied, no deploy  
**Specs:** `CrossPilot_V9.2_Architecture_Specification.md` + `CrossPilot_V9.2_Implementation_Specification.md`  
**Baseline:** V9.1 `v9.1.0` → `b3d5607`; local HEAD `85f5b94` (Epic 4 committed, not pushed); origin/live `e457d5a`

```text
READY_FOR_PHASE1_CODING = YES
Recommended first coding phase: Phase 1 — Playbook Framework only
Do not implement: Fact Engine / Evidence Engine / VOC / Amazon Research / Recommendation Center
```

Implementation Spec §4 / §6: this document is the required first deliverable. Coding starts only after this plan is accepted.

---

## 1. Current capability map

| Capability | Where | Status | V9.2 Phase 1 role |
| :--- | :--- | :--- | :--- |
| Agent Runtime | `packages/ai`, `apps/api/src/modules/agent-task`, `apps/worker` | Exists | Reuse. Do not replace. |
| Workflow (WF-05) | `packages/domain/src/operations/workflow/` | Frozen | Reuse later as a *called* workflow. Do not modify. Phase 1 does not invoke it. |
| Listing DAG (WF-02) | `packages/domain/src/listing/listing-workflow-dag.service.ts` | Frozen | Do not modify. |
| Market research (WF-01) | `apps/api/src/modules/market`, Opportunity Score v1.0.0 | Frozen | Future Playbook *may* call it in Phase 3. Not now. |
| Tool Center | `packages/tool-platform` (`ToolRegistry` / `ToolExecutor`) | Exists | Pattern to copy (register + version + input schema). Playbook is not a Tool. |
| Provider Framework | `packages/integrations` | Exists + Epic 4 Amazon read-only | Do not rebuild. Phase 1 does not call SP-API. |
| Workspace isolation | JWT + `WorkspaceGuard` + `x-workspace-id` | Exists | All new APIs must use it. |
| HITL / Approval | `Approval` model + WF-05 gate | Frozen | Recommendation Center (Phase 5) may later reuse. Not Phase 1. |
| Checkpoint / OCC | `AgentTask.checkpointVersion` + `WorkflowIdempotency` | Frozen | Do not overload `AgentTask` for Playbook runs. |
| Epic 4 store foundation | `apps/api/src/modules/commerce-store` | Local `85f5b94`, not deployed | Preserve. Do not retarget. |
| Playbook Framework | — | **MISSING** | This phase. |
| Fact / Evidence Engine | — | **MISSING** | Phase 2. Out of this coding slice. |
| Recommendation Center lifecycle GENERATED→VERIFIED | Epic 3 `RecommendedAction` is a different object | Partial analog only | Phase 5. Do not conflate with WF-05 actions. |
| VOC Intelligence | `VocAnalysisRun` + Firecrawl tools | Listing/research VOC, not V9.2 Fact pipeline | Phase 4. |
| Amazon Product Research Playbook | Architecture §4 first business loop | Not a Playbook; existing market module is frozen WF-01 | Phase 3. |

There is **no** `packages/services` package. Suggested path `packages/services/playbook` would be a new package type. Rejected (see §6).

The only existing "Playbook" strings are knowledge-seed titles (`Generative Engine Optimization Playbook`). Not a framework.

---

## 2. Current architecture (what we reuse)

```text
User / Next.js
    → NestJS /api/v1  (JWT + WorkspaceGuard + ViewerWriteGuard)
        → Controllers (daily-diagnosis, tools, commerce, listing, market, ...)
            → Domain services (pure TS in packages/domain)
            → Tool Platform (register / execute / schema)
            → IntegrationGateway (ProviderAdapter)
            → Prisma / Postgres
```

V9.2 target (Architecture §2), **not built in Phase 1**:

```text
User → Scenario Router → Playbook Engine → Workflow Runtime → Tool Center → Provider
Data: Amazon → Commerce Domain → Fact → Evidence → Recommendation
```

Phase 1 inserts **only** Playbook Engine between API and persistence. It does **not** become a new Agent or Workflow runtime. Relationship from Architecture §3:

```text
Scenario  →  Playbook  →  Workflow  →  Tool
```

Playbook is a **business execution definition** (name, version, input/output schema, execution context / `run_id`). It is not a prompt, not an agent, not WF-05.

---

## 3. Gap analysis (Phase 1 only)

| AC | Requirement | Current | Gap |
| :--- | :--- | :--- | :--- |
| AC-01 | Playbook can register | No model, no registry, no API | Add register path |
| AC-02 | Playbook has version | Tool definitions have `version`; Playbook does not | `workspaceId + name + version` unique |
| AC-03 | Input/output schema validation | Tools validate input via `ToolExecutor`; no Playbook schemas | Domain validator + execute/complete gates |
| AC-04 | Execution has `run_id` | `AgentTask.id` / `ToolExecution.id` exist but are not Playbook runs | New `PlaybookRun.id` |
| AC-05 | Existing workflows unchanged | WF-05 / WF-02 / WF-01 frozen | Zero edits to those files |

Out of Phase 1 (explicit in Implementation Spec §4):

```text
Fact Engine
VOC
Amazon Research
Evidence Engine
Recommendation Center
Amazon Write API
Auto execution
New Agent / Workflow / Provider framework
```

---

## 4. Reuse / Extend / Add / Protect

### Reuse

- Nest module pattern: `apps/api/src/modules/tool-center/` (controller + service + PrismaModule)
- Guards: `JwtAuthGuard`, `WorkspaceGuard`, `ViewerWriteGuard`
- Envelope: `TransformInterceptor` + `HttpExceptionFilter`
- JSON types: `packages/shared` contracts + `ErrorCodes`
- Schema validation style: JSON-object `properties` / `required` like `ToolInputSchema` (already in repo). **Do not add ajv.** Zod already used for HTTP/DTO; Playbook *stored* schemas are JSON and need a small domain validator.
- Prisma additive migration style: `packages/db/prisma/migrations/20260912180000_epic4_store_foundation/`
- Domain tests: `packages/domain/test/*.spec.ts` (pure, no Nest)

### Extend

- `packages/shared/src/constants/error-codes.ts` — Playbook codes only
- `packages/shared/src/index.ts` — export playbook contracts
- `packages/domain/src/index.ts` — export playbook module
- `packages/db/prisma/schema.prisma` — two new models + `Workspace` relations
- `apps/api/src/app.module.ts` — import `PlaybookModule`
- `apps/api/src/common/filters/http-exception.filter.ts` — map Playbook domain error codes (same pattern as `WORKFLOW_NOT_FOUND`)

### Add

```text
packages/domain/src/playbook/*
packages/domain/test/playbook-framework.spec.ts
packages/shared/src/contracts/playbook-contracts.ts
apps/api/src/modules/playbook/*
apps/api/test/v92-phase1-playbook.spec.ts
packages/db/prisma/migrations/<ts>_v92_playbook_framework/migration.sql
```

### Protect (do not touch)

```text
Sku360 context loader / formulas
Operation anomaly detector
Cross-domain diagnosis
Action recommendation scoring
WF-05 9-step DAG + daily-diagnosis REST/SSE
Postgres workflow checkpoint + OCC updateMany
WorkflowIdempotency
operation.daily.* tools
Operations Today HITL UX
Provider Framework / XYDC mapper (do not retarget 5147→5151)
Opportunity Score v1.0.0
Epic 4 commerce-store / Amazon read-only allowlist
Listing DAG / claim grounding
```

### Rejected suggestions from the spec path list

| Spec suggestion | Decision |
| :--- | :--- |
| `packages/services/playbook` | **Do not create.** Monorepo has `packages/{domain,shared,db,ai,integrations,tool-platform,actions}` + `apps/{api,web,worker}`. Nest service lives in `apps/api/src/modules/playbook`. |
| New Agent / Workflow framework | Forbidden by Implementation Spec §1. |
| Overload `AgentTask.taskType` | Would mix Playbook with WF-05 checkpoint/OCC. New tables. |

---

## 5. Domain & data model

### 5.1 Playbook (from spec, plus minimum persistence fields)

```text
id
workspace_id
name                  -- human + lookup key, e.g. amazon-product-research
version               -- semver string, e.g. 1.0.0
status                -- DRAFT | PUBLISHED | ARCHIVED
input_schema          -- JSON object schema (ToolInputSchema subset)
output_schema         -- JSON object schema
created_by            -- optional user id
created_at
updated_at
```

Unique: `(workspace_id, name, version)`  
Published row: schemas immutable (patch → `PLAYBOOK_VERSION_IMMUTABLE`). New version = new row.

### 5.2 PlaybookRun (required by AC-04; not named in spec §3 but implied by “execution context” + `run_id`)

```text
id                    -- run_id (uuid)
workspace_id
playbook_id
playbook_version      -- denormalized copy
status                -- PENDING | RUNNING | COMPLETED | FAILED | VALIDATION_FAILED
input_json
output_json           -- null until complete
error_code
error_message
created_by
started_at
completed_at
created_at
```

Index: `(workspace_id)`, `(playbook_id)`, `(started_at)`

Phase 1 **does not** persist step traces, facts, evidence, or recommendations.

### 5.3 Execution context (domain, not a table)

```ts
interface PlaybookExecutionContext {
  runId: string;
  playbookId: string;
  playbookName: string;
  playbookVersion: string;
  workspaceId: string;
  userId?: string;
  input: Record<string, unknown>;
  startedAt: string;
}
```

### 5.4 Schema dialect (minimum, no new dependency)

Same shape as `ToolInputSchema`:

```ts
interface PlaybookJsonSchema {
  type: 'object';
  properties: Record<string, { type: 'string' | 'number' | 'boolean' | 'object' | 'array' }>;
  required?: string[];
}
```

Validator checks: missing required, wrong JSON type. Nested object/array: type check only (no deep JSON Schema). Enough for AC-03.

### 5.5 Phase 1 execute semantics (no auto-execution)

```text
startRun:
  playbook must exist in workspace
  status must be PUBLISHED
  validate input against input_schema
  persist PlaybookRun status=RUNNING
  return run_id
  DO NOT call ToolExecutor, WF-05, listing DAG, SP-API, XYDC

completeRun (test/API for AC-03 output):
  run must be RUNNING and same workspace
  validate output against output_schema
  persist COMPLETED + output_json
```

This is **not** Amazon Research. A schema-only playbook named `amazon-product-research` may be **registered** as a fixture (proves AC-01/02) but its steps are empty in Phase 1.

---

## 6. API impact

Prefix remains `/api/v1`. All endpoints: JWT + workspace. VIEWER: GET allowed, POST 403 `AUTH_FORBIDDEN`.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/playbooks` | Register (AC-01, AC-02) |
| `GET` | `/playbooks` | List current workspace |
| `GET` | `/playbooks/:id` | Get one (404 if other workspace) |
| `POST` | `/playbooks/:id/versions` | New version row (copy or new schemas) |
| `POST` | `/playbooks/:id/runs` | Start execution → `{ runId }` (AC-04) |
| `GET` | `/playbook-runs/:runId` | Get run |
| `POST` | `/playbook-runs/:runId/complete` | Validate output + complete (AC-03) |

No change to existing routes. No SSE. No frontend in Phase 1.

New error codes (shared):

```text
PLAYBOOK_NOT_FOUND
PLAYBOOK_VERSION_CONFLICT
PLAYBOOK_VERSION_IMMUTABLE
PLAYBOOK_NOT_PUBLISHED
PLAYBOOK_SCHEMA_INVALID
PLAYBOOK_INPUT_INVALID
PLAYBOOK_OUTPUT_INVALID
PLAYBOOK_RUN_NOT_FOUND
PLAYBOOK_RUN_INVALID_STATE
```

HTTP: 404 / 409 / 400 / 403. Filter maps `exception.code` like existing workflow errors.

---

## 7. Authentication & security

- Workspace isolation: every query `where: { workspaceId }`. Never return another tenant's playbook/run.
- VIEWER cannot register, version, start, or complete.
- No secrets in playbook schemas or run payloads logs.
- Phase 1 must not call Amazon Write API (none registered).
- Phase 1 must not auto-execute recommendations or WF-05 (`Approval ≠ Execute` remains).
- No credential in Agent context (Playbook engine does not load Provider credentials).

---

## 8. Implementation plan (Phase 1 coding, after this audit)

Do **not** create `packages/services`. Do **not** start Postgres/API/Web on Windows. Tests are unit/integration with mocked Prisma, same as Epic 4.

### Task 1 — Shared contracts + error codes

**Files:**  
`packages/shared/src/constants/error-codes.ts`  
`packages/shared/src/contracts/playbook-contracts.ts`  
`packages/shared/src/index.ts`

DTOs: `PlaybookJsonSchema`, `PlaybookRecord`, `PlaybookRunRecord`, register/start/complete request/response types. Status unions as string literals matching §5.

### Task 2 — Domain engine (TDD)

**Files:**  
`packages/domain/src/playbook/playbook.types.ts`  
`packages/domain/src/playbook/playbook-schema.validator.ts`  
`packages/domain/src/playbook/playbook-engine.ts`  
`packages/domain/src/playbook/index.ts`  
`packages/domain/src/index.ts`  
`packages/domain/test/playbook-framework.spec.ts`

Engine is persistence-agnostic (`IPlaybookStore`). In-memory store in tests.

Tests that must exist before Nest wiring:

1. `register` stores name+version  
2. duplicate `(workspace, name, version)` → `PLAYBOOK_VERSION_CONFLICT`  
3. invalid schema (not `type: object`) → `PLAYBOOK_SCHEMA_INVALID`  
4. missing required input field → `PLAYBOOK_INPUT_INVALID`  
5. start on DRAFT → `PLAYBOOK_NOT_PUBLISHED`  
6. `startRun` returns `runId`  
7. complete with wrong output type → `PLAYBOOK_OUTPUT_INVALID`  
8. complete with valid output → `COMPLETED`  
9. workspace A cannot load workspace B playbook  

Engine must not import `@crosspilot/tool-platform` workflow services or Nest.

### Task 3 — Prisma models + SQL migration

**Files:**  
`packages/db/prisma/schema.prisma`  
`packages/db/prisma/migrations/20260912210000_v92_playbook_framework/migration.sql`

Additive only. `CREATE TABLE IF NOT EXISTS`. FK to `workspaces(id) ON DELETE CASCADE`. Unique `(workspace_id, name, version)`.

Do **not** use `prisma db push` as the source of unique constraints (Epic 4 lesson: SQL owns partial/unique indexes). Phase 1 uniques are full uniques, so Prisma `@@unique` **is** allowed and must match SQL.

Workspace model: add `playbooks Playbook[]` and `playbookRuns PlaybookRun[]`.

### Task 4 — Nest module

**Files:**  
`apps/api/src/modules/playbook/playbook.module.ts`  
`apps/api/src/modules/playbook/playbook.service.ts`  
`apps/api/src/modules/playbook/playbook.controller.ts`  
`apps/api/src/app.module.ts`  
`apps/api/src/common/filters/http-exception.filter.ts`  
`apps/api/test/v92-phase1-playbook.spec.ts`

Service: Prisma adapter implementing `IPlaybookStore` + domain engine.  
Controller: paths in §6.  
Tests: VIEWER 403; register+version+run_id; input validation 400; Prisma mocked.

### Task 5 — Regression evidence (no WF-05 edits)

Run (local, no product stack):

```text
pnpm --filter @crosspilot/domain test -- playbook-framework.spec.ts
pnpm --filter @crosspilot/domain test -- daily-operation-workflow.spec.ts
pnpm --filter @crosspilot/api test -- v92-phase1-playbook.spec.ts
pnpm --filter @crosspilot/api test -- v91-phase1.regression.spec.ts
pnpm --filter @crosspilot/db exec prisma validate
```

Evidence file after coding: `docs/00_governance/V92_PHASE1_IMPLEMENTATION_EVIDENCE.md`  
Changelog: HANDOFF + DOCUMENT_AUTHORITY_MAP pointer only.

Do not deploy. Do not push unless asked.

---

## 9. Later V9.2 phases (recorded, not scheduled)

| Phase | Spec | Depends on Phase 1 | Start now? |
| :--- | :--- | :--- | :--- |
| 2 Fact / Evidence Engine | Architecture §3, Implementation §2 | Playbook run can attach facts later | **No** |
| 3 Amazon Product Research Playbook | Architecture §4 | Calls existing market tools / OppScore; must not rewrite frozen score | **No** |
| 4 VOC Intelligence | Architecture §5 | Must not pretend Firecrawl VOC is the new Fact pipeline | **No** |
| 5 Recommendation Center | Implementation §2 lifecycle | Distinct from WF-05 `RecommendedAction` | **No** |

---

## 10. Risks

| Risk | Mitigation |
| :--- | :--- |
| Spec path `packages/services/playbook` vs real monorepo | Do not create the package; document deviation here |
| Mixing PlaybookRun with AgentTask | Separate tables |
| Phase 1 “execute” accidentally calling WF-05 / XYDC | Engine has no workflow/tool imports; startRun only validates + persists |
| Registering `amazon-product-research` looks like Phase 3 | Schema-only fixture; no steps; evidence must say NOT RESEARCH |
| Epic 4 not on cloud (`85f5b94` ahead 1) | Phase 1 is additive; deploy order is a later ops decision, not this audit |
| `临时命令.txt` still says “不得提前开发 V9.2 / 当前任务只处理 Epic 4” | User instruction to execute the two V9.2 specs overrides that file for this slice; do not rewrite 临时命令 unless asked |
| Windows local product stack | Still forbidden. Unit tests only. |

---

## 11. Out-of-scope findings (do not fix in Phase 1)

```text
HANDOFF.md still says Epic 4 uncommitted; actual local HEAD is 85f5b94 ahead of origin
CURRENT_SYSTEM_AUDIT_BASELINE.md still says Epic 4 SUSPENDED / V9.2 NOT STARTED
临时命令.txt still Epic 4 audit-only
V9.2 spec markdown files are untracked
Cloud still e457d5a (visual); Epic 4 not deployed
packages/services does not exist
ToolCenter recentExecutions is in-memory (pre-existing)
```

---

## 12. Acceptance matrix (Phase 1)

| ID | Test |
| :--- | :--- |
| AC-01 | `POST /playbooks` creates a row; `GET` returns it in the same workspace |
| AC-02 | Two versions of the same name coexist; duplicate version 409 |
| AC-03 | Bad input 400 `PLAYBOOK_INPUT_INVALID`; bad output 400 `PLAYBOOK_OUTPUT_INVALID`; good I/O accepted |
| AC-04 | `POST /playbooks/:id/runs` returns `runId`; `GET /playbook-runs/:runId` loads it |
| AC-05 | `daily-operation-workflow.spec.ts` and `v91-phase1.regression.spec.ts` still pass; git diff does not include WF-05 / diagnosis / recommendation / Sku360 / OppScore / provider / commerce-store |

---

## 13. Exact recommended first coding phase

```text
ONLY: V9.2 Phase 1 — Playbook Framework
NEXT UNIQUE TASK AFTER APPROVAL: Task 1 (shared contracts) → Task 2 (domain TDD) → Task 3 (Prisma) → Task 4 (Nest) → Task 5 (regression evidence)

STOP after Phase 1 until asked to start Phase 2.
```
