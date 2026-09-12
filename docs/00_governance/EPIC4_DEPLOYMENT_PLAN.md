# Epic 4 Deployment Plan

**Status:** Hold until `EPIC4_RELEASE_READINESS.md` blockers are fixed.  
**Live today:** `e457d5a` @ `http://116.198.230.217:2222`  
**V9.1 tag:** `v9.1.0` → `b3d5607` (do not retag)

This plan is for **API + Prisma additive schema**. Web need not rebuild unless you also ship UI (there is none).

---

## Hold conditions

Do not run this plan on production until:

1. Unconnected sync no longer persists MockAmazon into the workspace DB.  
2. `sellingPartnerId` is stored for live listings.  
3. Production encryption key is mandatory (`AMAZON_CREDENTIAL_ENCRYPTION_KEY`).

Until then: local commit is a product decision; **cloud deploy is NO**.

---

## Env variables (server `.env`, do not commit)

| Name | Required to boot | Required to OAuth | Notes |
| :--- | :---: | :---: | :--- |
| `DATABASE_URL` | yes | yes | Existing |
| `JWT_SECRET` | yes | yes | Existing; do not reuse as long-term token wrap if wrap key is set |
| `AMAZON_CREDENTIAL_ENCRYPTION_KEY` | no (today) | **should be yes** | 32+ byte random. Must stay stable or stored tokens cannot decrypt |
| `AMAZON_LWA_CLIENT_ID` | no | yes | SP-API app |
| `AMAZON_LWA_CLIENT_SECRET` | no | yes | |
| `AMAZON_APPLICATION_ID` | no | yes if ≠ client id | Consent URL |
| `AMAZON_LWA_REDIRECT_URI` | no | yes | Must match Amazon app: `https://<host>/api/v1/commerce/amazon/oauth/callback` (via Next :2222 rewrite or API host) |
| `AMAZON_SP_API_REGION` | no | NA default | `NA` / `EU` / `FE` |
| `STORE_SKU360_SOURCE` | no | — | **Leave unset or `scenario`.** Never `prisma` on this deploy |

App **must** start if all `AMAZON_*` are empty.

Redirect URI note: public traffic is Next `:2222` rewriting `/api/*` → `127.0.0.1:3001`. Register:

```text
http://116.198.230.217:2222/api/v1/commerce/amazon/oauth/callback
```

(or https if you add TLS later.)

---

## Migration order

Cloud previously used **`prisma db push`** because migrate history ≠ full schema. Keep that unless you reconcile history.

On server, after `git fetch` / checkout, **preserve** `.env` and `ecosystem.config.cjs`.

```bash
cd /root/zls/project/CrossPilot
# 1) deps
pnpm install

# 2) generate client
pnpm --filter @crosspilot/db exec prisma generate

# 3) additive schema (preferred on this host)
cd packages/db
pnpm exec prisma db push
# If you instead apply the SQL file:
# psql via SSH tunnel only — do not open 5432 to the internet
# File: packages/db/prisma/migrations/20260912180000_epic4_store_foundation/migration.sql
# Re-run risk: CREATE TABLE IF NOT EXISTS is safe; ADD CONSTRAINT is not.

# 4) builds (API needs new Prisma client)
pnpm --filter @crosspilot/shared run build
pnpm --filter @crosspilot/integrations run build
pnpm --filter @crosspilot/domain run build
pnpm --filter @crosspilot/api run build
```

Web rebuild is optional for this Epic (no new pages).

---

## Service restart

```bash
cd /root/zls/project/CrossPilot
pm2 reload crosspilot-api --update-env
# worker: no Epic 4 consumer; skip unless you change env globally
# web: skip unless you rebuilt web
sleep 3
```

Do **not** set `STORE_SKU360_SOURCE=prisma` in `ecosystem.config.cjs`.

---

## Smoke test (after blockers fixed)

From the server (or public :2222):

```bash
# boot + existing health
curl -s -o /tmp/h.json -w "%{http_code}\n" http://127.0.0.1:2222/api/v1/health
# expect 200, postgres/redis/milvus up

# demo login (201 or 200)
# then:
# GET /api/v1/commerce/accounts   with Bearer + x-workspace-id
# expect { accounts: [], amazonConfigured: true|false }

# GET /api/v1/operations/daily-diagnosis/... existing flows still work
# GET /api/v1/products still lists demo catalog
```

**Do not** `POST /api/v1/commerce/amazon/sync` on the live demo workspace until implicit-mock persist is fixed. That would insert fixture SKUs/orders into `crosspilot-demo`.

Live SP-API: only after LWA app + seller consent. If no refresh token:

```text
LIVE_NOT_RUN
```

---

## Rollback

1. `pm2 reload` previous API `dist` **or** `git checkout e457d5a` (last known live web/api SHA) and rebuild API.  
2. Schema rollback (only if you must):

```sql
ALTER TABLE "skus" DROP COLUMN IF EXISTS "amazon_seller_sku";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "external_order_id";
ALTER TABLE "inventory_balances" DROP COLUMN IF EXISTS "source_updated_at";
ALTER TABLE "profit_daily" DROP COLUMN IF EXISTS "source";
DROP TABLE IF EXISTS "sync_runs";
DROP TABLE IF EXISTS "provider_credentials";
DROP TABLE IF EXISTS "commerce_accounts";
```

3. V9.1 product behavior does not depend on these tables. Demo seed rows remain.  
4. Do not move `v9.1.0`.

---

## Post-deploy monitoring

- `GET /commerce/amazon/sync-runs` for FAILED + `errorCode`  
- API logs: must not contain `Atzr|` / `Atza|`  
- Health 200  
- WF-05 still Scenario (no prisma flag)
