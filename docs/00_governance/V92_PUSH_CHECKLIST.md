# V9.2 Push Checklist

**Date:** 2026-09-12  
**Do not run this checklist until asked.** This file is preparation only.

```text
git push origin master
```

That single command uploads **two** local commits that origin does not have.

---

## Commits to push

| Order | SHA | Subject |
| :--- | :--- | :--- |
| 1 | `85f5b94` | `feat(epic4): add read-only Amazon store data foundation` |
| 2 | `54074d9` | `feat(v9.2): add playbook framework and commerce intelligence loop` |

Remote today: `origin/master` = `e457d5a`  
After push: `origin/master` = `54074d9`

---

## Included changes

### Epic 4 (`e457d5a..85f5b94`)

Amazon LWA / SP-API **read-only** store foundation, commerce APIs, additive Prisma store tables, Epic 4 docs.

### V9.2 (`85f5b94..54074d9`)

Playbook Framework, Fact / Evidence / Recommendation, Amazon Product Research runner, VOC intelligence, V9.2 docs.

---

## Excluded files (must stay untracked / unstaged)

```text
.runtime-pg/
docs/_ops_*
docs/00_governance/临时命令.txt
remote .env
ecosystem.config.cjs
```

Do not `git add -A`.

---

## Migration list (code in the push; not applied on cloud by push)

1. `packages/db/prisma/migrations/20260912180000_epic4_store_foundation/migration.sql`
2. `packages/db/prisma/migrations/20260912210000_v92_playbook_framework/migration.sql`
3. `packages/db/prisma/migrations/20260912220000_v92_intelligence_layer/migration.sql`

`git push` does **not** run migrations.

---

## Known risks

| Risk | Note |
| :--- | :--- |
| Epic 4 rides along | Cannot push V9.2 without `85f5b94` on this branch |
| Push ≠ deploy | Cloud stays `e457d5a` until a separate deploy |
| Production Amazon key | Epic 4 API boot in `NODE_ENV=production` requires `AMAZON_CREDENTIAL_ENCRYPTION_KEY` |
| Live SP-API | Still `LIVE_NOT_RUN` |
| No V9.2 UI | Playbook / facts / recommendations are API-only |
| `STORE_SKU360_SOURCE` | Keep `scenario` on cloud |

---

## Pre-push commands (when executing later)

```powershell
cd E:\AiSecondBrain\vault\Work\Projects\CrossPilot
git status -sb
git log --oneline origin/master..HEAD
# expect only 85f5b94 and 54074d9
git push origin master
```

Do not `--force`. Do not retag `v9.1.0`.
