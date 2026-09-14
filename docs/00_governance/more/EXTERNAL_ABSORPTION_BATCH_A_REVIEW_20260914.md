# 外部设计吸收：Batch A 实施回交独立复审

日期：2026-09-14。统筹：Kimi Code（接替额度耗尽的 Codex 统筹会话；本次复审的测试复跑、指纹核对与独立探针证据由 Codex 在额度耗尽前完成采集，缺陷定位由 Kimi 对照当前源码逐条复核确认）。

**结论：CHANGES_REQUESTED。A-1（legacy reset 封闭）验收通过；A-2（XYDC 数据真实性）未闭环——Mapper 主字段已修，但实际页面数据链（MarketService）、Mapper 的 trending 子字段、前端结论性文案三处仍在伪造数据。修复并复审通过前：不得提交、推送、部署；不放行 Batch B～E。**

项目根目录：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。
审核对象：执行方（Gemini）按 [EXTERNAL_ABSORPTION_BATCH_A_HANDOFF_20260914.md](./EXTERNAL_ABSORPTION_BATCH_A_HANDOFF_20260914.md) 实施的 Batch A 回交，自报 `READY_FOR_REVIEW`，证据报告 `artifacts/external-absorption/batch-a/BATCH_A_EXECUTION_EVIDENCE.md`。

## 1. 本次复审依据（独立核实，非转述执行方报告）

- 审核基线 HEAD：`e474c20882094d2d34ed0da52591319a077319a8`。Batch A 全部改动位于未提交工作区，与执行方声明一致。
- **指纹核对**：执行方报告的 9 个变更/新增文件 SHA-256 与当前工作区逐一比对，9/9 一致（`artifacts/external-absorption/batch-a/review-codex/fingerprints.json`）。
- **独立复跑执行方测试**（`review-codex/test-results.json`）：
  - api 定向 3 suites / 17 tests PASS（legacy-reset-disabled 3、simulator 6、closed-loop-v2-compat 8）；
  - Mapper 真实性验收 5/5 PASS；
  - web 定向 5/5 PASS（market-overview-truth 2 + automation-page-truth 3）；
  - G1 两轮对抗探针独立复跑 10/10 + 9/9 = 19/19 PASS（探针脚本为统筹原始版本，未修改）。
- **统筹自写独立探针**：`review-codex/batch-a-probes.cjs`，对当前源码与构建产物在 vm 隔离中执行，无网络、无数据库调用（`actualNetworkCalls: 0`、`actualDatabaseCalls: 0`）。结果 **0 PASS / 4 FAIL**（`review-codex/batch-a-probe-results.json`、`review-codex/independent-probes.log`）。
- 缺陷定位由 Kimi 对照当前源码逐条复核：`apps/api/src/modules/market/market.service.ts:20-135`、`packages/integrations/src/provider-framework/providers/xydc/xydc.mapper.ts:178-182`、`apps/web/src/app/app/market-research/page.tsx:1374-1415`。

## 2. 阻断缺陷清单（BA-R1～BA-R3）

### BA-R1：MarketService 实际数据链没走修好的 Mapper，空 LIVE 数据仍产出全套假值（探针 A-SERVICE-MISSING-LIVE）

`apps/api/src/modules/market/market.service.ts` 的 `getMarketSnapshot()`（:20-135）**从未调用 `XydcMapper.toMarketOverview`**。它从 `market.product.search` 返回的 products 数组手工推导指标，推不出来时回落到硬编码常数（:52-57：`fallbackMonthly=48500`、`fallbackPrice=30.5`、`fallbackRating=4.42`、`fallbackReviews=1120`），竞争分写死 `0.65*10=6.5`、机会分算出 `6.1`（:84-86），trendingKeywords 由种子词模板编造且 growth 写死 `+28%/+15%/+35%`（:90-94），`competitorCount` 空列表时 `0 || 10 = 10`（:103）——却照常标注 `provider: searchRes.providerId`、`mode: searchRes.mode`（即 LIVE）。

探针实证：喂入 `success: true` 但 products 为空的 LIVE 响应，输出仍为搜索量 48,500、均价 30.5、评分 4.42、评论 1120、机会分 6.1、竞争分 6.5、三条伪造 trending 关键词，mode 标 LIVE。**即：Mapper 修好了，但给前端页面喂数据的真实链路根本没经过 Mapper，假值源头原样保留。** 这正是交接文件"不得只改类型、不修消费者"所禁止的交付形态。

**修复要求**：`getMarketSnapshot` 的 LIVE 分支改为经由 `XydcMapper.toMarketOverview`（或与其等价且同一真实性标准的映射）产出快照；缺失指标一律为 `null`，不得使用 fallback 常数；trendingKeywords 不得由种子词模板编造；`competitorCount` 空列表为 `null` 或 `0`（如实），不得 `|| 10`。catch 兜底分支返回 `mode: 'MOCK'` 的演示数据属于明确 MOCK，可保留，但不得进入 LIVE 标注的路径。

### BA-R2：Mapper 的 trendingKeywords 子字段仍把缺失转零（探针 A-TREND-MISSING）

`xydc.mapper.ts:178-182`：主字段已用 `pickFiniteNumber` 修好，但 trending 子字段仍是 `volume: this.pickFiniteNumber(k.volume, k.vol) ?? 0`、`growth: k.growth || k.growth_rate || '+0%'`。探针实证：输入仅有 keyword 的 trending 项，输出 `volume: 0, growth: "+0%"`——缺失被伪造成事实。

**修复要求**：trending 项的 volume/growth 缺失时输出 `null`；允许对 `MarketOverviewSnapshot` 的 trending 类型做与主字段相同的 `null` 兼容扩展，并同步前端展示的空安全处理。

### BA-R3：前端结论性文案无条件硬编码渲染，与数据无关（探针 A-UI-MISSING / A-UI-ZERO）

`apps/web/src/app/app/market-research/page.tsx`：执行方只修了四张指标卡主数字的兜底，但卡片下方的**结论性副文案仍无条件渲染**，snapshot 为 null 或为 0 时原样展示：

- :1374 `+22.4% 同比增长`（月搜索量卡）
- :1399 `壁垒中等，易切入`（平均评论数卡）
- :1407 `高潜力细分市场`（机会评分卡）
- :1415 `头部垄断度较低`（竞争烈度卡）

探针实证：分别以全 null 和全 0 的 snapshot 渲染页面源码，上述 4 条无依据结论均出现在可见文本中。这些是对用户做出的业务判断，无任何数据支撑，与 Batch A 消除的 `|| 48500` 假兜底同属一类真实性缺陷。

**修复要求**：这些结论文案要么基于真实数据按明确条件派生（无数据时不渲染），要么移除/显示"—"占位；不得以任何默认值形态保留。

## 3. 已通过项（不需要重做）

- **A-1 legacy reset 封闭**：`simulator.service.ts` 与 `simulator-adapter.ts` 双层 `LEGACY_RESET_DISABLED` 拦截，专项测试 3/3（零写入断言、Controller 拦截、v2 409 契约保留）与 v2 回归 14/14 PASS；验收标准达成。
- Mapper 主字段缺失/合法零/别名优先级：5/5 验收 PASS。
- 前端指标卡主数字空安全（`!= null ? : '—'`）：2/2 PASS。
- 既有回归：G1 两轮 19/19 探针、执行方自报 E01～E15 15/15、typecheck 10/10、web build 24/24（后三项本轮未全量重跑，以执行方自报为准，修复后复审时需复验）。

## 4. 修复提示词（复制给执行 AI）

```text
你是 CrossPilot 项目的执行工程师。项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot。
先读项目 AGENTS.md、docs\HANDOFF.md。

统筹对 Batch A 回交的独立复审结论为 CHANGES_REQUESTED，复审报告：
docs\00_governance\more\EXTERNAL_ABSORPTION_BATCH_A_REVIEW_20260914.md
只做报告 §2 列出的三项修复，不扩范围：

1. BA-R1：apps\api\src\modules\market\market.service.ts 的 getMarketSnapshot() LIVE 分支改为经由 XydcMapper.toMarketOverview（或同一真实性标准的等价映射）产出快照。缺失指标一律 null，删除 fallbackMonthly/fallbackPrice/fallbackRating/fallbackReviews/fallbackOppScore/fallbackCompScore 在 LIVE 分支的使用；trendingKeywords 不得由种子词模板编造（volume 按比例推算、growth 写死百分比均属伪造）；competitorCount 不得 0 || 10。catch 兜底的 MOCK 演示分支可保留，但必须保持 mode: 'MOCK' 标注，不得混入 LIVE 路径。
2. BA-R2：packages\integrations\src\provider-framework\providers\xydc\xydc.mapper.ts 的 toMarketOverview 中，trendingKeywords 的 volume/growth 缺失时输出 null（去掉 ?? 0 和 || '+0%'）；允许对 TrendingKeyword 相关契约类型做 null 兼容扩展，并同步前端展示空安全。
3. BA-R3：apps\web\src\app\app\market-research\page.tsx 四条结论性副文案（'+22.4% 同比增长'、'壁垒中等，易切入'、'高潜力细分市场'、'头部垄断度较低'）不得无条件渲染：要么基于真实数据按明确条件派生（无数据/为 null 时不渲染），要么移除并显示占位；禁止任何默认值形态的保留。

纪律要求：
- 先写断言正确行为的失败测试（修前失败、修后通过），不得修改既有断言来接受旧错误结果。
- 保持已有成果不回退：A-1 legacy reset 封闭、Mapper 主字段 pickFiniteNumber 行为、前端卡片主数字空安全；G1 两轮 19 项探针与 scripts/run-automation-acceptance.cjs E01～E15 必须保持全过。
- 受影响包执行构建、typecheck 与定向测试；测试实际调用当前代码与构建产物，不得用旧 dist 或固定输出冒充通过。
- 不提交、不推送、不部署；不改动 Automation v1 已通过 G1 的代码行为。
- 统筹将重跑独立探针 artifacts\external-absorption\batch-a\review-codex\batch-a-probes.cjs，修复后必须 4/4 PASS（你可以先自行运行它验证：node artifacts\external-absorption\batch-a\review-codex\batch-a-probes.cjs；注意它引用 packages\integrations 的 dist，修改 Mapper 后需先构建该包）。
- 证据与报告写入 artifacts\external-absorption\batch-a\（新增文件，不覆盖 review-codex 统筹证据目录）；完成后输出文件清单、复现与修复结果、全部测试命令与退出码、未验证项与 Git 指纹，标 READY_FOR_REVIEW 并停止。
```

## 5. 修复后复审方式（接任统筹执行）

1. 核对 Git 指纹：修复涉及的文件应出现在新 diff 中，A-1 相关文件指纹不得变化。
2. 独立复跑执行方全部定向测试 + 新增失败复现测试。
3. 重跑统筹独立探针 `batch-a-probes.cjs`（先 `pnpm --filter @crosspilot/integrations build`），必须 4/4 PASS。
4. 复跑 G1 两轮 19 探针与 E01～E15 回归。
5. 人工抽查 `market.service.ts`、`xydc.mapper.ts`、`page.tsx` 三处源码，确认无常数回退、无模板编造、无条件结论文案。
6. 判定 PASS 后方可放行 Batch B（放行条件见交接包 `EXTERNAL_ABSORPTION_HANDOFF_PACKAGE_20260914.md`）。
