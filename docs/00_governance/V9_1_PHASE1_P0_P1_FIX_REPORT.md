# CrossPilot V9.1 Phase 1 — P0 / P1 Production Bug Fix Report

> **阶段**：V9.1 Phase 1 仅修审计确认的 P0/P1  
> **基线**：`docs/00_governance/V9_1_FULL_PRODUCT_BUG_AUDIT.md`  
> **日期**：2026-09-12  
> **边界**：未启动 Epic 4；未改 WF-05 DAG / Detector / Diagnosis / Recommendation / 补货公式 / 利润方差公式 / OCC `updateMany`；未进入 Phase 2

---

## 1. Fixed Issues

| ID | 结果 |
| :--- | :--- |
| V91-001 | **FIXED** Creative SKU 查询强制 `workspaceId`；跨租户 skuCode 不再泄漏产品名；本工作区不存在则 404 |
| V91-002 | **FIXED** `DailyDiagnosisApiClient` 全部走 `/api/v1/operations/daily-diagnosis` |
| V91-003 | **FIXED** SSE 改为 `fetch` + `Authorization: Bearer`，禁止 query token / EventSource |
| V91-021 | **FIXED** AbortController 在 error / `workflow.completed` / `workflow.failed` 关闭连接；页面 error 时 REST `refreshTask` |
| V91-004 | **FIXED** Session 持久化 `crosspilot_role`；全局 `ViewerWriteGuard`；VIEWER 写操作 403 `AUTH_FORBIDDEN`；前端写按钮禁用 |
| V91-006 | **FIXED** 删除利润/库存/SKU360/Analyst 假数字 fallback；0 保持 0；失败显示 Error/N/A |
| V91-007 | **FIXED** Reviews 改为 `/api/v1/skus/:skuId/returns` 与 `return-summary` |
| V91-008 | **FIXED** SKU 360 `returnRate` 与 `getSkuReturnSummary` 统一为 0–1 比率；UI 只乘一次 100 |
| V91-005 | **FIXED** 生产页不再硬编码 `sku_white_001` / `mkt_us_001`；从 `GET /products` 取 UUID / marketplaceId |
| V91-009 | **FIXED** `DailyDiagnosisService` 构造时 `setDailyOperationWorkflowService(this.workflowService)`，Tool 与 REST 共用 Postgres checkpoint |

---

## 2. Modified Files

### 新增

- `apps/api/src/common/guards/viewer-write.guard.ts`
- `apps/api/test/creative-tenant-isolation.spec.ts`
- `apps/api/test/v91-phase1.regression.spec.ts`
- `apps/web/src/lib/catalog.ts`
- `apps/web/test/v91-phase1-browser-contract.cjs`
- `docs/00_governance/V9_1_PHASE1_P0_P1_FIX_REPORT.md`

### 后端

- `apps/api/src/app.module.ts` — 注册 `ViewerWriteGuard`
- `apps/api/src/modules/creative/creative.service.ts`
- `apps/api/src/modules/daily-diagnosis/daily-diagnosis.service.ts`
- `apps/api/src/modules/inventory/inventory.service.ts`
- `apps/api/src/modules/product/product.service.ts`
- `apps/api/src/modules/analyst/analyst.service.ts`

### 前端

- `apps/web/package.json` — `test` 改为 `node --test test/*.cjs`
- `apps/web/src/lib/daily-diagnosis.api.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/components/top-bar.tsx`
- `apps/web/src/app/app/operations/today/page.tsx`
- `apps/web/src/app/app/orders/page.tsx`
- `apps/web/src/app/app/inventory/page.tsx`
- `apps/web/src/app/app/reviews/page.tsx`
- `apps/web/src/app/app/profit/page.tsx`
- `apps/web/src/app/app/skus/page.tsx`
- `apps/web/src/app/app/skus/[skuId]/page.tsx`
- `apps/web/src/app/app/business-analyst/page.tsx`
- `apps/web/src/app/app/suppliers/page.tsx`
- `apps/web/src/app/app/advertising/page.tsx`
- `apps/web/src/app/app/overview/page.tsx`
- `apps/web/src/app/app/listings/page.tsx`
- `apps/web/src/app/app/creative/page.tsx`
- `apps/web/src/app/app/tool-center/page.tsx`
- `apps/web/src/app/app/operations/automation/page.tsx`

---

## 3. Root Cause → Fix Mapping

| ID | 根因 | 修复 |
| :--- | :--- | :--- |
| V91-001 | `sku.findFirst` 只有 `id/skuCode` | `where: { workspaceId, OR: [...] }`；找不到 404 |
| V91-002 | 客户端用 Controller 相对路径，漏了 `api/v1` | 导出 `DAILY_DIAGNOSIS_API_BASE = '/api/v1/operations/daily-diagnosis'` |
| V91-003 | EventSource 不能带 Bearer；query token 被 JWT 忽略 | `fetch` + `Authorization` + `x-workspace-id`；不写 query token |
| V91-021 | `onerror` 不 close；401 自动重试 | `AbortController.abort()`；页面 `refreshTask` REST 水合 |
| V91-004 | 角色不入库；只有 WF-05 查 VIEWER | `setSession(..., role)`；`ViewerWriteGuard` 拦非 GET；UI `isViewer` |
| V91-006 | `\|\| 28490` / catch 返回 450 演示行 | 删除 fallback；`displayAmount` 对 null 显示 N/A，对 0 显示 0 |
| V91-007 | Reviews 打不存在的 `/profit/returns/:sku` | 改为 `/skus/:skuId/returns` |
| V91-008 | 后端百分数 × 前端再 ×100 | 统一 0–1；`displayPercentFromRate` |
| V91-005 | 页面写死演示主键 | `loadCatalogSkus()` 使用真实 UUID |
| V91-009 | 工具 `new PersistentWorkflowCheckpointStore()` | API 构造后注入同一 `DailyOperationWorkflowService` |

---

## 4. Regression Tests Added

| 文件 | 覆盖 |
| :--- | :--- |
| `apps/api/test/creative-tenant-isolation.spec.ts` | A. Workspace A 不能用 skuCode 读到 B 的产品名；缺 SKU 404 |
| `apps/api/test/v91-phase1.regression.spec.ts` | D. VIEWER POST/PATCH/PUT/DELETE → 403；GET 放行；OWNER/ADMIN/OPERATOR 写操作放行；C. JWT 不从 query 取；G. DailyDiagnosisService 注册共享 workflow；E. inventory 失败不再返回 450；缺 balance 404；SKU360 `returnRate===0` 且库存 0 保持 0 |
| `apps/web/test/v91-phase1-browser-contract.cjs` | B. 源码包含 `/api/v1/operations/daily-diagnosis`；C. fetch+Bearer、无 EventSource、无 query token；V91-021 AbortController + terminal events；V91-007 Reviews URL；V91-005 无硬编码 ID；V91-006 无 28490/450/0.032 fallback |

`apps/web/package.json` 的 `test` 从 echo 改为真正跑合同测试，因此 `pnpm test` 现在会执行浏览器契约检查。

---

## 5. Browser / HTTP / SSE Verification

| 要求 | 验证方式 | 结果 |
| :--- | :--- | :--- |
| REST 命中 `/api/v1/operations/daily-diagnosis` | web contract + `DAILY_DIAGNOSIS_API_BASE` | PASS |
| 登录用户认证 SSE | fetch `Authorization: Bearer`；JWT strategy 仍 `fromAuthHeaderAsBearerToken` | PASS（合同）；未起真实浏览器 |
| snapshot / event / heartbeat | 服务端仍写 `event: snapshot` / 具名事件 / 15s ping；客户端解析 `event:`/`data:` | 协议保留 |
| error / completed 释放 | `abort.abort()` + `refreshTask` | PASS（源码合同） |
| 禁止长期 query token | 无 `urlParams.set('token')`；strategy 无 `fromUrlQueryParameter` | PASS |

说明：现有 300 测仍是 Controller 直调。本轮补上**浏览器路径合同**，避免再漏前缀/EventSource。完整浏览器点选需人工起 `dev:api` + `dev:web`。

---

## 6. Tenant Isolation Verification

- Creative `findFirst` **必须**带 `workspaceId`。
- 同 skuCode 在 A/B 两个工作区时，A 只能拿到 A 的 `product.name`。
- SKU 不在当前工作区 → `NotFoundException`，不再用「Natural Marble Toothbrush Holder」冒充。

---

## 7. RBAC Verification

| 角色 | GET | POST/PATCH/PUT/DELETE |
| :--- | :---: | :---: |
| VIEWER | 允许 | 403 `AUTH_FORBIDDEN`（`@Public()` 除外） |
| OPERATOR / ADMIN / OWNER | 允许 | 允许（原有业务校验不变） |

前端：登录写入 `crosspilot_role`；Today / Orders / 入库 / 否定词 / Listing 生成 / Creative / Tool / Automation / Overview reset / 模拟退货 对 VIEWER 禁用。

---

## 8. Honest Data Verification

- API error → 页面 Error / N/A，不再吞成假账。
- null/undefined → `N/A`。
- **0 显示 0**（`displayCount(0)==='0'`，`displayAmount(0)==='0.00'`）。
- 生产页源码合同禁止 `28,490.50`、`|| 450`、`|| 0.032`。
- Inventory DB 失败抛错，不再返回 450 件演示行。
- Analyst 无 waterfall 时返回 null / 「No profit waterfall data」，不再用 1840/-980 场景生成器冒充本工作区账。

---

## 9. Full Quality Gate

```text
pnpm -r typecheck                         10/10 PASS
pnpm test                                 ALL PASS
  domain                                  24 suites / 228 tests
  api                                     10 suites / 64 tests  (was 8/46)
  tool-platform                           3 / 16
  actions / ai / worker                   1+1+1 / 2+6+2
  web contract (node:test)                6/6 PASS
node scripts/run-evals.cjs                9/9 PASS
pnpm --filter @crosspilot/web run build   23/23 PASS
Epic 1 / 2 / 3 golden                     0 Regression
```

Jest 套件由 38 增至 **40**（新增 isolation + v91-phase1.regression）。测试期待未为了变绿而放宽冻结金标。

---

## 10. Frozen Architecture Diff Check

未修改：

- `packages/domain/src/operations/sku360-context.loader.ts` / `sku360-context-loader.ts`
- `operation-anomaly-detector.ts`（12 条规则）
- `cross-domain-diagnosis.service.ts`
- `action-recommendation.service.ts`
- `daily-operation-workflow.service.ts` DAG 拓扑
- 补货 `InventoryPlanningService.calculatePlanning` 公式
- `VarianceAttributionService.attributeVariance`
- OCC `updateMany` + `expectedVersion`
- Prisma schema（本轮）
- Amazon 执行器 / Launch Center / Scheduler

V91-009 只调用已有的 `setDailyOperationWorkflowService`，不换 DAG。

---

## 11. Remaining P2 / P3

审计 V91-010–029 **未修**。包括但不限于：

- Analyst `/agent-tasks/stream` EventSource 无 JWT（P2）
- Tool Center 硬编码目录 / 已删除的 `operation.listing.publish`（P2）
- PO 非法迁移 500 映射（P2）
- TransformInterceptor 剥 `data`（P2）
- 无工作区切换器、ESC/aria、亮色对比度（P2/P3）
- 文档 57 vs 88 API 漂移（DOC_DRIFT）

留给 **V9.1 Phase 2**，需人工确认后再做。

---

## 12. Known Gaps（保持不变）

Epic 4 SUSPENDED · Approval ≠ Execute · WF-03/04 PARTIAL（问答仍是模版，但数字不再伪造）· Launch MISSING · Creative Mock 图 · Reviews VOC 硬编码卡片 · 无 Scheduler · 无独立知识库/Eval 大屏。

---

## 停止边界

Phase 1 P0/P1 已完成并过质量门禁。

**不要自动进入 V9.1 Phase 2。等待人工验收。**
