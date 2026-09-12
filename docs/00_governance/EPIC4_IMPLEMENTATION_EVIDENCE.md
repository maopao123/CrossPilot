# Epic 4 Implementation Evidence

**Date:** 2026-09-12  
**Scope:** Real Store Data Foundation (Read Only)  
**V9.1 freeze:** unchanged (`v9.1.0` → `b3d5607`)

```text
READY_FOR_IMPLEMENTATION was YES
Implemented Phases 1–8 in one coding pass (read-only)
LIVE_NOT_RUN unless AMAZON_LWA_REFRESH_TOKEN is present
```

## What landed

- Amazon Provider + MockAmazon on existing IntegrationGateway
- LWA helpers + HTTP GET allowlist (write paths throw `WRITE_FORBIDDEN`)
- Additive Prisma: `CommerceAccount`, `ProviderCredential`, `SyncRun` + optional identity/freshness columns
- REST: `/api/v1/commerce/accounts`, OAuth start/callback, `/amazon/sync`, `/amazon/sync-runs`
- Optional `STORE_SKU360_SOURCE=prisma` (default **scenario**, WF-05 demo unchanged)
- Encrypted refresh tokens; redaction; VIEWER cannot sync

## Official APIs used (read)

- LWA `https://api.amazon.com/auth/o2/token`
- Sellers `GET /sellers/v1/marketplaceParticipations`
- Listings `GET /listings/2021-08-01/items`
- Catalog `GET /catalog/2022-04-01/items/{asin}`
- Orders `GET /orders/2026-01-01/orders`
- FBA Inventory `GET /fba/inventory/v1/summaries`
- Finances `GET /finances/2024-06-19/transactions`

## Not done (by command)

- Amazon Write, Ads, Scheduler, CSV import, Feishu, V9.2
- XYDC 5147→5151
- Frozen WF-05 formulas / OCC

## Tests (this machine)

| Suite | Result |
| :--- | :--- |
| API Jest | **14/14 suites, 95 tests PASS** (7 new Epic 4) |
| Domain Jest | **24/24 suites, 228 tests PASS** |
| Web contracts | **29/29 PASS** |
| Amazon store unit | **PASS** + `LIVE_NOT_RUN` |
| Integrations XYDC live `5151≠5147` | **KNOWN ENVIRONMENT-DEPENDENT** — not retargeted |

## Live test

If env has no seller refresh token:

```text
LIVE_NOT_RUN
```
