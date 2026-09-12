# Epic 4 Release Readiness Review

**Date:** 2026-09-12  
**Scope:** Read-only review of implemented Epic 4. **No code was changed in this review.**  
**Question:** Can Epic 4 enter commit / deploy?

```text
READY_FOR_RELEASE = NO
```

V9.1 freeze (`v9.1.0` → `b3d5607`) is not contradicted by the *intent* of the diff. The *current* store-sync defaults are not safe to run on the live demo database.

---

## 1. Migration Review

**Additive:** Yes. New tables + nullable/default columns. No drop, no rewrite of existing business rows.

| Change | Verdict |
| :--- | :--- |
| `commerce_accounts` / `provider_credentials` / `sync_runs` | New, FK to `workspaces` CASCADE, tenant via `workspace_id` |
| unique `(workspace_id, provider)` | One Amazon account per workspace — OK |
| unique `(account_id, kind)` | One LWA refresh per account — OK |
| `skus.amazon_seller_sku` nullable | Additive |
| `orders.external_order_id` nullable + **non-unique** index | Additive; duplicate Amazon ids possible under race |
| `inventory_balances.source_updated_at` nullable | Additive |
| `profit_daily.source DEFAULT 'ESTIMATED'` | Additive; existing rows stay valid |

**Tenant isolation:** New tables filter/FK `workspace_id`. Credentials hang off account, not User. `Marketplace` remains global lookup.

**Rollback:** Drop three tables + four columns. Low data-loss risk if no live OAuth has run (none has). `IF NOT EXISTS` on tables helps re-run; **FK `ADD CONSTRAINT` is not idempotent** — second migrate apply can fail. Cloud historically used `prisma db push`.

**Not a schema blocker.** Weak uniqueness on `external_order_id` is a risk, not a freeze violation.

---

## 2. Security Review

| Control | Finding |
| :--- | :--- |
| Refresh token at rest | AES-256-GCM, random IV, auth tag. **Good.** |
| Encryption key | `AMAZON_CREDENTIAL_ENCRYPTION_KEY` **or** `JWT_SECRET` **or hardcoded `dev-amazon-cred-key`**. Production can encrypt with a known fallback. **Blocker for deploy.** |
| List APIs | `listAccounts` does not select `payloadEnc`. **Good.** |
| Logs / Agent | No store tools in `ALL_DEFAULT_TOOLS`. Token not returned on account DTO. Error paths use `SecretProvider.redact` in Amazon provider. **Good.** |
| OAuth callback | `@Public()` + HMAC `state`. `ts` is stored **but never expired**. Compare is not timing-safe. Stolen `code+state` within Amazon code TTL could bind a workspace. |
| Decrypt boundary | Plain refresh token exists in process memory during sync / LWA exchange only. Not written to SyncRun. |

**Agent context isolation:** PASS for “not in tools.” Not a vault.

---

## 3. Provider Review

| Item | Finding |
| :--- | :--- |
| Abstraction | `AmazonProvider` implements `ProviderAdapter`. Commerce services do not import SP-API types. **Good.** |
| Mock | `MockAmazonProvider` + fixtures. Gateway enables live Amazon only if `AMAZON_LWA_CLIENT_ID` is set. **Good for boot.** |
| Allowlist | GET-only regex for Sellers / Listings / Catalog / Orders v2026-01-01 / FBA summaries / Finances. Write method → `WRITE_FORBIDDEN`. **Good.** |
| Errors | Mapped: AUTH_REQUIRED, TOKEN_EXPIRED, PERMISSION_DENIED, RATE_LIMITED, NOT_FOUND, PROVIDER_UNAVAILABLE. |
| Retry / timeout | Gateway retry exists, but **live sync constructs `AmazonProvider` directly** — no gateway retry. HTTP timeout 20s. LWA has no retry. |

---

## 4. Sync Review

| Item | Finding |
| :--- | :--- |
| SyncRun | Created RUNNING → COMPLETED/FAILED with counts, duration, errorCode. Cursor column **never written**. |
| Listings upsert | `(workspaceId, skuCode)` — idempotent for same seller SKU. |
| Orders | Skip if `externalOrderId` exists; **not unique in DB**; no transaction around find+create. |
| Inventory | Upsert `(workspaceId, skuId, FBA)`. Matcher `asin: row.asin \|\| ''` can collide empty ASINs. |
| Finances | Counts events, **does not persist** `ProfitDaily`. |
| Returns | **Not implemented** (Reports async). |
| **Default mock persist** | `useMock \|\| !hasRefreshToken` → **unconnected `POST /commerce/amazon/sync` writes fixture SKU/order/inventory into that workspace.** **Blocker for deploy.** |
| Live listings | Requires `sellingPartnerId`. OAuth/participations persist **never sets it.** Live catalog sync will `INVALID_REQUEST`. **Blocker for live AC-04.** |

Failure recovery: failed run is marked FAILED; no auto-resume from cursor.

---

## 5. API Review

| Route | Auth | Notes |
| :--- | :--- | :--- |
| `GET /commerce/accounts` | JWT + workspace | No secrets in body |
| `POST /commerce/amazon/oauth/start` | JWT + workspace | VIEWER can start OAuth (not explicitly blocked) |
| `GET /commerce/amazon/oauth/callback` | **Public + SkipWorkspace** | Relies on HMAC state |
| `POST /commerce/amazon/sync` | JWT + workspace | VIEWER → 403 `AUTH_FORBIDDEN`. Role fallback `user.role \|\| 'OPERATOR'` if membership missing — **too permissive if JWT lacks role** |
| `GET /commerce/amazon/sync-runs` | JWT + workspace | Filtered by workspaceId |

Envelope still goes through existing `TransformInterceptor`. No commerce UI.

---

## 6. Regression Review

Recorded on implementation machine (not re-run in this review turn):

| Suite | Result |
| :--- | :--- |
| API Jest | 14/14, 95 PASS |
| Domain | 24/24, 228 PASS |
| Web contracts | 29/29 PASS |
| Amazon unit | PASS |
| Live SP-API | `LIVE_NOT_RUN` |
| XYDC 5151≠5147 | Unchanged (not retargeted) |

WF-05 default remains `ScenarioSku360DataSource` unless `STORE_SKU360_SOURCE=prisma`. **Do not set that flag on deploy.** Frozen formulas not edited.

This review did **not** re-execute the suites.

---

## 7. Verdict

```text
READY_FOR_RELEASE = NO
```

**BLOCKERS**

1. Unconnected sync **defaults to MockAmazon and persists fixtures** into Prisma.  
2. Live listings need `sellingPartnerId`; it is never stored from OAuth/participations.  
3. Credential encryption may use hardcoded `dev-amazon-cred-key` if env keys are missing.  
4. OAuth `state` has no expiry; callback is public.

**RISKS** (not sufficient alone to freeze commit discussion, but not ship-as-is)

- `external_order_id` not unique; order insert race  
- Inventory empty-ASIN match  
- Finances/returns incomplete vs AC-04 extension  
- Direct `AmazonProvider` skips gateway retry  
- `STORE_SKU360_SOURCE=prisma` would change WF-05 inputs  
- Cloud `db push` vs incomplete migrate history  
- No live SP-API proof  

**RECOMMENDED NEXT ACTION**

Do **not** deploy to `116.198.230.217` yet.

Fix blockers 1–3 (minimum):

1. Default `useMock = false`; mock only when `useMock === true` **and** non-production.  
2. Persist `sellingPartnerId` (Sellers payload or LWA token response) before listings sync.  
3. Require `AMAZON_CREDENTIAL_ENCRYPTION_KEY` in production; refuse to store tokens without it.  
4. Optional: expire OAuth state (e.g. 10 minutes) + timing-safe compare.

Then: commit → deploy per `EPIC4_DEPLOYMENT_PLAN.md` → smoke **without** calling sync on the demo workspace until a real account is connected.

Do not start V9.2. Do not change WF-05.
