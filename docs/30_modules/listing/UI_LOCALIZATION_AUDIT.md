# CrossPilot 前端 UI 中文化审计报告 (UI Localization Audit)

> **版本**：V9 FINAL UI 改造阶段  
> **日期**：2026-09-11  
> **基准目录**：`apps/web/src`  
> **定位原则**：普通界面语言 → 简体中文；跨境电商行业专有名词（SKU/ASIN/PPC/ACOS/Listing 等）与技术专有名词（Agent/Workflow/Tool/Trace/Eval 等）保留英文；严禁借机重构后端、API、数据库或业务逻辑。

---

## 1. 英文 UI 出现在哪些页面与组件 (Page Occurrences)

通过对 `apps/web/src` 下 25 个 `.tsx` 文件全量扫描，梳理出英文残留及需中文化的页面分布：

| 文件路径 | 页面 / 组件名称 | 当前英文残留 / 需中文化元素 |
| :--- | :--- | :--- |
| `components/sidebar.tsx` | 侧边栏主导航 | 英文副标题（Business Overview, Market & Research, Product Center, Competitor & VOC, Tool Platform, Supply & Purchase, Listing Studio, Creative Studio, Advertising PPC, Orders, Inventory & FBA, Reviews & Returns, Profit Center, Business Analyst, RPA Automation, Architecture & Defense），AI Copilot 标签 |
| `components/top-bar.tsx` | 顶部导航栏 | `Active SKU:`, `Date:`, `Sign Out`, 角色 `OWNER`, 站点名称 |
| `app/page.tsx` | 根跳转页 | `Loading CrossPilot...` |
| `app/login/page.tsx` | 登录页 | `AI Cross-border Operations Platform`, `Entering Platform...`, `1-Click Demo Login`, `Default workspace: CrossPilot Demo (Amazon US)`, `Email`, `Password`, `Sign In`, `Authenticating...`, `CrossPilot Monorepo V9 • Multi-tenant Protected`, 错误提示 |
| `app/app/overview/page.tsx` | 01 经营驾驶舱 | `90-Day Full Lifecycle Active`, `POLEGAS Natural Marble Toothbrush Holder (Amazon US)`, `1-Click Demo Reset (重置基准数据)`, `Resetting Demo...`, `90天总销售额 (Revenue)`, `Avg Daily:`, `90天净利润 (Net Profit)`, `总订单件数 (Units Sold)`, `广告总支出 (Ads Spend)`, `Week 11 利润异动`, `CRITICAL/WARNING/INFO` 等严重等级, 变体标签 `Steady Growth`, `Surge & Stockout`, `VOC Improved`, 按钮文案 |
| `app/app/market-research/page.tsx` | 02 市场与选品 | `Milestone 3: Research & Opportunity`, `Amazon US 市场宏观大盘`, `月搜索量 (Search Volume)`, `类目均价 (Avg Price)`, `类目均评分 (Avg Rating)`, `平均评论数 (Reviews)`, `机会评分 (Opportunity)`, `竞争烈度 (Competition)`, `高增长买家搜索词 (Buyer Search Queries)`, `Product Opportunity Brief`, `Problem Summary`, `Target Audience`, `Positioning`, `Evidence Summary` |
| `app/app/products/page.tsx` | 03 产品中心 | `Milestone 1: Core Commerce`, `Target Price:`, `Marketplace:`, `SKU Code`, `Brand`, `Category`, `Status` 标签 (`ACTIVE`), 材质描述 |
| `app/app/competitors/page.tsx` | 04 竞品与 VOC | `Milestone 3: Review Evidence Drill-down`, `核心标杆竞品实时监控大盘 (Benchmark Competitors)`, `售价 (Price)`, `Review Evidence Drill-Down`, `Verified Purchase`, `PAIN_POINT`, `FEATURE`, `DELIGHT` |
| `app/app/tool-center/page.tsx` | 05 工具中心 | `全部工具 (All Tools)`, `素材生产 (Creative)`, `运营管理 (Operation)`, `数据与财务 (Data & Finance)`, `选品研究 (Research)`, `V9 Tool Platform`, 工具执行状态 (`SUCCESS`, `FAILED`, `Running...`) |
| `app/app/suppliers/page.tsx` | 06 供应链与采购 | `AC 1: PO Receive → Inventory +`, `核心供应商名录 (Suppliers)`, `采购订单列表 (Purchase Orders)`, `PO Number`, `AC 1 动作`, `Inventory +`, 状态 (`DRAFT`, `CONFIRMED`, `SHIPPED`, `RECEIVED`) |
| `app/app/listings/page.tsx` | 07 Listing 工作台 | `Listing Studio V2`, `Listing Intelligence • 14-Step DAG`, `14 步 DAG 编排中...`, `运行 WF-02 14-Step DAG`, `运行合规判决器 (Judge)`, `一键推送素材工坊`, 选项卡标签, 输入占位符, 字符限制提示, Visual Facts 状态 (`EXTRACTED`, `CONFIRMED`, `REJECTED`), DAG 状态, 合规卡片 (`PASS`, `WARNING`, `BLOCKED`, `Compliance Status`, `Risk Level`, `WAITING_APPROVAL`) |
| `app/app/creative/page.tsx` | 08 素材中心 | `Creative Studio`, `P0 核心工作台`, `一键生成 Amazon Creative Pack`, `亚马逊主图 (Main Image)`, `卫浴生活场景图 (Lifestyle)`, `卖点与尺寸信息图 (Infographic)`, `15秒商品展示短视频 (Video Short)`, `三段式分镜设计 (Storyboard)`, `多画幅规格裁剪矩阵 (Resize Matrix)` |
| `app/app/advertising/page.tsx` | 09 广告运营 | `Advertising PPC`, `Milestone 5: Search Term Optimization & Negative Action`, `PPC Waste Spend Warning`, `一键添加精准否定 (Negative Exact)`, `买家搜索词报告 (Search Term Performance & Optimizer)`, `曝光量 (Impr)`, `点击量 (Clicks)`, `Action` (`ADD_NEGATIVE_EXACT`, `INCREASE_BID`, `DECREASE_BID`) |
| `app/app/orders/page.tsx` | 10 订单管理 | `AC 2: Order → Inventory -`, `AC 2 履约验证控制台 (Simulate Customer Order)`, `下单件数 (Quantity)`, `最新订单流 (Recent Orders)`, `Amazon Order ID`, 订单状态 (`PENDING`, `SHIPPED`, `DELIVERED`, `CANCELLED`) |
| `app/app/inventory/page.tsx` | 11 库存 / FBA | `Deterministic Reorder Engine`, `FBA 可售库存 (Fulfillable)`, `在途采购 (Inbound)`, `预留库存 (Reserved)`, `不可售损耗 (Unfulfillable)`, `智能补货建议引擎 (Reorder Recommendation)`, `HEALTHY`, `WARNING`, `CRITICAL` |
| `app/app/reviews/page.tsx` | 12 评论与退货 | `VOC & Returns Ingestion`, `综合评分 (Rating)`, `退货率 (Return Rate)`, `退货总数 (Returns Count)`, `退款损失 (Refund Total)`, `买家原声聚类 (VOC Topics)`, `退货明细记录 (Return Records)`, `Customer Return`, 状态标签 |
| `app/app/profit/page.tsx` | 13 利润中心 | `Profit Center`, `AC 3: Return → Profit Recalculate`, `销售额 (Revenue)`, `采购成本 (COGS)`, `Amazon 佣金与 FBA`, `广告花费 (PPC)`, `退货损失 (Return Loss)`, `净利润 (Net Profit)`, `每日利润聚合账目 (ProfitDaily Table)` |
| `app/app/business-analyst/page.tsx` | 14 AI 经营分析 | `Business Analyst`, `Milestone 6: Exact Variance Waterfall & Trace`, `Why did profit drop this week?`, `提问经营 Agent`, `AI 经营分析师综合答复 (Agent Findings)`, `Deterministic Attribution Waterfall`, `Trace Drawer & Latency`, `Input Payload`, `Output Result` |
| `app/app/operations/automation/page.tsx` | 15 运营自动化 | `Operation Automation`, `P0 RPA Pipeline`, `启动 Listing 发布流水线`, `Human Approval Gate`, `WAITING_APPROVAL`, `驳回发布 (Reject)`, `核准并触发 RPA (Approve & Publish)`, `Node 运行时 (AI/TOOL/HUMAN/RPA)` |
| `app/app/architecture/page.tsx` | 16 架构与知识库 | 英文副标题、英文 Q1/Q2/Q3 提示（主体已为中文） |
| `app/app/skus/[skuId]/page.tsx` | SKU 360 详情 | `库存状态 (FBA)`, `在途 (Inbound)`, `采购与成本 (Supply)`, `交期 (Lead Time)`, `销售与订单 (Sales)`, `退货与品质 (Returns)`, `SKU 真实经营利润账目 (Financial Breakdown)`, `总销售额 (Revenue)`, `商品成本 (COGS)` |

---

## 2. 应该中文化的普通 UI 元素 (Standard UI to Localize)

1. **导航菜单项**：
   - 移除晦涩英文后缀，采用 Section III 规定的标准中文：经营概览、市场调研、产品中心、竞品与 VOC、工具中心、供应链与采购、Listing 工作台、素材中心、广告运营、订单管理、库存 / FBA、评论与退货、利润中心、AI 经营分析、运营自动化、架构与知识库。
2. **常规操作按钮**：
   - Create → 新建、Add → 添加、Save → 保存、Submit → 提交、Run → 运行、Approve → 通过、Reject → 驳回、Search → 搜索、Filter → 筛选、Reset → 重置、Refresh → 刷新、Details → 详情、Back → 返回、Close → 关闭、Generate → 生成、Regenerate → 重新生成、Analyze → 分析、Export → 导出、Download → 下载。
3. **状态与空状态**：
   - Loading... → 加载中...、Processing... → 处理中...、No data → 暂无数据、Saved successfully → 保存成功、Deleted successfully → 删除成功。
4. **表单标签与占位符**：
   - Email → 邮箱、Password → 密码、Quantity → 数量、Price → 售价、Date → 日期、Marketplace → 站点。
5. **系统与业务提示 (Toast / Dialog / Error)**：
   - 数据加载失败、请求超时、演示数据重置成功、采购入库完成、订单扣减成功。

---

## 3. 必须严格保留英文的专有名词与行业缩写 (Terms Kept in English)

严格遵循 Prompt 第二节规定，以下词汇在 UI 中保留英文原样：

- **跨境电商基础专有名词**：`SKU`, `ASIN`, `FBA`
- **内容与素材专有名词**：`Listing`, `A+`
- **广告与财务核心指标**：`PPC`, `CPC`, `CTR`, `CVR`, `ACOS`, `ROAS`, `ROI`
- **买家与市场算法术语**：`VOC`, `SEO`, `GEO`, `COSMO`, `Rufus`, `Amazon`
- **AI 与工程技术名词**：`Agent`, `Workflow`, `Tool`, `Trace`, `Eval`, `RAG`, `API`, `Prompt`, `Token`
- **文件与数据格式**：`CSV`, `Excel`, `TXT`, `JSON`
- **标识与协议**：`ID`, `URL`, `USD`, `DPI`
- **自然复合表达（推荐）**：
  - `Listing 文案` / `Listing 版本` / `Listing 合规检查`
  - `PPC 广告` / `FBA 库存` / `VOC 分析`
  - `Agent 执行记录` / `Workflow 运行状态` / `Tool 调用` / `Trace 详情` / `Eval 结果`

---

## 4. 国际化框架现状与轻量方案设计 (i18n Status & Light Dict)

- **现状**：项目中目前**未安装** `next-intl`、`react-i18next` 等重型 i18n 框架，避免引入过度工程与路由包装开销。
- **设计方案**：在 `apps/web/src/constants/ui-labels.ts` 构建统一常量字典与映射函数：
  - `STATUS_LABELS`: 统一定义 `PENDING` → 待处理、`WAITING_APPROVAL` → 等待审批、`SUCCEEDED` / `COMPLETED` → 已完成、`FAILED` → 失败、`ACTIVE` → 正常 等；
  - `COMMON_LABELS`: 通用按钮、表头、空状态与通用错误文案；
  - `NAV_ITEMS`: 统一侧边栏 16 个模块的中文标准名称与次要标签。

---

## 5. 重复出现的字符串 (Duplicate Strings)

| 字符串 | 出现次数 | 统一中文显示 |
| :--- | :--- | :--- |
| `Status` / `status` | 18+ 处 | 状态 |
| `Actions` / `Operation` | 14+ 处 | 操作 |
| `Loading...` | 12+ 处 | 加载中... |
| `Date` / `Created At` | 10+ 处 | 日期 / 创建时间 |
| `Revenue` / `Total Revenue` | 8+ 处 | 销售额 / 总销售额 |
| `Net Profit` | 8+ 处 | 净利润 |
| `Lead Time` | 6+ 处 | 供应商交期 |
| `Days Cover` | 6+ 处 | 可售天数 |
| `Verified Purchase` | 4+ 处 | 真实买家 (VP) |
| `Back to...` | 5+ 处 | 返回... |

---

## 6. 状态标签映射表 (Status Label Mapping)

只修改前端显示层，绝对不改动数据库与 API Enum：

```ts
export const STATUS_LABELS: Record<string, string> = {
  // Workflow / Task / Action Runs
  PENDING: '待处理',
  RUNNING: '运行中',
  WAITING: '等待中',
  WAITING_APPROVAL: '等待审批',
  SUCCEEDED: '已完成',
  COMPLETED: '已完成',
  SUCCESS: '成功',
  FAILED: '失败',
  CANCELLED: '已取消',

  // Commerce & Lifecycle
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  PRODUCTION: '生产中',
  INSPECTION: '验货中',
  SHIPPED: '已发货',
  RECEIVED: '已收货',
  DELIVERED: '已送达',
  REFUNDED: '已退款',

  // Product & Inventory
  ACTIVE: '正常',
  INACTIVE: '已停用',
  ARCHIVED: '已归档',
  HEALTHY: '健康',
  WARNING: '预警',
  CRITICAL: '严重',

  // Compliance
  PASS: '通过',
  WARN: '警告',
  BLOCKED: '已拦截',

  // Visual Facts
  EXTRACTED: '已提取',
  REJECTED: '已驳回',
};
```

---

## 7. 预计修改的文件列表 (Files to Touch)

### 核心公共常量与组件 (4 个)
1. `apps/web/src/constants/ui-labels.ts` (新建：轻量字典与状态映射)
2. `apps/web/src/components/sidebar.tsx` (侧边栏导航中文化)
3. `apps/web/src/components/top-bar.tsx` (顶栏上下文与用户菜单中文化)
4. `apps/web/src/app/page.tsx` & `apps/web/src/app/login/page.tsx` (根加载与登录页中文化)

### 业务与智能页面 (18 个)
5. `apps/web/src/app/app/overview/page.tsx` (经营概览)
6. `apps/web/src/app/app/market-research/page.tsx` (市场调研)
7. `apps/web/src/app/app/products/page.tsx` (产品中心)
8. `apps/web/src/app/app/skus/page.tsx` & `apps/web/src/app/app/skus/[skuId]/page.tsx` (SKU 360)
9. `apps/web/src/app/app/competitors/page.tsx` (竞品与 VOC)
10. `apps/web/src/app/app/tool-center/page.tsx` (工具中心)
11. `apps/web/src/app/app/suppliers/page.tsx` (供应链与采购)
12. `apps/web/src/app/app/listings/page.tsx` (Listing 工作台 V2)
13. `apps/web/src/app/app/creative/page.tsx` (素材中心)
14. `apps/web/src/app/app/advertising/page.tsx` (广告运营)
15. `apps/web/src/app/app/orders/page.tsx` (订单管理)
16. `apps/web/src/app/app/inventory/page.tsx` (库存 / FBA)
17. `apps/web/src/app/app/reviews/page.tsx` (评论与退货)
18. `apps/web/src/app/app/profit/page.tsx` (利润中心)
19. `apps/web/src/app/app/business-analyst/page.tsx` (AI 经营分析)
20. `apps/web/src/app/app/operations/automation/page.tsx` (运营自动化)
21. `apps/web/src/app/app/architecture/page.tsx` (架构与知识库)

---

## 8. 实施与验证门禁 (Implementation Plan)

- [x] **第一阶段**：输出 `UI_LOCALIZATION_AUDIT.md` 审计基线；
- [ ] **第二阶段**：建立统一常量字典 `apps/web/src/constants/ui-labels.ts`；
- [ ] **第三阶段**：修改全局 Shell（Sidebar / TopBar / Login）；
- [ ] **第四阶段**：按模块完成 18 个业务与智能工作台页面的 UI 中文化；
- [ ] **第五阶段**：执行全套工程验证门禁（`pnpm -r typecheck`, `pnpm test`, `pnpm test:eval`, `pnpm build`）；
- [ ] **第六阶段**：Git 提交推送，远程云端服务器（116.198.230.217:2222）拉取构建重启 PM2，更新 `HANDOFF.md` 并输出实施报告。
