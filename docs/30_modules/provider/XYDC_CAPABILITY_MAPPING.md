# XYDC (西柚洞察) 官方 MCP 全量 Capability Mapping 与真实性审计文档

> **更新时间**: 2026-09-11  
> **真实 MCP Endpoint**: `https://mcp.xydc.com/mcp`  
> **MCP 协议**: JSON-RPC 2.0 (HTTP POST over TLS)  
> **凭据管理**: `SecretProvider` 动态读取 `.env` 环境变量 `XYDC_MCP_TOKEN`，全局掩码保护 (`mcp_****344c`)，严禁明文入库入卷入日志。  
> **真实发现状态**: **45 个官方远程 MCP 工具 100% 真实发现成功** (`tools/list`)。  
> **阶段边界**: **严格限定于 Phase 1 首个只读工具 (`get_asin_info`) 的真实联调与落盘**，其余 4 个假定能力均保持原状或标注为 Phase 2 候选，坚决杜绝越权扩大范围。

---

## 一、初始 5 大假定能力对比评估矩阵

在未接入真实凭据前，系统基于电商业务常识预设了 5 个临时占位能力（`PROVISIONAL_xydc_*`）。  
在本次真实 `tools/list` 发现后，与官方 45 个工具进行严格契约核实对比，评估结果如下：

| 序号 | CrossPilot 标准内部能力 ID | 初始临时占位符 (Provisional) | 真实对应 XYDC 工具名 | 支持度判定 | 业务匹配度与集成说明 | 当前执行状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `market.product.detail` | `PROVISIONAL_xydc_get_product_detail` | **`get_asin_info`** | **SUPPORTED** | **完美匹配**。入参为 `asins: string[]`, `country: string`，返回真实标题、价格、星级、评分数、主图与详情页 URL。单次消耗 1 Credit。 | **VERIFIED_LIVE** (首接验证通过) |
| 2 | `market.keyword.search` | `PROVISIONAL_xydc_search_keywords` | **`get_keyword_info`** | **SUPPORTED** | **高度匹配**。入参为 `keywords: string[]`, `country: string`，返回 ABA 搜索量、ABA 排名、Top 3 ASINs、建议竞价 CPC、竞争难度。单次消耗 1 Credit。 | **VERIFIED_LIVE** (Phase 2 接入验证通过) |
| 2A | `market.asin.keywords` | （此前未正式绑定） | **`get_asin_keywords`** | **SUPPORTED** | **ASIN → Keywords**。入参为 `asin`, `country`，返回近 7 天流量关键词（`searchTerm` / `ranks` / `trafficSummary`）。**禁止**用 `market.keyword.asin_analysis`（Keyword → ASINs）作为反查替代。Credit 以远程 `cost_credits` 为准，预估阶段不伪造单价。 | **VERIFIED_LIVE** (Phase 2A Provider Closure) |
| 3 | `market.product.trend` | `PROVISIONAL_xydc_get_product_trends` | **`get_asin_bsr_trends`** + **`get_asin_info_trends`** | **SUPPORTED_COMPOSITE** | **复合趋势能力**。XYDC 将趋势细分为 BSR 日级走势 (`get_asin_bsr_trends`) 与 价格/评分日级走势 (`get_asin_info_trends`)。CrossPilot 在 Provider 层并发聚合为统一的 `MarketTrend[]`（包含 BSR、PRICE、RATING、REVIEW_COUNT），并在代码中计算确定性统计与方向语义。 | **COMPOSITE_LIVE** (Phase 4 接入验证通过) |
| 4 | `market.product.search` | `get_keyword_info+get_asin_info` | `get_keyword_info` (ABA Top ASINs) + `get_asin_info` (批量详情) | **SUPPORTED_COMPOSITE** | **复合能力接入**。通过关键词提取 ABA Top ASINs，并在一次请求中批量获取商品基础信息与详情（标题/价格/星级/评价数），严格置空未提供字段。 | **COMPOSITE_LIVE** (Phase 3 接入验证通过) |
| 5 | `market.market.overview` | `PROVISIONAL_xydc_get_market_overview` | `search_market_insight_categories` + `generate_category_insight_resource` | **PARTIALLY_SUPPORTED** | **成本与异步约束**。官方类目洞察需生成资源（单次耗费 500 Credits 且异步生成 1~5 分钟）。轻量级大盘更适合通过 `get_keyword_info` 聚合并发提取。 | **PENDING_PHASE_2** (架构锁定，暂由 Mock 兜底) |

---

## 二、官方 45 个真实远程 MCP 工具全景分类清单

通过真实 MCP `tools/list` 协议反射获取的 45 个工具，按照电商运营场景结构化归类：

### 1. 商品与竞品情报 (Product & ASIN Intelligence) — 8 个
1. `get_asin_info`: 查询一个或多个 ASIN 的基础信息（标题、价格、星级、评价数、大图、链接），消耗 1 Credit。**[Phase 1 首接工具]**
2. `get_asin_bsr_trends`: 查询单个 ASIN 在大类和子类目下的 BSR 排名历史走势。
3. `get_asin_info_trends`: 查询单个 ASIN 的历史价格、评分及评价数变动走势。
4. `get_asin_order_trends`: 查询单个 ASIN 预测日销量与日销售额趋势。
5. `get_asin_traffic_trends`: 查询单个 ASIN 历史自然流量与广告流量日趋势。
6. `get_asin_ad_trends`: 查询单个 ASIN 历史新增广告活动时间与日趋势。
7. `get_primary_asin_children`: 获取父体/主 ASIN 的全部变体子 ASIN 列表及表现。
8. `get_asin_parent_history`: 查询单个 ASIN 在指定时间范围内的父体绑定与变体结构变化历史。

### 2. 关键词与流量情报 (Keyword & Traffic Intelligence) — 10 个
9. `get_keyword_info`: 批量查询关键词最近一周基础市场指标（ABA 排名、搜索量、建议 CPC、竞价区间）。
10. `get_keyword_aba_trends`: 查询关键词 ABA 搜索量周度历史走势（最多 52 周）。
11. `get_asin_keywords`: 反查单个 ASIN 近 7 天流量关键词列表（排名、流量占比、广告位）。
12. `get_asin_keywords_monthly`: 按月份反查单个 ASIN 历史月度关键词覆盖。
13. `get_keyword_asin_analysis`: 关键词反查在竞流量 ASIN（近 7 天）。
14. `get_keyword_analysis_monthly`: 按月份查询单个关键词下的 ASIN 竞争格局历史。
15. `get_keyword_advertising_replay`: 广告放映机（逐小时广告位监控）。
16. `get_multi_asin_keyword_comparison`: 多个 ASIN 近 7 天关键词覆盖横向交叉对比。
17. `get_multi_asin_keyword_comparison_monthly`: 多个 ASIN 月度关键词覆盖横向交叉对比。
18. `get_parent_asin_keywords`: 父体下全部子体近 7 天关键词聚合反查。

### 3. 类目大盘与市场洞察 (Category & Market Intelligence) — 14 个
19. `search_market_insight_categories`: 搜索亚马逊标准类目树路径及候选 ID（免费）。
20. `generate_category_insight_resource`: 为确认类目生成洞察资源（消耗 500 Credits，最长 5 分钟）。
21. `get_category_insight_summary`: 获取已生成类目的核心大盘概览。
22. `get_category_sales_ranking`: 获取类目月度/年度/近30天销量排行榜。
23. `get_category_new_releases_ranking`: 获取类目新品榜。
24. `get_category_surging_ranking`: 获取类目飙升榜。
25. `get_category_brand_concentration`: 获取类目品牌集中度分析（CR3, CR5, CR10）。
26. `get_category_seller_concentration`: 获取类目卖家集中度分析。
27. `get_category_country_concentration`: 获取卖家国别分布。
28. `get_category_price_distribution`: 获取类目价格带分布与各区间销量。
29. `get_category_rating_distribution`: 获取类目星级评分分布。
30. `get_category_seasonality`: 判断类目淡旺季与季节性规律。
31. `get_category_brand_sales_trends`: 查询类目 Top 品牌历史销售走势。
32. `get_category_seller_sales_trends`: 查询类目 Top 卖家历史销售走势。

### 4. 评论与 VOC 买家原声 (Reviews & Voice of Customer) — 8 个
33. `get_asin_review_analysis`: 查询 ASIN 评价分析结论（正负面情感标签）。
34. `get_asin_review_trends`: 查询 ASIN 留评速度与评分变化月度走势。
35. `get_asin_rating_distribution`: 查询 ASIN 详细 1~5 星星级占比与全球评分。
36. `get_asin_review_buyer_motivation`: 买家购买动机与使用场景画像分析。
37. `get_asin_review_positive_feedback`: 买家正面体验核心赞誉点提炼。
38. `get_asin_review_negative_feedback`: 买家负面痛点、缺陷与退货抱怨聚类。
39. `get_asin_review_user_profile`: 买家真实人群画像。
40. `get_asin_review_keyword_aggregation`: 评论高频词与特征词聚合。

### 5. 广告投放与竞价智能 (PPC & Sponsored Ads) — 4 个
41. `get_asin_ad_history`: 查询单个 ASIN 广告活动历史沉淀。
42. `get_asin_bid_trends`: 查询竞品建议竞价历史变动区间。
43. `get_asin_sp_position_trends`: SP 广告位与搜索结果首页渗透率历史走势。
44. `get_parent_asin_keywords_monthly`: 变体月度广告关键词流量跟踪。

### 6. 能力边界与服务监控 (System & Feedback) — 1 个
45. `report_missing_xiyou_capability`: 上报当前 MCP 无法满足的长尾业务场景。

---

## 三、Phase 1 首个只读工具接入工程契约 (`get_asin_info`)

### 1. 选型考量与边界
- **只读零副作用**：查询官方 Amazon 商品基础公开数据，无任何写操作、审批风险或高额计费风险；
- **单次成本确定**：固定 1 Credit，响应耗时极短（实测 302ms）；
- **业务对齐度高**：直接为 Listing 工作台、竞品分析提供权威的真实标题、价格、评分、图片与链接；
- **严格防御**：针对可能缺失的字段（如部分 ASIN 价格为 null），XydcMapper 实施确定性类型转换与默认安全值包裹。

### 2. 真实调用输入与输出报文

#### 真实请求报文 (脱敏后)
```json
{
  "jsonrpc": "2.0",
  "id": "mcp_1789109895000_abcde",
  "method": "tools/call",
  "params": {
    "name": "get_asin_info",
    "arguments": {
      "asins": ["B0BFGNSXYL"],
      "country": "US",
      "intent_summary": "Query product details for ASIN B0BFGNSXYL",
      "user_task": "CrossPilot market intelligence query for ASIN B0BFGNSXYL"
    }
  }
}
```

#### 真实返回报文 (脱敏后)
```json
{
  "jsonrpc": "2.0",
  "id": "mcp_1789109895000_abcde",
  "result": {
    "structuredContent": {
      "status": 200,
      "cost_credits": 1,
      "data": {
        "entities": [
          {
            "asin": "B0BFGNSXYL",
            "country": "US",
            "title": "GFWARE Toothbrush Holders for Bathrooms, 5 Slots Bamboo Toothbrush Holder Kids Electric Toothbrush Holder and Toothpaste Holder for Bathroom Countertop Accessories Storage, Marble Toothbrush Organizer",
            "currency": "USD",
            "price": "9.99",
            "stars": "4.6",
            "ratings": 5147,
            "smallPicUrl": "https://m.media-amazon.com/images/I/613FPhzNozL._AC_UY128_.jpg",
            "bigPicUrl": "https://m.media-amazon.com/images/I/613FPhzNozL._AC_UY512_.jpg",
            "amazonUrl": "https://www.amazon.com/dp/B0BFGNSXYL"
          }
        ]
      }
    }
  }
}
```

#### 归一化后的 CrossPilot MarketProduct 对象
```json
{
  "source": "XYDC",
  "marketplace": "AMAZON_US",
  "externalId": "B0BFGNSXYL",
  "asin": "B0BFGNSXYL",
  "title": "GFWARE Toothbrush Holders for Bathrooms, 5 Slots Bamboo Toothbrush Holder Kids Electric Toothbrush Holder and Toothpaste Holder for Bathroom Countertop Accessories Storage, Marble Toothbrush Organizer",
  "brand": "Generic",
  "category": "Home & Kitchen",
  "price": 9.99,
  "monthlySales": 0,
  "monthlyRevenue": 0,
  "rating": 4.6,
  "reviewCount": 5147,
  "bsr": 999999,
  "imageUrl": "https://m.media-amazon.com/images/I/613FPhzNozL._AC_UY512_.jpg",
  "sourceUrl": "https://www.amazon.com/dp/B0BFGNSXYL",
  "capturedAt": "2026-09-11T06:58:15.820Z"
}
```

#### 生成的 ResearchEvidence 凭据对象
```json
{
  "evidenceId": "ev_1789109895821_f92ka",
  "source": "XYDC",
  "providerId": "xydc",
  "transport": "MCP",
  "type": "MARKET_PRODUCT",
  "sourceId": "B0BFGNSXYL",
  "title": "XYDC 官方商品画像 (B0BFGNSXYL)",
  "content": "商品标题: GFWARE Toothbrush Holders for Bathrooms, 5 Slots Bamboo Toothbrush Holder Kids Electric Toothbrush Holder and Toothpaste Holder for Bathroom Countertop Accessories Storage, Marble Toothbrush Organizer\n价格: $9.99，评分: 4.6星 (5147条评价)\n数据来源: XYDC Remote Tool get_asin_info (耗费: 1 Credits)",
  "mode": "LIVE",
  "capturedAt": "2026-09-11T06:58:15.821Z",
  "metadata": {
    "asin": "B0BFGNSXYL",
    "marketplace": "AMAZON_US",
    "credits": 1,
    "imageUrl": "https://m.media-amazon.com/images/I/613FPhzNozL._AC_UY512_.jpg"
  }
}
```

---

## 四、Phase 2 第二个只读工具接入工程契约 (`get_keyword_info`)

### 1. 选型考量与业务价值
- **只读无副作用**：批量查询搜索词最近一周的市场指标，包含官方 ABA 搜索频率排名、周搜索量、头部 3 大转化 ASIN 及 CPC 建议竞价；
- **单次成本确定**：固定 1 Credit，响应耗时极短（实测 229ms）；
- **事实语义严格防御**：对于 XYDC 未返回的指标（如相关度、增长率），统一设为 `null`，坚决消除任何伪造默认值（如 0.8 或 +15%）。

### 2. 真实调用报文与归一化对象

#### 真实请求报文 (脱敏后)
```json
{
  "jsonrpc": "2.0",
  "id": "call_kw_live_1789110466000",
  "method": "tools/call",
  "params": {
    "name": "get_keyword_info",
    "arguments": {
      "keywords": ["toothbrush holder"],
      "country": "US",
      "intent_summary": "Query market metrics for keyword toothbrush holder",
      "user_task": "CrossPilot keyword research for toothbrush holder"
    }
  }
}
```

#### 真实返回报文 (脱敏后)
```json
{
  "jsonrpc": "2.0",
  "id": "call_kw_live_1789110466000",
  "result": {
    "structuredContent": {
      "status": 200,
      "cost_credits": 1,
      "data": {
        "total": 1,
        "list": [
          {
            "searchTerm": "toothbrush holder",
            "clickConversionRate": "0.197068",
            "competitiveDifficulty": 80,
            "organicRotation": "1.800000",
            "abaReport": {
              "reportFromDate": "2026-08-30",
              "reportToDate": "2026-09-05",
              "searchFrequencyRank": 4775,
              "weeklySearchVolume": 27057,
              "topAsins": [
                { "asin": "B0BFGNSXYL", "clickShare": "0.067", "conversionShare": "0.052" },
                { "asin": "B0B8VG753F", "clickShare": "0.055", "conversionShare": "0.050" },
                { "asin": "B08P4ZZTNG", "clickShare": "0.039", "conversionShare": "0.044" }
              ]
            },
            "costPerClick": {
              "value": "0.93",
              "minSuggestedBid": "0.74",
              "maxSuggestedBid": "1.11"
            }
          }
        ]
      }
    }
  }
}
```

#### 归一化后的 CrossPilot KeywordMetric 对象
```json
{
  "source": "XYDC",
  "marketplace": "AMAZON_US",
  "keyword": "toothbrush holder",
  "searchVolume": 27057,
  "abaRank": 4775,
  "competition": 0.8,
  "cpc": 0.93,
  "topAsins": ["B0BFGNSXYL", "B0B8VG753F", "B08P4ZZTNG"],
  "relevance": null,
  "growth": null,
  "capturedAt": "2026-09-11T07:07:47.120Z"
}
```

#### 生成的 ResearchEvidence 凭据对象
```json
{
  "evidenceId": "ev_1789110467121_ab82c",
  "source": "XYDC",
  "providerId": "xydc",
  "transport": "MCP",
  "type": "KEYWORD",
  "sourceId": "toothbrush holder",
  "title": "XYDC 官方关键词大盘指标 (toothbrush holder)",
  "content": "关键词: toothbrush holder\nABA搜索量: 27,057 (ABA周搜索量)，ABA排名: #4775，建议CPC: $0.93\n头部ASIN: B0BFGNSXYL, B0B8VG753F, B08P4ZZTNG\n数据来源: XYDC Remote Tool get_keyword_info (耗费: 1 Credits)",
  "mode": "LIVE",
  "capturedAt": "2026-09-11T07:07:47.121Z",
  "metadata": {
    "keyword": "toothbrush holder",
    "marketplace": "AMAZON_US",
    "credits": 1,
    "abaRank": 4775,
    "searchVolume": 27057,
    "topAsins": ["B0BFGNSXYL", "B0B8VG753F", "B08P4ZZTNG"]
  }
}
```

---

## 五、Phase 4 `market.product.trend` 复合商品趋势深度设计与真实性审计

### 1. 真实 Remote Tools Schema 审计对照

| 字段 / 属性 | `get_asin_bsr_trends` | `get_asin_info_trends` | `get_asin_order_trends` (对比评估) |
| :--- | :--- | :--- | :--- |
| **工具功能描述** | 查询单个 ASIN 的 BSR 类目排名日趋势 | 查询单个 ASIN 的商品信息日趋势 (价格/评分/优惠) | 查询单个 ASIN 的月订单量趋势 (指定月份范围) |
| **必需输入参数** | `asin`, `country`, `start_date`, `end_date` | `asin`, `country`, `start_date`, `end_date` | `asin`, `country`, `start_month`, `end_month` |
| **日期格式** | `YYYY-MM-DD` | `YYYY-MM-DD` | `YYYY-MM` |
| **时间粒度** | 日级 (Daily) | 日级 (Daily) | 月级 (Monthly) |
| **单次最大对象数** | 单个 ASIN (`asin: string`) | 单个 ASIN (`asin: string`) | 单个 ASIN (`asin: string`) |
| **支持国家/站点** | US, CA, MX, BR, UK, DE, FR, IT, ES, JP 等 | US, CA, MX, BR, UK, DE, FR, IT, ES, JP 等 | US, CA, MX, BR, UK, DE, FR, IT, ES, JP 等 |
| **数据可用时间范围** | 2021-03-08 至 当前日期 | 2023-06-01 至 当前日期 (约滞后 2 天) | 历史月份至当前月份 |
| **单次额度消耗 (Credits)** | 1 Credit (<10天) / 4 Credits (30天) | 1 Credit (<10天) / 3 Credits (30天) | 按查询月份区间浮动 |
| **主要返回数据结构** | `categoryTree`: 类目树 (`categoryId, name, root`)<br>`trends`: `[{ date, values: [{ categoryId, rank }] }]` | `trends`: `[{ date, ratings, stars, priceDistribution: { display, deal, origin, strikethrough, prime, promotion, coupon, subscribe, other } }]` | `trends`: `[{ date: "YYYY-MM", orders: number }]` |
| **错误自愈提示** | `dateRangeError`: 包含 `dateRangeNotice` 与 `actionable_next_step` | 同左 | 同左 |
| **Phase 4 接入决策** | **已接入 (复合组成 1)** | **已接入 (复合组成 2)** | **评估后延期**。月度订单仅具月级粗粒度，本阶段聚焦日级商品表现与波动，后续专门设计销量洞察。 |

### 2. 内部标准能力 `market.product.trend` 复合实现架构

CrossPilot 坚守“业务层完全解耦，不暴露底层 Remote Tool 名字”原则：
1. **统一门面能力**: 暴露给前端与 Tool Platform 的能力统一为 `market.product.trend`，入参为 `{ asin, metric?, range?, marketplace? }`。
2. **复合并发调用 (Composite Parallel Execution)**:
   - 当 `metric === 'ALL'`（或默认未指定）时，Provider 层并发调用 `get_asin_bsr_trends` 与 `get_asin_info_trends`。
   - 当 `metric === 'BSR'` 时，仅调用 `get_asin_bsr_trends`（节约 Credits）。
   - 当 `metric === 'PRICE' | 'RATING' | 'REVIEW_COUNT'` 时，仅调用 `get_asin_info_trends`。
3. **确定性统计与方向语义 (100% Code-based, Zero-LLM)**:
   - 计算：`startValue`, `endValue`, `minValue`, `maxValue`, `averageValue`, `changeAbsolute`, `changePercent`。
   - 方向语义（Directional Semantics）：
     - BSR：数值变小 = `RANK_IMPROVED`（排名上升）；数值变大 = `RANK_DECLINED`（排名下滑）。
     - Price：数值变大 = `PRICE_UP`；数值变小 = `PRICE_DOWN`。
     - Rating：数值变大 = `RATING_IMPROVED`；数值变小 = `RATING_DECLINED`。
     - Review Count：数值变大 = `REVIEWS_INCREASED`；数值变小 = `REVIEWS_DECREASED`。
4. **内存缓存与防重复扣费 (TTL Caching)**:
   - Key: `trend:${marketplace}:${asin}:${range}:${metric}`
   - 默认 TTL: 6 小时（电商日趋势通常每日聚合一次）。
   - 缓存命中时 `mode: 'CACHED'`，`costCredits: 0`，不调用远程 MCP。
5. **严禁捏造伪默认值**:
   - 若某日无价格或排名为 null，真实保留 `null` 或跳过该点，坚决不造 `999999` 或 `0`。

---

## 六、剩余待接入能力与状态确认

| 内部标准能力 ID | 当前状态 | 对应远程工具 | 下一步建议 |
| :--- | :--- | :--- | :--- |
| `market.product.detail` | **VERIFIED_LIVE** | `get_asin_info` (1 Credit) | 已接通并完成事实边界核验 |
| `market.keyword.search` | **VERIFIED_LIVE** | `get_keyword_info` (1 Credit) | 已接通并完成事实边界核验 |
| `market.product.search` | **COMPOSITE_LIVE** | `get_keyword_info` + `get_asin_info` (批量) | Phase 3 复合能力已接通并验证 |
| `market.product.trend` | **COMPOSITE_LIVE** | `get_asin_bsr_trends` + `get_asin_info_trends` | Phase 4 复合日级走势已接通并升级 Redis 缓存 |
| `review.product.health` | **VERIFIED_LIVE** | `get_asin_info` (1 Credit) + `ProviderCache` | Phase 5.1 评价健康度与口碑量化指标已接通并验证 |
| `voc.product.analyze` | **PARTIAL_LIVE** | `get_asin_info` (1 Credit) + `ProviderCache` | 兼容旧版调用，仅提供星级/总数，真实文本级 VOC 为 UNSUPPORTED |
| `market.market.overview` | `PENDING_CANDIDATE` | 关键词轻量级聚合 | 后续候选（避免 500 Credits 重型生成） |
| `market.product.orders` | `EVALUATED_DEFERRED` | `get_asin_order_trends` (月订单) | 已完成 Schema 评估，待月度销量分析专项接入 |

---

## 七、Phase 5 Provider Cache Redis 化与 Review / VOC 真实性审计

### 1. Part A: Provider Cache Redis 化升级

- **通用抽象**: 建立通用 `ProviderCache` 接口，拒绝为单一供应商定制单独的 Cache。
- **双层容灾与优雅降级**: `RedisProviderCache` 封装现有 `RedisService`（ioredis）。当处于离线开发、测试环境或 Redis 出现超时/断连时，自动降级至内部 `InMemoryProviderCache`，保证系统 100% 不崩溃。
- **标准化缓存键与载荷结构**:
  - Key 格式：`provider:{providerId}:{capabilityId}:{marketplace}:{subject}:{parameters}:{version}`
  - 例：`provider:xydc:market.product.trend:AMAZON_US:B0BFGNSXYL:30d:ALL:v1`
  - 例：`provider:xydc:voc.product.analyze:AMAZON_US:B0BFGNSXYL:default:v1`
  - 载荷结构统一封装为 `CachedProviderPayload<T>`，记录 `capturedAt`, `expiresAt`, `schemaVersion`。
- **严格 Cache Hit 语义**: 缓存命中时 `mode = 'CACHED'`，`credits = 0`，复合步骤为 0，严禁假装为 `LIVE`。
- **容灾链路**: `Live Provider` $\to$ 异常 $\to$ `Last Successful Redis/Memory Cache` $\to$ 不可用 $\to$ `Mock (DEGRADED)`。

### 2. Part B: Review / VOC 真实 Schema 审计与事实边界

1. **真实工具审查结果**:
   - 对归档的 `XYDC_TOOLS_SCHEMA.json` 和远端真实 `tools/list`（45 个工具）进行全量复核。
   - **事实确认**：官方 45 个 Remote Tools 中**不存在** `get_asin_review_analysis`, `get_asin_review_negative_feedback`, `get_asin_review_positive_feedback`, `get_asin_review_buyer_motivation` 等单品级文本挖掘工具。
   - 官方唯一直接包含 Review 挖掘能力的为类目级工具 `get_category_review_analysis`，该工具强依赖 `generate_category_insight_resource`（单次消耗 500 Credits 且耗时达数分钟），违反轻量化、低成本原则。
2. **CrossPilot 务实接入方案**:
   - 内部统一标准能力：`voc.product.analyze`。
   - 数据源：通过 `get_asin_info`（1 Credit）实时提取官方权威星级（`stars`）与评价总数（`ratings`）。
   - **事实与观察边界声明**：买家评价属于主观使用体验数据，非物理工程质检结论。
   - **零伪造原则**：由于 XYDC MCP 当前未开放单品粒度 Review 文本与情感挖掘，系统将 `painPoints`, `praisePoints`, `buyerMotivations` 严格置空（`[]`），并在 `metadata.unsupportedDimensions` 中显式记录，坚决杜绝 LLM 伪造指标与虚构用户评价引言。
3. **UI 按需触发**:
   - 在 `/app/market-research` 核心竞品卡片中增加“买家原声”独立按钮。
   - 点击后独立弹窗加载，页面初次渲染不产生任何并发 VOC 扣费。

---

## 八、Phase 5.1 Review Health / VOC 语义纠偏与架构收口

### 1. 纠偏动因与数据事实

在 Phase 5 对 XYDC 45 个真实 Remote Tools 的全面审查中确认：
- **存在的能力**：`get_asin_info` 返回官方公开指标 `stars` 与 `ratings`；`get_asin_info_trends` 返回日级评分与评价数走势。
- **不存在的能力**：45 个远程工具中**绝无**单品粒度的 Review 文本抓取、差评聚类、痛点挖掘、赞誉提炼或买家画像提取工具。
- **事实与语义冲突**：若系统将单纯的“4.6 星、5,147 条评价”等价描述为“买家原声分析”，甚至在前端或报告中声称“已分析 5,147 条 Review 样本”、“暂无负面痛点”，在数据工程与商业智能上构成了严重的虚假承诺。没有 Review 文本，绝不等于买家没有抱怨。

### 2. 架构治理与语义纠偏措施

1. **确立内部标准一级能力**:
   - 内部能力 ID：`review.product.health` (`LIVE = YES`, `VERIFIED_LIVE`)
   - 语义定义：商品评价健康度与公开口碑量化指标（平均星级、公开总评价数、评分分布估算、趋势走势）。
2. **兼容性降级保留**:
   - 内部能力 ID：`voc.product.analyze` 标记为 `PARTIAL_LIVE`（真实文本级 VOC 为 `UNSUPPORTED`）。
   - 保留契约字段兼容旧版调用，但严格声明事实边界。
3. **严格语义契约**:
   - `totalReviewCount: number | null`：保留平台公开累计评价总数（如 5,147）。
   - `analyzedReviewCount: number | null`：明确置为 `null`（若无文本挖掘），绝不伪造成 5,147。
   - `supportedDimensions`: `['averageRating', 'totalReviewCount', 'ratingTrend', 'reviewCountTrend']`。
   - `unsupportedDimensions`: `['painPoints', 'praisePoints', 'buyerMotivations', 'negativeFeedback', 'reviewTextExtraction']`。
   - `painPoints: []`, `praisePoints: []`：必须为空数组，禁止 LLM 捏造。
4. **证据类型修正 (EvidenceType)**:
   - 星级与评价指标 Evidence 的 `type` 修正为 `'REVIEW_METRIC'`（新增至共享协议 `EvidenceType`），不再伪标为 `'VOC'`。
5. **UI 真实性反馈**:
   - 操作按钮：由“买家原声”更名为“评论概览” (`Star` 图标)。
   - 弹窗展示：显著区分“公开累计评价总数 (5,147 条)”与“已分析 Review 文本数 (0 条)”。
   - 独立 VOC 提示横幅：“文本级 VOC 分析：当前数据源暂不支持（当前 Provider 仅提供星级与评价总量指标，未提供单条 Review 文本挖掘工具）”，杜绝将“未提取到文本”误导为“产品 0 差评”。
6. **ProviderCache 键与容灾规范**:
   - 标准 Redis Key：`provider:xydc:review.product.health:{marketplace}:{asin}:default:v1`
   - 缓存命中：`mode = 'CACHED'`, `credits = 0`。



