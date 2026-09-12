# CrossPilot V9.1 Phase 2.2 — XYDC 5151 vs 5147 Adjudication

> **阶段**：只审查并裁决 `totalReviewCount` 5151 ≠ 5147  
> **日期**：2026-09-12  
> **禁止**：改 Provider Framework / XYDC Provider / Mock 数值 / 测试期待 / 冻结算法  
> **上位**：`V9_1_PHASE2_1_IDEMPOTENCY_HARDENING_REPORT.md` §12

---

## 1. Verdict（先给结论）

| 项 | 裁决 |
| :--- | :--- |
| **这是不是产品 Bug** | **否** |
| **这是不是 Phase 2.1 回归** | **否**（V91-017 未碰 integrations） |
| **5147 是什么** | 历史快照 / Mock 夹具，ASIN `B0BFGNSXYL` 曾经的公开评价数 |
| **5151 是什么** | **当前 XYDC LIVE** `get_asin_info` 返回的 `ratings` |
| **Mapper 有没有算错** | **没有**。`entity.ratings → totalReviewCount` 直映 |
| **要不要把 5147 改成 5151** | **不要**。会再次漂移 |
| **本阶段改不改代码** | **不改**。Provider Framework 冻结，且本阶段只裁决 |

**处置**：`TEST_SNAPSHOT_STALE` / `LIVE_DATA_DRIFT`。  
本地 `pnpm -r test` 在 `.env` 有 XYDC 凭证时会红，原因是测试把 **LIVE 公开评价总数** 当成 **冻结夹具**。不是 XYDC 实现坏了。

```text
CrossPilot V9.1 Phase 2.2
XYDC Review Count Adjudication
COMPLETED / WAITING FOR HUMAN ACCEPTANCE
```

---

## 2. Failing Assertion

文件：`packages/integrations/test/provider-framework.test.cjs`  
函数：`testPhase5ProviderCacheAndVoc`  
注释自称：`Gateway execution of review.product.health (Mock Fallback)`  
断言：

```js
assert.strictEqual(resHealth.data.totalReviewCount, 5147);
// actual 5151
```

同一函数里，**纯 Mapper 夹具**全部绿：

```js
const mockEntity = { asin: 'B0BFGNSXYL', stars: 4.6, ratings: 5147 };
XydcMapper.toReviewHealthResult(...)  // totalReviewCount === 5147  PASS
XydcMapper.toVocAnalysisResult(...)   // totalReviewCount === 5147  PASS
```

失败只发生在 `createDefaultIntegrationGateway().executeCapability(...)`。

---

## 3. Evidence（2026-09-12 实测，未改源码）

本机 `.env`：`XYDC_MCP_ENDPOINT` / `XYDC_MCP_TOKEN` **有值**（本报告不写内容）。`REDIS_URL` 不存在。

对同一 ASIN 调默认网关（只打印元数据与计数）：

```text
success            true
providerId         xydc
mode               LIVE
fallbackUsed       false
transport          MCP
remoteToolName     get_asin_info
averageRating      4.6
totalReviewCount   5151
analyzedReviewCount null
```

路由事实：

- Mock `review.product.health` priority = **10**
- XYDC `review.product.health` priority = **100**
- `CapabilityBindingRegistry.getBindingsForCapability` 按 priority 降序
- `IntegrationGateway` 主路径成功即返回，**不会**走 Mock

因此测试注释里的 “Mock Fallback” **在本机当前环境为假**。XYDC 活着时，这条断言测的是亚马逊公开评价数，不是 Mock。

---

## 4. 5147 从哪来

仓库里 5147 是 **同一条历史快照**，不是运行时计算：

| 位置 | 角色 |
| :--- | :--- |
| `mock-market.provider.ts` `review.product.health` / `voc.product.analyze` | Mock 写死 5147 |
| 测试 `mockEntity.ratings = 5147` | Mapper 单测夹具 |
| `docs/30_modules/provider/XYDC_CAPABILITY_MAPPING.md` | 文档示例 |
| `packages/domain/test/fixtures/real-marble-case.fixture.json` | Epic 3 金标夹具 |
| `scenario-sku360-data-source.ts` | 演示 SKU 静态数 |
| `scripts/verify-live-voc-call.cjs` | 现场脚本仍写死 `=== 5147` |

夹具自己已经记录过增长：`REVIEW_COUNT: 5056 -> 5147`。再变成 5151 与这条时间线一致（公开评价数上升），不是 off-by-4 实现错误。

git HEAD 的 `provider-framework.test.cjs` **还没有** 5147 断言。这些是工作区未提交的 XYDC Phase 5.1 脏文件，不是 V91-017 引入的。

---

## 5. 排除项

| 假设 | 结果 |
| :--- | :--- |
| Mapper 把百分比加进 count | 否。`parseInt(entity.ratings)` |
| Mock 返回 5151 | 否。Mock 源码仍是 5147；实测 `providerId=xydc` |
| Phase 2.1 Prisma / 幂等表污染 | 否。integrations 不读 Prisma |
| Redis 脏缓存 | 否。`REDIS_URL` 缺失；本次 `mode=LIVE` 不是 `CACHED` |
| 星级分布 78+12+4+2+4=100 被当成 count | 否。那是百分比字段，未写入 `totalReviewCount` |

`analyzedReviewCount === null` 仍然成立：XYDC 只给总量，不给评论文本。这条诚实边界没坏。

---

## 6. 裁决细则

1. **5151 是当前 LIVE 事实。** 接受它等于接受 XYDC `get_asin_info.ratings` 此刻的值。
2. **5147 继续当夹具。** Mock、Mapper 单测、Epic 3 marble fixture 应保持快照，不追生产计数。
3. **禁止**把测试期待改成 5151 来刷绿。下一次 LIVE 再变又红。
4. **禁止**为了这条去改 `XydcProvider` / `XydcMapper` / Mock / Router。没有实现缺陷可修。
5. **以后若要让 `pnpm -r test` 在有 XYDC 凭证时也绿**（需单独批准，本阶段不做）：
   - 这条 gateway 测试应断言 **形状**（`success`、`providerId ∈ {xydc,mock}`、`analyzedReviewCount === null`、`typeof totalReviewCount === 'number'`），不要断言精确公开评价数；或
   - 该用例显式清掉 XYDC secret，让注释里的 Mock Fallback 真的发生，再断言 5147；或
   - LIVE 校验只放 `scripts/verify-live-voc-call.cjs`，且同样不要写死 count。
6. 同源债务（不修）：`scripts/verify-live-voc-call.cjs` 仍要求 `totalReviewCount === 5147`，LIVE 下同样会假失败。

---

## 7. Scope Check

本阶段 **未修改**：

- Provider Framework 源码
- XYDC Provider / Mapper / config
- Mock `5147`
- 测试期待
- WF-05 / Prisma / Phase 1–2.1 业务语义
- 冻结算法

产出仅此报告。

未进入 Phase 3、Epic 4、V91-022–029、UX polish。

---

## 8. Stop Boundary

```text
CrossPilot V9.1 Phase 2.2
XYDC Review Count Adjudication
COMPLETED / WAITING FOR HUMAN ACCEPTANCE
```
