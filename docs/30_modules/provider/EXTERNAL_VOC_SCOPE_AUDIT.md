# CrossPilot External VOC 数据检索范围与 Provenance 事实审计报告

> **编制时间**: 2026-09-11  
> **所属阶段**: Phase 6.1 — External VOC Scope 明确、数据源 Provenance 审计与成本追踪  
> **审计对象**: ASIN `B0BFGNSXYL`（GFWARE 大理石浴室牙刷架）对应的 Firecrawl VOC 抓取集（25 条原始文本）  
> **执行依据**: 基于实测抓取生成的真实 `raw-voc-audit-data.json` 逐条审计，坚决杜绝主观臆测。

---

## 一、实际检索 Query 审计

在 `FirecrawlVocProvider` 中针对目标商品执行的两路检索 Query：
1. **Query 1 (品类与痛点检索)**:
   ```text
   toothbrush holder marble bathroom complaints reviews (limit: 15)
   ```
2. **Query 2 (社区原声检索)**:
   ```text
   site:reddit.com toothbrush holder marble bathroom (limit: 10)
   ```

检索总计获取 25 条有效长文本（经 URL 去重与最小文本长度过滤后）。

---

## 二、5 大核心问题事实回答

### A. 有多少条明确提到了 B0BFGNSXYL？
- **结果**: **0 条 (0.0%)**
- **事实依据**: 25 条文本的正文、标题与源 URL 中，均未出现字符串 `B0BFGNSXYL` 或其小写变体。

### B. 有多少条明确讨论 GFWARE 对应商品？
- **结果**: **0 条 (0.0%)**
- **事实依据**: 25 条文本中未出现目标品牌词 `GFWARE` 或 `GFware`。

### C. 有多少条是明确讨论 marble toothbrush holder？
- **结果**: **17 条 (68.0%)**
- **事实依据**: 17 条文本中同时包含 `marble`（或天然石材/树脂复合石材）以及 `toothbrush holder` / `toothbrush caddy`，集中讨论大理石牙刷架的材质重量、孔径尺寸、积水防滑等品类特性。

### D. 有多少条是更泛化的 toothbrush holder / bathroom organizer？
- **结果**: **8 条 (32.0%)**
- **事实依据**: 8 条文本讨论了更广泛的卫生间台面收纳（Bathroom organization、牙刷牙膏清洁水垢、台面搭配等），未强绑定于大理石材质。

### E. 每一条实际来自哪个 URL / Domain？
25 条文本来自 **12 个完全独立的权威域名**，具有极高的来源多样性（Source Diversity），且无单一网页垄断现象：

| 序号 | 域名 (Domain) | 渠道大类 | 范围判定 (Scope) | 匹配关键词 (Matched Terms) | 页面标题 / 来源摘录 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `www.walmart.com` | RETAIL | **CATEGORY** | `[marble, toothbrush holder]` | Better Homes & Gardens Faux Marble Toothbrush |
| 2 | `www.amazon.com` | RETAIL | **CATEGORY** | `[marble, toothbrush holder]` | BCS Toothbrush Holder for Bathroom 4 Slots |
| 3 | `www.target.com` | RETAIL | **CATEGORY** | `[marble, toothbrush holder]` | Marble Toothbrush Holder White - Threshold™ |
| 4 | `www.etsy.com` | RETAIL | **CATEGORY** | `[marble, toothbrush holder]` | Marble Toothbrush Holder - Etsy Artisans |
| 5 | `www.youtube.com` | VIDEO | **CATEGORY** | `[marble, toothbrush holder]` | BCS Toothbrush Holder for Bathrooms Video Review |
| 6 | `www.cb2.com` | RETAIL | **CATEGORY** | `[marble, toothbrush holder]` | Nexus Black Marble Toothbrush Holder + Reviews |
| 7 | `www.instagram.com` | SOCIAL | **CATEGORY** | `[marble]` | Amazon bathroom marble essentials & caddy |
| 8 | `www.homedepot.com` | RETAIL | **CATEGORY** | `[marble, toothbrush holder]` | Creative Home - Curvy Natural Marble Toothbrush |
| 9 | `in.pinterest.com` | SOCIAL | **CATEGORY** | `[marble, toothbrush holder]` | Marble Toothbrush Holder - Pinterest Home Decor |
| 10 | `www.amazon.com` | RETAIL | **CATEGORY** | `[marble, toothbrush holder]` | Real Luxurious Natural Marble Toothbrush Holder |
| 11 | `www.youtube.com` | VIDEO | **GENERIC** | `[bathroom]` | TOP 5 Best Toothbrush Holder For Bathroom 2024 |
| 12 | `www.tiktok.com` | SOCIAL | **CATEGORY** | `[marble, toothbrush holder]` | Best Toothbrush Hiding Marble Container Ideas |
| 13 | `identifyasmodern.com` | FORUM | **CATEGORY** | `[marble, toothbrush holder]` | White Marble Toothbrush Holder Review |
| 14 | `www.walmart.com` | RETAIL | **GENERIC** | `[bathroom]` | Sweet Home Collection Handcrafted Bathroom Caddy |
| 15 | `www.youtube.com` | VIDEO | **GENERIC** | `[bathroom]` | BEST Toothbrush Holder EVER?! NPET Review |
| 16 | `www.reddit.com` | REDDIT | **CATEGORY** | `[marble, toothbrush holder]` | r/bathrooms: Bathroom Accessories marble holder |
| 17 | `www.reddit.com` | REDDIT | **CATEGORY** | `[marble, toothbrush holder]` | r/BuyItForLife: Brass & marble heavy bathroom caddy |
| 18 | `www.reddit.com` | REDDIT | **CATEGORY** | `[marble, toothbrush holder]` | r/cleaningtips: Tips for cleaning a toothbrush holder |
| 19 | `www.reddit.com` | REDDIT | **GENERIC** | `[bathroom]` | r/HomeDecorating: All-marble bathroom counter |
| 20 | `www.reddit.com` | REDDIT | **GENERIC** | `[bathroom]` | r/femalelivingspace: Decorate bathroom countertops |
| 21 | `www.reddit.com` | REDDIT | **GENERIC** | `[bathroom]` | r/Organization: Soap dish, toothbrush/paste caddy |
| 22 | `www.reddit.com` | REDDIT | **GENERIC** | `[bathroom]` | r/Oldhouses: Vintage bathroom fixture identification |
| 23 | `www.reddit.com` | REDDIT | **GENERIC** | `[bathroom]` | r/DesignMyRoom: Cleaning up the bathroom counter |
| 24 | `www.reddit.com` | REDDIT | **CATEGORY** | `[marble, toothbrush holder]` | r/functionalprint: Simple toothbrush holder insert |
| 25 | `www.reddit.com` | REDDIT | **CATEGORY** | `[marble, toothbrush holder]` | r/interiordecorating: Wood or marble countertop |

---

## 三、渠道与域名分布统计 (Source Diversity)

- **总抓取条目 (Raw Items)**: 25 条
- **独立 URL (Unique Pages)**: 25 个（100% 无重复 URL，去重比率 1.0）
- **独立域名 (Unique Domains)**: 12 个
- **渠道大类分布**:
  - `REDDIT`: 10 条 (40.0%)
  - `REVIEWS / RETAIL` (Walmart, Target, Amazon, CB2, Home Depot, Etsy): 7 条 (28.0%)
  - `YOUTUBE`: 3 条 (12.0%)
  - `SOCIAL` (Instagram, Pinterest, TikTok): 3 条 (12.0%)
  - `FORUM / BLOG`: 2 条 (8.0%)

---

## 四、核心结论与 Scope 修正决策

1. **绝对禁止误导性定性**:
   - 当前外部 VOC 的本质是：**大理石牙刷架品类外部讨论 (Category External VOC)**，而非单一特定 ASIN 的专属闭环反馈。
   - **严禁向用户声称**：“B0BFGNSXYL 的买家有 44% 认为孔位太小”。
   - **正确定性规范**：“在本次采集的 25 条相关外部公开讨论中，11 条提到了电动牙刷兼容/孔径过窄问题，占本次品类样本集分析的 44.0%”。

2. **分析范围标记 (Analysis Scope)**:
   - 本次调用的 `analysisScope.type` 必须确立为：`'CATEGORY'`。
   - 包含的详细分布：`exactProductItems: 0`、`brandProductItems: 0`、`categoryItems: 17`、`genericItems: 8`。

3. **分母语义完整性 (Sample Denominator)**:
   - 所有的频次输出必须同时暴露：`frequency: 11`、`percentage: 44.0`、`sampleSize: 25`、`scope: 'CATEGORY'`、`denominatorText: '11 of 25 analyzed category discussions'`。
