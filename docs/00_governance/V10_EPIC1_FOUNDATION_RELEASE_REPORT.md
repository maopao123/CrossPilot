# V10 Epic 1 — Store + ChannelIdentity Foundation

**Date:** 2026-09-12  
**Status:** SHIPPED / LIVE  
**Live SHA:** `2a5b305`  
**Scope:** Database foundation + Simulator/OAuth upsert compatibility. No Adapter. No Amazon/Shopify live calls. No WF-05 / Recommendation / Action state-machine changes.

---

## 1. Schema Changes

| Object | Change |
| :--- | :--- |
| `stores` | **NEW** id, workspaceId, name, platform (`amazon\|shopify\|simulator`), country, status |
| `channel_identities` | **NEW** storeId, platform, entityType, entityId, externalId. Unique `(storeId, platform, entityType, externalId)` |
| `commerce_accounts.store_id` | **NEW** NOT NULL FK → stores, **UNIQUE** |
| `commerce_accounts (workspace_id, provider)` unique | **DROPPED** |

Not added (pollution ban): `Store.amazonId`, `Store.shopifyId`.  
Not deleted: `Sku.asin`, `Campaign.campaignIdAmazon`, `Competitor.asin`.

Unique choice: **scheme A `storeId` unique** (1 Store ↔ 1 CommerceAccount). Simulator amazon/shopify stay two stores.

---

## 2. Migration Steps

SQL: `packages/db/prisma/migrations/20260914000000_v10_epic1_store_foundation/migration.sql`

1. CREATE `stores`, `channel_identities`
2. ADD `commerce_accounts.store_id` nullable
3. Backfill: **each existing account → one new Store** (`simulator-amazon` / `simulator-shopify` **not merged**)
4. SET `store_id` NOT NULL + FK
5. DROP `commerce_accounts_workspace_id_provider_key`
6. CREATE UNIQUE `commerce_accounts_store_id_key`

Application code that used `upsert({ workspaceId_provider })` now uses `ensureStoreBoundAccount()`:

- `packages/db/src/simulator/simulator-store.ts`
- `apps/api/src/modules/commerce-store/commerce-store.service.ts`

---

## 3. Backfill Result

Cloud `industry_postgres` / `crosspilot` after `prisma db execute` of `20260914000000_v10_epic1_store_foundation`:

| provider | store.name | platform | country | status |
| :--- | :--- | :--- | :--- | :--- |
| `simulator-amazon` | Simulator Amazon | simulator | US | CONNECTED |
| `simulator-shopify` | Simulator Shopify | simulator | US | CONNECTED |

`commerce_accounts.store_id` NULL count = **0**.  
No live Amazon/Shopify accounts existed, so the amazon/shopify name mapping was not exercised on production rows.  
ChannelIdentity row count = **0** (table only).  
`skus.asin` column kept.

---

## 4. Compatibility Verification

Local (this machine, no Postgres runtime):

```text
pnpm --filter @crosspilot/api test -- --testPathPattern="v10-epic1-foundation|simulator.spec|epic4-commerce-store|v93-action-layer"
4 suites / 24 tests PASS
@crosspilot/api typecheck PASS
@crosspilot/db typecheck PASS
rg workspaceId_provider --glob '*.{ts,js,sql}'  → 0 hits
```

| Case | How | Result |
| :--- | :--- | :--- |
| 1 Multi-store | unit: 2× amazon (NA/EU) + 2× shopify in one workspace | PASS |
| 2 Simulator two stores | unit + `ensureFixtures` no longer uses `workspaceId_provider` | PASS |
| 3 V9.3 Action SM | `v93-action-layer.spec.ts` still green (`CREATED` / `WAITING_APPROVAL` / `APPROVED` / `SUCCESS`) | PASS |
| Epic 4 store service | `epic4-commerce-store.spec.ts` (AUTH_REQUIRED / WRITE_FORBIDDEN / mock listings) | PASS |
| Simulator API unit | `simulator.spec.ts` | PASS |

Live (`2a5b305`, backup `/root/zls/backup/CrossPilot-pre-v10e1-202609122045`):

| Check | Result |
| :--- | :--- |
| Indexes | `commerce_accounts_workspace_id_provider_key` gone; `commerce_accounts_store_id_key` unique present |
| Case 1 | Inserted Amazon US/EU + Shopify A/B in one workspace (**4 stores**, 2×amazon + 2×shopify), **ROLLBACK**; leftover `V10E1 %` = 0 |
| Case 2 | `GET /commerce/accounts` → two stores (`Simulator Amazon`, `Simulator Shopify`); `GET /simulator/state` 200 RUNNING dayIndex=10 simDate=2026-09-11 |
| Case 3 | `POST /actions/plan-acos` → `WAITING_APPROVAL` → approve `APPROVED` → execute `SUCCESS` (`Mock bid decreased 20%`) |
| Health | `/api/v1/health` 200; postgres/redis/milvus up; `/app/operations/today` 200 |
| Guard | `STORE_SKU360_SOURCE=prisma` **not** set |

PM2: api + worker reloaded on `2a5b305`; web left on previous dist (no UI in this epic).

---

## 5. Known Limitations

- ChannelIdentity empty — Sku.asin still lives on Sku
- PlannedAction / Order still have no `storeId` (Epic 2+)
- OAuth callback binds the latest `AUTH_REQUIRED` amazon account
- Second Shopify shop is allowed by schema; helper `ensureStoreBoundAccount('shopify')` still finds the first shopify unless caller creates the store explicitly
- No Adapter, no live Amazon/Shopify, no Action write

Next: Epic 2 Commerce Ports + SimulatorAdapter.
