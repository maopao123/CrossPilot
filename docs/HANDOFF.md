# CrossPilot 交接

**日期：** 2026-09-12（更新：Commerce Simulator 部署后）
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

Commerce Simulator（Epic 4 mock data，docs/40_mockData）
DEPLOYED & LIVE SIMULATING  93de779
世界状态 day 7（2026-09-08），worker 每 60 分钟自动推进 1 模拟日
云库实测：226 sim orders / 1 active event / 42 channel metrics / 29 sim reviews

Live:
origin/master = 云机 git = 93de779
http://116.198.230.217:2222
health 200  postgres/redis/milvus up
```

**不要自动开 V9.3 / Launch Center / Amazon Write / 产品 Scheduler。**
**不要为了刷绿把 XYDC `5147` 改成 `5151`。**
**不要 retag / force-push `v9.1.0`。**
**不要改 simulator 引擎的种子/起始日/初始库存（确定性会被测试 gold case 锁死）。**

Windows 本机 **只做开发**。不要在本机起 Postgres / API / Web / 浏览器验收。

---

## 1. 必须先读

1. 本文件 `docs/HANDOFF.md`
2. `docs/00_governance/V9_1_RELEASE_FREEZE.md`
3. `docs/00_governance/V92_DEPLOYMENT_PLAN.md`
4. `docs/40_mockData/CrossPilot_Commerce_Simulator_V1.0.md`（§15 实现决策 = Simulator 权威说明）

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
| 指针同步 | `5ef0313` | evidence / authority map |
| 旧交接记录 | `09ad2c0` | 仅 docs |
| **origin + 云机 git（当前 live）** | **`93de779`** | Commerce Simulator 全套 + 本文件 |

```text
Tag v9.1.0  →  b3d5607     不要 retag
Live git    →  93de779
Live API    →  dist 来自 93de779（nest build 于部署时）
Live Web    →  仍是 e457d5a 的 Next build（本轮无前端改动，未 rebuild web）
```

建议 RC tag（**未打**）：`v9.2.0-rc1` → `54074d9`。等人工下令。

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
| 数据 | PG `industry_postgres` 容器 :5432（库 `crosspilot`）/ Redis / Milvus 只听 `127.0.0.1` |
| 部署铁律 | 保留远程 `.env` 与未跟踪 `ecosystem.config.cjs`；**不要 commit 密钥** |

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=10 root@116.198.230.217
```

Demo：`POST /api/v1/auth/demo-login` `{"role":"OWNER"}`；`demo@crosspilot.com` / `crosspilot123`。
注意 API 守卫链要 **`x-workspace-id` header**（demo-login 返回 `activeWorkspace.id`）。
VIEWER：`viewer@crosspilot.com`（云库已 seed）。
登录后落地：`/app/operations/today`。

云机 `.env` 有 `AMAZON_CREDENTIAL_ENCRYPTION_KEY`（root + `apps/api/.env`）与 `SIMULATOR_ENABLED=true`（`apps/worker/.env`）。**不要打印、不要入库。**
`STORE_SKU360_SOURCE` 保持非 `prisma`（默认 scenario）。

备份：`/root/zls/backup/CrossPilot-pre-v92-202609121715`、`/root/zls/backup/CrossPilot-pre-sim-*`

---

## 4. 本轮已验证事实

### 4.1 产品

- V9.1 仍冻结。WF-05 / OppScore v1.0.0 / Provider / Tool Center **源码未改**。
- Epic 4：LWA + GET-only SP-API allowlist + 加密 refresh token。生产无 key 不能起 API。
- V9.2 Playbook：`POST /playbooks`、`POST /playbooks/:id/runs` → `{ runId, status: CREATED }`。
- V9.2 智能：`POST /playbook-runs/:id/execute` 才跑 Fact/Evidence/选品/VOC/建议。
- 建议生命周期到 `EXECUTED` **不**对外下发（`executionDispatched=false`）。
- 无 V9.2 UI。
- **Commerce Simulator V1**（新）：
  - 引擎 `packages/domain/src/simulator/`（纯 TS，确定性 seeded RNG，起始日 2026-09-01，初始库存 500/400/300，被测试 gold case 锁死）
  - 落库 `packages/db/src/simulator/simulator-store.ts`（`tickSimulatorWorkspace`，乐观锁防重，同日重放 409）
  - 端点 `POST /api/v1/simulator/tick | advance | reset`、`GET /api/v1/simulator/state`
  - worker BullMQ repeatable job 每 60 分钟自动推进（`SIMULATOR_TICK_INTERVAL_MINUTES` 可调）

### 4.2 云上冒烟（2026-09-12，机内 `127.0.0.1:3001`）

| 调用 | 结果 |
| :--- | :--- |
| `GET /api/v1/health` | 200 |
| `GET /api/v1/simulator/state`（无 auth） | 401（路由已注册） |
| `POST /simulator/reset` → `advance {days:7}` | 200，day 7，末日产 36 订单/5 评论/3 广告行/6 漏斗行 |
| `GET /simulator/state` | 200，活跃事件 RETURN_SPIKE（MTH-GREEN-001） |
| worker 日志 | `Simulator scheduler enabled: 1 simulated day every 60 minute(s)` |
| 云库实测 | 226 sim orders / 1 event / 42 channel metrics / 29 sim reviews，隔离标记正确 |

未跑：Live SP-API、OAuth、浏览器全站、`executeRun` 云上选品、Simulator 前端页面（不存在，用 API + 现有页面看数据）。

### 4.3 库表（additive，已在云库执行）

1. `20260912180000_epic4_store_foundation`
2. `20260912210000_v92_playbook_framework`
3. `20260912220000_v92_intelligence_layer`
4. `20260913000000_commerce_simulator`（simulation_states / simulation_events / channel_daily_metrics）

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
Simulator 引擎确定性参数（seed / 起始日 / 初始库存 / 事件模板文案）
Simulator 数据隔离标记（source_provider='simulator' / 'sim-' reviewer / 'SIM-' campaign）
```

---

## 6. Known Gaps（不是本轮 Blocker）

- Live SP-API：`LIVE_NOT_RUN`（无卖家授权）
- 无 V9.2 UI；无 Simulator 专属控制台页面（计划内 V1 边界）
- VOC 是英文正则 + 调用方文本，不是 Firecrawl/SP-API 实评
- `playbook_run_id` / `evidence_ids` 无 DB FK
- `EXECUTED` 只记账
- Finances/Returns persist 仍不完整（Epic 4 已知）
- WF-05 日志里仍可能出现非 UUID `activeSkuId` P2003（V9.1 BA-002 类，不是 Playbook 回归）
- Launch Center / 产品 Scheduler / Amazon Write / 飞书：不要做
- 未打 `v9.2.0-rc1`
- Simulator V1 未做：Customer 模型、TikTok/eBay/Walmart 渠道、真实 SP-API/Shopify Adapter、LLM 生成评论文案（当前为模板）
- 本机（Windows）`pnpm -r run test` 中 `packages/integrations` provider-framework 测试红：期望 fixture 5147、实取 5151（XYDC live 数据漂移），**环境敏感、预先存在**，不是回归

---

## 7. 不要入库

```text
.runtime-pg/
docs/_ops_*          （含 _ops_deploy_v92.sh、_ops_deploy_simulator.sh、
                      _ops_simulator_bootstrap.sh、探针、demo 哈希）
docs/00_governance/临时命令.txt
.env / ecosystem.config.cjs
```

**例外（2026-09-12 起）：** `docs/40_mockData/CrossPilot_Commerce_Simulator_V1.0.md` 已随 `93de779` 入库 —— 该目录原在"不要入库"清单，因 Simulator 已成为正式特性、文档 §15 为权威实现说明，故移入版本管理。后续 mock 实验性产物仍不要入库。

---

## 8. 运维操作手册

### 8.1 部署（有代码更新时）

```bash
# 本机：commit + push origin/master 后
scp docs/_ops_deploy_simulator.sh root@116.198.230.217:/tmp/
ssh root@116.198.230.217 "bash /tmp/_ops_deploy_simulator.sh"
# 备份 → fetch/checkout → 保留 .env → install → generate → apply 迁移 → 全量 build
# → pm2 reload crosspilot-api crosspilot-worker（注意：pm2 reload 传两个名字只生效第一个，
# worker 要单独再 reload 一次）
```

### 8.2 重建 / 推进模拟世界

```bash
ssh root@116.198.230.217 "bash /tmp/crosspilot_sim_bootstrap.sh 7"
# 幂等：置 SIMULATOR_ENABLED=true → reload worker → demo-login → reset → advance N 天
# 服务器脚本源文件在仓库 docs/_ops_simulator_bootstrap.sh（不入库）
```

### 8.3 观察模拟状态

```bash
ssh root@116.198.230.217 "docker exec industry_postgres psql -U postgres -d crosspilot -c \
  \"select day_index, sim_date from simulation_states;\""
pm2 logs crosspilot-worker   # 找 Simulator scheduler / tick 日志
```

---

## 9. 下一会话（等人工选）

不要自己开：

1. 打 `v9.2.0-rc1`
2. 云上 `POST /playbook-runs/:id/execute` 选品/VOC 冒烟
3. V9.2 UI
4. Live Amazon OAuth（LWA 已配 key，仍需卖家同意）
5. 视觉版远程 Browser Acceptance
6. Simulator 前端控制台页（看 simDate / 事件流 / 漏斗）
7. Simulator 节奏调参（`SIMULATOR_TICK_INTERVAL_MINUTES`，改完 `pm2 reload crosspilot-worker --update-env`）
8. Simulator → Agent 联动（Epic 4.5：自动分析销售 / 发现问题 / 运营建议）
9. V9.3

默认：**停住，问人。**

---

## 10. 状态块（复制用）

```text
CrossPilot V9.1  FROZEN  v9.1.0=b3d5607
Epic 4           DEPLOYED  LIVE_NOT_RUN
V9.2 Phase 1-5   DEPLOYED  API only
Simulator        DEPLOYED & LIVE  day7 @ 60min/tick  seed=93de779
Live git         93de779 @ 116.198.230.217:2222
health           200
Do not start V9.3 / Launch Center / Amazon Write / product Scheduler
Do not retarget XYDC 5147→5151
```
