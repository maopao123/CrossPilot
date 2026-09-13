# CrossPilot 全产品 Bug 排查报告（2026-09-13）

> **文档层级**：LEVEL 1 审计产出（本轮只记录，不改代码）
> **审计日期**：2026-09-13
> **审计方式**：8 路并行只读审查，覆盖 apps/api（126）、apps/web（35+）、apps/worker（4）、packages/domain（93）、packages/integrations+db+shared+actions（72）、packages/ai+tool-platform（28），合计约 390+ 个 TS/TSX 文件全量通读
> **禁止项（已遵守）**：不修改业务代码、不修 Bug、不改 Prisma、不改测试、不启动任何服务
> **排除项**：`docs/HANDOFF.md` §6 已记录的 Known Gaps 不计入本报告（XYDC 5147/5151 漂移、EXECUTED 只记账、Amazon listOrders 不翻页、Simulator 不写 profit_daily、health/ai degraded 等）

---

## 1. Executive Summary

共发现 **122 项问题**：严重 10 / 中 36 / 低 76（其中标 [存疑] 33 项，需人工复核确认是否算 Bug）。

真正值得立即处理的三个主题：

1. **多租户隔离仍有缺口**：`profit.createReturn`、`supplier.createQuote`、`tool-center.executeTool`、`operation-daily-diagnosis.tools` 共 5 处可跨 workspace 写入/读取（S2/S3/S9 + 中档 tool-center 项）。V9.1 审计修过一批，这是残留面。
2. **并发先读后写遍布写路径**：Action 状态机、Approval、库存扣减、退货幂等、PO 收货超收、Simulator 首 tick，至少 9 处 check-then-act 竞态，生产并发下会双写/超卖/重复执行。
3. **「假数据冒充真数据」复发**：RPA 失败仍报发布成功、creative 尺寸元数据造假、analyst 瀑布周对比算错仍宣称 exact closure、market 非 toothbrush 关键词返回伪造 APPROVED 机会、ui-labels 缺枚举回退英文——违反「无数据不得显示为正常业务数据」的既定原则。

另有一个**高隐蔽性数据腐败**：Simulator campaign 名前缀不匹配（`'SIM - '` vs 查询用 `startsWith 'SIM-'`），导致**每个 sim tick 新建一条 Campaign、reset 清不干净、campaigns 接口恒空**（S8）。Simulator 是当前主力数据源，建议优先修。

---

## 2. 统计

| 范围 | 文件数 | 严重 | 中 | 低（含存疑） |
| :--- | ---: | ---: | ---: | ---: |
| apps/api：action-layer / playbook / intelligence / daily-diagnosis / operations-today / operation-automation / common | 32 | 1 | 3 | 10 |
| apps/api：commerce-store / simulator / order / inventory / advertising / profit / product | 24 | 1 | 4 | 6+4存疑 |
| apps/api：auth / workspace / listing / market / purchase / supplier / creative | 27 | 2 | 7 | 7 |
| apps/api：agent-task / analyst / eval / health / scenario / storage / tool-center / prisma | 22 | 1 | 3 | 8 |
| packages/domain | 93 | 2 | 3 | 8 |
| packages/integrations + db + shared + actions | 72 | 1 | 7 | 10 |
| apps/worker + packages/ai + packages/tool-platform | 32 | 2 | 5 | 10 |
| apps/web | 63 | 0 | 4 | 13 |
| **合计** | **365+** | **10** | **36** | **76** |

---

## 3. 严重（P0，建议立即修）

### S1. RPA 执行失败仍把工作流标记 SUCCEEDED 并伪造「已发布」
`apps/api/src/modules/operation-automation/operation-automation.service.ts:247-272`
Step 5 已把 RPA 失败标成 `FAILED`，但 Step 6 无条件 `run.status='SUCCEEDED'` 并生成 `publishedAt` / `sellerCentralUrl`。用户看到「发布成功」假象和伪造的 Seller Central 链接。条件算了却没用 + 失败无补偿。

### S2. createReturn 完全不校验 orderItemId / skuId 的 workspace 归属 → 跨租户数据污染
`apps/api/src/modules/profit/profit.service.ts:107-131`
`ReturnRecord.orderItemId` FK 不带 workspace，`skuId` 无外键。任一 workspace 成员传他人 orderItemId 即可把退货挂到受害者订单项并污染其 profitDaily；传不存在的 skuId 触发 P2003 变 500。

### S3. createQuote 不校验 supplierId / skuId 归属（越权写入 + P2003 裸奔）
`apps/api/src/modules/supplier/supplier.service.ts:81-90`
对比 `purchase.service.ts:67-86` 做了归属校验，这里没有。传他租户 UUID 即跨租户建报价；传不存在 ID → P2003 500。

### S4. receivePurchaseOrder 对同一 skuId 重复行重复加库存
`apps/api/src/modules/purchase/purchase.service.ts:239-311`
`po.items` 在事务开始一次性查出，循环内对象陈旧。请求体含两条相同 skuId（schema 未去重）→ 库存加两次，但 `receivedQuantity` 两次写同一 `totalReceived` → 库存虚增、PO 与库存永久不一致。

### S5. Analyst 瀑布「前 7 行 / 后 7 行」切分把周对比完全算错
`apps/api/src/modules/analyst/analyst.service.ts:25-44`
`ProfitDaily` 是 (sku, date) 粒度，14 天 × 3 SKU = 42 行；`slice(0,7)`/`slice(7,14)` 实际只覆盖前 ~2.3 天且丢弃 28 行。previousProfit/currentProfit 与演示宣称值无关，`isExactMatch` 必然 false，「100% exact closure」是假闭环。`askAnalyst` 复用同一 attribution，问答里的公式验证同样错。

### S6. VOC/退货 percentage 单位不一致，诊断文案出现 3110% / 7000%
`packages/domain/src/operations/scenario-sku360-data-source.ts:408,490`（0–100 百分数） vs `operations/diagnosis/diagnosis-patterns/product-quality-diagnosis.pattern.ts:93,98,125,136`（按 0–1 小数处理并 ×100 展示）。Grey SKU 退货/差评诊断产出「占退货 7000%」，原样进证据链。项目口径（`opportunity-score.config.ts:77` threshold=25.0）证实百分数才是对的，错在 diagnosis pattern 换算。

### S7. CompetitorPressurePattern 非降价场景一律误诊为「评分优势」
`packages/domain/src/operations/diagnosis/diagnosis-patterns/competitor-diagnosis.pattern.ts:97,110`
`isRatingAdvantage` 算出后从未使用（死变量）；else 分支不校验任何评分条件就标 `COMPETITOR_RATING_ADVANTAGE` 且 `causalStrength=STRONG`。竞品价格跌幅未达 -10% 的任一 COMPETITOR 信号都会产出错误根因，污染下游 REVIEW_PRICE_COMPETITIVENESS 建议。

### S8. Simulator campaign 名前缀不匹配：每个 tick 新建 Campaign、reset 清不干净、campaigns 接口恒空
`packages/db/src/simulator/simulator-store.ts:15` 定义 `'SIM - Sponsored Products - Simulator Catalog'`（第 4 字符是空格），而 `:139,413,415` 与 `packages/db/src/commerce/simulator-adapter.ts:165` 全部用 `startsWith: 'SIM-'` 匹配 → 永不命中：
- `ensureFixtures` 每次 tick 都 `findFirst` 落空 → **每个 sim tick 新建一条 Campaign**，当天 AdMetricDaily 挂最新 campaign，历史指标散落；
- `SimulatorAdapter.getCampaigns` 恒返回 `[]`，UI 上 ACOS/ROAS 无从展示；
- `resetWorld` 的 `deleteMany(startsWith 'SIM-')` 删不掉自建 campaign → 每次 reset 累积垃圾行。
测试通过是因为 mock 直接返回了匹配名称（`apps/api/test/v10-epic2-ports.spec.ts:103`），线上云库可查证（`select id,name from campaigns where name like 'SIM%'`）。
**注意**：修复时只改查询前缀或只改常量之一，保持与 HANDOFF 隔离标记约定的兼容；不要顺手 reset 线上模拟世界。

### S9. operation-daily-diagnosis 工具：workspaceId 可被 input 注入 + 全局 lastKnownTaskId 跨 workspace 共享
`packages/tool-platform/src/tools/operation-daily-diagnosis.tools.ts:28-54,142,269,377`
(a) `ctx.workspaceId || input.workspaceId || 'default'`：inputSchema 未声明 `workspaceId` 却从 input 读，ctx 为空时调用方可注入任意 workspaceId 以别的 workspace 身份执行诊断；(b) 模块级 `lastKnownTaskId`/`lastKnownActionId` 无 workspace 维度，workspace B 用 `'latest'` 可拿到 A 的 taskId；隔离检查显式豁免 `'default'`，与 market 工具 `ctx?.workspaceId || 'default'` 兜底组合后越权路径可达。影响：跨 workspace 数据泄露 + HITL 审批越权。同文件另有「status/approve/reject 路径在 taskId=latest 无缓存时用硬编码 skuId + 固定日期静默触发一次完整 WF-05 执行」的写副作用（见中档 M25）。

### S10. Creative 图像：aspectRatio 完全不生效且 dimensions 元数据造假
`packages/tool-platform/src/tools/creative-studio.tools.ts:94-101`
`aspectRatio` 从未映射为 provider 的 `size`（实际永远生成默认 1024×1024），但返回的 `dimensions` 声称 2000×2000 或 1920×1080；`'4:3'` 落入 else 被标成正方形。下游（主图合规校验）按假尺寸消费，属前后端契约错误。

---

## 4. 中（P1，建议下一修复批次）

### apps/api — action-layer / operation-automation / daily-diagnosis

- **M1** `action-layer/action-layer.service.ts:127-208` — approve/reject/execute 先读后写非原子：两个并发 execute 都过 APPROVED 检查 → Mock Executor 执行两次、history 双写。应 `updateMany({where:{id,status:'APPROVED'}})` 检查 count。另 `executeMockAction` 抛错无 catch 回补 FAILED，Action 永久滞留 EXECUTING。
- **M2** `operation-automation/operation-automation.service.ts:36,155-210` — approveAndExecute 同样审批竞态（并发双 dispatch RPA）；`workflows` 是进程内数组，API 重启后 fallback 捏造只有 Step 4 的 run（Step 1-3 文案/合规/素材全丢）直接进 RPA 发布。
- **M3** `daily-diagnosis/daily-diagnosis.service.ts:148-159` — 工作流同步失败被 catch 吞掉，`waitForCompletion=true` 时响应仍硬编码 `status:'RUNNING'`，前端轮询等一个已死任务。

### apps/api — commerce-store / order / inventory / profit / product

- **M4** `order/order.service.ts:98-146` — createOrder 库存扣减读-改-写绝对值无锁，并发下同 SKU 超卖且无告警。应原子 decrement + 条件更新。
- **M5** `inventory/inventory.service.ts:58-66` — 显式传入的 `leadTimeDays` 被供应商报价无条件覆盖，API 参数契约失效（应仅在未传时用供应商值）。
- **M6** `inventory/inventory.service.ts:74-80` — 「近 30 天销量」用 `OrderItem.createdAt`（入库时间）而非 `Order.orderedAt`；sync 导入的历史订单全部计入近 30 天 → avgDailySales 虚高、补货点失真。
- **M7** `profit/profit.service.ts:107-131` — createReturn 幂等检查-创建竞态，`(workspaceId, orderItemId)` 无唯一约束兜底，双击/重试双计 returnLoss。

### apps/api — workspace / listing / market / purchase / supplier / creative

- **M8** `workspace/workspace.service.ts:73-124` — 无 workspace 的用户被自动授予共享 demo workspace 的 **OWNER**（可读写所有 demo 数据）。[存疑：或为刻意 demo 引导，但 OWNER 角色 + 共享工作区是隔离隐患]
- **M9** `workspace/workspace.service.ts:136-145` — catch 吞掉所有非 Forbidden 异常并返回伪造的 `ws_demo_preview`（角色 OWNER），DB 故障被掩盖且误导排障。
- **M10** `listing/listing.service.ts:678-731` — 版本号读-改-写在事务外，双击/重试并发 generate job 撞 `@@unique([listingId, versionNumber])` / `@@unique([workspaceId, skuId])` → 裸 P2002 500。
- **M11** `creative/creative.service.ts:95-96` — 三元两分支同值（`? 1.5 : 1.5`、`? 3.57 : 3.57`），信息图永远硬编码大理石产品参数，跨产品常量泄漏。
- **M12** `supplier/supplier.service.ts:31-45,123-136` — `listSuppliers`/`listQuotesBySku` 的 catch 无判断返回硬编码假供应商/假报价，任何真实 DB 错误都会让前端把假数据当真数据展示。
- **M13** `purchase/purchase.service.ts:94-114` — 重复 poNumber 的 P2002 未处理 → 500 而非 409。
- **M14** `purchase/purchase.service.ts:255-261` — 收货超收校验先读后比，READ COMMITTED 下两个并发 receive 可都通过 → 超收 + 库存多加。[存疑：依赖并发场景]

### apps/api — analyst / scenario / tool-center / storage

- **M15** `scenario/scenario.service.ts:22,26`（根源 `packages/domain/src/scenario/scenario-generator.ts:172` `Date.now()-90d`）— `/scenario/daily`、`/scenario/waterfall` 每次调用以「今天」重新生成日期，窗口随时间滑动，与 DB 种子数据及 `AnalysisWaterfall.periodStart/End` 错位。
- **M16** `tool-center/tool-center.service.ts:107-141` — 执行时直接信任 `input.taskId`，可把 ToolExecution 挂到任意 workspace 的 AgentTask 上（跨租户注入）；传随机 UUID 触发 P2003。
- **M17** `tool-center/tool-center.service.ts:142-144` — DB 持久化失败的 catch 完全静默（无日志无补偿），执行历史静默丢失，调用方仍拿成功结果。

### packages/domain

- **M18** `operations/workflow/daily-operation-workflow.service.ts:99-101` — `execute()` 订阅 `hooks.onEvent` 永不退订，emitter 的 listeners/eventHistory 无界增长。若 API 层以 Nest 单例复用该 service：内存泄漏 + 旧 run 的 SSE 订阅者收到后续所有 run（含其他 workspace）的事件串扰。[存疑：取决于实例生命周期]
- **M19** `operations/workflow/daily-operation-workflow.service.ts:375,491` — `autoApproveAdvisory` 语义与效果相反：实际跳过的是 APPROVAL_REQUIRED 动作的审批门；跳过后动作保持 PROPOSED 而 workflow 已 COMPLETED，再调 approveAction 会把状态从 COMPLETED 退回 PARTIALLY_APPROVED。另 approveAction/rejectAction/dismissAction 未校验 workflow 处于可审批状态。
- **M20** `listing/listing-workflow-dag.service.ts:722,804-807` — rufusCoverageMetrics 造假：`coverageRate: 1.0` 硬编码；LLM 未返回覆盖数据时 defaultRufusCoverage 把每个问题无条件标 covered。LLM 只覆盖部分问题时返回 `coveredCount=1, totalQuestions=2, coverageRate=1.0`。

### packages/integrations / db / actions

- **M21** `integrations/.../amazon/amazon.provider.ts:152,155` + `amazon.allowlist.ts:9` — Orders 端点版本号 `/orders/2026-01-01/orders` 是捏造的，真实 SP-API 为 `/orders/v0/orders`。一旦打开 live，订单读全 404。mock/fixture 路径掩盖了它。
- **M22** `integrations/.../amazon/amazon.mapper.ts:116` — 把 SP-API `ItemPrice.Amount`（行总价=单价×数量）当 unitPrice；quantity>1 时金额虚高，且 `amazon-adapter.ts:328` 无 totalAmount 时用 `Σ quantity × unitPrice` 兜底 → 数量被乘两遍。
- **M23** `integrations/.../xydc/xydc.provider.ts:631,635-642` — 传了 `endDate` 时 `startDate` 仍按 now 倒推（可产生 start>end 非法窗口）；缓存键只含 `days+metric` 不含起止日期，不同窗口互相污染缓存。
- **M24** `integrations/.../core/integration-gateway.ts:137-138` — fallback 成功结果 `mode` 被覆写为 `DEGRADED`，抹掉 Mock provider 的 `MOCK` 真实度标签；前端无法区分「Mock 兜底」与「降级」。
- **M25**（关联 S9）`tool-platform/.../operation-daily-diagnosis.tools.ts:42-48` — status/approve/reject/dismiss 在 taskId='latest' 无缓存时用硬编码 skuId `MTH-WHITE-001` + 固定日期 `2026-08-15~22` 静默触发一次完整 WF-05 执行。查询变写操作，幂等性被破坏。
- **M26** `db/src/simulator/simulator-store.ts:378-379` — 首 tick 并发时幂等保护失效：`previous==null` 直接 create，workspaceId 唯一冲突抛裸 P2002（注释承诺 SimulatorConflictError/409）。API 手动 tick 与 worker 定时 tick 首跑撞车即 500。
- **M27** `integrations/.../firecrawl/firecrawl-voc.provider.ts:44-55` — 缺参时静默分析硬编码 ASIN `B0BFGNSXYL`（违反禁止伪造数据基调）；缓存键不含 queryKeyword，同 asin 不同关键词互串缓存。
- **M28** `integrations/.../firecrawl/firecrawl.client.ts:44,83` — 硬编码 `curl.exe`（Linux 容器直接 ENOENT，provider 永久失败）；Bearer token 走命令行参数，`ps` 可见。

### apps/worker / packages/ai / tool-platform

- **M29** `apps/worker/src/worker.service.ts:49-66,115-122` — 两个 BullMQ Worker 未注册 `'error'` 监听，Redis 连接层错误会以未捕获异常 crash 进程，与注释「Never crashes the worker」矛盾。[存疑：取决于 BullMQ 版本内部处理，但官方要求挂 error 监听]
- **M30** `tool-platform/src/tools/finance-profit-calculate.tool.ts:76-77` — `fbaFee` 按总额除以 quantity，但 label/defaultValue 是典型单件费；直调 API 传 quantity>1 时 FBA 费用低估 N 倍。[存疑：UI 不传 quantity 时无差异]
- **M31** `ai/src/providers/openai-compatible-embedding.provider.ts:180-186` — 维度不匹配时静默改写共享 `config.dimension`（且 `Math.abs(...)>0` 是死代码），之后所有请求按新维度发参而 version 不同步 → 同一 Milvus collection 混入不同维度向量。应抛已定义却未用的 RAG_DIMENSION_MISMATCH。

### apps/web

- **M32** `web/src/app/app/inventory/page.tsx:79-112,28` — 库存页四张指标卡全部只显示 `balances[0]`（第一个 SKU）的数据，卡片语义是全店维度；补货建议同理只算 `inv[0]`。工作区 ≥2 SKU 恒成立。
- **M33** `web/src/app/app/overview/page.tsx:171` — 概览 ACOS = 广告花费 / **90 天总营收**（含自然销售），与后端统一口径 `spend / 广告销售额` 不一致，实为 TACOS，系统性低估。
- **M34** `web/src/app/app/suppliers/page.tsx:47-49,199` — 部分收货的 PO 点「入库核收」永远按订单全量提交 → 后端超收校验必然 400，用户无法完成剩余入库。
- **M35** `web/src/app/app/operations/today/page.tsx:179-186` — 「重新诊断」硬编码 2026-03-01~03-14 时间窗与 2 月 baseline，覆盖后端「近 7 天」默认值；Simulator 起始日 2026-09-01，3 月窗口内无业务事实，大概率产出空诊断。[存疑：WF-05 读数过滤未 100% 确认，但硬编码绝对日期本身即错]

---

## 5. 低（P2，择机修 / 合并进相关 Epic）

按模块归并（[存疑] 保留原标记）：

**apps/api — action-layer / intelligence / daily-diagnosis / operations-today / common**
- `action-layer.service.ts:93-95` 指定 campaignId 不存在时静默改用 campaigns[0] 生成降价 Action（应抛 ACTION_TARGET_REQUIRED）。
- `action-layer.service.ts:274-275` appendHistory 把 input 同时写进 output 字段（复制粘贴错误），history 的 output 永远等于入参。
- `intelligence.service.ts:107-118` RECOMMENDATION_INVALID_STATE 映射 400，与 playbook 路径 409 不一致。
- `daily-diagnosis.service.ts:126,539-543` 幂等回放 fallback 把 taskId 塞进 workflowRunId 字段。
- [存疑] `daily-diagnosis.service.ts:111` workflowRunId 用 `run-${Date.now()}`，同毫秒碰撞。
- `main.ts:16-20` CORS `origin:true` + `credentials:true` 反射任意来源，生产隐患。
- [存疑] `transform.interceptor.ts:24-29` 用 URL 子串 `/events` 判定 SSE，脆弱。
- [存疑] `operations-today.service.ts:92-94,176-178` catch 无日志吞错 + fallback `status:'UNKNOWN'` 不在状态枚举内（ui-labels 无映射）。
- `operation-automation.service.ts:84,107` 工具调用抛错无补偿，run 永远停 RUNNING；`:278-281` listWorkflows 不传 workspaceId 返回全租户（当前 controller 总传值，裸露越权面）；`:50` `targetPrice || 29.99` 把合法 0 价格替换掉。
- [存疑] `operations-today.service.ts:206-218` VOC negativeCount/sampleSize 兜底口径失真。

**apps/api — order / inventory / advertising / profit / product / commerce-store**
- `order.service.ts:71-84` createOrder 幂等竞态 P2002 未捕获 → 500。
- `product.service.ts:116` createSku 重复 skuCode P2002 未处理。
- `product.service.ts:191` SKU 360 的 avgDailySales 用全部历史 ÷ 30，口径与 inventory 模块不一致，老 SKU 虚高。
- `advertising.service.ts:133-160` applyNegativeKeyword 检查-创建竞态，无唯一约束。
- `commerce-store.service.ts:424-466` ordersSearch 去重检查-创建竞态，部分唯一索引冲突 P2002 未捕获（runOne 有兜底）。
- `order.controller.ts:24` limit 无校验，`abc`→NaN 500，负数 take 取尾部。
- [存疑] `advertising.service.ts:14-17` metrics30d 按行 take 30，若一 campaign 一天多行则实际窗口 <30 天。
- [存疑] `advertising.service.ts:112` savingsProjectedMonthly=单日 spend×4，口径可疑。
- [存疑] `store-sku360-data-source.ts:113,136` getProfit/getReturns 不按 currentPeriod 过滤（该源默认关闭）。
- [存疑] `commerce-store.service.ts:234-241` hydrateSellerIdentity 吞错后仍置 CONNECTED。

**apps/api — auth / listing / market / purchase / creative**
- `auth.service.ts:59` `user.memberships[0]` 无 orderBy，多 workspace 用户活跃 workspace 不确定，与 workspace.service 口径不一致。
- `listing.service.ts:679,688` Listing 查询/创建用未 trim 的 skuId（resolvedSkuId 算了没用），带空格时 P2003。
- `listing.service.ts:71,793-843` 内存 job Map 无 TTL/淘汰，长期运行内存泄漏。
- `creative.controller.ts:15` skuCode 缺省静默回退 `'MTH-GREEN-001'`，漏传字段时给错误产品生成素材并计费。
- [存疑] `market.service.ts:227-242` 非 toothbrush 关键词返回硬编码中文文案 + `status:'APPROVED'` 伪造机会，绕过 DB 与引擎，污染审批统计。
- `purchase.service.ts:89-92` totalAmount number 浮点累乘写 Decimal(12,2)，四舍五入尾差与前端展示不一致。
- `market.controller.ts:31,55` `Number(limit)` NaN 透传。

**apps/api — analyst / scenario / storage / tool-center / health / agent-task**
- [存疑] `scenario.service.ts:81-126` resetDemo 清理清单不含 PlannedAction/ActionExecution/WorkflowIdempotency，重复 reset 累积孤儿行。
- [存疑] `scenario.service.ts:545-676` demoUser 缺失时静默跳过核心种子数据但 reset 返回 success。
- `scenario.service.ts:646` 种子 ToolExecution 的 weekStartA/B 硬编码 2026-08-15/22，与场景生成器起点不一致。
- `storage.controller.ts:22-24` 所有错误统一包装成 404，S3 未配置也 404，错误码丢失。
- `tool-center.service.ts:171-172` listExecutions 硬编码 `source:'TOOL_CENTER'`、伪造 `trace_${id}`，trace 关联断裂。
- [存疑] `analyst.service.ts:117-147` askAnalyst 用 `Math.max(15, ...)` 伪造最小延迟。
- `agent-task.service.ts:32,60,75-76` JSON.parse 无容错，畸形 JSON 直接 500。
- [存疑] `health.service.ts:18-19` 绕过 DI 自建 Redis/Milvus 实例，连接状态可能与系统其余部分不一致。

**packages/domain**
- `compliance-judge.service.ts:142` passedRulesCount 按违规条目数扣减，同规则多字段命中时计数可为负/虚低（应去重 ruleCode）。
- `workflow-aggregator.ts:99-105` topRisks.financialExposure 混用单位（margin/daysCover/件数/美元跨域排序无意义）。
- 三层阈值魔法数字：detector 可配置 `zeroConversionClicksThreshold`(20)，但 `advertising-diagnosis.pattern.ts:92` 与 `advertising-action.policy.ts:57` 硬编码 15；`inventory-action.policy.ts:212` 硬编码 daysCover>90；多处 `?? 29.99` ASP fallback（含 `operation-anomaly-detector.ts:963` 证据里的 `velocity*29.99`）。workspace override 后 detect/diagnose/recommend 三层口径不一致。
- `competitor-action.policy.ts:60,135-139` priceGap 为负（竞品更贵）时输出「比我方低 $-3.50」且 impactAmount 变正。
- `prisma-workflow-database.adapter.ts:172` OCC create 分支并发撞 P2002 未映射为 CheckpointVersionConflictError。
- `workflow-checkpoint.store.ts:157-179` file 后端 OCC get-then-write 非原子（仅 dev/test 路径）。
- [存疑] `advertising-action.policy.ts:160` ACOS 超标时只要已有其他动作就不再建议 REVIEW_BID，无注释。
- [存疑] `ad-optimizer.service.ts:45-46` 注释「0 or 1 order 且 ACOS>80%」与实际条件 `spend>=40 && acos>=0.80` 不符，高转化高 ACOS 词也会被建议精准否定。
- [存疑] `sku360-context-loader.ts:206-216` identity 加载失败被 catch 后伪造 ACTIVE 身份兜底，无 evidence 记录。

**packages/integrations / db / actions**
- `mcp-client.ts:135` `retryable: isAbort || true` 恒 true（写反/调试残留），非重试错误也白打一次。
- [存疑] `mcp-executor.ts:26` 把 `SecretProvider.redact(args)` 打码版当真实请求参数发给远端工具（当前 XYDC 参数不含敏感词，暂无实际损害）。
- `action.router.ts:28-34` 幂等重放用新 traceId 覆盖缓存结果原 traceId；幂等表为进程内 Map 重启即失；COMPUTER_USE/HUMAN 落 default 被标 executed:true。[部分存疑]
- `amazon-adapter.ts:130-140` `OrderQuery.to` 被静默忽略；listProducts 固定 pageSize 20 只取第一页。
- `provider-cache.ts:118-145` Redis 健康但 miss 时不回读 in-memory 副本，与 set 双写不对称；`:46` InMemoryProviderCache 无容量上限。
- `xydc.mapper.ts:174-182` toMarketOverview 用 `||` 伪造默认值（48500/30.5/4.42/...），真实值 0 也被替换，与同文件「strictly null」注释原则矛盾。
- [存疑] `simulator-adapter.ts:254` store 未绑定 account 时 channel 静默回退 'amazon'，simulator-shopify 会被当 amazon 渠道查 campaign。
- `milvus-vector-store.ts:133-135` delete 在未连接时静默 return（其他方法都先 connect），删除被无声丢弃。
- `integration-gateway.ts:105-122` adapter throw 路径 `retryable:false` 但循环不 break，非重试异常也打满 maxAttempts。

**apps/worker / ai / tool-platform**
- `operation-daily-diagnosis.tools.ts:293` `state.recommendedActions.length` 无空值保护（274 行有空保护，293 没有），checkpoint 缺字段时 TypeError。
- `llm-runtime.ts:96-99` repair 成功路径 retryCount 虚报；多处 `throw {...} as LlmError` 抛普通对象，`instanceof` 失效且无堆栈。
- `openai-compatible.provider.ts:154`（及 embedding 同族 :111）超时只覆盖到拿到 headers，`response.json()` 读取不受 AbortController 保护，慢流可无限挂起。
- [存疑] `tool.executor.ts:56` `source==='WORKFLOW'` 完全跳过权限校验，source 由调用方传入可被滥用；validateInput mutate 调用方 input 且非法 boolean 静默漏过。
- `market.tools.ts:160` `total: products.length` 伪造分页总数，前端永远无法翻页。
- `keyword-intake.tools.ts:198` deduplicatedCount 把空 keyword 跳过条目也算成去重数。
- `dashscope-image.provider.ts:78` 硬编码 fallback IP `http://116.198.230.217:2222` 进源码，env 缺失时必然失败且误导排障。
- [存疑] `creative-studio.tools.ts:261-306` infographic 固定返回 unsplash 图、resize 原样返回源 URL 却声称裁剪尺寸，无 mock 标记（同文件 video 工具有 `mock:true`），违反真实度分级口径。
- `apps/worker/src/main.ts:8-15` shutdown 中 `workerService.stop()` 抛错则 `process.exit(0)` 不执行，进程僵死只能靠 SIGKILL。
- [存疑] `listing-output.schema.ts:83` searchTerms 用字符数校验 250 而 prompt 要求 250 **bytes**，与 keyword-combine 的 `Buffer.byteLength` 口径不一致。

**apps/web**
- `ui-labels.ts:29-37` 缺 `PARTIALLY_RECEIVED` 映射，采购页回退英文原串（违反状态枚举中文映射约定）；[存疑] 缺 VOC `FEATURE_REQUEST`。
- `app/api/v1/listings/generate/stream/route.ts:42-50` SSE 代理丢弃上游状态码恒 200，鉴权失败被报成「生成中断」，绕过 401 清会话逻辑。
- `authenticated-sse.ts:99-100` + `business-analyst/page.tsx:116-145` 流正常结束但无终止事件时 sseActive 永远 true，按钮永久禁用无提示。
- `listing-generate-stream.ts:37-61` `pollListingGenerate` 无超时无最大轮次，job 卡 running 时 400ms 无限轮询。
- `insight-stack.tsx:26`、`recommendation-center.tsx:47-51` 展开状态用首渲染 props 初始化，数据刷新后 stale。
- `orders/page.tsx:229,232` 件数 `reduce(...) || 1` 把空明细显示成「1 件」，SKU 编码 `|| 'MTH-WHITE-001'` 伪造。
- `overview/page.tsx:154` 「日均」硬编码除 90，数据不足时偏小，空数据显示 `日均 $0`。
- `profit/page.tsx:164` ACOS 提示硬编码 `12.3%`，不随数据变化。
- `action-list.tsx:148` `!amount` 把合法的 0 影响额判为假（应 `amount == null`）。
- `operations/today/page.tsx:176` 「重新诊断」marketplaceId 硬编码 `'AMAZON_US'`，忽略业务上下文切换。
- [存疑] `listings/page.tsx:496,890` productId 为空时点击无反馈；发送素材中心用硬编码 `'prod-marble-001'` 兜底。
- [存疑] `advertising/page.tsx:177-193` 预警横幅文案写死「bathroom organizer / $420 / 93.3%」，按钮实际操作 `recommendations[0]`，文案与行为可能脱节。

---

## 6. 修复优先级建议

| 批次 | 内容 |
| :--- | :--- |
| P0 立即 | S1-S10（重点：S8 simulator campaign 前缀——数据源持续腐败中；S2/S3/S9 越权；S1 假发布） |
| P1 下一批 | M1-M7 并发/幂整改批次（统一改条件更新/唯一约束/原子 decrement）；M16/M17 tool-center 越权与吞错；M20/M24/M33 契约与真实度；M34/M35 前端阻断性 bug |
| P2 择机 | §5 低档项，建议合并进对应 Epic 顺手修（如 ui-labels 缺失并入 Epic B Alert Center 的前端工作） |

修复时的共同纪律（沿用 V9.1 Phase 经验）：每修一个 Bug 补一个回归测试；涉及冻结域（WF-05 公式、Simulator 种子参数）只修 bug 不改行为口径；修完更新 `docs/HANDOFF.md` 状态块。

---

## 7. 附：与 Closed-loop PRD 的联动

本审计发现直接输入 `docs/20_epics/closed-loop/CLOSED_LOOP_OPERATIONS_LAYER_PRD.md`：

- Epic A（Outcome Tracking）实现前必须先修 **S8**（simulator 广告数据腐败，否则 Before/After 指标无意义）与 **M6**（销量窗口口径）；
- Epic B（Incident & Alert）的 SYNC_FAILURE/TOKEN_EXPIRED 检测直接消费 SyncRun，需注意 **M26** 首 tick 竞态；
- Epic D（Autopilot）的 Policy 执行依赖 Action 状态机原子性，**M1/M2** 是 L3 的硬性前置（自动执行绝不能容忍双写）；
- tool-platform 越权面（S9/M16）在 Autopilot 自动调用工具时爆炸半径更大，L3 开启前必须关闭。
