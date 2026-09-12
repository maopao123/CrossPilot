# Epic 4 Repo Audit — Real Store Data Foundation

**Date:** 2026-09-12  
**Status:** AUDIT ONLY — no code, no migration, no deploy  
**Command:** `docs/00_governance/临时命令.txt` (Epic 4)  
**Baseline:** CrossPilot V9.1 RELEASE VERIFIED & FROZEN (`v9.1.0` → `b3d5607`)  
**Live HEAD at audit time:** `e457d5a` (post-V9.1 visual; frontend only)

```text
READY_FOR_IMPLEMENTATION = YES
Recommended first coding phase: Phase 1 — Provider foundation
Implementation: see EPIC4_IMPLEMENTATION_EVIDENCE.md (Phases 1–8 coded, read-only)
```

---

## 1. Executive Summary

V9.1 已经把 **经营计算与 HITL 决策** 做实，但 **店铺数据入口仍是 Demo / Scenario / 手工 POST**。仓库里 **没有** Amazon SP-API、LWA、Selling Partner Account、refresh token 存储或同步游标。

已有、必须复用的底座：

- `packages/integrations` Provider Framework：`ProviderAdapter` + `IntegrationGateway` + capability routing + retry + `SecretProvider.redact`
- Prisma 商业表：`Product` / `Sku` / `Order` / `InventoryBalance` / `ReturnRecord` / `ProfitDaily`
- `ISku360DataSource`（WF-05 已预留 Prisma/Store 实现位，默认仍是 `ScenarioSku360DataSource`）
- JWT + `x-workspace-id` + `ViewerWriteGuard`

缺口：

- 无 per-workspace Amazon 连接与加密凭证
- 无 Amazon Provider / 无 STORE_COMMERCE capability
- WF-05 诊断仍读 Scenario，即使 Prisma 已有库存/利润
- Provider 错误码与 HTTP `ErrorCodes` 未对齐 Amazon 语义

**本 Epic 按最新临时命令：只做 Read-Only 真实数据地基。**  
POST_V9 里的 CSV 导入、晨检 Scheduler、飞书告警、Ads 直连 **不在本次范围**（记入 OUT_OF_SCOPE / 后续 backlog）。

官方 SP-API（2026 文档，非记忆）：

- 认证：LWA `refresh_token` → `access_token`（1h）；请求头 `x-amz-access-token`
- 店铺发现：Sellers API v1 `getMarketplaceParticipations`
- 自己的 Listing：**GET** `getListingsItem` / `searchListingsItems`（v2021-08-01）。`put/patch/delete` **禁止**
- 公开目录：Catalog Items API v2022-04-01 GET（按 ASIN，不是卖家 SKU 列表）
- 订单：Orders API **v2026-01-01**（v0 已弃用）
- 库存：FBA Inventory API v1 **GET** `getInventorySummaries`。`add/create/deleteInventoryItem` **禁止**
- 财务：Finances API v2024-06-19 `listTransactions`
- PII 订单字段需要 Restricted Data Token，Phase 4 默认不拉 PII

---

## 2. Current Architecture

```text
Web (Next :2222)
    → /api/v1  (Nest, JWT + WorkspaceGuard + ViewerWriteGuard)
        → Prisma Postgres     ← Product Center / Orders / Inventory / Profit UI
        → ScenarioSku360DataSource  ← WF-05 LOAD_CONTEXT（默认，内存 90 天剧本）
        → IntegrationGateway
              ├ xydc (MCP, MARKET_DATA)     市场调研 / 公开 ASIN
              ├ firecrawl (HTTP, EXTERNAL_VOC)
              └ mock-market (fallback)
        → Tool Platform (28 tools, 无 Amazon Write)
        → Mock RPA (Approval ≠ Execute)
```

Provider 调用链：`capabilityId` → `ProviderRouter`（priority）→ `ProviderAdapter.execute` → mapper → `ProviderExecutionResult`。业务层不应 `if provider == amazon`。

数据双轨（这是 Epic 4 最大产品裂缝）：

| 表面 | 数据从哪来 |
| :--- | :--- |
| `/app/products` `/orders` `/inventory` `/profit` | Prisma |
| Operations Today / Sku360 / 异常检测 | `ScenarioSku360DataSource` |
| 市场调研 | XYDC / Firecrawl |
| 订单列表 | Prisma；**seed 不写 Order 行**，页面经常空 |

---

## 3. Existing Capabilities

| 能力 | 现状 |
| :--- | :--- |
| Provider Interface | **有**：`ProviderAdapter`（`packages/integrations/src/provider-framework/core/provider.types.ts`） |
| Provider Registry / Gateway / Cache / Retry | **有** |
| Amazon / LWA / SP-API 代码 | **无** |
| Mock / Demo | `seed.ts` + `POST /scenario/reset` + Scenario 生成器 |
| Domain | Prisma 商业实体已够用，缺 Connection / Credential / Sync |
| Catalog 读取 | `ProductService` ← Prisma |
| Orders | `OrderService` 内部 POST + 扣库存；非 Amazon |
| Inventory | `InventoryBalance` 当前水位；无流水账 |
| Returns / Fees | `ReturnRecord` + `ProfitDaily` 估算费率（15% / $4.50） |
| Tenant | Workspace + membership；几乎所有业务表带 `workspaceId` |
| Credential | 应用 JWT；集成密钥 = **进程 env**（`SecretProvider`），非 per-workspace |
| Scheduler | **MISSING**（本次也不做） |
| Worker | BullMQ stub，无生产者 |
| Tools | 28；Approve 只改内部状态 |

---

## 4. Epic 4 Gap Analysis

| Epic 4 Target | Current | Gap |
| :--- | :--- | :--- |
| Amazon Account 可配置识别 | 只有全局 `Marketplace.code = AMAZON_US` | 无 Selling Partner / 店铺连接 |
| LWA / SP-API 授权 | 无 | 需 OAuth + refresh token 存储 |
| Amazon Provider | 无 | 新 Adapter + HTTP transport |
| 与业务解耦 | 框架有；commerce 不走 Gateway | 新 capability，禁止服务里写 SP-API |
| Raw → Canonical | XYDC mapper 模式可抄 | 新 Amazon mappers |
| 真实同步或按需读 | 无 | SyncRun + 混合策略 |
| Mock / Demo 保留 | 有 | 无 credential 必须仍能启动 |
| 错误语义 | ProviderErrorCode 偏 MCP | 对齐 AUTH_REQUIRED / RATE_LIMITED / TOKEN_EXPIRED |
| Read Only | 工具层已遵守 | 新代码必须 allowlist GET |
| 上层不吃 Amazon 字段 | Sku360 接口已是 canonical | 缺 Prisma/Store DataSource |
| Observability | Gateway duration/retry；无 Account 维度 | ProviderCall 日志表或结构化 log |
| AC-12 V9.1 回归 | 视觉后未全量重跑 | Phase 8 必跑；不跑 XYDC 刷 5151 |

---

## 5. Reuse / Extend / Add / Protect Matrix

### 可以直接复用

- `ProviderAdapter`, `IntegrationGateway`, `ProviderRouter`, `CapabilityBindingRegistry`
- `SecretProvider.redact` / `maskToken`
- `ISku360DataSource` + `Sku360ContextLoader`（**不改**检测/诊断公式）
- Prisma：`Product`, `Sku`, `Order`, `OrderItem`, `InventoryBalance`, `InventorySnapshot`, `ReturnRecord`, `ProfitDaily`, `Marketplace`
- `WorkspaceGuard` / `ViewerWriteGuard`
- `WorkflowIdempotency` 模式（同步幂等可参考，不要滥用同一张表）
- Demo seed / scenario reset

### 需要扩展

- `ProviderCategory`：增加 `STORE_COMMERCE`（现有只有 MARKET_DATA / EXTERNAL_VOC / …）
- `ProviderErrorCode` + HTTP `ErrorCodes`：Amazon 稳定码
- `Sku.asin` / `Order.orderNumber`：映射 Amazon 外部 ID（可加字段，不必新实体）
- `createDefaultIntegrationGateway()`：注册 Amazon + MockAmazon
- `.env.example`：只加 **应用级** `AMAZON_LWA_CLIENT_ID/SECRET` 名，不放 refresh token
- `HttpExceptionFilter`：映射新错误码

### 需要新增

- `AmazonProvider`（HTTP，只注册 GET capabilities）
- `MockAmazonProvider`（fixture，无 credential 可跑测试）
- LWA token client（内存 cache access_token，1h）
- Prisma：`CommerceAccount`, `ProviderCredential`（加密）, `SyncRun`（及可选 `ProviderCallLog`）
- `PrismaSku360DataSource`（Phase 3 之后，把 WF-05 从 Scenario 切到可选 Store 模式）
- Nest module：account connect / sync status（最小 REST）
- Fixture 测试：sanitized SP-API JSON

### 不要修改（Protect / Frozen）

- Sku360 公式、异常检测、诊断、推荐打分、WF-05 DAG、OCC `updateMany`
- XYDC Mapper / Provider Framework 既有 XYDC 绑定与 5147 fixture 期待
- Approval ≠ Execute；禁止 Listings put/patch/delete、FBA add/create/delete、改价、Ads 写
- V9.1 tag `v9.1.0` / 冻结基线行为
- 不为 Epic 4 做 Scheduler、Launch Center、CSV 导入器、飞书晨报（POST_V9 有，本次命令没有）

---

## 6. Proposed Architecture

最小改造，不重做平台：

```text
Workspace
  └── CommerceAccount (provider=amazon, sellingPartnerId, region, status)
        └── ProviderCredential (encrypted refresh_token, never in logs/agent)
              ↓
        AmazonProvider (ProviderAdapter, transport=HTTP)
              capabilities (READ ONLY allowlist):
                store.account.participations
                store.listings.search / store.listings.get
                store.orders.search / store.orders.get
                store.inventory.summaries
                store.finances.transactions   (later)
              ↓
        AmazonNormalizer → existing Prisma commerce rows
              ↓
        Optional PrismaSku360DataSource → Sku360ContextLoader (unchanged)
              ↓
        Existing Product/Order/Inventory APIs + WF-05
```

无 Amazon credential：不注册 live adapter 或 adapter 立即 `AUTH_REQUIRED`；Mock / Demo 照常。  
业务服务继续只谈 Prisma / Sku360 canonical，不 import SP-API 类型。

官方只读映射（实现时以当时文档为准）：

| Capability | Official API | Operation | Notes |
| :--- | :--- | :--- | :--- |
| Account / Marketplace | Sellers API v1 | `getMarketplaceParticipations` | AC-03 |
| Seller listing | Listings Items v2021-08-01 | `searchListingsItems`, `getListingsItem` | 禁止 put/patch/delete |
| Catalog by ASIN | Catalog Items v2022-04-01 | GET item | 公开目录，补 ASIN 元数据 |
| Orders | Orders v2026-01-01 | search / get | 默认不申请 RDT/PII |
| FBA inventory | FBA Inventory v1 | `getInventorySummaries` | 禁止 write ops |
| Fees | Finances v2024-06-19 | `listTransactions` | Phase 6 |
| Returns | Reports 异步 或 Finances 退款事件 | Phase 6 | 无简单同步 REST 列表时用 Reports |

---

## 7. Domain & Data Model Changes

**不新造第二套 Product/Order。** 同步结果写入现有表。

建议新增（Phase 1–2 migration，additive）：

| Model | 用途 |
| :--- | :--- |
| `CommerceAccount` | `workspaceId`, `provider` (`amazon`), `sellingPartnerId`, `region` (`NA/EU/FE`), `status`, `defaultMarketplaceCode` |
| `ProviderCredential` | `accountId`, `kind` (`LWA_REFRESH`), **encrypted** payload, `expiresAt?`, 禁止明文 log |
| `SyncRun` | `workspaceId`, `accountId`, `capability`, `status`, `cursor`, `startedAt`, `completedAt`, `recordsProcessed`, `recordsFailed`, `errorCode` |

现有表最小加列（可随同步 Phase，不必 Phase 1 一次做完）：

- `Sku.sellerSku` 或沿用 `skuCode` = Amazon seller SKU；保留 `asin`
- `Order.externalOrderId`（Amazon order id）；`orderNumber` 继续 unique
- `InventoryBalance.sourceUpdatedAt` / `observedAt`
- `ProfitDaily` 增加 `source`（`ESTIMATED` vs `SETTLEMENT`），避免把结算当估算

**影响现有数据：** 纯 additive。Demo 行不变。无 credential 时不同步。

**不要：** 把 refresh token 放 `User` 或 env 当「店铺密钥」。

---

## 8. API Changes

| 类型 | 建议 |
| :--- | :--- |
| 新增 | `GET/POST /api/v1/commerce/accounts`；`POST .../amazon/oauth/start` + `GET .../amazon/oauth/callback`；`POST .../accounts/:id/sync`；`GET .../accounts/:id/sync-runs`；`GET .../accounts/:id/status` |
| 修改 | **尽量不改** 现有 `/products` `/orders` `/inventory` 契约；同步后这些 GET 自然看到新行 |
| 兼容 | Demo login、scenario reset、WF-05 REST/SSE 保持 |
| 内部 | `IntegrationGateway.executeCapability('store.*')`；LWA client 不暴露给 Tool/Agent |
| 禁止 | 任何 Amazon Write REST；Agent 工具拿不到 refresh token |

OAuth callback 必须走服务端，token 只写加密列。

---

## 9. Authentication & Security Design

1. **应用 LWA 客户端**（`client_id` / `client_secret`）来自部署 env，不是卖家密码。  
2. **卖家授权**走官方 [Authorizing Selling Partner API applications](https://developer-docs.amazon.com/sp-api/docs/authorizing-selling-partner-api-applications)；得到 **refresh token**，按 workspace 加密存储。  
3. 调用时 POST `https://api.amazon.com/auth/o2/token`（`grant_type=refresh_token`），access token 进程内缓存至 `expires_in`。  
4. SP-API 请求：`x-amz-access-token` + `user-agent` + 区域 endpoint（见 [Connect to the SP-API](https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api)）。  
5. **Read-only allowlist** 写死在 Amazon HTTP client；未列出的 method/path 抛内部错误。  
6. Token / secret 不进 Agent Context、不进 Tool 输出、不进 `SecretProvider.redact` 漏网的 log。  
7. 所有 store API 走现有 Workspace + VIEWER 只读。Connect/sync = OPERATOR+。  
8. 无 credential：应用启动成功；store capability 返回 `AUTH_REQUIRED`，不 crash。

---

## 10. Sync / Freshness Design

**推荐 Hybrid（不是拍脑袋）：**

| 数据 | 策略 | 原因 |
| :--- | :--- | :--- |
| Marketplace participations | 授权后一次 + 手动刷新 | 很少变 |
| Listings / Catalog | 按需 GET + 每日增量 search | SP-API 限流；Listing 变更少 |
| Orders | 周期同步（CreatedAfter cursor） | 订单是诊断销量主源；search 可分页 |
| FBA Inventory | 周期 snapshot 写入 `InventoryBalance` | `getInventorySummaries` 是当前水位 |
| Finances / Returns | 低频 / Phase 6 | Finances 量大；Returns 常走 Reports 异步 |

Freshness：行上 `sourceUpdatedAt` / `observedAt`；Sku360 已有 `freshnessMaxAgeDays`。  
失败：保留上次 snapshot，标记 `PARTIAL_DATA` / `stale`，禁止静默当实时。  
分页：`SyncRun.cursor` 存 NextToken。  
幂等：Amazon order id → `Order.externalOrderId` unique per workspace；库存按 `(workspaceId, skuId, warehouseType)` upsert。

**本期不做 Nest cron。** 同步由显式 `POST sync` 触发（人点或以后 Scheduler 再调同一入口）。符合 `Scheduler = Trigger, NOT Workflow`。

---

## 11. Error & Observability Contract

扩展现有 `ProviderError`，映射到稳定码（名称可微调，语义固定）：

| Stable code | 来源示例 |
| :--- | :--- |
| `AUTH_REQUIRED` | 未连接店铺 |
| `TOKEN_EXPIRED` | refresh 失败 / 授权撤销 |
| `PERMISSION_DENIED` | 缺 role（如 Product Listing） |
| `RATE_LIMITED` | 429 / `x-amzn-RateLimit-Limit` |
| `PROVIDER_UNAVAILABLE` | 5xx / 超时 |
| `INVALID_REQUEST` | 400 |
| `NOT_FOUND` | 404 listing/order |
| `PARTIAL_DATA` | 分页中断、部分 SKU 失败 |
| `SYNC_FAILED` | SyncRun 终态失败 |
| `WRITE_FORBIDDEN` | 内部拦截写 API |

日志允许：accountId、marketplace、capability、latency、recordCount、retryCount、errorCode。  
禁止：access_token、refresh_token、client_secret、authorization_code、完整含 PII 的响应。

---

## 12. Phase-by-Phase Implementation Plan

### Phase 1 — Provider foundation（推荐下一步唯一开工项）

- **Goal：** 框架能挂 STORE_COMMERCE；MockAmazon + 空 Amazon adapter；错误码；无 credential 启动。
- **Files：** `provider.types.ts`；`providers/amazon/*`；`providers/mock/mock-amazon.provider.ts`；`error-codes.ts`；gateway 注册；fixture tests。
- **Data：** 可选先加空 Prisma models（Account/Credential/SyncRun）或 Phase 2 再加。建议 Phase 1 就把表加上（additive）。
- **API：** 无对外 Amazon 调用。最多 `GET /commerce/accounts` 返回 `[]`。
- **Tests：** mapper/error/allowlist unit；无 env 启动。
- **AC：** AC-01 骨架、AC-08、AC-11 allowlist、AC-13 redact。
- **Risks：** 误改 XYDC 注册顺序。

### Phase 2 — Amazon authentication + account

- **Goal：** LWA OAuth + 加密 refresh token + `getMarketplaceParticipations`。
- **Files：** LWA client；oauth controller；credential encrypt；AmazonProvider `store.account.participations`。
- **Data：** 使用 Phase 1 表。
- **API：** oauth start/callback；account status。
- **Tests：** token exchange fixture；redaction；LIVE_NOT_RUN 若无 credential。
- **AC：** AC-02、AC-03。
- **Risks：** 回调 URL / 区域 endpoint；禁止把 secret 打进日志。

### Phase 3 — Catalog / Listing（只读）

- **Goal：** `searchListingsItems` / `getListingsItem` → upsert `Product`/`Sku`。
- **AC：** AC-04 catalog、AC-05。
- **Risks：** seller SKU vs 内部 `skuCode` 碰撞；不要调用 put/patch。

### Phase 4 — Orders

- **Goal：** Orders v2026-01-01 search + get（无 PII）→ `Order`/`OrderItem`；cursor 幂等。
- **AC：** AC-04 orders。
- **Risks：** v0 已弃用，不要实现 v0；RDT 本期不做。

### Phase 5 — Inventory

- **Goal：** `getInventorySummaries` → `InventoryBalance` + snapshot 行。
- **AC：** AC-04 inventory。
- **Risks：** 禁止 FBA write ops。

### Phase 6 — Returns / Fees

- **Goal：** Finances `listTransactions` → 诚实费用；Returns 用 Reports 或退款事件，能做多少做多少。
- **AC：** 扩展 AC-04。
- **Risks：** Reports 异步；不要把估算费率冒充结算。

### Phase 7 — Observability + hardening

- SyncRun 完整字段；rate limit 退避；stale 标记；可选 `PrismaSku360DataSource` **开关默认关**（Demo 仍 Scenario）。
- **Risks：** 默认切 Store 会让 WF-05 金标/演示轨迹变样 → 必须显式开关。

### Phase 8 — Regression + acceptance

- V9.1 web 29 + API/domain 回归；无 XYDC 5151 改期待；LIVE_NOT_RUN 诚实记录；handoff/evidence。
- **AC：** AC-07、AC-08、AC-12、AC-13、AC-14。

每阶段结束才允许下一阶段。

---

## 13. Acceptance Matrix

| ID | 目标 | 现在 | 计划阶段 |
| :--- | :--- | :--- | :--- |
| AC-01 Amazon Provider | 正式 Provider | 无 | P1 |
| AC-02 认证基础 | LWA | 无 | P2 |
| AC-03 Account/Marketplace | participations | 仅全局 AMAZON_US | P2 |
| AC-04 Catalog/Orders/Inventory | 可读真实数据 | Prisma Demo / 空订单 | P3–P5 |
| AC-05 Canonical | mapper → Prisma | 无 Amazon mapper | P3–P5 |
| AC-06 业务层无原始字段 | 服务不 import SP-API | 已大致如此 | 全程 |
| AC-07 Mock 可用 | Demo | 有 | 全程保护 |
| AC-08 无 credential 可启动 | env 无 Amazon | 当前即如此 | P1 锁住 |
| AC-09 稳定错误 | 部分 ProviderError | 缺 Amazon 语义 | P1+P7 |
| AC-10 可观测 | Gateway 计时 | 无 account/sync | P7 |
| AC-11 Read Only | 工具层已是 | 新代码 allowlist | P1 起 |
| AC-12 V9.1 回归 | 冻结时通过 | 视觉后未全量 | P8 |
| AC-13 无 Secret 泄漏 | XYDC redact | 无 Amazon token 路径 | P2+P8 |
| AC-14 handoff/evidence | 本文件 | 本审计 | 每阶段报告 |

---

## 14. Risks

1. **双轨数据：** 同步进 Prisma 后 WF-05 仍读 Scenario → 运营看板仍是剧本。Phase 7 开关必须默认关。  
2. **POST_V9 vs 本命令：** 旧文档含 CSV/Scheduler/告警。本 Epic **不做**，避免范围膨胀。  
3. **Listings/FBA API 含 Write：** 必须 allowlist，单测拦截。  
4. **Orders PII / RDT：** 过早申请会提高合规成本。  
5. **限流：** Orders 等配额低，不能在请求路径上同步打全店。  
6. **凭证安全：** 无 KMS 时至少应用层加密 + 文件系统权限；禁止进 git。  
7. **XYDC 5151：** 回归不得改 fixture。  
8. **订单 seed 为空：** 同步前 UI 空是现状，不是回归失败。  
9. **估算费用 vs 结算：** 在 Finances 接入前必须标 ESTIMATED。

---

## 15. Out-of-Scope Findings

记录，**不修**：

- Worker BullMQ 无生产者  
- JWT 不校验 User.status  
- CORS `origin: true`  
- `demo-login` 在 DB down 时发 preview JWT  
- Reviews 页 VOC 硬编码  
- Profit 硬编码 15% / $4.50  
- Inventory 无 ledger 表（矩阵有名无表）  
- Architecture 面试页仍在「更多」导航  
- POST_V9 CSV 导入 / 晨检 Scheduler / 飞书  
- Listing 真发布 / Ads 真执行  
- 视觉改版 `e457d5a` 未再跑 Browser Acceptance  
- `next lint` 未配置  

---

## 16. Exact Recommended First Coding Phase

```text
Phase 1 — Provider foundation

Goal:
  STORE_COMMERCE category + MockAmazon + Amazon adapter shell
  + Read-only allowlist + error codes + additive Prisma connection tables
  + app boots with zero Amazon env

Do not:
  Call live SP-API
  Implement OAuth UI
  Sync orders
  Touch XYDC mapper / WF-05 formulas
  Add Scheduler

Stop after Phase 1 tests pass. Wait for human to start Phase 2.
```

```text
READY_FOR_IMPLEMENTATION = YES
NEXT_PHASE = Phase 1 Provider foundation
```

到此停止。未写业务代码。未部署。未改冻结基线。
