# V9.2 Phase 1 Implementation Evidence — Playbook Framework

**Date:** 2026-09-12  
**Status:** CODE COMPLETE — not committed, not pushed, not deployed  
**Plan:** `V92_PHASE1_IMPLEMENTATION_PLAN.md`

```text
AC-01 PASS
AC-02 PASS
AC-03 PASS
AC-04 PASS
AC-05 PASS
AC-06 PASS

READY_FOR_PHASE2 = YES
Do not start Phase 2 until asked.
```

---

## 1. Summary

Playbook 是可注册的电商 SOP 定义 + 执行上下文（`run_id`）。Phase 1 **不执行** Workflow / Tool / XYDC / SP-API。

`startRun` 只做：校验 input → 创建 `PlaybookRun` `status=CREATED` → 返回独立 `run_id`。`output` 恒为 `null`。Playbook 行不被改写。

未建 `packages/services`。未改 WF-05 / Agent / Tool Center / Provider / Epic 4。

---

## 2. Changed files

### Created

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
docs/00_governance/V92_PHASE1_IMPLEMENTATION_EVIDENCE.md
```

### Modified

```text
packages/shared/src/constants/error-codes.ts
packages/shared/src/index.ts
packages/domain/src/index.ts
packages/db/prisma/schema.prisma          # Playbook + PlaybookRun + Workspace relations only
apps/api/src/app.module.ts
apps/api/src/common/filters/http-exception.filter.ts
docs/HANDOFF.md
docs/00_governance/DOCUMENT_AUTHORITY_MAP.md
```

Frozen paths not in diff: operations workflow, listing DAG, research/OppScore, daily-diagnosis, agent-task, tool-center, commerce-store, tool-platform, integrations.

---

## 3. Database migration

File: `packages/db/prisma/migrations/20260912210000_v92_playbook_framework/migration.sql`

Additive only:

- `playbooks` (`workspace_id + name + version` unique)
- `playbook_runs` (`run_id` unique; FK playbook / workspace CASCADE)

No `ALTER` of `workspaces` / `agent_tasks` / Epic 4 tables.  
`pnpm --filter @crosspilot/db exec prisma validate` → valid.

Not applied on cloud. Local product stack was not started.

---

## 4. API changes

Prefix `/api/v1`. JWT + workspace. VIEWER POST → 403 `AUTH_FORBIDDEN`.

| Method | Path | Effect |
| :--- | :--- | :--- |
| POST | `/playbooks` | register |
| GET | `/playbooks` | list workspace |
| GET | `/playbooks/:id` | detail |
| POST | `/playbooks/:id/runs` | validate input, create run, return `{ runId, playbookId, status: "CREATED" }` |
| GET | `/playbook-runs/:id` | `:id` = `run_id` |

No complete / version / SSE / UI endpoints.

Error codes: `PLAYBOOK_NOT_FOUND`, `PLAYBOOK_VERSION_INVALID`, `PLAYBOOK_VERSION_CONFLICT`, `PLAYBOOK_SCHEMA_INVALID`, `PLAYBOOK_DISABLED`, `PLAYBOOK_INPUT_INVALID`, `PLAYBOOK_RUN_NOT_FOUND`.

---

## 5. Tests

| Suite | Result |
| :--- | :--- |
| `packages/domain/test/playbook-framework.spec.ts` | 17 passed |
| `apps/api/test/v92-phase1-playbook.spec.ts` | 5 passed |
| `packages/domain/test/daily-operation-workflow.spec.ts` | 22 passed |
| `apps/api/test/v91-phase1.regression.spec.ts` | 15 passed |
| `prisma validate` | valid |

---

## 6. Acceptance checklist

| ID | Result | Evidence |
| :--- | :--- | :--- |
| AC-01 可注册 Playbook | **PASS** | domain create + API `svc.create` |
| AC-02 支持 version | **PASS** | `MAJOR.MINOR.PATCH`；duplicate → `PLAYBOOK_VERSION_CONFLICT` |
| AC-03 Input/Output schema 可校验 | **PASS** | register-time schema; `validateAgainstSchema` input+output unit tests; startRun input 400 |
| AC-04 独立 `run_id` | **PASS** | `runId !== playbook.id !== run.id` |
| AC-05 已有 Workflow 不变 | **PASS** | WF-05 22 tests green; frozen paths untouched |
| AC-06 无业务执行副作用 | **PASS** | run `CREATED`, `output=null`; playbook status unchanged; no Tool/WF/XYDC/SP-API imports |

---

## 7. Remaining risks

- 未 commit / 未 push / 未部署；云机仍是 `e457d5a`
- Epic 4 (`85f5b94`) 同样未上云；若一起部署需按 Epic 4 plan 保留 `.env`
- `definition` JSON 本阶段不解析
- `RUNNING` / `COMPLETED` / `FAILED` 仅类型保留
- 无 UI
- `临时命令.txt` 仍写 Epic 4 only（未改）

---

## 8. READY_FOR_PHASE2

```text
READY_FOR_PHASE2 = YES
```

Playbook Registry + Execution Context 已可挂 Fact/Evidence。  
**不要自动开始 Phase 2。**
