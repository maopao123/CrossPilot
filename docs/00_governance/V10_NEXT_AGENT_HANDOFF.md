# V10 下一任 AI 交接（执行入口）

**日期：** 2026-09-12（Epic 3 发货后更新）
**本文件目的：** 换工具 / 新会话后只读这一份就能继续干活。不要翻聊天记录。
**项目入口：** 先读 `docs/HANDOFF.md`，再读本文件。
**人类意图：** Epic 1/2/3 已上线。**Epic 4 未授权**：用户说「做 Epic 4 / Shopify / 继续」时直接执行 §6 Epic 4；没说就停，不要主动开工。

未授权：Epic 5 切 WF-05 数据源、Epic 6 Action Write、真 Amazon Write。

---

## 0. 一句话状态

```text
V9.3 Mock Action  +  V10 Epic 1 多店表  +  Epic 2 Ports/SimulatorAdapter
        +  Epic 3 Amazon read Adapter（6c4d169 + 复查修复 71d405f，已部署）
        ↓
下一件授权工作 = Epic 4 Shopify read Adapter（等用户发话）
```

| 项 | 值 |
| :--- | :--- |
| 实现 SHA（API/worker dist） | `71d405f` |
| 云机应用 | `/root/zls/project/CrossPilot` @ `root@116.198.230.217` |
| 公网 | http://116.198.230.217:2222 |
| 本机 | Windows **只写代码**。不要起 Postgres / API / Web / 浏览器验收 |

---

## 1. 开工前必读（按这个顺序，不要全库乱翻）

1. 本文件
2. `docs/HANDOFF.md`（运行时、铁律、SHA 表）
3. `docs/00_governance/V10_EPIC3_AMAZON_READ_ADAPTER_REPORT.md`
4. `docs/00_governance/V10_EPIC2_PORTS_RELEASE_REPORT.md`
5. `docs/00_governance/V10_EPIC1_FOUNDATION_RELEASE_REPORT.md`
6. `docs/00_governance/V10_COMMERCE_OS_ARCHITECTURE.md` §3 Ports + §3.2 Shopify Adapter
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
Amazon/Shopify Write 默认无；写端口 WRITE_FORBIDDEN
XYDC 夹具 5147 不要改成 5151
不要给 Store/Sku/Campaign 加 amazonId / shopifyId / shopifyVariantId
不要删 Sku.asin / Campaign.campaignIdAmazon / Competitor.asin
旧 packages/actions ActionRouter 不要合并进 PlannedAction
不要再建一套 mock-data-service
不要把 XYDC 5147→5151
AmazonAdapter fail-closed：无 LWA_REFRESH / 无 sellingPartnerId 必须显式
  AUTH_REQUIRED；禁止给它加自动 mock fallback
ProviderCredential AES-GCM key 推导顺序冻结（production 必须
  AMAZON_CREDENTIAL_ENCRYPTION_KEY；非 prod 依次 fallback JWT_SECRET / dev key）
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

- 表：`stores`、`channel_identities`、`commerce_accounts.store_id` **UNIQUE NOT NULL**；方案 A 1 Store ↔ 1 CommerceAccount
- Helper：`packages/db/src/commerce/ensure-store-account.ts`
- 已知限制：`ensureStoreBoundAccount('shopify')` 会找到第一条 shopify；第二店要调用方自己 `store.create`

### Epic 2 — Ports + SimulatorAdapter（`6a9b636`）

- `packages/domain/src/commerce-ports/`：Catalog/Order/Inventory/Ads/Profit 接口 + `CommerceContext`（`CommercePortError` 现带可选 `retryable`）
- `packages/db/src/commerce/simulator-adapter.ts`；`resolve-adapter.ts` 登记 simulator
- 写端口 `updateProduct` / `decreaseBid` **返回** `{ ok:false, code: WRITE_FORBIDDEN }`

### Epic 3 — Amazon read Adapter（`6c4d169`）

| 文件 | 职责 |
| :--- | :--- |
| `packages/db/src/commerce/amazon-adapter.ts` | `AmazonAdapter implements CommerceAdapter`；bind → LWA 凭证 → `AmazonProvider` GET allowlist → Canonical |
| `packages/integrations/src/provider-framework/secrets/provider-credential-crypto.ts` | ProviderCredential AES-GCM 的**唯一**实现（Epic 3 从 api 移来）；`apps/api/.../credential-crypto.ts` 只是转发壳，导出不变 |
| `resolve-adapter.ts` | `amazon` → `AmazonAdapter`；`shopify` 仍 `PROVIDER_UNAVAILABLE` |
| `@crosspilot/db` 依赖 | 新增 `@crosspilot/integrations` + `@crosspilot/shared`（worker 早已依赖 integrations） |

读端口行为与错误矩阵（RESOURCE_NOT_FOUND / PROVIDER_UNAVAILABLE / AUTH_REQUIRED / TOKEN_EXPIRED / PROVIDER_RATE_LIMIT）：见 `V10_EPIC3_AMAZON_READ_ADAPTER_REPORT.md` §2。
ads / profit 读返回 `[]`（allowlist 支撑不了，不假装）。mock 只能经 `options.transport` 注入，生产自动 fail-closed。

### 两条经营世界（不要混）

| 世界 | 谁写 | 谁读 | 用途 |
| :--- | :--- | :--- | :--- |
| Scenario | 内存 `ScenarioGenerator` | Overview、**默认 WF-05** | V9.1 演示诊断 |
| Simulator | worker/API tick → Prisma | `/orders` `/inventory` ads、Today 部分指标 | V9.2 mock 店 |
| Amazon live | `POST /commerce/amazon/sync` 或 AmazonAdapter | 几乎未被 WF-05 使用 | Epic 3 只读；**LIVE_NOT_RUN**（无卖家授权） |

云上最近一次验证：day 12（2026-09-13）。worker 会继续往前走，**不要**为了「对齐文档里的 day」去 `reset`。

---

## 5. 不要入库

```text
.runtime-pg/
docs/_ops_*          （部署脚本、探针、smoke SQL/py 都在这里）
docs/00_governance/临时命令.txt
.env / ecosystem.config.cjs
```

产品代码、治理报告、本文件、`docs/HANDOFF.md` **要入库**。

---

## 6. 授权下一任执行：Epic 4 Shopify read Adapter

**前提：用户明确说「做 Epic 4 / Shopify / 继续」。** 权威来源：Epic 0 史诗顺序 + 架构 §3.2。
**不是** Action Write，**不是** 切 `STORE_SKU360_SOURCE=prisma`，**不是** Amazon 写。

### 6.1 目标

```text
resolveCommerceAdapter(prisma, 'shopify')
        ↓
ShopifyAdapter implements Catalog/Order/Inventory/Ads/Profit
        ↓
内部调用 Shopify Admin API（REST/GraphQL）+ Store 绑定凭证
        ↓
映射到 Canonical + ChannelIdentity（GID → ChannelIdentity）
        ↓
写端口仍然 WRITE_FORBIDDEN
```

业务层**继续不** `import` Shopify SDK。模仿 `amazon-adapter.ts` 的结构：bind（store workspace/platform/account/凭证）→ transport 注入缝 → 错误显式化。

### 6.2 做

1. 新增 `ShopifyAdapter`（`packages/db/src/commerce/shopify-adapter.ts`），实现 Port 接口。
2. `resolveCommerceAdapter`：`shopify` 返回它。
3. Webhook（若本轮做）：验签 + `X-Shopify-Webhook-Id` 幂等，cursor 记 SyncRun；**禁止无游标死循环**。
4. Canonical 投影：GID / variantId 放 `identities[]`，**不要**在 Canonical 或 Store 上加 `shopifyId` / `shopifyVariantId`。
5. 同步时可写 `channel_identities`；**不要删** `Sku.asin`。
6. 写端口保持 `WRITE_FORBIDDEN`；无凭证时读端口显式 `AUTH_REQUIRED`，禁止偷偷 mock 进生产。
7. 测试：MockTransport → Canonical；resolve 不再抛；simulator / epic1 / epic2 / **epic3** / v93 / epic4 全回归。
8. 文档：`V10_EPIC4_SHOPIFY_READ_ADAPTER_REPORT.md`，更新 `docs/HANDOFF.md`。
9. 提交、push、云机 pull、rebuild api+worker、分别 `pm2 reload`、保留 `.env`、钉 SHA。

### 6.3 不做

```text
Amazon Ads 真写 / SP-API POST/PUT/DELETE / 改 amazon.allowlist
改 Action execute() 绑定真工具                ← 那是 Epic 6
改 PlannedAction 状态机 / action_type
改 WF-05 公式；把 STORE_SKU360_SOURCE 改成 prisma
删 Sku.asin / Campaign.campaignIdAmazon
给 Store 加 shopifyId
重构 Simulator / AmazonAdapter 引擎
打 release tag / 配 LLM key / UI 多店选择器
```

### 6.4 验收方向

`resolve('shopify')` 返回 ShopifyAdapter；Mock 路径 listings/orders → Canonical；写端口 `WRITE_FORBIDDEN`；Simulator 两店 + tick 仍绿；V9.3 Action Mock 路径仍绿；无凭证时显式 `AUTH_REQUIRED`；报告 + HANDOFF SHA 钉死。

---

## 7. 再后面的史诗（本文件不授权）

```text
Epic 5  WF-05 读 Canonical（开关，公式不动）
Epic 6  ToolResolver + 可选 Write binding（默认关）
```

禁止跳到 Epic 6。禁止在 Epic 4 里夹带 Amazon 写。

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

参照脚本：`docs/_ops_deploy_v10_epic3.sh`（= epic2 脚本 sed v10e2→v10e3；不入库）。
备份目录惯例：`/root/zls/backup/CrossPilot-pre-<epic>-<YYYYMMDDHHMM>`。
Epic 3 备份：`/root/zls/backup/CrossPilot-pre-v10e3-202609122133`。

PowerShell 注意：当前 Grok/部分 shell **不支持** `&&`，用 `;`。远程 bash 脚本可以 `set -eu` + `&&`。Windows 写的 sh 先 `sed -i 's/\r$//'`。

---

## 9. 给下一任的「不要猜」清单

| 问题 | 答案 |
| :--- | :--- |
| unique 用哪套？ | 方案 A：`commerce_accounts.store_id` UNIQUE。不要改回 workspace+provider |
| Simulator 两个 provider 会不会并店？ | 不会。`simulator-amazon` / `simulator-shopify` 必须两行 Store |
| Action 还走谁？ | Mock Executor。Epic 4/5 **不要**改 `executeMockAction` |
| WF-05 读哪？ | 默认 Scenario 内存世界。不要切 prisma |
| AmazonAdapter 在哪？ | `packages/db/src/commerce/amazon-adapter.ts`；transport 复用 Epic 4 `AmazonProvider` |
| 凭证解密在哪？ | 唯一实现在 `packages/integrations/src/provider-framework/secrets/provider-credential-crypto.ts`；api 的 credential-crypto.ts 是转发壳 |
| 云上有真 Amazon/Shopify 账户吗？ | 没有。只有两条 simulator 账户 |
| Order/PlannedAction 有 storeId 列吗？ | **没有**。非必须不加；要加必须 additive nullable |
| 本机能跑 API 吗？ | 不要。验收在 116.198.230.217 |
| git 往哪推？ | `origin master`。CrossPilot 惯例就是 master |
| 提交信息格式 | `feat(commerce): ...` / `docs: pin V10 Epic N live SHA <short>` |
| worker 日志里的 BullMQ TypeError | 预先存在（19:12 旧日志就有），Epic 3 reload 后未复现；不是回归 |

---

## 10. 状态块（复制到下一会话开头）

```text
CrossPilot V9.1     FROZEN   v9.1.0 = b3d5607
Epic 4 Amazon read  DEPLOYED LIVE_NOT_RUN
V9.2 / V9.2.1 / V9.3 SHIPPED  Action = Mock only
V10 Epic 0          DONE     architecture + impact
V10 Epic 1          SHIPPED  2a5b305  Store + ChannelIdentity
V10 Epic 2          SHIPPED  6a9b636  Ports + SimulatorAdapter
V10 Epic 3          SHIPPED  6c4d169 + 复查修复 71d405f  Amazon read Adapter
Live git            master HEAD  (API dist = 71d405f)
Live                http://116.198.230.217:2222  health 200
Next                Epic 4 Shopify read Adapter  ← 仅用户发话后开工
Stop                不要开 Epic 5/6；不要 Amazon/Action Write；不要 WF-05 切源
Do not              retag v9.1.0 ; XYDC 5147→5151 ; STORE_SKU360_SOURCE=prisma
```
