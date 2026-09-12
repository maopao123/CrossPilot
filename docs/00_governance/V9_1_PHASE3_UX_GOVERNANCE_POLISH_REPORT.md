# CrossPilot V9.1 Phase 3 — UX / Governance Polish Report

**Status:** COMPLETED / WAITING FOR HUMAN ACCEPTANCE  
**Date:** 2026-09-12  
**Scope:** V91-022, V91-023, V91-025, V91-026, V91-027, V91-028, V91-029 only.

---

## 1. Executive Summary

Phase 3 在不新增业务能力、不改冻结算法、不启动 Epic 4 的前提下，收口 V9.1 剩余体验与治理漂移。

| 项 | 结果 |
| :--- | :--- |
| V91-022 BusinessContext | Workspace / Marketplace 展示 / SKU 选择已接真实 API |
| V91-023 OCC UX | in-flight lock、冲突文案、INVALID_ACTION_STATE 自动刷新 |
| V91-025 A11y | Dialog `role="dialog"` / `aria-modal` / ESC / focus-visible |
| V91-026 Honest Overview | 去掉硬编码 `-$2,280.00`；接 `/analyst/waterfall` 或标 Demo Scenario |
| V91-027 Shell | Copilot = Coming Later；Architecture ≠ Knowledge Base |
| V91-028 WorkspaceGuard | 删除 6 个 controller 重复 Guard；全局 APP_GUARD 保留 |
| V91-029 Governance | 基线 / 矩阵 / 权威图谱按源码重计 |

**未宣布 V9.1 RELEASED。未启动 Epic 4。未跑完整 Browser E2E。**

---

## 2. Fixed Issue Matrix

| ID | 类型 | 处置 | 验证 |
| :--- | :--- | :--- | :--- |
| V91-022 | UX_ISSUE | 轻量 BusinessContext + TopBar selectors | `v91-phase3-ux-contract.cjs` + store unit |
| V91-023 | UX_ISSUE | in-flight + OCC copy；不改 OCC 后端 | contract + 源码 |
| V91-025 | UX_ISSUE | AccessibleDialog + `:focus-visible` | contract |
| V91-026 | UX_ISSUE | waterfall / Demo Scenario | contract：源码无 `-$2,280` |
| V91-027 | UX_ISSUE | Copilot Coming Later；架构文案 | contract |
| V91-028 | TECH_DEBT | 去重复 `@UseGuards(WorkspaceGuard)` | `v91-phase3-workspace-guard-cleanup.spec.ts` 5/5 |
| V91-029 | DOC_DRIFT | 重计 20 files / 21 `@Controller` / 87 REST + 1 SSE / 28 tools | 源码扫描 |
| V91-024 | — | **本阶段不做** | — |

---

## 3. V91-022 Business Context

最小实现，无 Redux。

```text
localStorage
  crosspilot_workspace_id   （ApiClient 已用于 x-workspace-id）
  crosspilot_role
  crosspilot_marketplace_id
  crosspilot_sku_id
sessionStorage
  crosspilot_active_op_task  （切 Workspace 时清除）
```

数据：

- Workspace：`GET /api/v1/workspaces` + `/workspaces/current`
- SKU：`GET /api/v1/products` → `sku.id`（禁止 `sku_white_001` / 顶栏硬编码 `MTH-WHITE-001`）
- Marketplace：现有模型只有 `defaultMarketplace` 代码。UI **只展示当前站点**，不伪造多站点列表。

切 Workspace：

1. 写入新 `workspaceId` + role + defaultMarketplace  
2. 清空 SKU  
3. 清空 `crosspilot_active_op_task`  
4. `ApiClient.setSession` 后 `window.location.reload()`  
5. 后续请求带新 `x-workspace-id`

切 SKU：写 `sku.id`；若当前在 `/app/skus/*` 则路由到新 id。

---

## 4. Workspace Switch Verification

| 步骤 | 行为 |
| :--- | :--- |
| A 选中 | `workspaceId=ws-a`，可有 `skuId=sku-a-1` |
| 切到 B | `applyWorkspaceSwitch` → `workspaceId=ws-b`，`skuId=null`，session task 清空 |
| 后续请求 | ApiClient 读同一 key `crosspilot_workspace_id` 作为 `x-workspace-id` |
| 同 SKU code 跨租户 | 旧 skuId 不能带到 B；B 必须重新选自己的 `sku.id` |

证明：`apps/web/test/v91-phase3-ux-contract.cjs` 前 3 条（MemoryStorage 真切 store，不是只扫源码）。

---

## 5. Marketplace / SKU Context

| 页面 | 绑定 |
| :--- | :--- |
| 全局 TopBar | Workspace 全局边界；SKU 选择；Marketplace 只读展示 |
| SKU 360 | 必须跟 `sku.id`；index 优先 context skuId |
| Listing | catalog 驱动切换器；加载 `/listings/sku/:skuId` |
| Operations Today | Workspace 诊断；SKU mode 才传 `skuId` |
| Overview / Orders / Inventory / Profit / Analyst | Workspace-level，不机械绑 SKU |
| Advertising / Creative / Reviews | 本阶段不重写整页；不把演示 SKU 写进 TopBar |

---

## 6. V91-023 OCC UX

**未改** `expectedVersion` / `updateMany` / 冲突码。

| 要求 | 实现 |
| :--- | :--- |
| in-flight lock | `inflightRef` + `inflightActionId`；Approve/Reject/Dismiss `disabled` |
| 409 CHECKPOINT_VERSION_CONFLICT | 文案：「当前任务已被其他操作更新。请刷新最新状态后重新操作。」按钮 Refresh Latest State |
| 409 INVALID_ACTION_STATE | 先 `refreshTask`，再提示已决断，不鼓励重提 |
| Approval ≠ Execute | 高风险弹窗保留原免责声明 |
| Resume | UI **没有**「必须手动 Resume 才结束」。API resume 仍在客户端，页面不调用 |

---

## 7. V91-025 Accessibility

`AccessibleDialog`：`role="dialog"`、`aria-modal`、`aria-labelledby`、`aria-describedby`、ESC、Tab 循环、关闭后 focus 回到触发元素。

覆盖：Approval Modal、OCC Modal、Action Detail Drawer。

`globals.css` 增加 `:focus-visible`。健康状态卡片原本就有 CRITICAL / HEALTHY 文字，未只靠颜色。登出按钮补 `aria-label`。

---

## 8. V91-026 Honest Overview

- 删除硬编码 `-$2,280.00`
- 拉取 `GET /api/v1/analyst/waterfall`；有 `totalVariance` 则展示；否则「暂无瀑布数据 / Demo Scenario」
- 90 天 KPI 仍走 `/scenario/timeline|daily`；空数据为 N/A，并在双失败时给错误条
- SKU 三卡加 Demo Scenario；详情链到 catalog `sku.id`（若匹配）
- **没有重写 Overview**

---

## 9. V91-027 Navigation / Shell Cleanup

- AI Copilot：不可点，`Coming Later`；去掉 Mastra Agent 活入口
- Sidebar：`16 系统架构` / `Architecture`，不再叫「架构与知识库」
- Architecture 页：去掉「14 大经营子页面」
- LIGHT：沿用已有 `text-white` 覆盖，并保证 focus ring 可见
- SKU 360 不进一级导航（走 TopBar）

---

## 10. V91-028 WorkspaceGuard Cleanup

删除重复 `@UseGuards(WorkspaceGuard)`：

- `product.controller.ts`
- `order.controller.ts`
- `inventory.controller.ts`
- `profit.controller.ts`
- `purchase.controller.ts`
- `supplier.controller.ts`

保留 `app.module.ts` 全局 `APP_GUARD`。未改 Guard 核心语义。

验证：missing header → 403；foreign workspace → 403；`@Public` / `@SkipWorkspace` 不查 membership。

---

## 11. V91-029 Governance Update

已更新：

- `CURRENT_SYSTEM_AUDIT_BASELINE.md`
- `V9_PRODUCT_CAPABILITY_MATRIX.md`
- `DOCUMENT_AUTHORITY_MAP.md`

见 §14–15。

---

## 12. Modified Files（本阶段）

**新增**

- `apps/web/src/lib/business-context-store.cjs` + `.d.ts`
- `apps/web/src/components/business-context-provider.tsx`
- `apps/web/src/components/accessible-dialog.tsx`
- `apps/web/test/v91-phase3-ux-contract.cjs`
- `apps/api/test/v91-phase3-workspace-guard-cleanup.spec.ts`
- `docs/00_governance/V9_1_PHASE3_UX_GOVERNANCE_POLISH_REPORT.md`

**修改**

- TopBar / Sidebar / App layout / catalog.ts
- Overview / Listings / SKUs index / Architecture / globals.css
- Operations Today page + OCC / Approval / ActionList / Drawer
- 6 个 API commerce controllers
- 三份 Level 1 治理文档

---

## 13. Regression Tests

| 套件 | 结果 |
| :--- | :--- |
| `apps/web` `node --test test/*.cjs` | 29/29 PASS（含 Phase 1/2 合同 + 12 条 Phase 3） |
| `apps/api` jest | 13/13 suites，88/88 PASS |
| `packages/domain` jest | 24/24，228/228 PASS |
| `packages/tool-platform` / `actions` / `ai` / `worker` | PASS |
| `node scripts/run-evals.cjs` | 9/9 PASS |
| `@crosspilot/integrations` | **FAIL** `5151 !== 5147`（Phase 2.2 已裁决，禁止改期待） |

---

## 14. Route / API / Tool Recount

扫描时间：2026-09-12。方法：`*.controller.ts` 装饰器 + `apps/web/src/app/**/page.tsx` + `sidebar.tsx` + `ALL_DEFAULT_TOOLS`。

| 项 | 旧文档 | Phase 3 源码 |
| :--- | ---: | ---: |
| Controller 文件 | 20 | **20** |
| `@Controller`（含 Demo） | 21 | **21**（scenario 文件内 `demo`） |
| REST handlers | 57（过时） | **87**（Get 53, Post 33, Patch 1） |
| SSE | 计入 88 的一部分 | **+1** `agent-tasks/stream`；Daily Diagnosis `/events` 为 GET |
| HTTP 端点合计 | 88（审计） | **88**（87 REST + 1 @Sse） |
| Web `page.tsx` | 21 功能页 | **21** |
| Next build 路由 | 23/23 | **23/23**（含 `/` `/login` `/_not-found`） |
| Sidebar 一级 | 16「架构与知识库」 | **17**（含 Operations Today；架构改名） |
| Tool IDs | 22 | **28**（`createDefaultToolRegistry`） |

`/` 是登录/概览跳转，不是营销门户。

---

## 15. Capability Matrix Changes

| 模块 | 变化 |
| :--- | :--- |
| Product Center | 全局 SKU 选择使用 `sku.id` |
| Profit / Overview | 瀑布路径 `/analyst/waterfall`；Overview 不再假装 -$2,280 实时 |
| Listing | SKU 切换器接 catalog |
| Operations Today | OCC UX / a11y；resume 文档纠偏 |
| Knowledge Base | 明确无独立 KB 页；架构页不是 KB |
| Tool Platform | 22 → **28** |
| Launch / Scheduler / Epic 4 | 仍 MISSING / SUSPENDED |

REAL / PARTIAL / MISSING 分布未因「有页面」而虚报：Copilot 仍无能力；Architecture 是静态说明。

---

## 16. Full Quality Gate

```text
pnpm -r typecheck                         10/10 PASS
pnpm --filter @crosspilot/api test        13/13, 88/88 PASS
pnpm --filter @crosspilot/domain test     24/24, 228/228 PASS
pnpm --filter @crosspilot/web test        29/29 PASS
node scripts/run-evals.cjs                9/9 PASS
pnpm --filter @crosspilot/web run build   23/23 PASS
pnpm test (recursive)                     FAIL @crosspilot/integrations 5151!==5147
```

Integrations 失败按 Phase 2.2：`TEST_SNAPSHOT_STALE` / `LIVE_DATA_DRIFT`。**不是 Phase 3 回归。禁止 5147→5151 刷绿。**

---

## 17. Browser Smoke Result

```text
Browser E2E: NOT RUN
```

本阶段允许 contract / component / build。完整浏览器验收属于下一独立阶段 **V9.1 Final Browser Acceptance**。未伪造 PASS。

---

## 18. Frozen Architecture Diff

Phase 3 **未修改**：

```text
Sku360ContextLoader
OperationAnomalyDetector
CrossDomainDiagnosisService
ActionRecommendationService
DailyOperationWorkflowService DAG
Inventory Planning Formula
Profit / Variance Formula
OCC expectedVersion / updateMany
WorkflowIdempotency semantics
Milvus RAG
Unified LLM Runtime
Provider Framework
XYDC Mapper / Provider
```

工作区里仍有既有 XYDC / Listing DAG / Prisma 脏文件，来自更早阶段，**不是本 Phase 3 diff**。本阶段 commerce controller 的 diff 仅去掉重复 Guard。

---

## 19. Remaining Known Gaps

仍不进修复队列：Epic 4 / SP-API、Approval ≠ Execute、WF-03/04 大重构、Launch Center、独立 KB 管理台、Scheduler、Agent Trace 大屏、Creative Mock 生图、站内 VOC 硬编码卡片、XYDC live count 可变。

---

## 20. Stop Boundary

```text
CrossPilot V9.1 Phase 3
UX / Governance Polish
COMPLETED / WAITING FOR HUMAN ACCEPTANCE
```

不要自动：启动 Epic 4。不要宣布：V9.1 RELEASED。下一阶段仅在新命令下进行 Final Browser Acceptance。
