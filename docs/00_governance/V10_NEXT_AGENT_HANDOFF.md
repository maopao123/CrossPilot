# V10 下一任 AI 交接（执行入口）

**日期：** 2026-09-12  
**本文件目的：** 换工具 / 新会话后只读这一份就能继续干活。不要翻聊天记录。  
**项目入口：** 先读 `docs/HANDOFF.md`，再读本文件。  
**人类意图：** Epic 2 已上线；后续工作交给下一任 AI。用户说「继续 / 接着干 / 做 Epic 3 / 全部做完」时 **直接执行 §6 Epic 3**，不必再问要不要开。

未授权：Epic 4 Shopify、Epic 5 切 WF-05 数据源、Epic 6 Action Write、真 Amazon Write。

---

## 0. 一句话状态

```text
V9.3 Mock Action  +  V10 Epic 1 多店表  +  V10 Epic 2 Ports/SimulatorAdapter
        ↓
下一件唯一授权工作 = Epic 3 Amazon read Adapter（复用 Epic 4 GET allowlist，仍只读）
```

| 项 | 值 |
| :--- | :--- |
| 实现 SHA（API/worker dist） | `6a9b636` |
| 文档钉死 SHA（origin / 云机 git） | `8d30554` |
| 云机应用 | `/root/zls/project/CrossPilot` @ `root@116.198.230.217` |
| 公网 | http://116.198.230.217:2222 |
| 本机 | Windows **只写代码**。不要起 Postgres / API / Web / 浏览器验收 |

---

## 1. 开工前必读（按这个顺序，不要全库乱翻）

1. 本文件  
2. `docs/HANDOFF.md`（运行时、铁律、SHA 表）  
3. `docs/00_governance/V10_EPIC2_PORTS_RELEASE_REPORT.md`  
4. `docs/00_governance/V10_EPIC1_FOUNDATION_RELEASE_REPORT.md`  
5. `docs/00_governance/V10_EPIC0_IMPACT_ANALYSIS.md` §8 Phase 3 + §10 史诗顺序  
6. `docs/00_governance/V10_COMMERCE_OS_ARCHITECTURE.md` §3 Ports + §3.1 Amazon Adapter  
7. 代码：下面 §4 文件地图  

`docs/00_governance/临时命令.txt` **不要 commit、不要当现行命令执行**（里面是旧 Epic 4 正文）。

---

## 2. 铁律（V10 任何 Epic 都不得破）

```text
v9.1.0 不要 retag / force-push
WF-05 DAG / 公式 / 11 项门禁         不动
Recommendation 状态机                不动
PlannedAction 状态机                 不动
  CREATED → WAITING_APPROVAL → APPROVED → EXECUTING → SUCCESS|FAILED
action_type 六个名字                 不动
  DECREASE_BID / UPDATE_INVENTORY / GENERATE_REPORT
  STOP_CAMPAIGN / CHANGE_PRICE / DELETE_LISTING
Simulator 引擎 seed / 起始日 2026-09-01 / 初始库存 500/400/300 / 事件模板文案
STORE_SKU360_SOURCE 默认非 prisma
Approval ≠ Execute
Amazon Write 默认无；写端口 WRITE_FORBIDDEN
XYDC 夹具 5147 不要改成 5151
不要给 Store/Sku/Campaign 加 amazonId / shopifyId / shopifyVariantId
不要删 Sku.asin / Campaign.campaignIdAmazon / Competitor.asin
旧 packages/actions ActionRouter 不要合并进 PlannedAction
不要再建一套 mock-data-service
不要把 XYDC 5147→5151
```

Windows 本机不跑库。云机部署必须保留远程 `.env` 与未跟踪 `ecosystem.config.cjs`。  
`pm2 reload` **一次只能带一个进程名**：先 api，再 worker。Web 无 UI 改动就不要 rebuild。

---

## 3. 运行时（下一任会用到的）

| 项 | 值 |
| :--- | :--- |
| SSH | `ssh -o BatchMode=yes -o ConnectTimeout=10 root@116.198.230.217` |
| Git | `origin https://gitee.com/zhang-liangshan/CrossPilot.git`，`master` |
| 云路径 | `/root/zls/project/CrossPilot` |
| PM2 | `crosspilot-api` :3001 / `crosspilot-web` :2222 / `crosspilot-worker` |
| API | `/api/v1`；Next rewrite `/api/:path*` → `127.0.0.1:3001` |
| PG | docker `industry_postgres`，库 `crosspilot`，用户 `postgres` |
| Demo | `POST /api/v1/auth/demo-login` `{"role":"OWNER"}` |
| 登录包装 | 响应是 `{ data, meta, requestId }`，token 在 `data.token`，workspace 在 `data.activeWorkspace.id` |
| Header | 必须带 `Authorization: Bearer …` 和 `x-workspace-id` |
| VIEWER | `viewer@crosspilot.com`（`demo-login role=VIEWER` **不能**当 VIEWER 验收） |
| 模拟器 | `SIMULATOR_ENABLED=true` 在 worker `.env`；worker 每 60 分钟 tick 1 模拟日 |

云上 `.env` 有 `AMAZON_CREDENTIAL_ENCRYPTION_KEY`。**不要打印、不要写进文档、不要 commit。**  
查库：

```bash
docker exec industry_postgres psql -U postgres -d crosspilot -c "select ..."
```

不要 `grep` 出整份 `.env`。查 `STORE_SKU360_SOURCE=prisma` 用文件名过滤，命中则 FATAL。

---

## 4. 已经落地的代码（不要重做）

### Epic 1 — 多店地基（`2a5b305`）

- 表：`stores`、`channel_identities`（空表）、`commerce_accounts.store_id` **UNIQUE NOT NULL**
- 已删：`unique(workspaceId, provider)`
- 方案 A：1 Store ↔ 1 CommerceAccount
- 回填：每个旧账户 1 个 Store。云上现有两行：
  - `simulator-amazon` → Store `Simulator Amazon` `platform=simulator`
  - `simulator-shopify` → Store `Simulator Shopify` `platform=simulator`
- Helper：`packages/db/src/commerce/ensure-store-account.ts`
- 迁移 SQL：`packages/db/prisma/migrations/20260914000000_v10_epic1_store_foundation/migration.sql`（已在云库执行，**不要再跑一遍当新迁移**）
- 已知限制：`ensureStoreBoundAccount('shopify')` 会找到第一条 shopify；第二店要调用方自己 `store.create`

### Epic 2 — Ports + SimulatorAdapter（`6a9b636`）

| 文件 | 职责 |
| :--- | :--- |
| `packages/domain/src/commerce-ports/` | Catalog/Order/Inventory/Ads/Profit 接口 + `CommerceContext` |
| `packages/db/src/commerce/simulator-adapter.ts` | Simulator 实现；`tick()` 包现有引擎+Store |
| `packages/db/src/commerce/resolve-adapter.ts` | **只登记 simulator**；`amazon`/`shopify` → `PROVIDER_UNAVAILABLE` |
| `apps/api/src/modules/simulator/simulator.service.ts` | `tick()` 走 `new SimulatorAdapter(prisma).tick()` |
| `apps/worker/src/processors/simulator-tick.processor.ts` | worker sweep 走 Adapter |
| `packages/db/src/simulator/simulator-store.ts` | 持久化内部；`ensureFixtures` 已不用 `workspaceId_provider` |

写端口现状：`updateProduct` / `decreaseBid` **返回** `{ ok:false, code: WRITE_FORBIDDEN }`（不是抛给 Action 层；Action execute 仍走 Mock）。

测试：

```text
pnpm --filter @crosspilot/domain test -- --testPathPattern=commerce-ports
pnpm --filter @crosspilot/api test -- --testPathPattern="v10-epic2-ports|simulator.spec|v10-epic1-foundation|v93-action-layer|epic4-commerce-store"
```

云上最近一次 Adapter tick：`POST /simulator/tick` 201，dayIndex 11→12（2026-09-13）。worker 会继续往前走，**不要**为了「对齐文档里的 day12」去 `reset`。

### 两条经营世界（不要混）

| 世界 | 谁写 | 谁读 | 用途 |
| :--- | :--- | :--- | :--- |
| Scenario | 内存 `ScenarioGenerator` | Overview、**默认 WF-05** | V9.1 演示诊断 |
| Simulator | worker/API tick → Prisma | `/orders` `/inventory` ads、Today 部分指标 | V9.2 mock 店 |
| Amazon live | `POST /commerce/amazon/sync` | 几乎未被 WF-05 使用 | Epic 4 只读；**LIVE_NOT_RUN**（无卖家授权） |

---

## 5. 不要入库

```text
.runtime-pg/
docs/_ops_*          （部署脚本、探针、epic1/epic2 smoke SQL/py 都在这里）
docs/00_governance/临时命令.txt
.env / ecosystem.config.cjs
```

产品代码、治理报告、本文件、`docs/HANDOFF.md` **要入库**。

---

## 6. 授权下一任执行：Epic 3 Amazon read Adapter

权威来源：Epic 0「Epic 3 = Amazon read Adapter（复用 Epic 4）」+ 架构 §3.1。  
**不是** Shopify，**不是** Action Write，**不是** 切 `STORE_SKU360_SOURCE=prisma`。

### 6.1 目标

```text
resolveCommerceAdapter(prisma, 'amazon')
        ↓
AmazonAdapter  implements Catalog/Order/Inventory/Ads/Profit
        ↓
内部调用已有 AmazonProvider + GET allowlist + CommerceAccount 凭证
        ↓
映射到 CanonicalProduct/Order/Inventory/… + 可选写入 ChannelIdentity
        ↓
写端口仍然 WRITE_FORBIDDEN
```

业务层（WF-05 / Playbook / Action Planner）**继续不** `import` SP-API。

### 6.2 做

1. 新增 `AmazonAdapter`（建议 `packages/db/src/commerce/amazon-adapter.ts` 或 `packages/integrations` 旁；**实现 Port 接口**，运输仍用 `AmazonProvider`）。  
2. 改 `resolveCommerceAdapter`：`platform==='amazon'` 返回它；`shopify` 仍 `PROVIDER_UNAVAILABLE`。  
3. 读路径复用：
   - `packages/integrations/src/provider-framework/providers/amazon/amazon.provider.ts`
   - `amazon.allowlist.ts`（GET only）
   - `amazon.mapper.ts` / `MockAmazonProvider`
   - `apps/api/src/modules/commerce-store/commerce-store.service.ts` 现有 sync（不要重写一条同步引擎）
4. `CommerceContext` 继续必带 `workspaceId + storeId + traceId`。用 `storeId` 找 `CommerceAccount`（`storeId` unique）。  
5. Canonical 投影：ASIN / seller SKU 放 `identities[]`，**不要**在 Canonical 或 Store 上加 `amazonId`。  
6. 同步时 **可以** `channel_identities` insert（表已在 Epic 1）；**不要删** `Sku.asin`。  
7. 写端口 `updateProduct` / `decreaseBid` 保持 `WRITE_FORBIDDEN`。  
8. 无 refresh token：读端口失败要明确 `AUTH_REQUIRED` / `PROVIDER_UNAVAILABLE`，禁止偷偷 mock 进生产（`NODE_ENV=production` 下 mock sync 已 403 `WRITE_FORBIDDEN`，保持）。  
9. 测试：  
   - MockAmazonProvider → Canonical（listings/orders/inventory）  
   - `resolveCommerceAdapter(..., 'amazon')` 不再抛 `PROVIDER_UNAVAILABLE`  
   - `resolveCommerceAdapter(..., 'shopify')` 仍抛  
   - 写端口仍 `WRITE_FORBIDDEN`  
   - **回归** `simulator.spec` / `v10-epic1` / `v10-epic2` / `v93-action-layer` / `epic4-commerce-store`  
10. 文档：`docs/00_governance/V10_EPIC3_AMAZON_READ_ADAPTER_REPORT.md`（Schema/行为/验证/限制）。更新 `docs/HANDOFF.md`。  
11. 提交、push `master`、云机 pull、**无新表就不要乱跑 SQL**、rebuild api+worker、分别 `pm2 reload`、保留 `.env`。

可选（有则更好，没有也不要借机做 UI）：

- `GET /commerce/stores` 或 `GET /stores`：按 workspace 列 Epic 1 的 Store（只读）。  
- `POST /sync/jobs { storeId, capability }` 作为现有 `POST /commerce/amazon/sync` 的别名。  
- **禁止**用新路径替换 `/actions` 或 `/operations/today`。

### 6.3 不做

```text
Shopify Adapter / webhook / GraphQL
Amazon Ads 真写 / SP-API POST/PUT/DELETE
改 amazon.allowlist 放行写
改 Action execute() 绑定 AmazonAdsTool     ← 那是 Epic 6
改 PlannedAction 状态机 / action_type
改 WF-05 公式；把 STORE_SKU360_SOURCE 改成 prisma
删 Sku.asin / Campaign.campaignIdAmazon
给 Store 加 amazonId
重构 Simulator 引擎
打 release tag / 配 LLM key
UI 多店选择器（架构写明本阶段不开发前端）
```

### 6.4 验收（Epic 3 完成才算完成）

| Case | 标准 |
| :--- | :--- |
| A | `resolveCommerceAdapter('amazon')` 返回 AmazonAdapter |
| B | Mock/夹具路径：listings → CanonicalProduct（identities 含 asin，本体无 asin 字段） |
| C | 写端口 `WRITE_FORBIDDEN` |
| D | Simulator 两店 + `POST /simulator/tick` 仍绿 |
| E | V9.3 Action：`plan-acos` 仍可 `WAITING_APPROVAL` → `APPROVED` → Mock `SUCCESS` |
| F | 生产无卖家授权时：**不要假装 LIVE 成功**。标 `LIVE_NOT_RUN` / `AUTH_REQUIRED` |
| G | `STORE_SKU360_SOURCE=prisma` 未出现 |
| H | 发布报告 + HANDOFF SHA 钉死 |

Live SP-API 没有卖家授权是 **已知限制**，不是 Epic 3 失败。用 MockAmazonProvider + 现有 epic4 单测证明映射。禁止为了刷绿对生产 `useMock: true`。

### 6.5 建议实现顺序

```text
1. 红：v10-epic3 测试（resolve amazon、WRITE_FORBIDDEN、mock listings→Canonical）
2. 绿：AmazonAdapter + resolve 登记
3. 把现有 sync 读结果接到 Port（能复用 commerce-store.service 的 mapping 就复用）
4. 回归 simulator / epic1 / epic2 / v93 / epic4
5. 报告 → commit → push → 云 rebuild api+worker → 冒烟 → 钉 SHA
6. 停。不要顺手开 Shopify / Action Write
```

---

## 7. 再后面的史诗（本文件不授权）

```text
Epic 4  Shopify read Adapter + webhooks
Epic 5  WF-05 读 Canonical（开关，公式不动）
Epic 6  ToolResolver + 可选 Write binding（默认关）
```

禁止跳到 Epic 6。禁止在 Epic 3 里夹带 Shopify。

---

## 8. 部署套路（云机）

```bash
# 1) 本机 commit + git push origin master
# 2) 保留 env（脚本里必须有）：root/.env、apps/api/.env、apps/worker/.env、
#    packages/db/.env、ecosystem.config.cjs
# 3) git fetch && git checkout -B master origin/master && 拷回 env
# 4) 若 .env 出现 STORE_SKU360_SOURCE=prisma → exit 2
# 5) pnpm install --frozen-lockfile
# 6) prisma generate
# 7) 无新 migration 就不要 prisma db execute
# 8) build: shared → integrations → ai → domain → db → tool-platform → actions → api → worker
# 9) pm2 reload crosspilot-api --update-env
#    sleep 3
#    pm2 reload crosspilot-worker --update-env
# 10) 冒烟：/api/v1/health 、demo-login、GET /commerce/accounts、GET /simulator/state
```

备份目录惯例：`/root/zls/backup/CrossPilot-pre-<epic>-<YYYYMMDDHHMM>`。  
Epic 2 备份：`/root/zls/backup/CrossPilot-pre-v10e2-202609122059`。

PowerShell 注意：当前 Grok/部分 shell **不支持** `&&`，用 `;`。远程 bash 脚本可以 `set -eu` + `&&`。Windows 写的 sh 先 `sed -i 's/\r$//'`。

---

## 9. 给下一任的「不要猜」清单

| 问题 | 答案 |
| :--- | :--- |
| unique 用哪套？ | 方案 A：`commerce_accounts.store_id` UNIQUE。不要改回 workspace+provider |
| Simulator 两个 provider 会不会并店？ | 不会。`simulator-amazon` / `simulator-shopify` 必须两行 Store |
| Action 还走谁？ | Mock Executor。Epic 3 **不要**改 `executeMockAction` |
| WF-05 读哪？ | 默认 Scenario 内存世界。不要切 prisma |
| 有没有 ChannelIdentity 数据？ | 表在，行数 0。Epic 3 同步时可以开始写，不要一次性回填所有历史 ASIN 除非很小且可逆 |
| Order/PlannedAction 有 storeId 列吗？ | **没有**。Epic 3 非必须加；要加必须 additive nullable，禁止 NOT NULL 无回填 |
| 云上有真 Amazon 账户吗？ | 没有。只有两条 simulator 账户 |
| 本机能跑 API 吗？ | 不要。验收在 116.198.230.217 |
| git 往哪推？ | `origin master`。CrossPilot 惯例就是 master，不要另开没人看的分支除非人类要求 |
| 提交信息格式 | `feat(commerce): ...` / `docs: pin V10 Epic 3 live SHA <short>` |

---

## 10. 状态块（复制到下一会话开头）

```text
CrossPilot V9.1     FROZEN   v9.1.0 = b3d5607
Epic 4 Amazon read  DEPLOYED LIVE_NOT_RUN
V9.2 / V9.2.1 / V9.3 SHIPPED  Action = Mock only
V10 Epic 0          DONE     architecture + impact
V10 Epic 1          SHIPPED  2a5b305  Store + ChannelIdentity
V10 Epic 2          SHIPPED  6a9b636  Ports + SimulatorAdapter
Live git            8d30554  (docs pin; API dist = 6a9b636)
Live                http://116.198.230.217:2222  health 200
Next                Epic 3 Amazon read Adapter  ← 用户说继续就做
Stop after Epic 3   不要开 Shopify / Action Write / WF-05 切源
Do not              retag v9.1.0 ; XYDC 5147→5151 ; STORE_SKU360_SOURCE=prisma
```
