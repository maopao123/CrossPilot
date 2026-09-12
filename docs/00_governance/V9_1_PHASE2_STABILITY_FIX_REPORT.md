# CrossPilot V9.1 Phase 2 — P2 Stability Fix Report

> **阶段**：V9.1 Phase 2 仅修 Full Product Bug Audit 确认的 P2 稳定性问题  
> **基线**：`V9_1_FULL_PRODUCT_BUG_AUDIT.md` + `V9_1_PHASE1_P0_P1_FIX_REPORT.md` + `CURRENT_SYSTEM_AUDIT_BASELINE.md`  
> **日期**：2026-09-12  
> **边界**：未启动 Epic 4；未改 Prisma Schema；未改 WF-05 DAG / Detector / Diagnosis / Recommendation / 补货公式 / 利润方差 / OCC `updateMany`；未进入 Phase 3；V91-017 未改表

---

## 1. Executive Summary

Phase 2 按 A→D 顺序完成隔离、鉴权、SSE/Envelope、业务契约和前端错误反馈。

**结果**：所列 P2 队列项除 **V91-017（显式延期）** 外全部落地。质量门禁全绿。浏览器点选 **NOT RUN**（未起 `dev:api` + `dev:web`）。

最终状态：

```text
CrossPilot V9.1 Phase 2
Stability Fix
COMPLETED / WAITING FOR HUMAN ACCEPTANCE
```

---

## 2. Fixed Issues

| ID | 结果 |
| :--- | :--- |
| V91-015 | **FIXED** Order/SKU、createSku/productId、createPO/supplierId+skuId 均校验 `workspaceId`；跨租户 404 |
| V91-016 | **FIXED** `listExecutions` 无 workspace 返回 `[]`；DB 失败只回同一 workspace 的内存记录，不泄漏其它租户 |
| V91-019 | **FIXED** `AuthGate`：无 token → `/login`；API 401 `clearSession` + 跳转登录；TopBar 不再用演示工作区 / 「所有者」冒充 |
| V91-020 | **FIXED** 缺 workspace id → 403 `WORKSPACE_ACCESS_DENIED`；禁止第一 membership / JWT workspace / demo 静默切换。`@SkipWorkspace` / `@Public` 不变 |
| V91-010 | **FIXED** Analyst SSE 复用 `connectAuthenticatedSse`（fetch + Bearer + `x-workspace-id` + AbortController）；禁止 EventSource / `?token=`；401 不再写成「演示流结束」 |
| V91-013 | **FIXED** Envelope 仅当同时有 `data` + `requestId` 才视为已包装；`text/event-stream` / `/events` / `/stream` 跳过 JSON transform |
| V91-011 | **FIXED** Tool Center 目录改为 `GET /api/v1/tools`；删除硬编码与 `operation.listing.publish` |
| V91-012 | **FIXED** 非法 PO 迁移 → `409 PURCHASE_INVALID_STATUS_TRANSITION`；UI 仅 `SHIPPED` / `PARTIALLY_RECEIVED` 显示入库 |
| V91-014 | **FIXED** `skuId` 必填且非空 → 400 `VALIDATION_ERROR`；未知/外租户 → 404；未改 14-step DAG |
| V91-018 | **FIXED** 否定词 apply 有 loading / success / error |
| V91-024 | **FIXED** Listing 错误条；产品「新建」禁用；Automation 驳回标明不落库；订单提交 in-flight disable |

---

## 3. Deferred Issues

| ID | 状态 | 原因 |
| :--- | :--- | :--- |
| V91-017 | **Phase 2 Deferred Review** | 见 §19。禁止本轮加表 / 改 Prisma |
| V91-022–029 | **Phase 3 / Governance** | 命令明确禁止 |

---

## 4. Modified Files

### 本轮新增

- `apps/web/src/lib/authenticated-sse.ts`
- `apps/web/src/components/auth-gate.tsx`
- `apps/api/test/v91-phase2.regression.spec.ts`
- `apps/web/test/v91-phase2-browser-contract.cjs`
- `docs/00_governance/V9_1_PHASE2_STABILITY_FIX_REPORT.md`

### 后端

- `apps/api/src/common/guards/workspace.guard.ts`
- `apps/api/src/common/interceptors/transform.interceptor.ts`
- `apps/api/src/modules/order/order.service.ts`
- `apps/api/src/modules/product/product.service.ts`
- `apps/api/src/modules/purchase/purchase.service.ts`
- `apps/api/src/modules/tool-center/tool-center.service.ts`
- `apps/api/src/modules/listing/listing.service.ts`
- `apps/api/test/core-commerce.integration.spec.ts`（补 `sku.findFirst` mock）
- `apps/api/test/v9-upgrade.integration.spec.ts`（`listExecutions` 带 workspaceId）

### 前端

- `apps/web/src/app/app/layout.tsx`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/components/top-bar.tsx`
- `apps/web/src/app/app/business-analyst/page.tsx`
- `apps/web/src/app/app/tool-center/page.tsx`
- `apps/web/src/app/app/advertising/page.tsx`
- `apps/web/src/app/app/listings/page.tsx`
- `apps/web/src/app/app/products/page.tsx`
- `apps/web/src/app/app/operations/automation/page.tsx`
- `apps/web/src/app/app/orders/page.tsx`
- `apps/web/src/app/app/suppliers/page.tsx`

工作区里还有 Phase 1 / Epic 3 / XYDC 等既有未提交改动。**本报告只对 Phase 2 文件负责。**

---

## 5. Root Cause → Fix Mapping

| ID | 根因 | 修复 |
| :--- | :--- | :--- |
| V91-015 | SKU/Product/Supplier 只靠全局 id | `findFirst({ id, workspaceId })`；找不到 404 |
| V91-016 | DB 失败回退全局 `recentExecutions` | 无 workspace → `[]`；内存按 `workspaceId` 过滤 |
| V91-019 | `/app` 无守卫；401 不清 session；TopBar 默认演示 OWNER | AuthGate + 401 clear + 诚实空态 |
| V91-020 | Guard 静默选第一 membership | 缺显式 workspace id 直接 403 |
| V91-010 | Analyst 仍用 EventSource | 与 Today 相同的 authenticated fetch SSE |
| V91-013 | 有 `data` 就剥皮 | 必须同时有 `requestId`；SSE skip |
| V91-011 | 硬编码 5 个工具含已删 publish | `GET /tools` |
| V91-012 | 状态机抛无 code 的 Error | API 层 `ConflictException` 409；UI 跟合法态 |
| V91-014 | Prisma 丢掉 `undefined` skuId | 入参校验 400 |
| V91-018 | catch 只 console | `applyError` |
| V91-024 | 死 CTA / 假 reject / 双提交 / 静默 listing | 禁用、诚实文案、submitting、actionError |

---

## 6. Tenant Isolation Verification

| 用例 | 结果 |
| :--- | :--- |
| Workspace A 下单不能读 B 的 `sellingPrice` | PASS（SKU 不在 A → 404，且不再 `findUnique({ id })`） |
| A 不能把 B 的 Product 绑到新 SKU | PASS |
| A 不能把 B 的 Supplier/SKU 绑进 PO | PASS |
| Tool executions 不返回其它 workspace | PASS（过滤 / fail-closed） |

测试：`apps/api/test/v91-phase2.regression.spec.ts` V91-015 / V91-016。

---

## 7. Auth / Workspace Verification

| 用例 | 结果 |
| :--- | :--- |
| `/app/*` 无 token → `/login` | PASS（源码合同 `AuthGate`） |
| API 401 → `clearSession` + `/login` | PASS（`api-client.ts`） |
| 缺 `x-workspace-id`（非 Skip/Public）→ 403 | PASS |
| 不自动选第一 membership | PASS |
| `@SkipWorkspace` 仍可无 header | PASS |

未做真实浏览器跳转。VIEWER 写拦截仍由 Phase 1 `ViewerWriteGuard` 覆盖（本轮回归套件仍绿）。

---

## 8. SSE Verification

| 要求 | 结果 |
| :--- | :--- |
| Analyst：fetch + Bearer + `x-workspace-id` | PASS（合同） |
| 无 EventSource / 无 `?token=` | PASS |
| terminal / error abort | PASS（`TASK_COMPLETE` + AbortController；卸载 abort） |
| 401 不显示「演示流结束」 | PASS |
| Operations Today 既有 SSE | 未改 `daily-diagnosis.api.ts` 传输实现（Phase 1 合同仍 PASS） |

---

## 9. Tool Catalog Verification

| 要求 | 结果 |
| :--- | :--- |
| `GET /api/v1/tools` 驱动 | PASS |
| 不含 `operation.listing.publish` | PASS |
| Registry 仍是 SoT | PASS（未改 ToolRegistry 核心） |

---

## 10. PO State Machine Verification

| 要求 | 结果 |
| :--- | :--- |
| 非法 receive → 409 `PURCHASE_INVALID_STATUS_TRANSITION` | PASS |
| 合法 SHIPPED → RECEIVED 路径 | 未放宽状态机；domain `purchase-order.state-machine.spec.ts` 仍 PASS |
| UI 仅 SHIPPED / PARTIALLY_RECEIVED 显示入库 | PASS |

---

## 11. Listing Validation Verification

| 要求 | 结果 |
| :--- | :--- |
| missing / blank skuId → 400 VALIDATION_ERROR | PASS |
| unknown / 外租户 skuId → 404 | PASS |
| 合法 skuId 仍走原 generateListing / DAG | 未改 `ListingWorkflowDagService` |

---

## 12. Frontend Reliability Verification

| 要求 | 结果 |
| :--- | :--- |
| 订单 in-flight disabled | PASS |
| 广告 API error 有 error state | PASS |
| Listing generate/compliance/visual 有 error state | PASS |
| 新建产品不再是可点死按钮 | PASS（disabled + 未开放） |
| Automation reject 不假装落库 | PASS（日志写明 Known Gap / 不会落库） |

---

## 13. Regression Tests Added

| 文件 | 覆盖 |
| :--- | :--- |
| `apps/api/test/v91-phase2.regression.spec.ts` | Guard 403；订单/SKU/供应商隔离；工具历史；Interceptor envelope + SSE skip；listing skuId；PO 409 |
| `apps/web/test/v91-phase2-browser-contract.cjs` | AuthGate、401、TopBar、Analyst SSE、GET /tools、入库按钮、广告 error、订单 submitting、Listing error、产品 CTA、Automation reject |

既有 Phase 1 合同测试 **17 web 全绿**（含 Phase 2 新增）。

---

## 14. Browser / HTTP Smoke Result

```text
NOT RUN
```

原因：本机未启动 `pnpm dev:api` + `pnpm dev:web`，没有可用浏览器会话做 Login → Today REST/SSE → Analyst SSE → Tool Center → VIEWER/OWNER 点选。

已用源码合同 + 单元/集成测试代替。不要把合同测试当成浏览器 PASS。

---

## 15. Full Quality Gate

```text
pnpm -r typecheck                         10/10 PASS
pnpm --filter @crosspilot/api test        11 suites / 77 tests PASS
pnpm --filter @crosspilot/web test        17 PASS
packages/domain test                      24 suites / 228 tests PASS
node scripts/run-evals.cjs                9/9 PASS
pnpm --filter @crosspilot/web run build   23/23 PASS
Epic 1/2/3 golden                         0 Regression
Phase 1 browser contracts                 0 Regression
```

`pnpm test` 在修复 core-commerce mock 与 `listExecutions(workspaceId)` 后，API 77/77 绿。测试数量允许增加，未写死旧 300。

---

## 16. Frozen Architecture Diff Check

本轮 **未修改**：

- `Sku360ContextLoader`
- `OperationAnomalyDetector`
- `CrossDomainDiagnosisService`
- `ActionRecommendationService`
- `DailyOperationWorkflowService` DAG
- 补货公式 / Profit / Variance
- OCC `updateMany`
- Milvus RAG / Unified LLM Runtime / Provider Framework 核心
- Prisma Schema（本轮零 schema 变更）
- Epic 4 / SP-API / Ads 执行 / Launch / Scheduler

说明：仓库工作区另有既有 XYDC / Listing DAG / schema 脏文件，**不是本 Phase 2 提交范围**。

---

## 17. Remaining Phase 3 Issues

V91-022 Workspace/Marketplace/SKU Switcher  
V91-023 OCC UX polish  
V91-025 Accessibility  
V91-026 Overview hardcoded copy  
V91-027 Shell visual/copy  
V91-028 Duplicate WorkspaceGuard cleanup  
V91-029 Documentation Drift  

---

## 18. Known Gaps

不变：Approval ≠ Execute、Epic 4 SUSPENDED、WF-03/04 PARTIAL、Launch MISSING、Creative Mock、Automation 无驳回 API、无 Scheduler。

Automation 驳回现已诚实标明 **不会落库**。

---

## 19. V91-017 Deferred Review

**现状：** `DailyDiagnosisService.idempotencyMap` 仍是进程内 `Map<string, { taskId, timestamp }>`。命中后会再 `checkpointStore.get` 并校验 `workspaceId`，所以**不是直接跨租户读检查点**。风险是：

1. 多实例 / 重启后同一 `idempotencyKey` 会再开一条工作流。  
2. Map 键未带 workspace 前缀时，后写入者会覆盖条目（查找时仍按 task.workspaceId 拒绝错租户，但幂等失效）。  
3. 与「Postgres = Production Workflow SoT」不完全对齐。

**要不要 Prisma：** 若要跨进程幂等，需要持久化键。可选：给 `AgentTask` 加 `idempotencyKey` 唯一索引（**要 migration**），或复用现有 checkpoint 元数据。都需要人工批准。

**是否进 Phase 2.1：** 建议是。单实例演示风险中等；多实例生产必须做。

**本轮未改。**

---

## 20. Stop Boundary

Phase 2 完成并停止。

未自动：修 V91-022–029、开 Phase 3、开 Epic 4、UX 大改、新 Feature、V91-017 加表。

等待人工验收。
