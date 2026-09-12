# CrossPilot V9.1 Final Browser Acceptance Report

**Date:** 2026-09-12  
**Runtime:** `root@116.198.230.217` `/root/zls/project/CrossPilot` 公网 `http://116.198.230.217:2222`  
**Deployed SHA:** `7c81411`  
**Windows 本机:** 未作为运行环境（无本地 Postgres/API/Web）

---

## 1. Executive Summary

V9.1 已同步到云机并在真实 API + Web 上验收。

远程门禁：health 200，Postgres/Redis/Milvus up，Next 23/23 路由已构建。API 合同 26/26 PASS。真实浏览器打开 `:2222/login`，一键演示登录进入 Overview，可看到 Workspace A/B 切换器与 catalog SKU；同一会话进入 `/app/operations/today`。

验收中发现并热修两个阻塞问题后重验通过：

1. `POST /auth/login` 500：编译后 `bcrypt.default.compare` 为 undefined  
2. WF-05 检查点把场景 SKU **code** 写入 `AgentTask.activeSkuId` 触发 FK P2003

```text
Release Decision: READY TO FREEZE
```

未启动 Epic 4。未把 XYDC 5147 改成 5151。

---

## 2. Runtime Environment

| 项 | 值 |
| :--- | :--- |
| Host | `116.198.230.217` |
| Path | `/root/zls/project/CrossPilot` |
| Git | `7c81411` = `origin/master` |
| PM2 | `crosspilot-api` / `web` / `worker` online |
| Web | `next start -p 2222`，反代 `/api` → `127.0.0.1:3001` |
| DB | 服务器本机 PostgreSQL `crosspilot`（未公网暴露） |
| 本机 Windows | 仅 git push + SSH/scp + 远程浏览器客户端 |

---

## 3. Browser Test Matrix

| 路由 | HTTP | 浏览器 |
| :--- | :---: | :--- |
| `/login` | 200 | PASS：演示登录 + 账密表单 |
| `/app/overview` | 200 | PASS：登录后落地；Workspace A/B；SKU 下拉为 catalog code |
| `/app/operations/today` | 200 | PASS：同会话进入，标题「今日运营看板」 |
| `/app/tool-center` | 200 | 页面 200；工具目录 API 28 条 |
| `/app/orders` `/app/inventory` `/app/profit` `/app/reviews` | 200 | API 200；浏览器未逐页点完 |
| `/app/architecture` | 200 | Sidebar 文案「16 系统架构」+ Copilot Coming Later |

---

## 4. Login / Auth

| 检查 | 结果 |
| :--- | :--- |
| 无 token 访 `/workspaces/current` | 401 |
| `POST /auth/demo-login` | 201 + JWT + Workspace A |
| `POST /auth/login` demo 用户 | 201（热修后；修前 500） |
| `GET /auth/me` | 200 |
| 浏览器一键演示登录 | 进入 `/app/overview`，可见用户名 |

---

## 5. Workspace Switch

| 检查 | 结果 |
| :--- | :--- |
| `GET /workspaces` | 2 个：CrossPilot Demo + Workspace B Isolation |
| A 的 products | 3 SKU，含 A 的 `sku.id`，不含 B |
| B 的 products | 1 SKU，含 B 的同 code 不同 id |
| B 读 A 的 SKU 360 | 404 |
| 缺 `x-workspace-id` | 403 |
| 浏览器 TopBar | 可看到两个 Workspace |

---

## 6. SKU Context

- Overview / Operations Today 的 SKU 选择器列出 `MTH-WHITE-001/GREEN/GREY`，主键是 UUID，不是 `sku_white_001`。  
- `GET /skus/{uuid}/overview` 200。  
- `GET /skus/sku_white_001/overview` 404。

---

## 7. Operations Today REST

- `POST /operations/daily-diagnosis` → **202** + `taskId`  
- 轮询 summary → **COMPLETED** / `health=NEEDS_ATTENTION`  
- 热修前：P2003 `agent_tasks_active_sku_id_fkey`（把 `MTH-WHITE-001` 当 FK）

---

## 8. Operations Today SSE

- `GET .../events` **200** `content-type: text/event-stream`  
- 带 `Authorization` + `x-workspace-id`，不是 query token

---

## 9. HITL / OCC

紧凑 summary 默认不含 actions。`?include=actions` 可见 3 条 `PROPOSED`。

- 批准一条：201，checkpoint 9 → 10，任务 COMPLETED  
- 用旧 `expectedVersion=9` 再批： **409 CHECKPOINT_VERSION_CONFLICT**

Approval ≠ Execute：批准只改决策状态。

---

## 10. VIEWER RBAC

- `viewer@crosspilot.com` 登录 201，role=VIEWER  
- 写诊断 **403**  
- 读 products **200**

---

## 11. Tool Center

`GET /tools` 200，**28** 个工具。页面 HTTP 200。

---

## 12. Orders

`GET /orders` 200。页面 200。

---

## 13. Inventory

`GET /inventory` 200。

---

## 14. Profit / Overview

- `GET /profit/daily` 200  
- `GET /analyst/waterfall` 200 且有 data  
- 浏览器 Overview 为 Demo 工作区，未见把硬编码 `-$2,280` 当实时账的顶栏死数字

---

## 15. Reviews / Returns

`GET /skus/{skuA}/returns` 200。

---

## 16. Business Analyst SSE

本轮未单独打 Analyst SSE。Analyst waterfall REST 200。不伪造 PASS。

---

## 17. Purchase Order

`GET /purchase-orders` 200。

---

## 18. Accessibility Smoke

登录页与工作台可键盘看到主按钮文案。Copilot 为 Coming Later。Dialog ESC 未在远程浏览器里逐个点开 Modal（API/源码 Phase 3 已覆盖）。不伪造全面 a11y PASS。

---

## 19. Bugs Found

| ID | 严重度 | 现象 | 处置 |
| :--- | :--- | :--- | :--- |
| BA-001 | P0 | `POST /auth/login` 500，`bcrypt.default.compare` undefined | **已修** `import * as bcrypt` |
| BA-002 | P0 | WF-05 检查点 SKU code 写入 `activeSkuId` FK 失败，诊断无法 COMPLETED | **已修** 非 UUID 不写 FK |
| BA-003 | P3 | 验收脚本把 201/202 判失败 | 脚本口径，非产品 |

---

## 20. Blocking Fixes Applied

Commits:

- `c4704fd` V9.1 主体上云  
- `1ab969d` / `7c81411` 登录 + FK 热修  

未改冻结算法、Provider Framework、XYDC Mapper。

---

## 21. Remaining Known Gaps

Epic 4 / SP-API、Approval ≠ Execute、WF-03/04 大重构、Launch Center、独立 KB、Scheduler、XYDC live count 可变。仍不进修复队列。

---

## 22. XYDC Adjudication

```text
5147 = fixture snapshot
5151 = LIVE mutable data
NOT PRODUCT BUG
NOT V9.1 REGRESSION
```

未把 live count 固定成 5151。

---

## 23. Final Quality Gate

| 门禁 | 结果 |
| :--- | :--- |
| 远程 `git log -1` | `7c81411` |
| 远程 Next build | 23/23 |
| 远程 health | 200，PG/Redis/Milvus up |
| 远程 API 验收脚本 | **26/26 PASS** |
| 本机 `pnpm -r test` | **NOT RUN**（按指令不在 Windows 起栈；integrations LIVE 5147 仍按 Phase 2.2） |

---

## 24. Release Decision

满足：No remaining P0/P1 after hotfix；Tenant isolation；Auth；VIEWER；Ops Today REST/SSE；HITL；OCC；Persistence；Tool Center；Honest Data；Workspace Switch；主要业务页 HTTP 200。

```text
V9.1 READY TO FREEZE
```

---

## 25. Frozen Architecture Diff

热修仅：

- `apps/api/src/modules/auth/auth.service.ts` bcrypt 导入  
- `packages/domain/src/operations/workflow/workflow-checkpoint.store.ts` activeSkuId UUID 守卫  

未改 Sku360 公式、异常检测、诊断/推荐打分、WF-05 DAG 步骤、OCC `updateMany` 语义、Provider/XYDC。

---

## 26. Stop Boundary

```text
CrossPilot V9.1
Final Browser Acceptance
PASSED

Release Decision:
READY TO FREEZE
```

不要自动启动 Epic 4。不要自动实现 Known Gaps。不要自动做 V9.2。等待人工做最终 Release Freeze。
