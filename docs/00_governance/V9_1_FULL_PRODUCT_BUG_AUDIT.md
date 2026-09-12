# CrossPilot V9.1 Full Product Bug Audit

> **文档层级**：LEVEL 1 审计产出（本轮只记录，不改代码）  
> **审计日期**：2026-09-12  
> **审计范围**：当前已声明存在、应当工作的功能是否正确 / 稳定 / 一致 / 可用  
> **权威入口**：`docs/00_governance/CURRENT_SYSTEM_AUDIT_BASELINE.md`  
> **禁止项（已遵守）**：不修改业务代码、不修 Bug、不重构、不新增 Feature、不启动 Epic 4、不改 Prisma、不改测试期待

---

## 1. Executive Summary

本轮是 **Audit-only**。质量门禁（typecheck / 300 tests / 9 evals / web build）与 Baseline 一致，**全部 PASS**。Epic 3 冻结域的确定性算法（方差残差、补货公式、WF-05 DAG、OCC `updateMany`）未发现需要推翻冻结架构的计算错误。

真正挡住「当前产品能不能用」的，不是缺功能，而是：

1. **Operations Today 浏览器路径不可用**：`DailyDiagnosisApiClient` 漏了 `/api/v1`，SSE 无法带 JWT。后端集成测试直接打 Controller，所以 300/300 全绿掩盖了前端契约断裂。
2. **VIEWER 只读契约几乎只写在 WF-05 上**：登录不持久化角色；订单 / 入库 / 退货 / 否定词 / Listing / Tool 写接口对 VIEWER 开放。
3. **财务与库存 UI 在失败或 0 值时用硬编码数字冒充真实业务数据**（违反「无数据不得显示为正常业务数据」）。
4. **页面硬编码 `sku_white_001` / `mkt_us_001`**，而 seed 的 `Sku.id` / `Marketplace.id` 是 UUID。
5. **Creative pack 按 `skuCode` 全局 `findFirst`，缺少 `workspaceId`**，构成跨工作区读取产品名的隔离缺口。

**Epic 4 未启动。Launch Center / WF-03 PARTIAL / WF-04 问答层模版 / Approval ≠ Execute / Creative Mock 图，一律按 Known Gap，不进 Bug Fix Queue。**

**建议下一阶段**：V9.1 Phase 1 只修 P0/P1（见 §19）。本文件等待人工确认 Bug List。

---

## 2. Audit Baseline

| 项 | 基线事实（CURRENT_SYSTEM_AUDIT_BASELINE） | 本轮核验 |
| :--- | :--- | :--- |
| Current Release | CrossPilot V9 | 确认 |
| Current Work | V9.1 Product Stabilization & UX Polish | 确认 |
| Epic 3 | RELEASE VERIFIED & FROZEN | 确认；冻结资产未因品味要求重写 |
| Epic 4 | SUSPENDED / NOT CANCELLED | 确认；未启动 |
| Release Decision | READY_WITH_KNOWN_LIMITATIONS | 确认 |
| 测试 | 38/38 suites, 300/300 tests | **38 Jest suites + 300 tests PASS**（另有 integrations CJS 套件 PASS，不计入 38） |
| Typecheck | 10/10 | **PASS** |
| Golden D1–D10 | 11/11 in domain suite | domain `epic3-daily-operation-golden.spec.ts` 含在 228 domain tests 内 |
| `run-evals.cjs` | 9/9 | **9/9 PASS** |
| Web build | 23/23 | **`Generating static pages (23/23)` PASS** |
| 路由矩阵 | 23（含 `/`、`/login`、`_not-found`） | 代码 21 个业务 page + `/` + `/login` + Next `_not-found` |
| API 矩阵 | 20 controllers / 57 APIs | **21 controller 类（含 `DemoController`）/ 88 Nest handlers** |
| WF-03 / WF-04 | PARTIAL | 非 Bug |
| Launch Center | MISSING | 非 Bug |
| Approval ≠ Execute | 铁律 | 非 Bug |

文档冲突裁决：以代码事实 + Level 1 Baseline 为准。`docs/90_historical/` 仅追溯，不恢复旧需求。

---

## 3. Verification Environment

| 项 | 值 |
| :--- | :--- |
| Host | Windows / PowerShell |
| Project | `E:\AiSecondBrain\vault\Work\Projects\CrossPilot` |
| 命令工作目录 | 必须 `Set-Location` 到 CrossPilot；在 `E:\AiSecondBrain` 根执行 `pnpm -r` 会因无 `package.json` 失败 |
| Node / pnpm | 本机已安装；pnpm workspace **10 of 11** 包有 typecheck/test script（与基线 10/10 一致） |
| `pnpm -r typecheck` | **PASS**（shared, web, integrations, actions, ai, domain, db, tool-platform, api, worker） |
| `pnpm test` | **PASS**：domain 24/228, api 8/46, tool-platform 3/16, actions 1/2, ai 1/6, worker 1/2 → **38 suites / 300 tests** |
| `node scripts/run-evals.cjs` | **9/9 PASSED (100%)** |
| `pnpm --filter @crosspilot/web run build` | **PASS**，Next.js 14.2.35，`Generating static pages (23/23)` |
| 浏览器 E2E | **未跑**。本轮不做代码改动，也未启动长期 API/Web 进程做点击验收。运行时结论来自静态代码路径 + 现有集成测试（集成测试绕过 HTTP 前缀与 EventSource）。 |
| 未改测试期待 | 确认 |

**Baseline Before Audit（本轮执行前/中记录，与 HANDOFF 宣称一致）：**

```text
Typecheck     10/10 PASS
Test Suites   38/38 PASS
Tests         300/300 PASS
Evals         9/9 PASS
Web Build     23/23 PASS
Cross-Epic    无本轮引入的测试回归（套件保持全绿）
```

---

## 4. Route Inventory

以 `apps/web/src/app/**/page.tsx` + `next build` 为准。

| # | Route | Page file | Sidebar | 状态 | 本轮结论 |
| :---: | :--- | :--- | :---: | :---: | :--- |
| 1 | `/` | `apps/web/src/app/page.tsx` | 否 | REAL（仅跳转） | 有 token → `/app/overview`，否则 `/login`。**不是**基线写的营销落地页 |
| 2 | `/login` | `login/page.tsx` | 否 | REAL | 账号登录 + Demo；Demo 写死 `role: 'OWNER'` |
| 3 | `/app/overview` | `app/overview/page.tsx` | 是 | REAL | scenario timeline/daily；KPI 失败则 $0；第 11 周利润硬编码 |
| 4 | `/app/operations/today` | `app/operations/today/page.tsx` | 是 | REAL（后端）/ **浏览器路径 BROKEN** | REST 缺 `/api/v1`；SSE 无 Bearer |
| 5 | `/app/operations/automation` | `app/operations/automation/page.tsx` | 是 | PARTIAL | 初始 DAG 为本地种子；驳回不打 API |
| 6 | `/app/market-research` | `app/market-research/page.tsx` | 是 | REAL | 主列表失败静默；Trend/VOC 有错误态 |
| 7 | `/app/listings` | `app/listings/page.tsx` | 是 | REAL | 生成/合规失败仅 `console.error` |
| 8 | `/app/creative` | `app/creative/page.tsx` | 是 | PARTIAL | Mock 图 = Known Gap；SKU 查询缺租户过滤 = Bug |
| 9 | `/app/advertising` | `app/advertising/page.tsx` | 是 | PARTIAL | 否定词失败静默 |
| 10 | `/app/profit` | `app/profit/page.tsx` | 是 | REAL 算法 / **UI 回退伪造** | `\|\| '28,490.50'` 等 |
| 11 | `/app/business-analyst` | `app/business-analyst/page.tsx` | 是 | PARTIAL | 瀑布失败用 -980 等硬编码；Ask 失败静默；SSE 无 JWT |
| 12 | `/app/orders` | `app/orders/page.tsx` | 是 | REAL 后端 / **表单 ID 错** | `sku_white_001` + `mkt_us_001` |
| 13 | `/app/inventory` | `app/inventory/page.tsx` | 是 | REAL 计算 / **只看 balances[0] + 假 KPI** | reorder 钉死 `sku_white_001` |
| 14 | `/app/suppliers` | `app/suppliers/page.tsx` | 是 | REAL | 非 RECEIVED 一律显示入库；非法迁移 500 |
| 15 | `/app/reviews` | `app/reviews/page.tsx` | 是 | PARTIAL VOC + **退货 API 路径错误** | `/profit/returns/:sku` 不存在 |
| 16 | `/app/products` | `app/products/page.tsx` | 是 | REAL | 「新建产品」无 onClick；SKU 360 链接正确用 `sku.id` |
| 17 | `/app/skus` | `app/skus/page.tsx` | **否** | REAL | `replace('/app/skus/sku_white_001')` 对 UUID seed 404 |
| 18 | `/app/skus/[skuId]` | `app/skus/[skuId]/page.tsx` | **否** | REAL | 从产品中心进则可用；失败用假财务数字；退货率单位错 |
| 19 | `/app/competitors` | `app/competitors/page.tsx` | 是 | PARTIAL | VOC 证据在此页，不在 Reviews |
| 20 | `/app/tool-center` | `app/tool-center/page.tsx` | 是 | REAL 执行 / **目录硬编码 5 个** | 未调 `GET /tools`；含已删除的 `operation.listing.publish` |
| 21 | `/app/architecture` | `app/architecture/page.tsx` | 是（标「知识库」） | REAL 静态 | 不是知识库管理台 |
| 22 | `/_not-found` | Next 内置 | — | REAL | 无自定义 `not-found.tsx` |
| 23 | App layout | `app/app/layout.tsx` | — | REAL | TopBar + Sidebar；**无登录守卫** |

**用户清单对照：**

| 用户点名 | 代码落点 |
| :--- | :--- |
| Business Overview | `/app/overview` |
| Market / Product Research | `/app/market-research` |
| Product Center | `/app/products` + `/app/skus` |
| Competitor / VOC | `/app/competitors`（Reviews VOC 为硬编码 Known Gap） |
| Profit Calculator | Tool Center `finance.profit.calculate`，无独立路由 |
| Supply / Purchase | `/app/suppliers` |
| Listing Studio | `/app/listings` |
| Advertising | `/app/advertising` |
| Orders | `/app/orders` |
| Inventory / FBA | `/app/inventory` |
| Reviews / Returns | `/app/reviews` |
| Profit Center | `/app/profit`（瀑布在 Analyst，不在本页） |
| AI Business Analyst | `/app/business-analyst` |
| Operations Today | `/app/operations/today` |
| Knowledge Base | 无独立页（KNOWN_GAP） |
| Agent Trace / Eval | 无独立页；`/eval/*`、`/agent-tasks` 无 Web 消费 |
| System / Data Source | 无独立页 |
| Launch Center | MISSING（KNOWN_GAP，非 Bug） |

---

## 5. API Inventory

Nest `setGlobalPrefix('api/v1')`。全局 `JwtAuthGuard` + `WorkspaceGuard` + `TransformInterceptor` + `HttpExceptionFilter`。**无** `ValidationPipe`。

**计数：** 基线 57；代码 **88** 个 handler + 2 个 bootstrap health 307。基线 57 条路径均存在，无「文档有、代码无」的缺失路由。多出的 31 条未进基线矩阵。

前端已接入的关键前缀正确（`/api/v1/...`），**唯一系统性漏前缀的客户端是 `DailyDiagnosisApiClient`**。

完整对照见本文件末「附录：88 API」。正文只列审计结论：

| 类别 | 结论 |
| :--- | :--- |
| 文档有、代码有、前端真用 | 登录、多数 GET 列表、WF-05 六个 REST（客户端路径写错）、Listing 主路径、利润 summary/daily、订单列表/创建、库存列表、PO 列表/receive |
| 文档写「前端已接入」但实际未接 | `POST /auth/register`、`GET/POST /workspaces`、`GET /listings/creative-brief/:id`、`GET /market-research/keywords`、`GET /orders/:id`、`GET /skus/:skuId/inventory`、`POST /purchase-orders`、`GET /tools`、`POST /scenario/reset`（前端打的是 `/demo/reset`） |
| 代码有、文档无、前端在用 | `/demo/reset`、`/scenario/timeline|daily`、`/skus/:skuId/overview`、`/creative/pack`、`/product-opportunities`、`/voc/topics/:id/evidence`、`/operations/listing-publish`、`/operations/approve/:id`、`/agent-tasks/stream` |
| 死接口 / 无消费者 | eval、agent-tasks list/trace、creative gallery、PO confirm/ship、products POST、suppliers POST、tools GET 等 |
| 前端路径与后端不一致 | Reviews：`/profit/returns/:sku` vs `/skus/:skuId/returns` |

---

## 6. P0 Issues

### Issue ID: V91-001

**Severity:** P0  
**Type:** BUG  
**Module:** Creative Studio / Tenant Isolation  
**Route:** `/app/creative`, `/app/listings`（发送素材包）  
**File:** `apps/api/src/modules/creative/creative.service.ts` → `generateCreativePack`  
**Related API:** `POST /api/v1/creative/pack`

**Description:** SKU 查询未带 `workspaceId`。`Sku.skuCode` 仅在 `(workspaceId, skuCode)` 上唯一，演示数据各租户都有 `MTH-WHITE-001`。`findFirst({ OR: [{ id }, { skuCode }] })` 可读到**其他工作区**的 `product.name` 并写入素材包。

**Reproduction:** 两个 workspace 均有 `MTH-WHITE-001` 但产品名不同；在 A 中 `POST /creative/pack { skuCode: 'MTH-WHITE-001' }`。

**Expected:** `where: { workspaceId, OR: [...] }`；找不到则 404。

**Actual:** 全局第一行 SKU；`productName` 可能来自外租户。

**Evidence:**

```34:42:apps/api/src/modules/creative/creative.service.ts
    const sku = await this.prisma.sku.findFirst({
      where: {
        OR: [{ id: skuCodeOrId }, { skuCode: skuCodeOrId }],
      },
      include: { product: true },
    });
    const skuCode = sku?.skuCode || skuCodeOrId;
    const productName = sku?.product.name || 'Natural Marble Toothbrush Holder';
```

`schema.prisma` `Sku @@unique([workspaceId, skuCode])`。

**Root Cause:** 租户过滤漏在 Catalog 查找层。Mock 出图是 Known Gap；**隔离失败不是 Gap**。

**Suggested Fix:** 查询强制 `workspaceId`。不要改 Creative 生图实现。

**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

## 7. P1 Issues

### Issue ID: V91-002

**Severity:** P1  
**Type:** BUG  
**Module:** Operations Today / WF-05  
**Route:** `/app/operations/today`  
**File:** `apps/web/src/lib/daily-diagnosis.api.ts`  
**Related API:** `POST/GET /api/v1/operations/daily-diagnosis*`

**Description:** 诊断客户端请求 `/operations/daily-diagnosis`，Nest 全局前缀是 `api/v1`，Next rewrite 只代理 `/api/:path*`。浏览器 REST **打不到** 后端。其它页面均使用 `/api/v1/...`。

**Reproduction:** 登录 → 今日运营看板 → 执行日常诊断（本地空 `NEXT_PUBLIC_API_URL` 或 compose `NEXT_PUBLIC_API_URL=http://localhost:3001`）。

**Expected:** `POST /api/v1/operations/daily-diagnosis`（或 `API_BASE + /api/v1/...`）。

**Actual:** `POST /operations/daily-diagnosis` → Next 404 HTML 或 Nest 404。

**Evidence:** `startDiagnosis` 使用 `'/operations/daily-diagnosis'`；`apps/api/src/main.ts` `setGlobalPrefix('api/v1')`；`apps/web/next.config.mjs` rewrite `source: '/api/:path*'`；`docker-compose.yml` `NEXT_PUBLIC_API_URL: http://localhost:3001`。Workbench 集成测试直接调 Controller，不经过此前缀。

**Root Cause:** 客户端按 Controller 相对路径编写，未叠加 global prefix / Next 代理。

**Suggested Fix:** 与 `ApiClient` 对齐，全部加 `/api/v1`。

**Regression Risk:** Medium（HTTP 契约测试目前覆盖不足）。  
**Frozen Architecture Impact:** YES（冻结资产 #11 UI 客户端；不要改 DAG）

---

### Issue ID: V91-003

**Severity:** P1  
**Type:** BUG  
**Module:** Operations Today / SSE  
**Route:** `/app/operations/today`  
**File:** `daily-diagnosis.api.ts` `connectEvents`；`apps/api/src/modules/auth/jwt.strategy.ts`  
**Related API:** `GET /api/v1/operations/daily-diagnosis/:taskId/events`

**Description:** 浏览器 `EventSource` 不能设 `Authorization`。客户端把 `token` 放在 query。Passport 只从 Bearer 取 JWT。端点非 `@Public()`。SSE 核心观察通道 401。即使 V91-002 修好，实时 DAG 仍断。`token=` 还会进访问日志 / Referer。

**Reproduction:** Network 面板看 `/events`（需先修 V91-002 才能打到 Nest）。

**Expected:** 已登录用户可收 `snapshot` + 具名事件 + 15s ping。

**Actual:** 401；`onError` → `isStreaming=false`。原生 EventSource 还会对 401 自动重试。

**Evidence:** `connectEvents` L219–227 注释承认无自定义头；`ExtractJwt.fromAuthHeaderAsBearerToken()`；SSE handler 本身有 snapshot/heartbeat/`req.on('close')` 清理，但鉴权过不去。

**Root Cause:** SSE 传输与 JWT 提取策略不匹配。

**Suggested Fix:** 同源 rewrite + cookie，或 `fetch`+stream 带 Bearer。**不要**把 JWT 长期放在 query。不要改 WF-05 领域服务。

**Regression Risk:** Medium。  
**Frozen Architecture Impact:** YES（冻结资产 #9 Controller/SSE 鉴权边界）

---

### Issue ID: V91-004

**Severity:** P1  
**Type:** BUG  
**Module:** RBAC  
**Route:** 全站写操作；尤其 `/app/orders`、`/app/suppliers`、`/app/advertising`、`/app/listings`、`/app/tool-center`、`/app/operations/today`  
**File:** `apps/web/src/lib/api-client.ts` `setSession`；`login/page.tsx`；`operations/today/page.tsx`；各 `*.controller.ts`  
**Related API:** 除 WF-05 mutations 与 scenario/demo reset 外的全部 POST/PATCH

**Description:** Baseline §12 与 `OPERATIONS_TODAY_UI.md` 要求 VIEWER 只读。后端 VIEWER 403 **仅**诊断 start/approve/reject/dismiss/resume 与 OWNER/ADMIN reset。登录只存 token + workspaceId，**从不写 `crosspilot_role`**。Today 页读该 key → `isViewer` 恒 false。Demo 登录写死 OWNER。VIEWER JWT 可创建订单、入库、退货、否定词、生成 Listing、执行含 `operation.daily.action.approve` 的工具。

**Reproduction:** 以 VIEWER 成员登录（需绕过 Demo OWNER）或直接带 VIEWER JWT 调 `POST /orders`。

**Expected:** 写按钮隐藏/禁用；API 403 `AUTH_FORBIDDEN`。

**Actual:** UI 全开；除 WF-05 外 API 成功。

**Evidence:** `setSession` 只写 `crosspilot_token` / `crosspilot_workspace_id`；`today/page.tsx` `localStorage.getItem('crosspilot_role')`；`grep member.role` 仅 daily-diagnosis + scenario。

**Root Cause:** RBAC 只做在 Epic 3 HITL 边界，未提升为全局写守卫；前端角色从未入 session。

**Suggested Fix:** 登录持久化 `activeWorkspace.role`；API 层统一写守卫；不要把角色判断做进冻结打分器。

**Regression Risk:** Medium（需补 VIEWER 集成用例，本轮禁止为了绿而改期待）。  
**Frozen Architecture Impact:** NO（守卫层，非 DAG）

---

### Issue ID: V91-005

**Severity:** P1  
**Type:** BUG  
**Module:** Orders / Inventory / SKU 360 / Reviews  
**Route:** `/app/orders`, `/app/inventory`, `/app/skus`, `/app/reviews`, `/app/profit`  
**File:** 见 Evidence  
**Related API:** `POST /orders`；`POST /skus/:skuId/reorder-recommendation`；`GET /skus/:skuId/overview`；`POST /returns`

**Description:** Seed 的 `Sku.id` / `Marketplace.id` 为 UUID。页面硬编码 `sku_white_001`、`sku_green_002`、`sku_black_002`、`mkt_us_001`、`ord_item_demo_01`。真实库上订单创建 FK 失败；`/app/skus` 跳到不存在的 id；补货 POST 打假 id（服务在找不到 balance 时用 450/8.5 **编造**规划）。

**Reproduction:** `pnpm db:seed` 后打开订单页提交；或打开 `/app/skus`。

**Expected:** 下拉绑定 `GET /products` / `/inventory` 的真实 `sku.id` 与 workspace `defaultMarketplaceId`。

**Actual:** 演示字符串 ID。产品中心「SKU 360」链接是对的（`/app/skus/${sku.id}`）。

**Evidence:** `schema.prisma` `Sku.id @default(uuid())`；`seed.ts` upsert 不指定 id；`orders/page.tsx` L18, L50–59, L119–120；`inventory/page.tsx` L23–26；`skus/page.tsx` L11；`reviews/page.tsx` L20, L112–114；`profit/page.tsx` L44–49。

**Root Cause:** UI 把测试夹具 ID 当成生产主键。

**Suggested Fix:** 去掉硬编码，改 API 水合。Inventory `getReorderRecommendation` 在 SKU 不存在时应 404，而不是 450 件假数据。

**Regression Risk:** Medium。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-006

**Severity:** P1  
**Type:** BUG  
**Module:** Profit / Inventory / SKU 360 / Analyst  
**Route:** `/app/profit`, `/app/inventory`, `/app/skus/[skuId]`, `/app/business-analyst`  
**File:** 各 page 的 `||` 回退；`inventory.service.ts` `listInventory` catch；`product.service.ts` `getSku360Overview` catch  
**Related API:** `/profit/summary`、`/inventory`、`/skus/:id/overview`、`/analyst/waterfall`

**Description:** API 失败、null、或 `0`（falsy）时，UI/服务返回看起来像真账的数字：利润 `$28,490.50`、库存 450、退货 `$89.97`、瀑布 `-980/-620/-510/-310/+140`。违反审计维度 D/F/G：「不得把无数据显示为正常业务数据」「不得静默失败」。

**Reproduction:** 未登录打开 `/app/profit`（layout 无守卫）；或断 API 后刷新利润/库存/SKU360。

**Expected:** Error / Empty；数字区为空或明确「不可用」。`0` 必须显示 0。

**Actual:** 健康绿色 KPI。`inv?.fulfillableQuantity || 450` 把真实 0 库存显示成 450。

**Evidence:** `profit/page.tsx` L114 `summary?.revenue?.toFixed(2) || '28,490.50'`；`skus/[skuId]/page.tsx` L90, L107, L154, L175；`inventory/page.tsx` L69–102；`business-analyst/page.tsx` L140–146；`inventory.service.ts` L18–32 catch 返回 demo 450。

**Root Cause:** 离线演示回退与生产渲染共用同一条表达式。

**Suggested Fix:** 删除业务数字 fallback；区分 loading/error/empty；`??` 代替对数量字段的 `||`。

**Regression Risk:** Low–Medium（页面会「看起来空」，这是正确的）。  
**Frozen Architecture Impact:** NO（不要改 `ProfitCalculationService` / 方差公式）

---

### Issue ID: V91-007

**Severity:** P1  
**Type:** BUG  
**Module:** Reviews / Returns  
**Route:** `/app/reviews`  
**File:** `apps/web/src/app/app/reviews/page.tsx`  
**Related API:** 实际 `GET /api/v1/skus/:skuId/returns`、`GET /api/v1/skus/:skuId/return-summary`

**Description:** 页面请求不存在的 `/api/v1/profit/returns/:sku`。`.catch(() => [])` 与硬编码 `{ count: 3, refundTotal: 89.97, returnRate: 0.032 }` 把 404 伪装成账。VOC 卡片硬编码 = Known Gap（矩阵已 PARTIAL），本条只报退货契约。

**Reproduction:** 打开评论与退货 → 退货明细。

**Expected:** 真实退货行或诚实空表 + 错误态。

**Actual:** 空表或假汇总；星级 4.7/152 亦硬编码（VOC Known Gap，不单列 P1）。

**Evidence:** `reviews/page.tsx` L33–39 vs `profit.controller.ts` L60–74。

**Root Cause:** 路径写错 + 静默 catch。

**Suggested Fix:** 改 URL；去掉假 summary 初始值。

**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-008

**Severity:** P1  
**Type:** BUG  
**Module:** SKU 360  
**Route:** `/app/skus/[skuId]`（产品中心真实 UUID 入口）  
**File:** `product.service.ts` `getSku360Overview`；`skus/[skuId]/page.tsx`  
**Related API:** `GET /api/v1/skus/:skuId/overview`

**Description:** 后端 `returnRate = (returns.length / unitsSold) * 100`（已是百分数，3/942 → ~0.3）。前端 `((returns?.returnRate || 0.032) * 100)` 再乘 100 → **30.0%**。且 `0 || 0.032` 把零退货显示成 3.2%。这是「重要数据错误」，不是样式问题。

**Reproduction:** 从产品中心点 SKU 360（真实 id）。

**Expected:** 与 `getSkuReturnSummary` 一致的比率（0.0032 → 0.3%）或统一百分数契约。

**Actual:** 放大 100 倍或用 3.2% 占位。

**Evidence:** `product.service.ts` L264 `returnRate = unitsSold > 0 ? (returns.length / unitsSold) * 100 : 0` 然后 `Math.round(returnRate * 10) / 10`；UI L175 `((returns?.returnRate || 0.032) * 100).toFixed(1)%`。`profit.service.ts` `getSkuReturnSummary` 则 **不** 乘 100（比）。契约 internally 也不一致。

**Root Cause:** 百分比 vs 小数未约定；UI 用 `||` 处理 0。

**Suggested Fix:** 单一契约（建议 0–1 比率）；UI 只用 `??`。

**Regression Risk:** Medium（展示会从「看起来合理的 3%」变成真实 0.3%，需产品确认）。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-009

**Severity:** P1  
**Type:** BUG  
**Module:** Tool Platform / WF-05  
**Route:** `/app/tool-center` 执行 `operation.daily.*`  
**File:** `packages/tool-platform/src/tools/operation-daily-diagnosis.tools.ts` `getDailyOperationWorkflowService`  
**Related API:** `POST /api/v1/tools/:id/execute`

**Description:** API 的 `DailyDiagnosisService` 注入 `PostgresWorkflowCheckpointStore`。工具层 `new PersistentWorkflowCheckpointStore()` **无 adapter**。生产 `NODE_ENV=production` 会 `PersistenceUnavailableError`（铁律 5）；非生产走文件 `.checkpoints/wf05`，与 Operations Today 的 Postgres **不是同一个脑**。VIEWER 仍可走工具批准（V91-004）。

**Reproduction:** Tool Center 执行 `operation.daily.diagnosis.run` / `operation.daily.action.approve`。

**Expected:** 与 API 同一 Postgres 检查点（`setDailyOperationWorkflowService` 已存在却未被 API 模块调用）。

**Actual:** 第二套 store 或生产直接抛错。

**Evidence:** `operation-daily-diagnosis.tools.ts` L29–35；对比 `daily-diagnosis.service.ts` L48–53。铁律 9：Tool ≠ Internal Service，但工具必须指向同一 SoT。

**Root Cause:** 工具工厂未接入 Nest 已构造的 workflow service。

**Suggested Fix:** `DailyDiagnosisModule` 启动时 `setDailyOperationWorkflowService(apiService.getWorkflowService())`。不要重写 DAG。

**Regression Risk:** Medium。  
**Frozen Architecture Impact:** YES（接线，不改算法）

---

## 8. P2 Issues

### Issue ID: V91-010

**Severity:** P2  
**Type:** BUG  
**Module:** AI Business Analyst / SSE  
**Route:** `/app/business-analyst`  
**File:** `business-analyst/page.tsx` `handleStartSSE`  
**Related API:** `GET /api/v1/agent-tasks/stream`

**Description:** `new EventSource('/api/v1/agent-tasks/stream?...')` 无 JWT、无 workspace。全局 JwtAuthGuard → 401。`onerror` 文案写成「演示流结束」。另：`TransformInterceptor` 对带 `data` 的 MessageEvent 可能剥掉 `type`（V91-013）。

**Expected:** 认证后的演示流，或明确「未授权」。  
**Actual:** 立刻 error。  
**Evidence:** page L116；`agent-task.controller.ts` `@Sse('stream')`。  
**Root Cause:** EventSource + Bearer。  
**Suggested Fix:** 与 V91-003 同一套 SSE 认证。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-011

**Severity:** P2  
**Type:** BUG  
**Module:** Tool Center  
**Route:** `/app/tool-center`  
**File:** `tool-center/page.tsx` `INITIAL_TOOLS`；`default-tools.ts`  
**Related API:** `POST /api/v1/tools/:id/execute`；未使用的 `GET /api/v1/tools`

**Description:** UI 硬编码约 5 个工具，含 **`operation.listing.publish`**。Registry 已删除该工具（只剩 `operation.keyword.combine` + 5 个 daily + 市场/创意等，共 22）。执行发布器 → 404。目录不反映 22 工具。

**Expected:** `GET /tools` 驱动目录。  
**Actual:** 过期硬编码。  
**Evidence:** `tool-center/page.tsx` L245；`operation-automation.tools.ts` 仅 combine；`default-tools.ts` `ALL_DEFAULT_TOOLS`。  
**Suggested Fix:** 改用 `GET /tools`。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-012

**Severity:** P2  
**Type:** BUG  
**Module:** Supply / Purchase  
**Route:** `/app/suppliers`  
**File:** `purchase-order.state-machine.ts` `assertTransition`；`http-exception.filter.ts`；`suppliers/page.tsx`  
**Related API:** `POST /api/v1/purchase-orders/:id/receive`

**Description:** UI 对一切非 `RECEIVED` 显示「入库核收」。合法迁移仅 `SHIPPED|PARTIALLY_RECEIVED → RECEIVED`。`assertTransition` 抛 **无 `code` 的 Error**，生产映射为 500 泛化消息。

**Expected:** 非法状态隐藏按钮；API 409 `PURCHASE_INVALID_STATUS_TRANSITION`。  
**Actual:** DRAFT 入库 → 500。Confirm/Ship 无 UI。  
**Evidence:** state-machine L15–20, L36–38；suppliers L195–207。  
**Root Cause:** 错误码未进 filter；UI 未跟状态机。  
**Suggested Fix:** 映射错误码；按钮按状态。不要放宽状态机。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-013

**Severity:** P2  
**Type:** BUG  
**Module:** API envelope  
**Route:** Tool Center；潜在 SSE  
**File:** `apps/api/src/common/interceptors/transform.interceptor.ts`  
**Related API:** `POST /tools/:id/execute`；`@Sse` 流

**Description:** 若 handler 返回对象已含 `data` 但无 `requestId`，拦截器只保留 `response.data`，丢掉 `success` / `durationMs` / `error`。Tool Center 用 `data.durationMs || 120`。`@Res()` SSE 存在二次写头风险（测试未走拦截器）。

**Expected:** 整包包装；`text/event-stream` / `@Res()` 跳过。  
**Actual:** 工具结果被剥皮。  
**Evidence:** interceptor L37–44；`tool-center/page.tsx` L343。  
**Suggested Fix:** 仅当同时有 `data`+`requestId` 才视为已包装；SSE skip。  
**Regression Risk:** Medium（所有客户端依赖 `.data` unwrap）。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-014

**Severity:** P2  
**Type:** BUG  
**Module:** Listing Studio  
**Route:** `/app/listings`  
**File:** `listing.controller.ts` `generateListing`；`listing.service.ts`  
**Related API:** `POST /api/v1/listings/generate`

**Description:** 无 Zod。`skuId` undefined 时 Prisma 丢掉 `undefined` 键，`where: { workspaceId }` → 工作区内**任意第一件 SKU**。正常 UI 会带 `listing.skuId`，直打 API 可误生成。

**Expected:** 400 VALIDATION_ERROR。  
**Actual:** 可能生成错 SKU（同租户）。  
**Evidence:** controller L17–28 `@Body('skuId')`；service L256 `findFirst({ where: { id: skuId, workspaceId } })`。  
**Suggested Fix:** Zod `skuId` required。不要改 14 步 DAG。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-015

**Severity:** P2  
**Type:** BUG  
**Module:** Orders / Isolation  
**Route:** `/app/orders`  
**File:** `order.service.ts` `createOrder`  
**Related API:** `POST /api/v1/orders`

**Description:** `tx.sku.findUnique({ where: { id: item.skuId } })` 不带 `workspaceId`。知道外租户 SKU UUID 时可读取其 `sellingPrice` 做成本。库存扣减仍按本 workspace 的 balance，多半 Fail-closed，但是价格泄漏。同类：`createSku` 的 `productId`、`createPurchaseOrder` 的 `supplierId` 未校验归属。

**Expected:** SKU/供应商/产品必须属于当前 workspace。  
**Actual:** 仅 FK 到全局 id。  
**Evidence:** `order.service.ts` L190–192。  
**Suggested Fix:** `findFirst({ where: { id, workspaceId } })`。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-016

**Severity:** P2  
**Type:** BUG  
**Module:** Tool Center  
**Route:** （无页面消费 `GET /tools/executions`，API 仍在）  
**File:** `tool-center.service.ts` `listExecutions` / `recentExecutions`  
**Related API:** `GET /api/v1/tools/executions`

**Description:** 内存环形缓冲跨租户。DB 空或异常时 fallback `recentExecutions.slice`，可返回其他 workspace 的 input/output。

**Expected:** 严格 `task.workspaceId`；失败不要回退全局内存。  
**Actual:** 进程级数组。  
**Evidence:** service L88–101, L147–  fallback。  
**Suggested Fix:** 去掉跨租户 fallback。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-017

**Severity:** P2  
**Type:** BUG  
**Module:** WF-05 API  
**Route:** `/app/operations/today`  
**File:** `daily-diagnosis.service.ts` `idempotencyMap`  
**Related API:** `POST /api/v1/operations/daily-diagnosis`

**Description:** 幂等 Map 在进程内存，不按 workspace 做主键隔离，重启/多实例失效。检查点 Postgres 仍是 SoT；这是 API 层捷径，不是 DAG 错误。

**Expected:** 持久化、按 workspace 作用域的幂等键。  
**Actual:** RAM Map。  
**Evidence:** service L47, L73–79。  
**Suggested Fix:** 表或 checkpoint 元数据。  
**Regression Risk:** Medium。  
**Frozen Architecture Impact:** NO（不要改 DAG 拓扑）

---

### Issue ID: V91-018

**Severity:** P2  
**Type:** BUG  
**Module:** Advertising  
**Route:** `/app/advertising`  
**File:** `advertising/page.tsx` `handleApplyNegative`  
**Related API:** `POST /api/v1/advertising/apply-negative`

**Description:** 失败只 `console.error`，无错误条。成功才 `setApplySuccess`。不调用 Amazon = Known Gap；**静默失败**是 Bug。无 VIEWER 隐藏。

**Expected:** 明确错误态。  
**Actual:** 按钮转圈后无反馈。  
**Evidence:** page L102–116。  
**Suggested Fix:** 错误 banner。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-019

**Severity:** P2  
**Type:** BUG  
**Module:** App shell  
**Route:** `/app/*`  
**File:** `app/app/layout.tsx`；`top-bar.tsx`  
**Related API:** `/auth/me`

**Description:** 无 Next middleware、layout 不检查 token。未登录可进壳。TopBar catch 后仍显示「CrossPilot 演示工作区」+ 默认「所有者」。与 V91-006 叠加会展示假财务。

**Expected:** 无 token 跳转 `/login`；401 清 session。  
**Actual:** 空壳 + 假 OWNER。  
**Evidence:** `layout.tsx` 无 auth；`top-bar.tsx` L22–24, L45 `return role || '所有者'`。  
**Suggested Fix:** 客户端守卫 + 401 处理。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-020

**Severity:** P2  
**Type:** BUG  
**Module:** WorkspaceGuard  
**Route:** 任意缺 `x-workspace-id` 的 JWT 请求  
**File:** `workspace.guard.ts`；`workspace.service.ts` `getCurrentWorkspace`  
**Related API:** 全局

**Description:** 无 header 时用**第一条 membership**。`getCurrentWorkspace` 在用户无成员时挂到 `crosspilot-demo`；DB 异常路径可签发演示 JWT（auth.service demo 离线分支，SEC）。不是跨租户随机泄漏，但是静默进错自己的工作区 / 演示租户。

**Expected:** 缺 workspace → 403。  
**Actual:** 静默 fallback。  
**Evidence:** guard L43–61。  
**Suggested Fix:** 缺 header 403；禁止把 demo workspace 当万能兜底。  
**Regression Risk:** Medium（现客户端总是带 header）。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-021

**Severity:** P2  
**Type:** BUG  
**Module:** Operations Today SSE lifecycle  
**Route:** `/app/operations/today`  
**File:** `operations/today/page.tsx` `setupSse`；`connectEvents` `onerror`  
**Related API:** events

**Description:** `onError` 只关 UI 流标记，不 `eventSource.close()`。401 时浏览器持续重连。`workflow.completed` 也不 close。任务切换时 `setupSse` 会断开旧连接（这块正确）。无自动恢复后的 REST 快照重水合策略（铁律 4：SSE ≠ SoT，但应回退 GET summary——`refreshTask` 仅在 taskId effect）。

**Expected:** error 时 close；可选指数退避；始终可用 REST 快照。  
**Actual:** 401 重试风暴（在 V91-003 存在时）。  
**Evidence:** page L146–148。  
**Suggested Fix:** `onerror` close + 一次 GET 水合。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** YES（UI 生命周期，不改 emitter）

---

### Issue ID: V91-022

**Severity:** P2  
**Type:** UX_ISSUE  
**Module:** Navigation / State  
**Route:** 全局 TopBar / Sidebar  
**File:** `top-bar.tsx`；`sidebar.tsx`  
**Related API:** `GET /workspaces`（未调用）

**Description:** 无工作区切换、无站点切换、无 SKU 切换。TopBar SKU 写死「天然大理石牙刷架 / MTH-WHITE-001」。Marketplace 只展示。Operations Today 的 marketplace/dateRange 为组件本地 state（2026-03 剧本），与 TopBar「今天」日期不一致。Sidebar 不含 `/app/skus`。

**Expected:** Baseline 要求 workspace / marketplace / SKU switch 后状态清空。  
**Actual:** 无法切换。  
**Evidence:** top-bar L71–80；sidebar NAV_ITEMS。  
**Root Cause:** 演示壳未接 workspace API。  
**Suggested Fix:** 接 `GET /workspaces`；SKU 从 catalog 来。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-023

**Severity:** P2  
**Type:** UX_ISSUE  
**Module:** HITL OCC  
**Route:** `/app/operations/today`  
**File:** `today/page.tsx`；`occ-conflict-modal.tsx`  
**Related API:** `POST .../resume`（客户端有，页面零调用）

**Description:** 批准在 `pendingActionIds.length===0` 时领域层会自己 COMPLETED（`daily-operation-workflow.service.ts` L480–488），故 resume **不是**关单所必需。基线 API 矩阵仍写「前端已接入 OCC 恢复」。OCC 弹窗只有刷新，无 resume。连点批准无 in-flight lock，第二次 409（安全但吵）。

**Expected:** 文档与 UI 对齐；进行中禁用按钮。  
**Actual:** resume 死代码；双击 409。  
**Evidence:** page 无 `resumeWorkflow` 调用；approve 无 disabled。  
**Suggested Fix:** 文档改「自动 FINALIZE」或补 resume 于 PAUSED；按钮 lock。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** YES（UX only）

---

### Issue ID: V91-024

**Severity:** P2  
**Type:** UX_ISSUE  
**Module:** Forms / Feedback  
**Route:** listings, products, automation, orders  
**File:** 各 page  
**Related API:** 对应 POST

**Description:** Listing 生成/合规/视觉提取失败仅 console。产品「新建产品」无 handler（`POST /products` 存在）。Automation `handleReject` 只改本地 state。订单创建无 disable，可双提交（幂等靠随机 orderNumber，几乎每次成功两次）。

**Expected:** 错误条；死按钮删除或接线；reject 打 API；提交中 disable。  
**Actual:** 静默 / 空按钮 / 本地 reject。  
**Evidence:** `listings/page.tsx` L281–283；`products/page.tsx` L54–57；`automation/page.tsx` L174+；`orders/page.tsx` L136–142。  
**Suggested Fix:** 最小错误态与 disable。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-025

**Severity:** P2  
**Type:** UX_ISSUE  
**Module:** Modal / A11y  
**Route:** Operations Today drawers/modals  
**File:** `approval-confirmation-modal.tsx`；`occ-conflict-modal.tsx`；`action-detail-drawer.tsx`  
**Related API:** —

**Description:** 全站 `grep` **零** `onKeyDown` / `Escape` / `aria-`。Modal 无 focus trap。遮罩可点关（部分）。1024 宽 Sidebar `w-64` + `main p-6` 表格横向溢出依赖 `overflow-x-auto`（部分页有）。

**Expected:** ESC、焦点、非颜色语义。  
**Actual:** 仅鼠标。  
**Evidence:** web 源码无 aria/Escape。  
**Suggested Fix:** Phase 1 之后的 polish。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

## 9. P3 Issues

### Issue ID: V91-026

**Severity:** P3  
**Type:** UX_ISSUE  
**Module:** Overview  
**Route:** `/app/overview`  
**File:** `overview/page.tsx` L185–189  
**Related API:** 无（硬编码）

**Description:** 「第 11 周利润异动 -$2,280.00」写死，不读 waterfall。与 golden 数字相同，但是死数据。API 失败时 90 天 KPI 为 0 且无 error。

**Expected:** 绑定 `/analyst/waterfall` 或标明演示静态。  
**Actual:** 常量。  
**Evidence:** L187 `-$2,280.00`。  
**Suggested Fix:** 绑定或标注。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-027

**Severity:** P3  
**Type:** UX_ISSUE  
**Module:** Shell  
**Route:** 全局  
**File:** `sidebar.tsx` L91–100；`architecture/page.tsx`；`globals.css`  
**Related API:** —

**Description:** Sidebar 底「AI Copilot / Mastra Agent」不可点。Architecture 文案「14 大经营子页面」过时。默认亮色但大量 `text-white` 靠 CSS 覆盖，对比度/漏网风险。`/` 不是营销页（基线写「产品特性展示」）。

**Expected:** 去掉死入口或接线；文案随代码。  
**Actual:** 装饰与漂移。  
**Evidence:** sidebar footer；architecture L56；`page.tsx` 仅 redirect。  
**Suggested Fix:** copy/polish。  
**Regression Risk:** None。  
**Frozen Architecture Impact:** NO

---

### Issue ID: V91-028

**Severity:** P3  
**Type:** TECH_DEBT  
**Module:** API  
**File:** `app.module.ts` + 部分 controller `@UseGuards(WorkspaceGuard)`  
**Related API:** Product/Order/Profit/Inventory/Purchase/Supplier

**Description:** 全局已注册 WorkspaceGuard，六模块再挂一次，双倍 membership 查询。

**Expected:** 只留全局。  
**Actual:** Dup。  
**Evidence:** `app.module.ts` APP_GUARD；controller `@UseGuards(WorkspaceGuard)`。  
**Suggested Fix:** 删重复。  
**Regression Risk:** Low。  
**Frozen Architecture Impact:** NO

---

## 10. UX Issues

（已在 P2/P3 编号，此处索引）

| ID | 摘要 |
| :--- | :--- |
| V91-006 / 007 | 假 KPI / 假退货汇总当真实账 |
| V91-018 / 024 | 静默失败、死按钮、双提交 |
| V91-019 | 无登录壳 + 默认所有者 |
| V91-022 | 无 workspace/marketplace/SKU 切换 |
| V91-023 | OCC 无 in-flight；resume 文案漂移 |
| V91-025 | ESC / aria / focus |
| V91-026 | Overview 硬编码 -2280 |
| V91-027 | Copilot 死脚、亮色覆盖、架构文案 |
| V91-011 | 工具目录 5 vs 22 |
| V91-012 UI | 入库按钮不顾 PO 状态 |

Listing / Market-research / Competitors 主路径相对完整（loading 部分有；Trend/VOC 有 error）。Operations Today 组件（EmptyAndHealthyState、OCC modal、高风险免责声明）**设计正确**，被 V91-002/003 挡住无法在浏览器验证。

---

## 11. Regression Issues

**本轮测试回归：0。**

`pnpm test` 300/300、evals 9/9、typecheck 10/10、web build 23/23。Epic 1/2/3 金标仍绿。

V91-002/003 **不是 REGRESSION**：现有集成测试从一开始就绕过 HTTP 前缀与 EventSource，浏览器路径可能从未被质量门禁看见。归类为 **BUG**，不是「曾经绿过的用例变红」。

历史审查 `docs/90_historical/reviews/code-review-2026-09-11.md` 中若干旧 P0（无全局 WorkspaceGuard、公开 tools、JWT 生产硬编码、未隔离 advertising）**在当前代码中已不成立**，不重新打开。

---

## 12. Security / Tenant Isolation

| 项 | 判定 |
| :--- | :--- |
| JWT 生产缺 secret | 启动抛错。Dev fallback 明确。非 P0 |
| 密码 | bcrypt 10 |
| CORS `origin: true` + credentials | TECH_DEBT V91-042 级；Bearer 在 localStorage，CSRF 面较小 |
| `demo-login` 永久 Public | 演示产品；`DEMO_MODE` env 未读。P2 加固项，不升 P0 |
| Creative SKU 无 workspace | **P0 V91-001** |
| Order SKU findUnique 无 workspace | P2 V91-015 |
| Tool 内存 executions | P2 V91-016 |
| Diagnosis getTaskSummary workspace 校验 | 有 |
| Scenario reset | 当前成员 workspace + OWNER/ADMIN，不扫其它租户 |
| SensitiveDataGuard | 诊断出站/落盘有；SSE 事件体未 scrub（P3 残余） |
| SSE `?token=` | 即使服务端忽略，仍是泄漏面（V91-003） |
| VIEWER 写接口 | P1 V91-004 |

未发现跨工作区 **写** 订单到别人 workspace 的直接路径（create 使用 `request.workspaceId`）。主要泄漏是 **读**（skuCode / 工具缓冲）。

---

## 13. State / SSE / OCC Issues

| ID | 主题 |
| :--- | :--- |
| V91-002 | REST 前缀 |
| V91-003 | SSE 认证 |
| V91-010 | Analyst SSE |
| V91-013 | Interceptor vs stream/tool `data` |
| V91-021 | close / 401 retry |
| V91-017 | 幂等 RAM |
| V91-009 | 工具第二检查点 |
| V91-023 | OCC UX / resume 文档 |

**OCC 后端是对的：** `expectedVersion` + `updateMany` where version；409 映射 `CHECKPOINT_VERSION_CONFLICT` / `INVALID_ACTION_STATE`；UI 传入 `summary.checkpointVersion` 并打开 `OccConflictModal`。这是冻结资产，**不要重写**。缺陷在前端路径到不了这些接口、以及缺少提交锁。

---

## 14. UI Consistency Findings

（只记录，不大改）

- Page header：多数「编号 + 英文 badge + 一句话」，Operations Today 组件更完整。
- 错误：混用 `alert`、banner、`console.error`、无提示。
- Empty：Orders/Suppliers 空表无插画；Today 有 EmptyAndHealthyState。
- Loading：多数中文一行「正在加载…」，无 skeleton；Listings/Analyst 几乎无页级 loading。
- Button：主 CTA `bg-blue-600`，危险 `rose`，不统一 disabled 文案。
- Table：`text-xs` + `overflow-x-auto` 常见。
- 中英混杂 badge（`HEALTHY`、`P1`）部分走了 `ui-labels.ts`，部分没有。
- 假数据回退导致「设计上像真实仪表盘」。

---

## 15. Responsive / Accessibility Findings

| 宽度 | 观察（静态） |
| :--- | :--- |
| 1440 | `max-w-7xl` 主栏 + `w-64` 侧栏可工作 |
| 1280 | 同左；TopBar SKU 块 `hidden lg:flex` 开始出现 |
| 1024 | 侧栏仍 16rem 不折叠；表格靠横向滚；TopBar 工作区+站点拥挤 |
| 无移动端折叠侧栏 | 未做 hamburger |

A11y：无 aria、无 skip link、无 focus ring 规范、Modal 无 ESC、颜色是唯一状态通道（绿/红 badge）。`select-none` 在 sidebar。P3 V91-025。

本轮 **未** 用浏览器改 viewport 实机截图（无运行中的 Web 会话）。

---

## 16. Known Gaps — Not Bugs

以下 **不进入 Bug Fix Queue**：

| Gap | 依据 |
| :--- | :--- |
| Epic 4 真实 Amazon 店铺 / SP-API 同步 | SUSPENDED |
| Approval 后不调 Amazon Ads/价格/Listing/ERP | 铁律 3 |
| WF-03 无独立长 DAG / 无 1688 | PARTIAL |
| WF-04 `askAnalyst` 模版插值非多轮 LLM | PARTIAL（**错误数字**是 V91-006/023 类 Bug，模版本身不是） |
| Launch Center 无页面无 API | MISSING |
| Creative 工具返回 Unsplash / `Math.random` | PARTIAL Mock |
| Reviews 站内 VOC 硬编码卡片 | 矩阵 PARTIAL |
| 无 Scheduler | 基线未来能力 |
| 知识库无独立管理台 | 矩阵：嵌入 Listing |
| Agent Trace / Eval 无独立大屏 | 矩阵：嵌入 DAG + 脚本门禁 |
| System / Data Source 页 | 未实现 |
| 独立 Profit Calculator 路由 | 能力在 Tool `finance.profit.calculate` |
| WF-05 Sku360 默认 Scenario 数据源 | Epic 4；不是算错 |
| Automation RPA Mock | 路由矩阵 PARTIAL |

---

## 17. Documentation Drift

### Issue ID: V91-029

**Severity:** P2  
**Type:** DOC_DRIFT  
**Module:** Governance  
**Route:** —  
**File:** `docs/00_governance/CURRENT_SYSTEM_AUDIT_BASELINE.md` §8–9；`V9_PRODUCT_CAPABILITY_MATRIX.md`  
**Related API:** —

**Description:**

- API：57 vs **88**；Controller：20 vs **21**（`DemoController`）。
- 「前端已接入=是」多处为假（register、workspaces CRUD、tools GET、scenario/reset、orders/:id 等）。
- Overview 文档写依赖 `/profit/summary`，代码用 `/scenario/timeline|daily`。
- 能力矩阵路径 `/market/research`、`/listing/generate`、`/profit/waterfall` 与真实 `/market-research/*`、`/listings/*`、`/analyst/waterfall` 不一致。
- `/` 写成营销门户，代码是 redirect。
- Sidebar「16 架构与知识库」不是 Knowledge Base。
- WF-05 resume「已接入」但 UI 不调用（领域层批准末张会 FINALIZE，文档过时）。

**Expected:** 矩阵 = 代码。  
**Actual:** Level 1 内部已漂。  
**Evidence:** 本文件 §4–5。  
**Suggested Fix:** V9.1 文档回写，不改代码。  
**Regression Risk:** None。  
**Frozen Architecture Impact:** NO

---

## 18. Technical Debt

| ID | 项 | 是否导致错误 |
| :--- | :--- | :--- |
| V91-028 | 重复 WorkspaceGuard | 否（多一次 DB） |
| V91-030 | 无全局 ValidationPipe；大量 POST 无 Zod | 部分导致 V91-014 |
| V91-031 | CORS `origin: true` | 否（姿态松） |
| V91-032 | 工具目录硬编码 | 导致 V91-011 |
| V91-033 | `ApiClient.request` 无条件 `res.json()` | 空 body 会抛；SSE 未走此客户端 |
| — | `idempotencyMap` / `recentExecutions` / automation `workflows[]` 内存 | 见 V91-016/017 |
| — | 无 E2E 打真实 HTTP 前缀与 EventSource | 导致 V91-002/003 逃过 300 tests |

---

## 19. Recommended Fix Order

**Phase 1（建议本轮人工确认后立即修，仅 P0/P1，仍禁止 Epic 4 / 重构冻结算法）：**

1. **V91-001** Creative `workspaceId` 过滤（安全）  
2. **V91-002 + V91-003 + V91-021** Operations Today HTTP 前缀 + SSE 认证 + close（核心工作流）  
3. **V91-004** 全局 VIEWER 写守卫 + 登录持久化 role  
4. **V91-006 + V91-007 + V91-008** 去掉假财务回退、修 Reviews URL、统一退货率单位  
5. **V91-005** 用真实 UUID/marketplaceId 替换硬编码  
6. **V91-009** Tool Platform 注入同一 Postgres workflow service  

**Phase 2（P2 稳定性）：** V91-010, 011, 012, 013, 014, 015, 016, 018, 019, 020, 024  

**Phase 3（UX polish / 文档）：** V91-022, 023, 025–029  

**明确不做：** 重写 Sku360ContextLoader / Detector / Diagnosis / Recommendation / DAG；上 Amazon 执行器；Launch Center；Scheduler。

---

## 20. Regression Risk Matrix

| 修复 | 风险 | 原因 |
| :--- | :---: | :--- |
| V91-001 workspace on SKU | Low | 查询收紧 |
| V91-002 `/api/v1` | Medium | 现有测试不覆盖 HTTP；需手工/补集成 |
| V91-003 SSE 认证 | Medium | EventSource 行为因浏览器而异 |
| V91-004 VIEWER 守卫 | Medium | 演示账号全是 OWNER，需 VIEWER fixture |
| V91-005 去硬编码 | Medium | seed 数据形状 |
| V91-006 删 fallback | Low–Med | 「好看的仪表盘」变空，属预期 |
| V91-008 退货率 | Medium | 展示数量级变化 |
| V91-009 共享 store | Medium | 工具与 API 并发 OCC |
| 冻结域公式 | — | **本轮禁止改** |

---

## 21. Final Statistics

编号问题 **V91-001 … V91-029**。Known Gap 只在 §16，**不进 Bug Fix Queue**。

| 指标 | 数量 |
| :--- | ---: |
| **Total Issues**（V91-001–029） | **29** |
| P0 | **1** |
| P1 | **8** |
| P2 | **17** |
| P3 | **3** |
| BUG | **21** |
| REGRESSION | **0** |
| UX_ISSUE | **6** |
| KNOWN_GAP（§16，非 Fix Queue） | **14** |
| DOC_DRIFT | **1** |
| TECH_DEBT（编号） | **1** |
| Affected Routes | 18（Today / Orders / Inventory / Reviews / Profit / SKUs / Creative / Listings / Ads / Suppliers / Tool Center / Analyst / Overview / Products / Automation / `/` / Layout） |
| Affected APIs | daily-diagnosis REST+SSE, `/creative/pack`, `/orders`, returns, `/skus/:id/overview`, `/tools/:id/execute`, `/advertising/apply-negative`, `/purchase-orders/:id/receive`, `/agent-tasks/stream` |
| Frozen Area Issues | 5（V91-002, 003, 009, 021, 023 — 接线/SSE/UI，**禁止当重构 DAG 的理由**） |

| Severity | IDs |
| :--- | :--- |
| P0 | V91-001 |
| P1 | V91-002 … V91-009 |
| P2 | V91-010 … V91-025, V91-029 |
| P3 | V91-026, V91-027, V91-028 |

| Type | IDs |
| :--- | :--- |
| BUG | V91-001 … V91-021 |
| UX_ISSUE | V91-022 … V91-027 |
| TECH_DEBT | V91-028 |
| DOC_DRIFT | V91-029 |
| REGRESSION | （无） |

质量门禁本轮：**typecheck 10/10、test 300/300、evals 9/9、web build 23/23**。浏览器 E2E 未跑。

---

## 附录：88 API（代码扫描）

Auth 4 · Health 2 · Workspace 4 · Daily-diagnosis 7 · Listing 7 · Market 13 · Advertising 4 · Profit 5 · Analyst 2 · Order 3 · Inventory 3 · Purchase 6 · Product 6 · Supplier 4 · Tools 4 · Scenario 4 · Demo 1 · Creative 2 · Eval 2 · Agent-task 3 · Operation-automation 3。

Bootstrap：`GET /health`、`GET /api/health` → 307 `/api/v1/health`。

---

## 停止边界

- 已生成：`docs/00_governance/V9_1_FULL_PRODUCT_BUG_AUDIT.md`
- **未**修改业务代码、测试、Prisma、UI
- **未**启动 Epic 4
- 等待人工确认 Bug List  
- 下一阶段才是：**V9.1 Phase 1 — P0 / P1 Bug Fix**
