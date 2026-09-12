# CrossPilot Commerce Simulator V1.0

## Synthetic Multi-Channel Commerce Environment

版本：V9.2 Epic 4

------------------------------------------------------------------------

# 1. 项目背景

CrossPilot 已具备 Agent 编排、Tool
Calling、RAG、数据分析能力，但缺少真实商业运行环境。

由于当前没有真实 Amazon / Shopify 店铺数据，因此设计 Commerce Simulation
Layer：

> 模拟真实跨境卖家经营过程，为 AI Agent 提供持续变化的业务数据环境。

未来可通过 Adapter 无缝替换真实平台 API。

------------------------------------------------------------------------

# 2. 项目目标

构建一个面向 AI Agent 的多渠道电商数字孪生系统。

支持：

-   Amazon Marketplace
-   Shopify 独立站

未来扩展：

-   TikTok Shop
-   eBay
-   Walmart
-   WooCommerce

Agent 可以完成：

-   销售分析
-   广告分析
-   Review 分析
-   库存预测
-   Listing 优化
-   运营决策

------------------------------------------------------------------------

# 3. 总体架构

    CrossPilot Agent Layer

            |
            |

    Commerce Tool Gateway

            |
            |

    Unified Commerce API

            |
    -------------------------
    Amazon Simulator
    Shopify Simulator
    -------------------------

            |

    Business Simulation Engine

            |

    PostgreSQL

------------------------------------------------------------------------

# 4. 核心思想

不要模拟平台，而模拟商家经营生命周期。

统一业务模型：

-   Store
-   Product
-   Customer
-   Order
-   Inventory
-   Review
-   Advertisement

平台只是数据来源。

------------------------------------------------------------------------

# 5. 数据模型

## Store

``` json
{
 "store_id":"store001",
 "brand":"POLEGAS",
 "country":"US",
 "channels":["amazon","shopify"]
}
```

## Product

包含：

-   SKU
-   标题
-   类目
-   价格
-   库存
-   平台映射

## Order

包含：

-   订单
-   渠道
-   商品
-   金额
-   国家
-   状态

## Review

包含：

-   星级
-   文本
-   差评关键词

## Advertisement

包含：

-   Impression
-   Click
-   Cost
-   Sales
-   ACOS
-   ROAS

------------------------------------------------------------------------

# 6. Channel Simulator

## Amazon Simulator

模拟：

### Listing

-   Title
-   Bullet Points
-   Keywords
-   Images
-   A+
-   Ranking

### Ads

-   Impression
-   Click
-   CPC
-   Conversion
-   ACOS

### Review

-   Rating
-   Verified Purchase
-   Negative Keywords

### Ranking

根据：

-   Sales Velocity
-   Conversion Rate
-   Review Score
-   Price

变化。

------------------------------------------------------------------------

## Shopify Simulator

模拟独立站：

用户链路：

    Traffic
     ↓
    Product Page
     ↓
    Add Cart
     ↓
    Checkout
     ↓
    Order

指标：

-   Session
-   Conversion Rate
-   Bounce Rate
-   Cart Abandonment

营销：

-   Google Ads
-   Meta Ads
-   Email Marketing
-   Influencer

------------------------------------------------------------------------

# 7. Business Simulation Engine

核心不是随机生成，而是业务规则模拟。

## Sales Engine

输入：

-   Product
-   Price
-   Traffic
-   Ads
-   Rating
-   Season

输出：

-   Daily Orders

支持：

-   大促
-   季节波动
-   竞争变化

------------------------------------------------------------------------

## Inventory Engine

流程：

    订单产生
     ↓
    库存扣减
     ↓
    库存预测
     ↓
    补货
     ↓
    风险事件

产生：

-   Low Stock
-   Out Of Stock

------------------------------------------------------------------------

## Review Engine

根据：

-   产品质量
-   物流
-   价格
-   描述一致性

生成：

-   正向评价
-   负向评价

------------------------------------------------------------------------

## Event Engine

模拟异常：

例如：

    大量差评

    ↓

    关键词：
    fake marble

    ↓

    Review Agent 分析

    ↓

    Listing 优化建议

------------------------------------------------------------------------

# 8. Unified Commerce API

统一接口：

    GET /products

    GET /orders

    GET /inventory

    GET /reviews/latest

    GET /ads/performance

Agent 不关心：

-   Amazon
-   Shopify

只调用 Commerce API。

------------------------------------------------------------------------

# 9. Agent Tool Integration

提供：

``` python
query_sales()

query_inventory()

analyze_reviews()

check_ads()

recommend_action()
```

------------------------------------------------------------------------

# 10. 技术方案

> **⚠️ 本节已被替代（2026-09-13 实现决策）**：Simulator 未采用独立 Python/FastAPI 项目，而是并入 CrossPilot monorepo 以 TypeScript 实现。实际落点见文末「15. 实现决策（V1 已落地）」。

原始方案（仅存档）:

Backend:

-   FastAPI
-   SQLAlchemy
-   PostgreSQL
-   Redis
-   APScheduler

数据生成：

-   Faker
-   numpy
-   pandas
-   LLM Synthetic Generator

每日任务：

    simulate_daily_business()

    Generate Orders
    Update Inventory
    Generate Reviews
    Update Ads
    Create Events
    Save Snapshot

------------------------------------------------------------------------

# 11. 项目结构

> **⚠️ 本节已被替代**：未建独立 `commerce-simulator/` 项目，实际结构见文末「15. 实现决策（V1 已落地）」。

原始方案（仅存档）:

    commerce-simulator/

    backend/

    ├── api/

    ├── domain/

    ├── simulator/

    │   ├── sales_engine.py
    │   ├── inventory_engine.py
    │   ├── review_engine.py
    │   └── event_engine.py

    ├── adapters/

    │   ├── amazon.py
    │   └── shopify.py

    ├── scheduler/

    └── database/

------------------------------------------------------------------------

# 12. Epic 开发计划

## Epic 4.1 Commerce Core

建立：

-   Store
-   Product
-   Customer
-   Order
-   Inventory

------------------------------------------------------------------------

## Epic 4.2 Channel Simulator

实现：

Amazon：

-   Listing
-   Ads
-   Review

Shopify：

-   Traffic
-   Conversion
-   Marketing

------------------------------------------------------------------------

## Epic 4.3 Business Simulation Engine

实现：

-   每日订单生成
-   库存变化
-   Review生成
-   异常事件

------------------------------------------------------------------------

## Epic 4.4 Commerce API

提供：

-   Product API
-   Order API
-   Review API
-   Ads API
-   Inventory API

------------------------------------------------------------------------

## Epic 4.5 Agent Integration

接入 CrossPilot：

-   自动分析销售
-   自动发现问题
-   自动生成运营建议

------------------------------------------------------------------------

# 13. Future Adapter

真实接入：

Amazon:

    Simulator
        ↓
    Amazon SP API Adapter

Shopify:

    Simulator
        ↓
    Shopify API Adapter

Agent 无需修改。

------------------------------------------------------------------------

# 14. 最终效果

每天模拟：

    模拟一天经营

    ↓

    产生订单

    ↓

    库存变化

    ↓

    广告消耗

    ↓

    Review变化

    ↓

    异常事件

    ↓

    Agent分析

    ↓

    运营建议

最终 CrossPilot 从：

AI Agent Demo

升级为：

AI Commerce Operating System。

------------------------------------------------------------------------

# 15. 实现决策（V1 已落地，2026-09-13）

## 关键决策：并入 monorepo，不另起项目

本文 §10-11 的原始方案（独立 Python/FastAPI 项目）**未采用**。实际实现并入
CrossPilot monorepo（TypeScript：NestJS + Next.js + Prisma + BullMQ），与主项目
共用一套代码、一次启动。原因：现有 Prisma schema 已具备几乎全部电商域模型，
且 `Order.sourceProvider/sourceAccountId`（Epic 4）本就是为外部来源数据预留的隔离位。

## 实际落点

    packages/domain/src/simulator/   纯 TS 引擎（sales / inventory / review /
                                     ads / funnel / event + daily-tick 编排器，
                                     可种子化确定性 RNG，不依赖 Nest/Prisma）
    packages/db/src/simulator/       共享 persistence（SimulatorStore +
                                     tickSimulatorWorkspace，api 与 worker 共用）
    apps/api/src/modules/simulator/  控制端点（见下）
    apps/worker/                     BullMQ repeatable job 定时推进模拟日
    packages/db/prisma/              新增 SimulationState / SimulationEvent /
                                     ChannelDailyMetric 三表
                                     (migration: 20260913000000_commerce_simulator)

## 模型映射

    本文 Store        → CommerceAccount（provider='simulator-amazon' / 'simulator-shopify'）
    本文 Product      → 复用现有 Product/Sku（POLEGAS 3 SKU，与 seed 共用）
    本文 Order        → Order/OrderItem（sourceProvider='simulator' 隔离）
    本文 Review       → Review（reviewerName 加 'sim-' 前缀隔离）
    本文 Advertisement→ AdMetricDaily（挂 'SIM-' 前缀 Campaign）
    本文 Customer     → V1 暂缓（schema 无此模型且无消费方）
    本文 Shopify 漏斗 → ChannelDailyMetric（sessions→cart→checkout→orders）
    Unified Commerce API → 现有 order / inventory / advertising 等模块即统一 API，
                        simulator 仅新增控制端点

## 控制端点（/api/v1，挂标准守卫链）

    POST /simulator/tick          推进 1 个模拟日（同日重放 → 409）
    POST /simulator/advance       { days: 1-90 } 批量推进
    POST /simulator/reset         重置模拟世界（限 OWNER/ADMIN；只清 simulator 标记数据）
    GET  /simulator/state         simDate / dayIndex / 事件流 / 渠道漏斗

## 启动与调度

    pnpm dev                      一键启动 api + web + worker（concurrently）
    SIMULATOR_ENABLED=true        worker 开启定时 tick
    SIMULATOR_TICK_INTERVAL_MINUTES=60   每 N 分钟真实时间 = 1 模拟日

模拟起始日默认 2026-09-01，初始库存 500/400/300（对齐 seed 的 POLEGAS 目录）。
reset 只删除 sourceProvider='simulator' 的订单、'sim-' 前缀的 review、
SIM- 前缀 campaign 的广告数据、以及三张 simulator 专属表，不碰 seed/scenario/真实同步数据。

## V1 边界（与原文档的差异）

- 未建 Customer 模型；TikTok/eBay/Walmart/WooCommerce 渠道未做
- 未接真实 SP-API / Shopify API —— 未来按 §13 Adapter 思路演进时，
  将 CommerceAccount provider 从 simulator-* 替换为真实账户即可，Agent 层无需改动
