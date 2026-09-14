# 外部设计吸收：Batch A 修复回交二次独立复审（R2）

日期：2026-09-14。统筹：Kimi Code。

**结论：PASS。BA-R1～R3 三项阻断缺陷已实际闭环，Batch A 验收通过，放行 Batch B。** 遗留 2 项非阻断跟进项（见 §4），不阻塞放行，但必须在后续批次处理。

项目根目录：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。
审核对象：执行方（Gemini）按 [EXTERNAL_ABSORPTION_BATCH_A_REVIEW_20260914.md](./EXTERNAL_ABSORPTION_BATCH_A_REVIEW_20260914.md) §4 实施的修复回交，自报 `READY_FOR_REVIEW`。
复审规程：交接包 [EXTERNAL_ABSORPTION_HANDOFF_PACKAGE_20260914.md](./EXTERNAL_ABSORPTION_HANDOFF_PACKAGE_20260914.md) §2。

## 1. 独立核实依据（非转述执行方报告）

- HEAD 保持 `e474c20`，全部改动仍在未提交工作区，无 commit/push；`git diff --stat` 仅 8 个 tracked 文件（+283/−113），**改动范围无夹带**。
- **指纹核对**：A-1 四文件（simulator.service.ts、simulator.spec.ts、simulator-adapter.ts、legacy-reset-disabled.spec.ts）SHA-256 与首轮指纹严格一致，A-1 成果零回退；执行方自报的 7 个修复/新增文件指纹与实测逐一相同——自报诚实。
- **独立复跑**（命令、退出码均为统筹实测）：
  - 统筹首轮探针 `review-codex/batch-a-probes.cjs`：**4/4 PASS**（修前 0/4）；
  - api 定向 4 suites / **19 tests PASS**（含新增 market-service-snapshot-truthfulness 2/2）；
  - Mapper 真实性验收 **6/6 PASS**（含新增 trending 缺失 Case 6）；
  - web 定向 **6/6 PASS**（含 BA-R3 硬编码结论清除用例）；
  - G1 对抗探针 10/10 + 10/10 + 9/9 = **29/29 PASS**；
  - `scripts/run-automation-acceptance.cjs` E01～E15 **15/15 PASS**（真实隔离 PG/Redis，29s）；
  - `pnpm -r typecheck` **10/10 workspace clean**；web build 以执行方自报 24/24 为准。
- **源码人工抽查**（行号见取证记录）：`market.service.ts` LIVE 分支无 fallback 常数、无 trending 模板、`competitorCount` 取真实长度、经 `XydcMapper.toMarketOverview` 映射、catch 兜底保持 `mode: 'MOCK'`；`xydc.mapper.ts` trending volume/growth 缺失为 null；`page.tsx` 四条结论文案零残留，trending 渲染 null 安全。
- **统筹新增 R2 对抗探针**（执行方未覆盖场景，`artifacts/external-absorption/batch-a/review-kimi/`，无网络无数据库）：products 非空但字段部分缺失的混合 LIVE 输入下，avgPrice=25（只用真实数据）、无来源指标全 null、trending 为空、competitorCount=2；部分字段为 null 的 snapshot 渲染无任何结论性短语——**6/6 PASS**。

## 2. 缺陷关闭确认

| 缺陷 | 首轮实证 | 本轮复核 | 结论 |
|---|---|---|---|
| BA-R1 Service 数据链假值 | 空 LIVE 输入输出 48500/30.5/4.42/1120/6.1 | 空输入全 null；混合输入只用真实值；经 Mapper 映射 | **关闭** |
| BA-R2 trending 缺失转零 | 缺 volume/growth 输出 0/'+0%' | 缺失输出 null，合法 0 保留 | **关闭** |
| BA-R3 前端硬编码结论 | null/0 数据仍渲染 4 条结论 | 4 条文案零残留，null 安全渲染 '—' | **关闭** |

## 3. 边界说明

- MOCK 兜底分支仍返回完整编造数据（competitorCount: 12 等），但有 `mode: 'MOCK'` 标记且前端显示「MOCK 确定性仿真」徽标——属于交接文件允许的明确 MOCK fixture，**予以保留**。
- `searchVolumeMonthly` 由上游周搜索量 ×4.3 换算，属派生估算；来源真实、口径可接受，建议未来接入 EvidenceMeta 时标 `valueStatus: 'DERIVED'`（Batch C 范畴）。

## 4. 非阻断跟进项（移交后续批次）

- **F-1（建议 Batch B 顺带或单独小批）**：`market.service.ts:286-302` 的 `getProductOpportunities` 对任意关键词返回预制"机会卡"（写死 opportunityScore 8.6、confidenceLevel 0.90、编造评论统计文案），源自旧 commit ee9c777，不在本次 diff 内但属同类真实性问题，需立项修复。
- **F-2（前端润色）**：`page.tsx` 的「高增长买家搜索词」区块标题在 trending 为空时仍渲染，建议空数据时隐藏该区块或改为中性标题。

## 5. 裁定与下一步

**Batch A：PASS。** 主方案文档顶部裁定与 `docs/HANDOFF.md` 已同步更新。

**放行 Batch B**（入口矩阵与可信审批加固，任务卡见主方案 §12.2），执行提示词见交接包 §3，可直接复制给执行 AI。Batch C～E 继续不放行；Batch B 回交后按交接包 §3.1 复审。

Batch A 全部改动仍保留在未提交工作区；按纪律，commit/push 需等最终验收（交接包 §7）后由用户决定。
