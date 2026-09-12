# CrossPilot 交接

**日期：** 2026-09-12  
**本文件：** 当前会话结束后的唯一项目交接入口。下一会话先读这里，再读治理文档。  
**不要把本文件当成 V9.1 Freeze 替代件。** Freeze 真相源仍是 `00_governance/V9_1_RELEASE_FREEZE.md`。

---

## 0. 现在停在哪

```text
CrossPilot V9.1
RELEASE VERIFIED & FROZEN
tag v9.1.0 = b3d5607

Epic 4  Real Store Data Foundation
DEPLOYED  (read-only Amazon)  ancestor 85f5b94
Live SP-API: LIVE_NOT_RUN

V9.2 Phase 1–5  Playbook + Intelligence
DEPLOYED
startRun = CREATED only
executeRun = Fact / Evidence / Research / VOC / Recommendation
Amazon Write: NOT IMPLEMENTED
EXECUTED.executionDispatched = false

Live:
origin/master = 云机 git = 09ad2c0
API dist built from 5ef0313 (09ad2c0 只改本文件)
http://116.198.230.217:2222
health 200  postgres/redis/milvus up
```

**不要自动开 V9.3 / Scheduler / Launch Center / Amazon Write。**  
**不要为了刷绿把 XYDC `5147` 改成 `5151`。**  
**不要 retag / force-push `v9.1.0`。**

Windows 本机 **只做开发**。不要在本机起 Postgres / API / Web / 浏览器验收。

---

## 1. 必须先读

1. 本文件 `docs/HANDOFF.md`
2. `docs/00_governance/V9_1_RELEASE_FREEZE.md`
3. `docs/00_governance/V92_DEPLOYMENT_PLAN.md`
4. `docs/00_governance/V92_PHASE1_IMPLEMENTATION_EVIDENCE.md`
5. `docs/00_governance/V92_PHASE2_5_IMPLEMENTATION_EVIDENCE.md`

`docs/00_governance/临时命令.txt` **不要 commit**。其中旧的 Epic 4 / Freeze 正文是历史，不要再执行一遍。

---

## 2. SHA 不要混

| 角色 | SHA | 说明 |
| :--- | :--- | :--- |
| V9.1 主体 | `c4704fd` | Epic 3 + Phase 1 / 2 / 2.1 / 2.2 / 3 |
| 验收时已部署应用 | `7c81411` | Final Browser Acceptance 热修 |
| Release docs / tag `v9.1.0` | `b3d5607` | 仅验收报告 |
| Freeze 声明 | `87d4eb2` | 治理文档 |
| 视觉系统（前端 only） | `e457d5a` | 现仍是 **Web** 构建基线 |
| Epic 4 | `85f5b94` | 只读 Amazon store foundation |
| V9.2 实现 | `54074d9` | Playbook + intelligence |
| RC 文档 | `eec21f5` | push/deploy 清单 |
| 指针同步 | `5ef0313` | evidence / authority map |
| **origin + 云机 git** | **`09ad2c0`** | 本交接记录 live SHA |

```text
Tag v9.1.0  →  b3d5607     不要 retag
Live git    →  09ad2c0
Live API    →  dist 来自 5ef0313 之后未再 nest build
Live Web    →  仍是 e457d5a 的 Next build（V9.2 无新 UI，未 reload web）
```

建议 RC tag（**未打**）：`v9.2.0-rc1` → `54074d9` 或当前 `09ad2c0`。等人工下令。

---

## 3. 运行时

| 项 | 值 |
| :--- | :--- |
| Host | `root@116.198.230.217`（`lavm-kx3e35xpar`） |
| 代码 | `/root/zls/project/CrossPilot` |
| Git | `origin https://gitee.com/zhang-liangshan/CrossPilot.git`，`master` |
| 公网 | http://116.198.230.217:2222 |
| PM2 | `crosspilot-api` :3001 / `crosspilot-web` :2222 / `crosspilot-worker` |
| API | `/api/v1`；Next rewrite `/api/:path*` → `127.0.0.1:3001` |
| 数据 | PG / Redis / Milvus 只听 `127.0.0.1` |
| 部署铁律 | 保留远程 `.env` 与未跟踪 `ecosystem.config.cjs`；**不要 commit 密钥** |

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=10 root@116.198.230.217
```

Demo：`POST /api/v1/auth/demo-login`；`demo@crosspilot.com` / `crosspilot123`。  
VIEWER：`viewer@crosspilot.com`（云库已 seed）。  
登录后落地：`/app/operations/today`。

云机 `.env` 在本次部署时补了 `AMAZON_CREDENTIAL_ENCRYPTION_KEY`（root + `apps/api/.env`）。**不要打印、不要入库。**  
`STORE_SKU360_SOURCE` 保持非 `prisma`（默认 scenario）。

备份：`/root/zls/backup/CrossPilot-pre-v92-202609121715`

---

## 4. 本轮已验证事实

### 4.1 产品

- V9.1 仍冻结。WF-05 / OppScore v1.0.0 / Provider / Tool Center **源码未改**。
- Epic 4：LWA + GET-only SP-API allowlist + 加密 refresh token。生产无 key 不能起 API。
- V9.2 Playbook：`POST /playbooks`、`POST /playbooks/:id/runs` → `{ runId, status: CREATED }`。
- V9.2 智能：`POST /playbook-runs/:id/execute` 才跑 Fact/Evidence/选品/VOC/建议。
- 建议生命周期到 `EXECUTED` **不**对外下发（`executionDispatched=false`）。
- 无 V9.2 UI。

### 4.2 云上冒烟（2026-09-12，机内 `127.0.0.1:2222`）

| 调用 | 结果 |
| :--- | :--- |
| `GET /api/v1/health` | 200，PG/Redis/Milvus up |
| `POST /auth/demo-login` | 201 |
| `GET /playbooks` `/facts` `/recommendations` `/commerce/accounts` `/products` | 200 |
| `POST /playbooks` → `POST /runs` | 201，`CREATED` + `runId` |

未跑：Live SP-API、OAuth、mock-sync demo、浏览器全站、`executeRun` 云上选品。

### 4.3 库表（additive，已在云库执行）

1. `20260912180000_epic4_store_foundation`
2. `20260912210000_v92_playbook_framework`
3. `20260912220000_v92_intelligence_layer`

回滚应用：`git checkout e457d5a` + 重建 API；**不要默认 drop 新表**。

---

## 5. 冻结（禁止顺手改）

```text
Sku360 / 异常检测 / 诊断 / 推荐打分
WF-05 9-step DAG + OCC updateMany
WorkflowIdempotency
Provider Framework / XYDC Mapper（5147 fixture / 5151 LIVE）
Opportunity Score v1.0.0
Approval ≠ Execute
Amazon Write API
```

---

## 6. Known Gaps（不是本轮 Blocker）

- Live SP-API：`LIVE_NOT_RUN`（无卖家授权）
- 无 V9.2 前端；视觉版 `e457d5a` 未再跑 26/26 浏览器矩阵
- VOC 是英文正则 + 调用方文本，不是 Firecrawl/SP-API 实评
- `playbook_run_id` / `evidence_ids` 无 DB FK
- `EXECUTED` 只记账
- Finances/Returns persist 仍不完整（Epic 4 已知）
- WF-05 日志里仍可能出现非 UUID `activeSkuId` P2003（V9.1 BA-002 类，不是 Playbook 回归）
- Launch Center / Scheduler / Amazon Write / 飞书：不要做
- 未打 `v9.2.0-rc1`

---

## 7. 不要入库

```text
.runtime-pg/
docs/_ops_*          （含 _ops_deploy_v92.sh、探针、demo 哈希）
docs/00_governance/临时命令.txt
.env / ecosystem.config.cjs
docs/40_mockData/
```

---

## 8. 下一会话（等人工选）

不要自己开：

1. 打 `v9.2.0-rc1`
2. 云上 `POST /playbook-runs/:id/execute` 选品/VOC 冒烟
3. V9.2 UI
4. Live Amazon OAuth（LWA 已配 key，仍需卖家同意）
5. 视觉版远程 Browser Acceptance
6. V9.3

默认：**停住，问人。**

---

## 9. 状态块（复制用）

```text
CrossPilot V9.1  FROZEN  v9.1.0=b3d5607
Epic 4           DEPLOYED  LIVE_NOT_RUN
V9.2 Phase 1-5   DEPLOYED  API only
Live git         09ad2c0 @ 116.198.230.217:2222
health           200
Do not start V9.3 / Scheduler / Amazon Write
Do not retarget XYDC 5147→5151
```
