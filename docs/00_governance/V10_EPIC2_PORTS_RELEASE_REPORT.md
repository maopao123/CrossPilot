# V10 Epic 2 — Commerce Ports + SimulatorAdapter

**Date:** 2026-09-12  
**Status:** SHIPPED / LIVE  
**Live SHA:** `6a9b636`  
**Scope:** Resource-level Commerce Ports + SimulatorAdapter wrapping existing SimulatorStore. No Amazon/Shopify APIs. No WF-05 / Recommendation / Action SM changes. Engine seed/start date/inventory frozen.

---

## 1. What landed

| Piece | Location |
| :--- | :--- |
| Ports | `packages/domain/src/commerce-ports/` — Catalog / Order / Inventory / Ads / Profit |
| Context | `CommerceContext { workspaceId, storeId, traceId }` — no marketplace-as-platform switch |
| SimulatorAdapter | `packages/db/src/commerce/simulator-adapter.ts` implements all ports |
| Resolver | `resolveCommerceAdapter(prisma, platform)` — **simulator only**; amazon/shopify → `PROVIDER_UNAVAILABLE` |
| Tick path | `POST /simulator/tick` and worker sweep call `SimulatorAdapter.tick()` |
| Writes | `updateProduct` / `decreaseBid` return `WRITE_FORBIDDEN` |

Simulator engine (`simulateOneDay`) is unchanged. `SimulatorStore.persistDay` / `ensureFixtures` stay as persistence internals.

---

## 2. Port behavior (Simulator)

| Port | Read | Write |
| :--- | :--- | :--- |
| Catalog | workspace SKUs; amazon-channel identities `{asin, amazon_sku}`; shopify-channel `{sku}` | `WRITE_FORBIDDEN` |
| Order | `sourceProvider=simulator` + store's `CommerceAccount` | n/a |
| Inventory | FBA balance + latest daysCover | n/a |
| Ads | SIM- campaign metrics on **simulator-amazon** store; shopify store → `[]` | `decreaseBid` → `WRITE_FORBIDDEN` |
| Profit | `profit_daily` with amazonFees+fbaFee folded into `fees` (not Canonical columns) | n/a |

Canonical products do **not** carry `asin` / `shopifyId` fields. Identities are a projection only. ChannelIdentity table is still empty (no ASIN backfill this epic).

---

## 3. Compatibility Verification

Local:

```text
pnpm --filter @crosspilot/domain test -- --testPathPattern=commerce-ports
  1 suite / 3 tests PASS
pnpm --filter @crosspilot/api test -- --testPathPattern="v10-epic2-ports|simulator.spec|v10-epic1-foundation|v93-action-layer|epic4-commerce-store"
  v10-epic2 7 PASS
  simulator / epic1 / v93 / epic4 24 PASS
@crosspilot/api typecheck PASS
@crosspilot/worker typecheck PASS
```

| Case | Result |
| :--- | :--- |
| Two simulator stores stay distinct | PASS (orders split by account/store) |
| Action SM | v93 suite still green |
| Simulator tick gold (day 7, isolation markers) | PASS |
| Amazon/Shopify adapter | `PROVIDER_UNAVAILABLE` |
| Write ports | `WRITE_FORBIDDEN` |

Live (`6a9b636`, backup `/root/zls/backup/CrossPilot-pre-v10e2-202609122059`, no SQL migration):

| Check | Result |
| :--- | :--- |
| Health | `/api/v1/health` 200; postgres/redis/milvus up |
| Two stores | `Simulator Amazon` + `Simulator Shopify` still distinct |
| Adapter tick | `POST /simulator/tick` 201: dayIndex 11 → **12**, 29 orders / 4 reviews / 3 ad rows |
| Action SM | existing `DECREASE_BID` rows still `SUCCESS` |
| Guard | `STORE_SKU360_SOURCE=prisma` **not** set |

PM2: api + worker reloaded on `6a9b636`; web dist unchanged (no UI).

---

## 4. Known Limitations

- AmazonAdapter / ShopifyAdapter **not** registered (Epic 3 / 4)
- Action execute still Mock (Epic 6 ToolResolver)
- WF-05 still default Scenario (`STORE_SKU360_SOURCE` not prisma)
- PlannedAction / Order have no `storeId` column
- ChannelIdentity not backfilled
- Inventory unique is still workspace+sku+FBA (shared across simulator stores)
- No new REST `/stores` or `/sync/jobs`

Next: Epic 3 Amazon read Adapter. 执行说明书：`docs/00_governance/V10_NEXT_AGENT_HANDOFF.md`。
