# CrossPilot 交接

> **2026-09-14 · CrossPilot Simulator-first 闭环 — 第二轮审查打回修复（R2-0～R2-12 & R2-P1）终验全量通过**：
> 严格执行 7 条核心纪律与独立对抗审查打回修复清单，彻底消灭“测试里成立、生产路径断”、外键/字段必炸、worker 调度孤立、回执/状态分叉、假重试、能力虚设与编造实验等问题：
> - **R2-0 真实 PostgreSQL 物理库验收全通**：本地启动独立 PostgreSQL 实例（`127.0.0.1:5432`，`crosspilot_test` 库），`apps/api/test/closed-loop-v2-postgres.spec.ts` 8/8 全通，验证真实事务原子回滚、P2002 唯一约束、OCC 乐观锁、Outcome v2 多干预降级、applyAction 原子快照与回执一致性、Outcome 任务重试恢复、V2Sku360 数据源隔离与 Tick 日度输出回放一致性；
> - **R2-1 & R2-5 Outcome v2 生产闭环与重试**：所有指标基线 `<= 0` 时 `changePct` 置 `null`（禁止符号倒挂），多干预强制降级为 `INCONCLUSIVE` 且 `interventionVerified=false`；`AgentTask` 重试成功置 `COMPLETED`；
> - **R2-2 & R2-4 Worker 生产触发与 Autopilot 原子一致性**：注册 `crosspilot-closed-loop-v2` 队列与 worker，支持 advance 与 sweep 周期调度；彻底删除假 clicks/acos；Autopilot 真实走 `PlannedAction` 创建 → `evaluateSimulatorPolicy` → `v2Store.applyAction` 事务内写入真 actionId 外键回执与乐观锁；
> - **R2-3 & R2-10 Policy 强制与 Adapter 能力消费**：消费 `adapter.getCapabilities()`，自动模式强制校验护栏，参数严格从落库 `run.policyLimits` 读取，单次请求禁止覆盖；`updateRunPolicy` 校验未知键并禁止放宽；
> - **R2-6 诊断真实库修复与全路径接入**：`V2Sku360DataSource` 查询 `adMetricDaily` 通过 `campaign: { workspaceId }` 关联过滤，消除未知参数必炸异常；清除 fake leadTime 15 / fake returnRate 0.05 编造；全路径按 workspace 分发；
> - **R2-7 质量事件持续期控制**：`world-engine.ts` 严格限制质量事件在 `[date, date + durationDays - 1]` 窗口内生效，消除跨日泄漏；
> - **R2-8 fixture 深合并与真实消费**：导出 `mergeV2Config`；真实消费 S03（`OPERATOR_PAUSE_AD`）与 S06（`failureSchedule.tickTimeout`）；`observation.ts` 真实投影 `inbound`；
> - **R2-9 真实差异实验与诚实声明**：`createExperiment` 支持全矩阵克隆；Rule 组走 §7.3 静态基准，CrossPilot 走利润敏感规则链路；移除编造成本与调用数，`callsUsed=0, costUsed=0`，明示“CrossPilot 规则链路，无 LLM 调用”；工件补齐 per-run 各日 hash、configHash 与回执序列；
> - **R2-11 UI 假数据清除与侧边栏接入**：侧边栏“更多”分组添加“模拟器沙箱”入口（`/app/simulator`）；页面彻底清除硬编码 fake receipts/outcomes 和 fake run fallback，接入真实 API；
> - **R2-12 Tick 回放内容完整化**：`SimulationTick.summary` 持久化 `dayOutput`，三条回放路径统一返回真实已存结果；
> - **R2-P1 专项全量落地**：compensate 乐观锁；补全 6 个失败测试用例；compat.spec mock 严格匹配；persistence.spec 完整回滚快照；V2RunStore 类型化错误；observation.ts 移除合成指标；钉住 bootstrap 95% CI 数值边界；
> - **全量门禁实测结果**：
>   - Monorepo Typecheck: 10/10 workspaces CLEAN (0 TS errors)
>   - `@crosspilot/domain`: 36/36 suites (352 tests) PASS (12.2s)
>   - `@crosspilot/worker`: 2/2 suites (8 tests) PASS (5.8s)
>   - `@crosspilot/api` (closed-loop): 8/8 suites (48 tests) PASS (含真实 PG 8/8 PASS)
>   - `@crosspilot/web`: 24/24 static pages 生成通过（`/app/simulator` 7.62 kB）
>   - 所有修改严格保持在未提交工作区，Git HEAD 冻结在 `dd69e637b0880ed50e8ed9743dcff3e3f8517ed1`。

**日期：** 2026-09-14（更新：CrossPilot Simulator-first 第二轮对抗审查打回修复 R2 终验）
**本文件：** 当前会话结束后的唯一项目交接入口。下一会话先读这里。
**实测证据文档：** `00_governance/more/IMPLEMENTATION_EVIDENCE.md`
**下一任 AI 执行说明书：** `00_governance/V10_NEXT_AGENT_HANDOFF.md`。

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
LIVE SIMULATING（tick 走 SimulatorAdapter）
worker 每 60 分钟推进 1 模拟日。当前 day 以 GET /simulator/state 为准（V9.2 验证时曾是 day 9；Epic 2 冒烟到过 day 12）。

V9.2 Production Verification
READY_WITH_KNOWN_LIMITATIONS
报告：docs/00_governance/V92_RELEASE_VERIFICATION_REPORT.md

V9.2.1 UI / Product Layer
SHIPPED  8c2f867
/app/operations/today = 卖家驾驶舱
报告：docs/00_governance/V921_UI_RELEASE_REPORT.md

V9.3 Action Layer
SHIPPED  a39a803  Mock Executor only
报告：docs/00_governance/V93_ACTION_LAYER_RELEASE_REPORT.md

V10 Multi-platform Commerce OS
ARCHITECTURE FROZEN
docs/00_governance/V10_COMMERCE_OS_ARCHITECTURE.md
Epic 0 Impact Analysis DONE
docs/00_governance/V10_EPIC0_IMPACT_ANALYSIS.md
Epic 1 Store + ChannelIdentity Foundation
SHIPPED  2a5b305
docs/00_governance/V10_EPIC1_FOUNDATION_RELEASE_REPORT.md
Epic 2 Commerce Ports + SimulatorAdapter
SHIPPED  6a9b636
docs/00_governance/V10_EPIC2_PORTS_RELEASE_REPORT.md
Epic 3 Amazon read Adapter
SHIPPED  6c4d169
docs/00_governance/V10_EPIC3_AMAZON_READ_ADAPTER_REPORT.md

Market Research & XYDC Live Integration:
LIVE DEPLOYED ee9c777
XYDC MCP token, Firecrawl API key deployed to server .env
Dynamic market snapshot & keyword-tailored product opportunities active

Tool Platform 28 Tools Audit & Hardening
SHIPPED  1e97585
28/28 Tools Production Verified 100% PASS

Listing Tab 02 unstructured spec extract
SHIPPED  1ac2a1d
POST /api/v1/listings/product-specs-extract
LLM first, heuristic fallback
Filters after-sales boilerplate; prefers body dimensions over a conflicting labeled 10x12x5 line

Live:
http://116.198.230.217:2222  (HEAD: 4098cf3)
health 200  postgres/redis/milvus up
/api/v1/health/ai UP (qwen3.8-max + qwen-image-3.0-pro + MinIO)
```

**新增（2026-09-13）：**
- 需求文档：`docs/20_epics/closed-loop/CLOSED_LOOP_OPERATIONS_LAYER_PRD.md` —— Closed-loop Operations Layer（Epic A Outcome Tracking → B Incident & Alert → C Experiment → D Autopilot），DRAFT 待确认；用户已明确 Epic A 优先，可授权开工。
- Bug 审计与 P0 修复：`docs/00_governance/V10_FULL_PRODUCT_BUG_AUDIT_20260913.md` —— 全项目 122 项（严重 10 / 中 36 / 低 76）。**严重级 10 项（S1~S10）已全部修复并通过门禁验证**：
  - S1 (RPA 失败标记与防伪造发布): `operation-automation.service.ts`
  - S2 (createReturn 租户与 SKU 隔离校验): `profit.service.ts`
  - S3 (createQuote 供应商与 SKU 租户校验): `supplier.service.ts`
  - S4 (receivePurchaseOrder 按 skuId 预聚合防重复加库存): `purchase.service.ts`
  - S5 (Analyst 瀑布周对比按自然日聚合多 SKU): `analyst.service.ts`
  - S6 (VOC/退货百分比单位归一化防 100x 虚高): `product-quality-diagnosis.pattern.ts`
  - S7 (竞品非降价场景误诊评分优势修复): `competitor-diagnosis.pattern.ts`
  - S8 (Simulator campaign 名前缀兼容 `'SIM - '` 与 `'SIM-'`): `simulator-store.ts` & `simulator-adapter.ts`
  - S9 (operation-daily-diagnosis 租户隔离加固与防止 input.workspaceId 注入): `operation-daily-diagnosis.tools.ts`
  - S10 (Creative 图像映射实际尺寸真实元数据返回): `creative-studio.tools.ts`
  - 门禁全绿：typecheck 10/10 PASS，domain tests 275/275 PASS，tool-platform 20/20 PASS，golden benchmark evals 9/9 PASS，web tests 34/34 PASS，web build 23/23 PASS；新增 `apps/api/test/v10-audit-p0.spec.ts` 与 `packages/domain/test/v10-p0-audit-fixes.spec.ts` 回归用例。
- **Epic A Outcome Tracking 已实现（本机，未部署，2026-09-13）**：`action_outcomes` 表 + `outcome-tracking` 模块（GET /outcomes、/outcomes/summary、/actions/:id/outcomes、POST /outcomes/:id/reevaluate）+ `outcome-evaluator` worker job（时间基准 sim_date 优先）+ Operations Today Action 卡片结果徽标。判定规则 v1 确定性（阈值 5%）；Simulator 无 profit_daily → 相关维度 INCONCLUSIVE（诚实数据，不伪造 0）。验证：domain 316/316、api 175/175、typecheck 全绿。**migration `20260914100000_v10_outcome_tracking` 待云库 apply**；部署需 prisma migrate deploy + 全量 build + pm2 reload api/worker。

**下一任：** Epic 3 已完成。用户说「做 Epic 4 / Shopify」→ 按 `V10_NEXT_AGENT_HANDOFF.md` 做 Shopify read Adapter；在那之前**不要主动开 Epic 4**。
**不要**顺手开 Shopify / Amazon Write / Action Write / 切 `STORE_SKU360_SOURCE=prisma`。  
**不要为了刷绿把 XYDC `5147` 改成 `5151`。不要 retag / force-push `v9.1.0`。**  
**不要改 simulator 引擎的种子/起始日/初始库存。**

Windows 本机 **只做开发**。不要在本机起 Postgres / API / Web / 浏览器验收。

---

## 1. 必须先读

1. 本文件 `docs/HANDOFF.md`
2. `docs/00_governance/V10_NEXT_AGENT_HANDOFF.md` ← **下一任执行入口**
3. `docs/00_governance/V9_1_RELEASE_FREEZE.md`
4. `docs/00_governance/V10_EPIC3_AMAZON_READ_ADAPTER_REPORT.md`
5. `docs/00_governance/V10_EPIC2_PORTS_RELEASE_REPORT.md`
6. `docs/00_governance/V10_EPIC1_FOUNDATION_RELEASE_REPORT.md`
7. `docs/00_governance/V10_EPIC0_IMPACT_ANALYSIS.md`
8. `docs/00_governance/V10_COMMERCE_OS_ARCHITECTURE.md`
9. `docs/00_governance/V93_ACTION_LAYER_RELEASE_REPORT.md`
10. `docs/00_governance/V921_UI_RELEASE_REPORT.md`
11. `docs/00_governance/V92_RELEASE_VERIFICATION_REPORT.md`
12. `docs/40_mockData/CrossPilot_Commerce_Simulator_V1.0.md`（§15 = Simulator 权威实现说明）

`docs/00_governance/临时命令.txt` **不要 commit**。其中旧的 Epic 4 / Freeze 正文是历史，不要再执行一遍。

---

## 2. SHA 不要混

| 角色 | SHA | 说明 |
| :--- | :--- | :--- |
| V9.1 主体 | `c4704fd` | Epic 3 + Phase 1 / 2 / 2.1 / 2.2 / 3 |
| 验收时已部署应用 | `7c81411` | Final Browser Acceptance 热修 |
| Release docs / tag `v9.1.0` | `b3d5607` | 仅验收报告 |
| Freeze 声明 | `87d4eb2` | 治理文档 |
| 视觉系统（前端 only） | `e457d5a` | 设计 token 基线；Web 现已 rebuild 为 `8c2f867` |
| Epic 4 | `85f5b94` | 只读 Amazon store foundation |
| V9.2 实现 | `54074d9` | Playbook + intelligence |
| 指针同步 | `5ef0313` | evidence / authority map |
| 旧交接记录 | `09ad2c0` | 仅 docs |
| V9.2 验证报告 + 稳定性补丁 | **`05b8151`** | 报告 + HTTP 日志 + worker Redis |
| V9.2.1 UI | `8c2f867` | Operations Today cockpit |
| V9.3 Action Layer | **`a39a803`** | Mock planner / risk / executor / history |
| V10 Epic 1 Store foundation | **`2a5b305`** | Store + ChannelIdentity + unique(storeId) |
| V10 Epic 2 Ports + SimulatorAdapter | **`6a9b636`** | Catalog/Order/Inventory/Ads/Profit ports |
| V10 Epic 3 Amazon read Adapter | **`6c4d169`** | AmazonAdapter + shared credential crypto；复查修复 `71d405f` |
| **Live API/worker dist** | **`71d405f`** | Epic 3 + 复查修复；Web dist 仍为 V9.3 UI |
| **origin master** | push 后 `git log -1` | 文档 HEAD 与 dist 可能再差 pin commit |

```text
Tag v9.1.0            →  b3d5607     不要 retag
Live API/worker dist  →  71d405f
Live Web dist         →  a39a803 驾驶舱（V10 尚未改 UI）
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

备份：`/root/zls/backup/CrossPilot-pre-v92-202609121715`、`/root/zls/backup/CrossPilot-pre-sim-*`、`/root/zls/backup/CrossPilot-pre-v10e2-202609122059`、`/root/zls/backup/CrossPilot-pre-v10e3-202609122133`

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

### 4.2 云上冒烟 / V9.2 生产验证（2026-09-12，机内 `127.0.0.1:3001`）

| 调用 | 结果 |
| :--- | :--- |
| `GET /api/v1/health` | 200 |
| `GET /api/v1/simulator/state`（无 auth） | 401（路由已注册） |
| `POST /simulator/reset` → `advance {days:7}` | 200，day 7，末日产 36 订单/5 评论/3 广告行/6 漏斗行 |
| `GET /simulator/state` | 200，活跃事件 RETURN_SPIKE（MTH-GREEN-001） |
| worker 日志 | `Simulator scheduler enabled: 1 simulated day every 60 minute(s)` |
| 云库实测 | 226 sim orders / 1 event / 42 channel metrics / 29 sim reviews，隔离标记正确 |

### 4.2b V10 Epic 3 生产冒烟（2026-09-12 部署后，机内 `127.0.0.1:3001`）

| 调用 | 结果 |
| :--- | :--- |
| 部署 HEAD | `6c4d169`，pm2 api/worker reload 后均 online |
| `GET /api/v1/health` | 200 |
| `POST /auth/demo-login` OWNER | 201，token + workspace `0e02ccf2…` |
| `GET /commerce/accounts` | 200，仍是 `simulator-amazon` / `simulator-shopify` 两行，Store 未并店 |
| `GET /simulator/state` | 200，day 12 / 2026-09-13（worker tick 正常） |
| worker 日志 | `Simulator scheduler enabled: 1 simulated day every 60 minute(s)`；reload 后无新增报错 |
| 云库 migration 数 | 无新增（Epic 3 不改 schema） |

BullMQ `Worker.run` 的 TypeError + `maxRetriesPerRequest` 告警存在于 19:12 的旧 error log（Epic 3 reload 前），reload 后未复现 → 预先存在，不是 Epic 3 回归。

复查修复热更新（`71d405f`，同一晚）：mock `listingsGet` 单对象形状对齐、`pageSize` 20、transport 抛异常归一。部署后 HEAD `71d405f`，health 200，api/worker online，无新报错。详见 Epic 3 报告 §7。

V9.2 生产验证追加（同一天，机内）：

| 调用 | 结果 |
| :--- | :--- |
| 页面 `/` `/login` `/app/operations/today` | HTTP 200 |
| sim orders + inventory + ads ACOS/ROAS 公式 | PASS（acos 0.4552 = spend/sales） |
| `POST /operations/daily-diagnosis` UUID SKU waitForCompletion | 202 → GET COMPLETED / NEEDS_ATTENTION |
| `POST /playbook-runs/:id/execute` research | COMPLETED `ENTER_MARKET`；EXECUTED `dispatched=false` |
| `POST /voc/analyze` | pain=1 + factId |
| `viewer@crosspilot.com` tick | 403；读 products 200 |
| `/health/ai` | degraded（无 LLM key） |

`demo-login role=VIEWER` **不能**当 VIEWER 验收（demo 用户 membership 已是 OWNER）。

未跑：Live SP-API、OAuth、浏览器全站视觉回归、Listing 真 LLM。Simulator 无前端页面。

### 4.3 库表（additive，已在云库执行）

1. `20260912180000_epic4_store_foundation`
2. `20260912210000_v92_playbook_framework`
3. `20260912220000_v92_intelligence_layer`
4. `20260913000000_commerce_simulator`（simulation_states / simulation_events / channel_daily_metrics）
5. `20260913200000_v93_action_layer`（planned_actions / action_executions）
6. `20260914000000_v10_epic1_store_foundation`（stores / channel_identities / commerce_accounts.store_id unique）

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

- Live SP-API：`LIVE_NOT_RUN`（无卖家授权；Epic 3 adapter 在无 LWA_REFRESH 时显式 `AUTH_REQUIRED`，fail-closed）
- AmazonAdapter ads / profit 读返回 `[]`（GET allowlist 无 Ads 端点、finances 无 SKU/COGS 拆分，见 Epic 3 报告 §2/§6）
- AmazonAdapter `listOrders` 不翻 `nextToken` 页（与 Epic 4 sync 一致）；ChannelIdentity 只在 catalog 读时增量写，无历史 ASIN 回填
- 业务层（WF-05 / Playbook / Action）尚未路由到 AmazonAdapter——那是 Epic 5/6 的事
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
- `/health/ai` degraded：云上无 LLM key。诊断/Playbook 不依赖 LLM
- Overview 读 scenario，不读 simulator；simulator 不写 `profit_daily`
- `CURRENT_SYSTEM_AUDIT_BASELINE.md` 仍写 Epic 4 SUSPENDED / V9.2 NOT STARTED，**过期**；以本文件 + V9.2 验证报告为准

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
scp docs/_ops_deploy_v10_epic3.sh root@116.198.230.217:/tmp/
ssh root@116.198.230.217 "sed -i 's/\r$//' /tmp/_ops_deploy_v10_epic3.sh && bash /tmp/_ops_deploy_v10_epic3.sh"
# 备份 → fetch/checkout → 保留 .env → install → generate → （有迁移才 apply）→ 全量 build
# → pm2 reload crosspilot-api --update-env；sleep 3；pm2 reload crosspilot-worker --update-env
# （铁律：pm2 reload 一次只带一个进程名）
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

## 9. 下一会话

**执行说明书：** `docs/00_governance/V10_NEXT_AGENT_HANDOFF.md`

Epic 3 **已完成**（`6c4d169` + 复查修复 `71d405f`，均已部署）。用户说「做 Epic 4 / Shopify」→ 按 `V10_NEXT_AGENT_HANDOFF.md` 做 **Epic 4 Shopify read Adapter**；用户没发话就停，不要主动开工。

不要夹带：

1. 真 Amazon Write / Action `execute()` 换真工具（Epic 6）
2. WF-05 切 `STORE_SKU360_SOURCE=prisma`（Epic 5）
3. 新 Agent / 新 `action_type` / 改 Action 状态机
4. 改 WF-05 公式或 Recommendation 状态机
5. 打 release tag / 配 LLM key

---

## 10. 状态块（复制用）

```text
CrossPilot V9.1  FROZEN  v9.1.0=b3d5607
Epic 4           DEPLOYED  LIVE_NOT_RUN
V9.2 Phase 1-5   DEPLOYED  API only
V9.2 Production  READY_WITH_KNOWN_LIMITATIONS
Simulator        LIVE  via SimulatorAdapter（day 会随 60min tick 前进，勿 reset 对齐旧数字）
Live git         master HEAD  (API dist 71d405f) @ 116.198.230.217:2222
V9.2.1 UI        SHIPPED
V9.3 Action      SHIPPED mock only
V10 Epic 1       SHIPPED  Store + ChannelIdentity
V10 Epic 2       SHIPPED  Ports + SimulatorAdapter
V10 Epic 3       SHIPPED  Amazon read Adapter 6c4d169 + 复查修复 71d405f
Closed-loop A    IMPLEMENTED (local)  Outcome Tracking；migration 20260914100000 待云库 apply，未部署
Next             Epic 4 Shopify read Adapter — 等用户授权（见 V10_NEXT_AGENT_HANDOFF.md）
health           200   /health/ai degraded
Do not start Amazon Write / Action Write / WF-05 切源 / Epic 4 未授权自启
Do not retarget XYDC 5147→5151
Do not add a second mock-data-service
```
