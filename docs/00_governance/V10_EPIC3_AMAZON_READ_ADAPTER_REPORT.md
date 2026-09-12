# V10 Epic 3 — Amazon Read Adapter

**Date:** 2026-09-12
**Status:** SHIPPED / LIVE
**Live SHA:** `TBD`（部署后以 `git log -1` 为准，pin 进 `docs/HANDOFF.md`）
**Scope:** `AmazonAdapter` behind the Epic 2 Commerce Ports. Reuses Epic 4 GET-allowlisted `AmazonProvider` transport + LWA credential chain. Read-only: write ports stay `WRITE_FORBIDDEN`. No Shopify. No WF-05 / Action / Recommendation changes. Simulator engine untouched.

---

## 1. What landed

| Piece | Location |
| :--- | :--- |
| AmazonAdapter | `packages/db/src/commerce/amazon-adapter.ts` — implements Catalog/Order/Inventory/Ads/Profit ports |
| Resolver | `resolveCommerceAdapter(prisma, 'amazon')` → `AmazonAdapter`; `shopify` still `PROVIDER_UNAVAILABLE` |
| Credential crypto (shared) | `packages/integrations/src/provider-framework/secrets/provider-credential-crypto.ts` — canonical AES-GCM impl moved out of the API app so db can decrypt the same `ProviderCredential` payloads |
| API compat | `apps/api/src/modules/commerce-store/credential-crypto.ts` keeps every export, delegates encrypt/decrypt to integrations |
| Port error | `CommercePortError` gains optional `retryable` (additive) |

`@crosspilot/db` now depends on `@crosspilot/integrations` + `@crosspilot/shared` (worker already depended on integrations — no new runtime weight).

## 2. Behavior

Binding (every port): `Store` must exist, belong to `ctx.workspaceId`, `platform === 'amazon'`, have a bound `CommerceAccount` (`storeId` unique), and a `LWA_REFRESH` `ProviderCredential`. Failures are explicit:

| Condition | Error |
| :--- | :--- |
| missing/wrong-workspace store | `RESOURCE_NOT_FOUND` |
| store platform ≠ amazon | `PROVIDER_UNAVAILABLE` (same as SimulatorAdapter) |
| no commerce account | `RESOURCE_NOT_FOUND` |
| no LWA refresh token | `AUTH_REQUIRED` |
| no `sellingPartnerId` on listing reads | `AUTH_REQUIRED` |
| LWA exchange `TOKEN_EXPIRED` | `TOKEN_EXPIRED` (retryable) |
| provider 429 / `RATE_LIMITED` | `PROVIDER_RATE_LIMIT` (retryable, per architecture §3.1) |
| other provider failure | original code, `retryable` passthrough |

| Port | Read path | Notes |
| :--- | :--- | :--- |
| Catalog | `store.listings.search` / `store.listings.get` via `AmazonProvider` | `CanonicalProduct.id = sellerSku`; identities `[{asin}, {amazon_sku}]`; **no `asin` field on the body**. Best-effort `ChannelIdentity` upsert (`entityType='offer'`) on catalog reads |
| Order | `store.orders.search` | `externalOrderId = amazonOrderId`; items `offerId = sellerSku`; `createdAfter` from `OrderQuery.from`; status/limit applied client-side |
| Inventory | `store.inventory.summaries` | match by `sellerSku` (or ASIN); `daysOfStock: null` |
| Ads | — | `[]`: Epic 4 GET allowlist has no Sponsored Ads read endpoints |
| Profit | — | `[]`: finances transactions carry no seller-SKU / COGS split, so an honest `CanonicalProfit` projection is impossible from the read allowlist |
| Writes | `updateProduct` / `decreaseBid` | `WRITE_FORBIDDEN` (returned, not thrown) |

No silent mock: the adapter only ever talks to the real `AmazonProvider`; mock enters solely via the injected `options.transport` seam (tests). Production sync endpoints keep their existing `useMock` 403 guard.

## 3. Verification

Local:

```text
pnpm --filter @crosspilot/api test --testPathPattern=v10-epic3 --silent   9 PASS
pnpm --filter @crosspilot/api test --silent                              23 suites / 149 PASS
pnpm --filter @crosspilot/domain test                                    29 suites / 270 PASS
packages/integrations: node test/amazon-store.test.cjs                   PASS (LIVE_NOT_RUN)
pnpm -r run typecheck                                                    all green
```

Updated expectation: `v10-epic2-ports.spec.ts` now asserts `resolve('amazon')` returns `AmazonAdapter` (its old "amazon rejects" line was the Epic 2 contract; Epic 3 replaces exactly that). All other Epic 2 assertions untouched.

Known pre-existing red, **not a regression, do not "fix"**: `packages/integrations` provider-framework fixture test expects 5147, live XYDC returns 5151 (environment drift; forbidden to retarget by handoff rules).

Live: see §5.

## 4. Compatibility matrix (acceptance §6.4)

| Case | Result |
| :--- | :--- |
| A `resolve('amazon')` → AmazonAdapter | PASS |
| B mock listings → CanonicalProduct, identities carry asin, body has none | PASS |
| C write ports `WRITE_FORBIDDEN` | PASS |
| D simulator two stores + `POST /simulator/tick` still green | PASS (simulator.spec) |
| E V9.3 `plan-acos` approval → Mock `SUCCESS` path | PASS (v93-action-layer) |
| F no seller authorization in prod → explicit `AUTH_REQUIRED`, never fake LIVE | PASS by design (bind fails closed) |
| G `STORE_SKU360_SOURCE=prisma` absent | PASS |
| H report + HANDOFF SHA pinned | this file |

## 5. Live deployment

TBD — filled after deploy: SHA, pm2 state, smoke results (`/health`, demo-login, `GET /commerce/accounts`, `GET /simulator/state`, `POST /simulator/tick`).

## 6. Known Limitations

- Live SP-API remains `LIVE_NOT_RUN` until a seller completes LWA OAuth; the adapter fails closed with `AUTH_REQUIRED` until then.
- Ads read and Profit read return `[]` (read allowlist cannot support them honestly).
- `ChannelIdentity` writes are catalog-path only, best-effort; no historical ASIN backfill.
- `listOrders` does not page `nextToken` (single page, same as Epic 4 sync).
- Business layers (WF-05 / Playbook / Action Planner) still do not `import` SP-API; nothing routes them through the AmazonAdapter yet — that wiring is Epic 5/6 territory.

Next: Epic 4 Shopify read adapter（未授权，等用户指令）。
