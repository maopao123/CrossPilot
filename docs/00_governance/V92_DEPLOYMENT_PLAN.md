# V9.2 Deployment Plan (draft)

**Status:** DRAFT — **do not deploy in this phase**  
**Live today:** `e457d5a` @ http://116.198.230.217:2222  
**Target SHA after a future deploy:** `54074d9` (contains Epic 4 + V9.2)  
**V9.1 tag:** `v9.1.0` → `b3d5607` (do not retag)

Windows PC is development-only. Apply this on `root@116.198.230.217` only when explicitly ordered.

---

## Hold conditions

Do not run this plan until:

1. `git push origin master` has landed `54074d9` on Gitee (or the server fetches that SHA another agreed way).
2. Cloud `.env` has `AMAZON_CREDENTIAL_ENCRYPTION_KEY` (32+ bytes) **before** production API boot.
3. Operator accepts: no mock-sync on the demo workspace; `STORE_SKU360_SOURCE` stays `scenario`.
4. Backup of `/root/zls/project/CrossPilot` + Postgres is taken.

Until then: **DEPLOYMENT_READY = NO**.

---

## 1. Backup

On the cloud host, before `git pull`:

```bash
# code snapshot
cp -a /root/zls/project/CrossPilot /root/zls/backup/CrossPilot-e457d5a-$(date +%Y%m%d%H%M)

# keep these out of git, copy aside
cp /root/zls/project/CrossPilot/.env /root/zls/backup/crosspilot.env.e457d5a
cp /root/zls/project/CrossPilot/ecosystem.config.cjs /root/zls/backup/ecosystem.config.cjs.e457d5a

# Postgres dump (loopback only; do not expose 5432)
# pg_dump using existing local socket / 127.0.0.1 credentials from .env
```

Record live SHA: `git -C /root/zls/project/CrossPilot rev-parse HEAD`  
Expect `e457d5a` before deploy.

---

## 2. Environment variables

Preserve remote `.env`. **Do not overwrite from the repo.**  
Do not commit secrets.

### Already required (leave as-is)

`DATABASE_URL`, `JWT_SECRET`, existing LLM / XYDC / Firecrawl / Redis / Milvus keys.

### Epic 4 — add if missing

| Name | Production boot | OAuth / live sync | Notes |
| :--- | :---: | :---: | :--- |
| `AMAZON_CREDENTIAL_ENCRYPTION_KEY` | **yes** | yes | 32+ random bytes; must stay stable |
| `AMAZON_LWA_CLIENT_ID` | no | yes | |
| `AMAZON_LWA_CLIENT_SECRET` | no | yes | |
| `AMAZON_APPLICATION_ID` | no | if ≠ client id | |
| `AMAZON_LWA_REDIRECT_URI` | no | yes | Public: `http://116.198.230.217:2222/api/v1/commerce/amazon/oauth/callback` |
| `AMAZON_SP_API_REGION` | no | default `NA` | |
| `STORE_SKU360_SOURCE` | no | — | **`scenario` or unset. Never `prisma` on this deploy.** |

API must still boot if all `AMAZON_LWA_*` are empty.  
API **must not** boot in production without `AMAZON_CREDENTIAL_ENCRYPTION_KEY`.

Do **not** `POST /api/v1/commerce/amazon/sync` against the demo workspace with `useMock: true`.

---

## 3. Database migrations (order)

Additive only. Do not drop V9.1 tables.

1. `packages/db/prisma/migrations/20260912180000_epic4_store_foundation/migration.sql`
2. `packages/db/prisma/migrations/20260912210000_v92_playbook_framework/migration.sql`
3. `packages/db/prisma/migrations/20260912220000_v92_intelligence_layer/migration.sql`

Cloud historically used `prisma db push` because migrate history ≠ full schema. Prefer applying the three SQL files in order via `127.0.0.1` psql **or** `db push` after generate — pick one story and do not mix in the same cutover.

`CREATE TABLE IF NOT EXISTS` is re-run safe. Extra `ADD CONSTRAINT` on a second apply may fail.

---

## 4. Build order

Preserve `.env` and untracked `ecosystem.config.cjs`. Then:

```bash
cd /root/zls/project/CrossPilot
git fetch origin
git checkout 54074d9   # or git pull origin master after push

pnpm install

pnpm --filter @crosspilot/db exec prisma generate
# then apply migrations (section 3)

pnpm --filter @crosspilot/shared run build
pnpm --filter @crosspilot/integrations run build
pnpm --filter @crosspilot/domain run build
pnpm --filter @crosspilot/ai run build
pnpm --filter @crosspilot/tool-platform run build
pnpm --filter @crosspilot/api run build
```

Web rebuild is optional: V9.2 has **no new UI**. Skip `crosspilot-web` rebuild unless you also pull unrelated frontend.

---

## 5. Service restart

```bash
pm2 reload crosspilot-api --update-env
# worker: skip unless env shared and you changed worker code (V9.2 did not)
# web: skip unless rebuilt
sleep 3
pm2 status
```

Confirm process cwd still `/root/zls/project/CrossPilot` and `git rev-parse HEAD` = `54074d9`.

---

## 6. Smoke test

From the server (loopback). JWT + `x-workspace-id` for app routes.

```bash
# health
curl -s -o /tmp/h.json -w "%{http_code}\n" http://127.0.0.1:2222/api/v1/health
# expect 200

# demo login then:
# GET  /api/v1/playbooks
# POST /api/v1/playbooks  (minimal schema) → id
# POST /api/v1/playbooks/:id/runs → runId, status CREATED
# GET  /api/v1/facts
# GET  /api/v1/recommendations
# GET  /api/v1/commerce/accounts
# existing WF-05: GET/POST operations/daily-diagnosis still 2xx for demo
```

Do **not** treat Live SP-API as smoke. If no seller token:

```text
LIVE_NOT_RUN
```

WF-05 regression on cloud = existing Operations Today path still loads; do not rewrite Sku360 source.

---

## 7. Rollback

1. `pm2 stop crosspilot-api` (brief) or keep serving old `dist` until checkout completes.
2. `git checkout e457d5a` in `/root/zls/project/CrossPilot`.
3. Restore `.env` and `ecosystem.config.cjs` from backup if touched.
4. Rebuild API from `e457d5a` (`pnpm --filter @crosspilot/api run build`) and `pm2 reload crosspilot-api --update-env`.
5. **Do not drop** new tables unless a separate data rollback is ordered. New tables are unused by `e457d5a` code; leaving them is the low-risk rollback.

Never force-push `v9.1.0`. Never retarget XYDC `5147` → `5151`.
