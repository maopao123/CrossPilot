# V9.2 Release Verification Report

**Date:** 2026-09-12  
**Document level:** implementation / release evidence（不替代 `V9_1_RELEASE_FREEZE.md`）  
**Runtime:** `http://116.198.230.217:2222`  
**Scope:** 把已部署的 V9.2 从「开发完成」核到「可稳定演示的软件产品」。无新 Epic、无 V9.2.1 UI、无 V9.3 Action Layer、无核心业务模型改动。

---

## 0. Verdict

```text
V9.1                 FROZEN          tag v9.1.0 = b3d5607
Epic 4               DEPLOYED        read-only Amazon; LIVE_NOT_RUN
V9.2 Playbook+Intel  DEPLOYED        API only; executeRun 云上已跑通
Commerce Simulator   LIVE            1 simulated day / 60 min
V9.2 Production      READY_WITH_KNOWN_LIMITATIONS
```

**不是**「无缺口的 Production Ready」。  
**是**：服务可部署、数据链路可跑、核心演示闭环已在云上跑通、异常路径可恢复或可降级；已知限制见 §4。

本轮**没有**新建 `mock-data-service`：仓库里已有 Commerce Simulator，能力覆盖用户 Phase 4 清单。  
本轮**只补了两处稳定性缺口**（见 §5）：HTTP 结构化日志、BullMQ worker 独立 Redis 连接。  
已部署：`05b8151` @ 云机；HTTP 日志已出现 `userId`/`workspaceId`；worker `online` 且 `listening for queue events`。

---

## 1. System Status

### 1.1 服务组成（扫描 + 云上实测）

| 层 | 组成 | Live |
| :--- | :--- | :--- |
| Frontend | Next.js 14 `apps/web` :2222，rewrite `/api/*` → `127.0.0.1:3001` | `/` `/login` `/app/operations/today` HTTP 200 |
| Backend | NestJS 10 `apps/api` :3001 `/api/v1` | `GET /health` 200 `status=ok` |
| Worker | `apps/worker` BullMQ：simulator tick + agent-task scaffold | PM2 online；simulator 已推进到 day 9 |
| Database | Postgres `industry_postgres` 库 `crosspilot` | health postgres up；schema 含 playbooks / facts / simulation_* |
| Redis | `industry_redis` `127.0.0.1:6379`（`REDIS_URL` 未设，走默认） | health redis up；`PONG` |
| Vector | Milvus 2.4 `industry_milvus` | health milvus up |
| Agent runtime | WF-05 进程内 DAG；Playbook `executeRun`；LLM runtime 3 次 retry + 30s timeout | 诊断/Playbook 云上 PASS；`/health/ai` **degraded**（无 LLM key） |
| Scheduler | **产品 Scheduler 未做（禁止）**。Simulator BullMQ repeatable job 每 60 分钟 1 模拟日 | worker log：`Simulator scheduler enabled` |
| External API | XYDC MCP / Firecrawl / Amazon SP-API GET-only | Amazon LIVE_NOT_RUN；XYDC 5147 fixture vs 5151 live 仍冻结 |

PM2（验证时）：`crosspilot-api` / `crosspilot-web` / `crosspilot-worker` 全部 `online`。

### 1.2 数据流（两套并行，不要混）

```text
A. V9.1 Demo Scenario（Overview UI + WF-05 默认）
   ScenarioGenerator → /scenario/daily|timeline → Operations Today
   STORE_SKU360_SOURCE 未设 = 非 prisma = WF-05 用水合 scenario，不读模拟店

B. V9.2 Commerce Simulator（Mock 店铺）
   seeded RNG → tick → orders/inventory/ad_metrics/reviews/events/channel_metrics
   Worker 每 60 分钟 + POST /simulator/tick|advance
   隔离：source_provider='simulator' / sim- reviewer / SIM- campaign

C. V9.2 Playbook Intelligence（API only，无 UI）
   startRun = CREATED
   executeRun = Fact → Evidence → Recommendation
   VOC = 英文正则，不是爬虫
   EXECUTED.executionDispatched = false
```

### 1.3 已实现 / 未完成

**已实现（本轮验证到）：** V9.1 工作台与 WF-05；Epic 4 只读 Amazon 基础设施；Playbook CRUD + start/execute；Fact/Evidence/Recommendation 生命周期；VOC analyze；Commerce Simulator 日推进与异常事件；28 tools；JWT + Workspace + VIEWER 写禁（真实 `viewer@` 用户）。

**未完成 / 明确不做：** V9.2 UI；V9.2.1 Product Layer；V9.3 Action Layer / Amazon Write；产品 Scheduler / 飞书；Live SP-API OAuth；Simulator → WF-05 自动接线（`STORE_SKU360_SOURCE=prisma` 禁止默认打开）；独立 `mock-data-service` 进程。

### 1.4 当前风险

| 风险 | 严重度 | 处置 |
| :--- | :--- | :--- |
| `/health/ai` degraded，无 LLM key | 中 | Listing LLM 路径不可 live；诊断/Playbook 不依赖 LLM。不造密钥。 |
| 旧日志 `agent_tasks_active_sku_id_fkey` P2003 | 低 | V9.1 BA-002 类。本轮 UUID SKU 诊断 COMPLETED。 |
| Overview 读 scenario，不读 simulator | 中 | 已知双世界。不要改默认数据源。 |
| `demo-login role=VIEWER` 不会把已有 OWNER membership 改成 VIEWER | 低 | 验收用 `viewer@crosspilot.com`。 |
| `CURRENT_SYSTEM_AUDIT_BASELINE.md` 仍写 Epic 4 SUSPENDED / V9.2 NOT STARTED | 文档 | 以本报告 + `docs/HANDOFF.md` 为准，不要按旧基线重做 Epic 4。 |

---

## 2. Feature Verification

| Module | Status | Evidence |
| :--- | :--- | :--- |
| Data Pipeline | **PASS** | 262+ sim orders（验证后继续 tick）；inventory 3；ad_metrics 114；channel_daily_metrics 48；simulation_states RUNNING |
| Dashboard | **PASS (scenario)** | `/scenario/daily` 90 days；`/scenario/timeline` 10；Web 页面 HTTP 200。无 Simulator 专属页。 |
| Agent (WF-05) | **PASS** | SKU `d5366ebd-…` `waitForCompletion` → COMPLETED / NEEDS_ATTENTION / 1 warning / 1 P3 advisory |
| Playbook / Insight | **PASS** | `amazon-product-research@9.2.1` execute → COMPLETED `ENTER_MARKET`；9 facts；rec `WAITING_APPROVAL→APPROVED→EXECUTED` `dispatched=false` |
| VOC | **PASS** | `POST /voc/analyze` pain=1 + factId |
| RAG / Milvus | **UP** | health milvus up；本轮未重跑 Listing RAG live |
| Scheduler | **PASS (simulator only)** | 60 min tick；day 7→9 已被 worker 推进。产品 Scheduler = N/A |
| Auth / VIEWER | **PASS** | `viewer@` POST `/simulator/tick` 403；GET products 200 |
| Metrics | **PASS** | ACOS 0.4552 = 5721.05/12567；ROAS 2.2；profit revenue 98700.04 |

### 2.1 指标抽查

广告活动 `SP - Marble Toothbrush Holder - Auto & Exact`（30d 聚合，含 scenario 历史，不只是 sim）：

- spend=5721.05 sales=12567 acos=0.4552 **公式成立**
- roas=2.2 **公式成立**

库存：3 条 FBA；`POST /skus/:id/reorder-recommendation` 201，返回 ADS / daysCover / reorderPoint。

利润：`GET /profit/summary` 来自 `profit_daily`（scenario 种子，**simulator 不写该表**）。

---

## 3. Demo Flow（已在云上跑通）

```text
Mock Store Data (Simulator SIM-* orders + inventory + ads)
        +
Scenario 90d / profit / Overview
        ↓
WF-05 Daily Diagnosis  COMPLETED  NEEDS_ATTENTION
        ↓
Playbook executeRun    ENTER_MARKET + Facts/Evidence
        ↓
Recommendation         WAITING_APPROVAL → APPROVED → EXECUTED
                       executionDispatched=false
        ↓
VOC analyze            pain point + listingImprovement
```

账号：`POST /api/v1/auth/demo-login` `{"role":"OWNER"}`；header `x-workspace-id` = `activeWorkspace.id`。  
VIEWER：`viewer@crosspilot.com` / `crosspilot123`（不要用 demo-login VIEWER 验收写禁）。

登录后落地：`/app/operations/today`。Playbook / Simulator 无前端，用 API。

---

## 4. Remaining Issues

### Bug

- 历史 WF-05 非 UUID `activeSkuId` P2003 仍可能出现在旧日志（已有守卫，本轮 UUID 路径绿）。
- `demo-login` 的 `role` 只在**首次**创建 membership 时生效。

### Technical Debt

- agent-task BullMQ worker 曾因 `maxRetriesPerRequest` 无法启动（scaffold，不在 WF-05 主路径）。本轮已改独立 Redis 连接。
- `playbook_run_id` / `evidence_ids` 无 DB FK。
- Simulator 不写 `profit_daily`；Overview 不读 simulator。
- HTTP 日志以前只有响应 envelope 的 `requestId`，没有 user/task/run。本轮已补拦截器。
- `REDIS_URL` 未写入 `.env`（默认 localhost，当前能通）。

### Future（不要本轮做）

- V9.2.1 UI / Simulator 控制台
- Simulator → Agent 自动联动（HANDOFF 项 8，需人工下令才改 `STORE_SKU360_SOURCE`）
- Live Amazon OAuth
- V9.3 Action Layer / Amazon Write
- 产品 Scheduler / 飞书
- 打 tag `v9.2.0-rc1`

---

## 5. Phase 4 / 5 裁决

### Phase 4 Mock 数据

**不新建 `mock-data-service`。** 映射到已部署的 Commerce Simulator：

| 要求 | 实现 |
| :--- | :--- |
| Store / Product / Order / Ads / Inventory | `packages/domain/src/simulator/*` + `packages/db/src/simulator/simulator-store.ts` |
| 固定随机种子可复现 | seeded RNG；种子/起始日/初始库存 **冻结** |
| 每日不同数据 | worker 60 min = 1 sim day；也可 `POST /simulator/tick` |
| 销量下降 / ACOS 涨 / 库存不足 / 转化差 / 广告浪费 | 事件模板 ACOS_SPIKE、RETURN_SPIKE、NEGATIVE_REVIEW_WAVE、VIRAL_SURGE；库存引擎自发 stockout。云上 ACTIVE 事件：`RETURN_SPIKE` |

禁止改引擎种子/起始日/初始库存/事件文案（gold case 锁死）。

### Phase 5 稳定性（本轮代码）

已有、未再造轮子：

- LLM：retry 3、backoff、timeout 30s、schema repair 1 次
- API 失败：HttpExceptionFilter 映射业务码；生产隐藏内部 message
- DB：health 探测；Prisma 错误进 filter
- Worker tick：单 workspace 失败 skip，不打挂调度

本轮新增（最小）：

1. `RequestLoggingInterceptor`：每请求一行 JSON（`requestId` `userId` `workspaceId` `taskId` `agentRunId` `method` `path` `statusCode` `durationMs`）
2. 成功/失败共用同一个 `requestId`
3. Worker agent-task 连接改为 `maxRetriesPerRequest: null` 的独立 ioredis

未做：新日志框架、告警通道、产品 Scheduler。

---

## 6. 项目结构（扫描摘要）

```text
apps/api          NestJS  /api/v1
apps/web          Next.js 工作台
apps/worker       BullMQ simulator + agent-task
packages/domain   WF-05 / profit / listing / playbook / intelligence / simulator
packages/db       Prisma + simulator-store
packages/ai       LLM runtime
packages/integrations  Redis / Milvus / Provider Framework
packages/tool-platform  28 tools
packages/shared   contracts
packages/actions  Action router（V9.3 不要扩）
```

---

## 7. 不变量（本轮未破）

```text
Approval ≠ Execute
SSE ≠ SoT
UI ≠ business logic
VIEWER read-only（真实 VIEWER 用户）
Amazon Write 不存在
STORE_SKU360_SOURCE 保持非 prisma
XYDC 5147 夹具不改成 5151
v9.1.0 不 retag / 不 force-push
Simulator 引擎确定性参数不改
Windows 不跑产品栈
```
