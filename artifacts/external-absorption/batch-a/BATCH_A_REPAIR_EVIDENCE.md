# CrossPilot External Design Absorption - Batch A 独立复审缺陷修复证据报告 (R1)

> **当前状态**：`READY_FOR_REVIEW`（已完成三项阻断缺陷修复与全量验证，保留在未提交工作区，提请统筹复审）  
> **执行批次**：Batch A 复审修复（BA-R1、BA-R2、BA-R3）  
> **Git Base HEAD**：`e474c20882094d2d34ed0da52591319a077319a8`  
> **依据文件**：`docs/00_governance/more/EXTERNAL_ABSORPTION_BATCH_A_REVIEW_20260914.md`  
> **统筹独立探针验证结果**：`batch-a-probes.cjs` **4 / 4 PASS**（修前 0 PASS / 4 FAIL）

---

## 1. 修复对齐与改动说明

按照复审报告 §2 明确指出的三项阻断缺陷逐一修复，未扩大任何开发范围：

### 1.1 BA-R1：`MarketService.getMarketSnapshot()` LIVE 分支真实性修复
- **文件**：`apps/api/src/modules/market/market.service.ts`
- **修复措施**：
  1. 引入并优先使用 `XydcMapper`：若原始数据包含 `overview`，直接经由 `XydcMapper.toMarketOverview` 映射。
  2. LIVE 分支全面清除 `fallbackMonthly`、`fallbackPrice`、`fallbackRating`、`fallbackReviews`、`fallbackOppScore`、`fallbackCompScore` 等硬编码常数；当指标不存在或无法由有效商品列表/关键词指标计算时，严格输出 `null`。
  3. 彻底删除根据种子词模板伪造 trendingKeywords 的逻辑（原代码 `[organizer, portable, with lid]` 模板推算及写死增长率 `+28%/+15%/+35%` 彻底移除）；无有效趋势数据时返回空数组 `[]`。
  4. `competitorCount` 修正为如实取商品数组长度，空列表返回 `0`，禁止 `|| 10`。
  5. catch 块的 `MOCK` 兜底演示分支严格保留 `mode: 'MOCK'`，绝不混入 LIVE 路径。

### 1.2 BA-R2：`XydcMapper.toMarketOverview` 趋势子字段真实性修复
- **文件**：`packages/integrations/src/provider-framework/providers/xydc/xydc.mapper.ts`
- **修复措施**：
  1. 移除 `volume` 映射时的 `?? 0`，当 volume/vol 缺失时严格输出 `null`；合法 0 继续通过 `pickFiniteNumber` 得到保留。
  2. 移除 `growth` 映射时的 `|| '+0%'`，当 growth/growth_rate 缺失或为空字符串时严格输出 `null`。
  3. 同步调整 `packages/shared/src/contracts/research-contracts.ts` 与 `apps/web/src/app/app/market-research/page.tsx` 中 `MarketOverviewSnapshot.trendingKeywords` 类型，允许 `volume: number | null; growth?: string | null`。
  4. 前端渲染 `k.volume` 时采用 `k.volume != null ? k.volume.toLocaleString() : '—'`，彻底防御 `null.toLocaleString()` 崩溃。

### 1.3 BA-R3：`page.tsx` 前端结论性文案无条件渲染清除
- **文件**：`apps/web/src/app/app/market-research/page.tsx`
- **修复措施**：
  1. 彻底移除月搜索量卡下无依据伪造的 `+22.4% 同比增长`，改为基于数值是否存在的真实标签 `snapshot?.searchVolumeMonthly != null && snapshot.searchVolumeMonthly > 0 ? '月度检索体量' : '—'`。
  2. 彻底移除评论卡下写死的 `壁垒中等，易切入`，改为 `snapshot?.avgReviewCount != null && snapshot.avgReviewCount > 0 ? '样本平均评价数' : '—'`。
  3. 彻底移除机会评分卡下写死的 `高潜力细分市场`，改为条件派生；当缺失或为 0 时输出 `'—'`，杜绝无条件断言。
  4. 彻底移除竞争卡下写死的 `头部垄断度较低`，改为条件派生；当缺失或为 0 时输出 `'—'`。

---

## 2. 失败复现与修后通过对照

| 缺陷项 | 测试文件 / 探针 | 修前结果（复现失败） | 修后结果（已通过） |
|:---|:---|:---|:---|
| **BA-R1** | `apps/api/test/market-service-snapshot-truthfulness.spec.ts` | `Received: 30.5`（断言 `toBeNull()` 失败） | **2/2 PASS**（空 LIVE 数据产出 null，真实数据正常计算） |
| **BA-R2** | `packages/integrations/test/xydc-market-overview-truthfulness.test.cjs` | `Missing trending volume must be null, not 0` | **6/6 PASS**（Case 6 trending missing 产出 null） |
| **BA-R3** | `apps/web/test/market-overview-truth.test.cjs` | `page.tsx must not contain hardcoded +22.4% 同比增长` | **3/3 PASS**（4 条伪造结论彻底清除） |
| **统筹探针** | `artifacts/external-absorption/batch-a/review-codex/batch-a-probes.cjs` | **0 PASS / 4 FAIL** | **4 / 4 PASS**（A-SERVICE-MISSING-LIVE、A-TREND-MISSING、A-UI-MISSING、A-UI-ZERO 全绿） |

---

## 3. 全量测试命令与退出码

所有命令均使用当前源码构建产物实际运行，退出码严格为 0：

1. **统筹独立探针**：
   - 命令：`node artifacts/external-absorption/batch-a/review-codex/batch-a-probes.cjs`
   - 退出码：`0`（4 / 4 PASS）
2. **BA-R1 专项测试**：
   - 命令：`pnpm --filter @crosspilot/api test apps/api/test/market-service-snapshot-truthfulness.spec.ts`
   - 退出码：`0`（2 / 2 PASS）
3. **Mapper 真实性测试（含 BA-R2）**：
   - 命令：`node packages/integrations/test/xydc-market-overview-truthfulness.test.cjs`
   - 退出码：`0`（6 / 6 PASS）
4. **前端展示真实性测试（含 BA-R3）**：
   - 命令：`node --test apps/web/test/market-overview-truth.test.cjs`
   - 退出码：`0`（3 / 3 PASS）
5. **A-1 Legacy Reset 专项测试**：
   - 命令：`pnpm --filter @crosspilot/api test apps/api/test/legacy-reset-disabled.spec.ts`
   - 退出码：`0`（3 / 3 PASS）
6. **Simulator 单元测试套件**：
   - 命令：`pnpm --filter @crosspilot/api test apps/api/test/simulator.spec.ts`
   - 退出码：`0`（6 / 6 PASS）
7. **v2 闭环兼容性测试套件**：
   - 命令：`pnpm --filter @crosspilot/api test apps/api/test/closed-loop-v2-compat.spec.ts`
   - 退出码：`0`（8 / 8 PASS）
8. **Monorepo 类型检查**：
   - 命令：`pnpm -r typecheck`
   - 退出码：`0`（10 / 10 workspaces PASS, 0 errors）
9. **Next.js Web 生产打包**：
   - 命令：`pnpm --filter @crosspilot/web build`
   - 退出码：`0`（24 / 24 页面编译成功）
10. **G1 两轮探针独立运行**：
    - `node artifacts/automation-v1/g1-review/review-probes.cjs` -> 退出码：`0`（10 / 10 PASS）
    - `node artifacts/automation-v1/g1-review-round2/review-probes.cjs` -> 退出码：`0`（10 / 10 PASS）
11. **全链路自动化回归（E01～E15）**：
    - 命令：`node scripts/run-automation-acceptance.cjs`
    - 退出码：`0`（15 / 15 PASS）

---

## 4. 文件变更清单与 Git SHA-256 指纹

### 4.1 涉及文件指纹列表

| 文件路径 | SHA-256 指纹 | 状态说明 |
|:---|:---|:---|
| `apps/api/src/modules/market/market.service.ts` | `4F0CD70DA1C735C5C8035426706A2377B17559DC9451A9C1BDA018F72B2ED841` | BA-R1 修复（清除假常数，空数据产出 null） |
| `packages/integrations/src/provider-framework/providers/xydc/xydc.mapper.ts` | `0E3EDAD17E4C170C7228737B0BF8372CA3D9E2507CF72080EB5C280D99C59351` | BA-R2 修复（trending 子字段缺失输出 null） |
| `packages/shared/src/contracts/research-contracts.ts` | `DBC174FDB06DC7136546CCEDC502A35E06571265D390099EAF39E7121D292006` | BA-R2 契约扩展（trending volume/growth 可为 null） |
| `apps/web/src/app/app/market-research/page.tsx` | `7F556EBDB12EE27D7F68CFD566D46307710F29177842E90F5481978B8E12F0EF` | BA-R3 修复（清除 4 条假结论，trending 渲染 null 安全） |
| `apps/api/test/market-service-snapshot-truthfulness.spec.ts` | `1392819CE8EC9FE5EDDE86F007F829311B0DFE2BE3BABF8BD64CDDB24D072843` | BA-R1 专项测试（新增） |
| `packages/integrations/test/xydc-market-overview-truthfulness.test.cjs` | `33E920FADE6DF98B8B2CE01C7B3CDCE11DA4AF8C6679F1D332350349A3D0D892` | BA-R2 验收测试 Case 6（增补） |
| `apps/web/test/market-overview-truth.test.cjs` | `9CE303F0A8C6A1D25A33A2D3A1969224DFD0E06D8E11F4E28282BA7BAB50EFB6` | BA-R3 验收测试（增补） |

### 4.2 A-1 相关文件指纹保持（严格无回退）

| 文件路径 | SHA-256 指纹 | 与首轮复审对比 |
|:---|:---|:---:|
| `apps/api/src/modules/simulator/simulator.service.ts` | `610B324CE4621B553701CE2F649677BD3057733BC50E533C6C907DFA7BDF9166` | **严格一致** |
| `apps/api/test/simulator.spec.ts` | `DFB23B9D4E24EF484E62A037447B3EFE716D3AF0CF4513AAC302F191C6527949` | **严格一致** |
| `packages/db/src/commerce/simulator-adapter.ts` | `0883B228F725B8F8AAA772CABC50E8E679513F88BB212F35D8D7856EFDBB042B` | **严格一致** |
| `apps/api/test/legacy-reset-disabled.spec.ts` | `4428C03483D6CC58D67C535B25F224F1ACC948604D977BC14AC8E452E254C4C6` | **严格一致** |

---

## 5. 验收边界与未验证项声明

1. **未修改与未验证项说明**：
   - 本轮仅针对 BA-R1～BA-R3 实施修复，未启动 Batch B～E。
   - 生产数据库与云端部署保持未触碰状态（未执行 `git commit`，未执行 `git push`，未部署）。
2. **当前状态判定**：
   - 全部阻断缺陷已闭环并通过统筹独立探针验证，标记为 **`READY_FOR_REVIEW`**，停止操作并等待统筹最终确认。
