# Phase 2B Candidate Enrichment 执行提示词

你现在要在 CrossPilot 中实施 **Product Research Phase 2B — Candidate Enrichment**。

当前基线：

```text
Product Research V2.0.0-FROZEN
Auto Discovery V2.1.0-FROZEN
本地冻结 Commit: 580ceff
```

唯一设计依据：

```text
docs/30_modules/product-research/PRODUCT_RESEARCH_CANDIDATE_ENRICHMENT_V2_2_SPEC.md
```

请先完整阅读该 Spec，再审计当前仓库实际 Contracts、Provider Registry、VOC Provider、V2 Handoff 和 Auto Discovery 实现，然后直接开发。不要重新设计方案，不要先给架构建议。

核心目标：

```text
CandidateDraft
→ Representative Competitors
→ Competitor Enrichment
→ VOC / Pain Points / Use Cases
→ Price Positioning
→ Product Concept
→ Differentiation Hypotheses
→ Enrichment Gate
→ Enriched Product Candidate
→ Existing V2 Frozen Pipeline
```

必须遵守：

1. 不修改 V2.0 / V2.1 Frozen 核心语义；需要兼容时新增 Adapter。
2. Missing ≠ 0；Provider 没返回的数据保持 UNKNOWN。
3. External VOC 绝不能冒充 Amazon Review。
4. VOC 百分比只有真实 denominator 存在时才允许计算。
5. Evidence subjectId / scope 不可改写；找不到 Evidence 不得造 Stub。
6. CATEGORY Evidence 不得冒充 PRODUCT Evidence。
7. Product Fact 与 Product Hypothesis 必须分离。
8. LLM 只能做主题归纳、概念总结、差异化假设；不能生成 ASIN、价格、销量、评论数、材质事实、尺寸事实、认证事实、成本或 Patent 结论。
9. DifferentiationHypothesis 必须绑定 Evidence；无充分证据时必须 LOW + validationRequired。
10. Suggested Target Price 只能是 ESTIMATE / ASSUMPTION，不能伪装 FACT。
11. Phase 2B 不新建 Economics Engine；已有 manual economics inputs 原样带 Provenance 交给 V2。
12. 无 Patent / Compliance Evidence 时继续 UNVERIFIED。
13. 不做 Supplier Search、1688、Patent Agent、Listing、PPC、Scale Funnel。

优先复用当前 Provider Framework 中实际可用的：

```text
market.product.detail
review.product.health
market.product.trend
market.asin.keywords
voc.product.analyze
```

必须根据 Registry 判断 AVAILABLE / UNAVAILABLE，不要猜 Remote Tool。

实现 Spec 中的数据契约、Domain Services、API、最小 UI、Budget Guard、Enrichment Gate、Handoff 和 Acceptance Cases。

重点验证：

```text
- 竞品实际 sample size 如实
- External VOC source type / sample / denominator 如实
- 无 VOC 不造痛点
- Price min/median/max 确定性
- Product Fact / Hypothesis 分离
- Cross Candidate Evidence 被阻断
- Evidence Handoff 前后 immutable
- 手工 Economics Provenance 不丢
- Critical Economics 缺失时 V2 正常 NEEDS_VALIDATION
- 相同 Fixture 输出稳定
```

完成后执行：

```text
pnpm --filter @crosspilot/domain test
pnpm --filter @crosspilot/integrations test
pnpm --filter @crosspilot/api test
pnpm --filter @crosspilot/web test
pnpm -r typecheck
pnpm --filter @crosspilot/web build
```

并至少做一次真实 Candidate Enrichment Live Verification。

不要为了结果好看强行生成 SHORTLIST。只要 Enrichment 数据真实、可追溯、可安全进入 V2，即算 Phase 2B 成功。

最终报告严格按 Spec Definition of Done 输出。全部验收通过后停止开发，不继续追加 Phase 2C 或其他功能。
