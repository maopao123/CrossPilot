# V9.3 Action Layer Release Report

**Date:** 2026-09-12  
**Runtime:** `http://116.198.230.217:2222`  
**Git:** `a39a803`  
**Scope:** Mock Action Framework only. No Amazon Write. No WF-05 formula change. No Recommendation engine refactor.

Cloud demo 2026-09-12：`plan-acos` → `DECREASE_BID` medium `WAITING_APPROVAL` → VIEWER approve 403 → OWNER approve → mock execute **SUCCESS** `Mock bid decreased 20%` → history `created / approved / execution_started / SUCCESS`.

---

## Verdict

```text
V9.2.1  AI Operations Assistant
    ↓
V9.3    AI Operations Automation Framework (Mock Executor)
```

Recommendation still answers **why**. PlannedAction answers **what the system would run**. Execution is a fake result plus history.

---

## 1. Action 架构

TypeScript 栈（没有新增 Python `backend/action/`）：

```text
Recommendation
    ↓
Action Planner     packages/domain/src/action-layer/action-planner.ts
    ↓
Risk Validator     action-validator.ts
    ↓
Action Registry    action-registry.ts  (whitelist + mock tools)
    ↓
Human Approval     POST /actions/:id/approve
    ↓
Mock Executor      mock-executor.ts
    ↓
Execution History  action_executions
```

旧的 `packages/actions` `ActionRouter` **未改**。V9.3 是并列的 Commerce Action Layer。

---

## 2. 数据模型

表：`planned_actions` / `action_executions`

```text
action_id
recommendation_id   (optional FK, 不改 recommendation 字段)
action_type         白名单
target              JSON
parameters          JSON
risk_level          low | medium | high
need_approval
status
created_by
```

History 行：`operator`, `timestamp`, `input`, `output`, `status`, `error`, `attempt`

---

## 3. 状态流转

```text
CREATED
  ↓ (need_approval)
WAITING_APPROVAL
  ↓ owner approve
APPROVED
  ↓ mock execute
EXECUTING
  ↓
SUCCESS | FAILED
```

低风险 `GENERATE_REPORT`：规划后直接 `APPROVED`（仍要点 Run mock executor）。  
拒绝：记为 `FAILED` + history `rejected`（规格未列 REJECTED 状态）。

---

## 4. Tool Registry（全部 Mock）

| action_type | risk | approval | mock result |
| :--- | :--- | :--- | :--- |
| DECREASE_BID | medium | required | `Mock bid decreased 20%` |
| UPDATE_INVENTORY | medium | required | Mock inventory updated |
| GENERATE_REPORT | low | not required | Mock report generated |
| STOP_CAMPAIGN | high | required | Mock campaign stopped |
| CHANGE_PRICE ≤20% | medium | required | Mock price changed |
| CHANGE_PRICE >20% | high | required | same mock |
| DELETE_LISTING | high | required | Mock listing delete recorded |

Planner **禁止自由发挥**：`IMPROVE_LISTING` 等无法映射的 recommendation → `ACTION_PLANNER_UNSUPPORTED`。

Mock 可通过 `parameters.mockOutcome`: `success` | `fail` | `timeout`（timeout 会重试后成功）。

---

## 5. API

| Method | Path |
| :--- | :--- |
| POST | `/api/v1/actions/plan` `{ recommendationId }` |
| POST | `/api/v1/actions/plan-acos` 演示：生成 ACOS rec + DECREASE_BID |
| GET | `/api/v1/actions` |
| GET | `/api/v1/actions/:id` |
| GET | `/api/v1/actions/:id/history` |
| POST | `/api/v1/actions/:id/approve` |
| POST | `/api/v1/actions/:id/reject` |
| POST | `/api/v1/actions/:id/execute` |

VIEWER：只能 GET。OWNER：plan / approve / execute。execute **不会**调用 SP-API。

UI：只增强 `/app/operations/today` 的 Recommendation 卡片（Generated Action / Risk / Approval / Execution）。无新复杂页面。

---

## 6. Demo 流程

```text
Simulator ACOS 环境
    ↓
POST /actions/plan-acos
    ↓ Recommendation DECREASE_KEYWORD_BID
    ↓ Action DECREASE_BID 20%  risk=medium  WAITING_APPROVAL
    ↓
POST /actions/:id/approve     OWNER
    ↓ APPROVED
    ↓
POST /actions/:id/execute     Mock
    ↓ SUCCESS  "Mock bid decreased 20%"
    ↓
GET /actions/:id/history
```

VIEWER approve/execute → 403。

---

## 7. 已知限制

- Executor 全是假结果，Amazon 广告/库存/价格不变
- 未接下发、无 Shopify、无 V10 多平台
- 未改 WF-05 公式、未重构 Recommendation 状态机
- 高风险 action 在 Mock 下仍可审批后“假执行”（真实 Amazon 阶段应硬拒绝）
- 旧 `ActionRouter` / RPA 路径仍独立存在

下一阶段才是 V10 Multi-platform Commerce OS。不要提前做 Amazon Adapter / Shopify Adapter。
