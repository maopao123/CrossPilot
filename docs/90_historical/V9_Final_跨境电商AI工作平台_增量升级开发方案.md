# V9 Final：跨境电商 AI 工作平台增量升级方案

> **文档用途**：作为 V8 已完成后的 V9 增量开发基线，可直接交给本地 Coding Agent / Codex / Claude Code 按阶段实施。  
> **核心原则**：**V8 已经实现，V9 禁止推倒重构。所有新能力必须以增量方式接入现有系统。**

---

# 0. 版本定位

## 0.1 V8 → V9 的关系

V9 不是新的重构项目，而是 V8 的增量升级：

```text
V8 已完成
    ↓
保留现有业务、数据结构、Workflow、Skills / Tools
    ↓
新增 Tool Platform
    ↓
新增独立 Tool Center
    ↓
新增 Action Layer / RPA Runtime
    ↓
新增 Creative Studio / Operation Automation / BI 等业务能力
    ↓
逐步形成 V9
```

必须避免：

```text
V8
×
推倒
×
重新开发 V9
```

正确方式：

```text
V9 = V8 Core + V9 Extension
```

---

# 1. V9 一句话定义

> **V8 是已经完成的跨境电商 AI 业务底座；V9 不重构 V8，而是在其上增加统一 Tool Platform、独立 Tool Center 和 Action / RPA 执行层，让同一套能力既能被 Agent / Workflow 自动调用，也能让员工单独使用，并优先扩展素材生产、运营自动化和经营复盘三个高价值场景。**

---

# 2. V9 核心设计原则

## 2.1 六大电商场景 ≠ 六个 Agent

六大场景是业务分类：

```text
Product Research
Creative Studio
Operation Automation
Customer Service
Supply Chain
Business Intelligence
```

Agent、Workflow、Tool、RPA、API 才是技术实现方式。

禁止直接设计成：

```text
选品 Agent
素材 Agent
运营 Agent
客服 Agent
供应链 Agent
复盘 Agent
```

这样会导致 Agent 职责过大、工具重复、Workflow 难维护。

---

## 2.2 一份能力，多个入口

每一个底层 Tool 应只实现一次，但可以被三种方式消费：

```text
                     Tool
                      │
          ┌───────────┼───────────┐
          ↓           ↓           ↓
       Agent       Tool Center   Workflow
       调用         人工使用      自动执行
```

例如：

```text
creative.image.generate
```

既可以：

1. 员工在 Tool Center 手动生成商品图；
2. Copilot / Agent 自动调用；
3. Listing Creative Workflow 自动调用。

**禁止为三个入口分别复制实现。**

---

## 2.3 Tool First，而不是 Agent First

新增能力默认采用：

```text
Tool
 ↓
Tool UI
 ↓
Workflow
 ↓
Agent
```

不要：

```text
先做一个超大 Agent
↓
然后把所有逻辑都塞进 Prompt
```

---

## 2.4 确定性逻辑与非确定性逻辑分离

```text
确定性任务
→ Rule / API / RPA / Python

非确定性任务
→ LLM / Agent

高风险动作
→ Human Approval
```

Agent 不负责所有事情。

---

## 2.5 延续 V8 的 80 / 15 / 5 原则

```text
80% 固定 Workflow
15% Dynamic Tool Routing
5% 开放 Agent
```

### 80% 固定 Workflow

适用于：

- Listing 发布
- 素材生产
- 日常运营诊断
- 报表生成
- 广告日报
- 批量处理

### 15% Dynamic Tool Routing

适用于：

- “分析一下这个 SKU 最近为什么下降”
- “帮我找这个产品最近的问题”
- “分析这批 Review”

Planner 根据问题动态选择 Tool。

### 5% 开放 Agent

适用于：

- 开放式市场调研
- 非结构化探索
- 新机会研究

---

# 3. V9 总体架构

```text
┌─────────────────────────────────────────────────────┐
│                    User Layer                       │
│                                                     │
│ Copilot │ Role Workspace │ Tool Center │ Dashboard │
└─────────────────────────┬───────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────┐
│                Business Capability Layer            │
│                                                     │
│ Product     Creative    Operation    Customer       │
│ Research    Studio      Automation   Service        │
│                                                     │
│ Supply Chain Integration     Business Intelligence │
└─────────────────────────┬───────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ↓                       ↓
┌────────────────────────┐  ┌─────────────────────────┐
│ Agent / Workflow Layer │  │     Tool Center         │
│                        │  │                         │
│ Copilot / Planner      │  │ 人直接选择 Tool        │
│ Fixed Workflow         │  │ 填参数 → 执行 → 结果   │
│ Dynamic Tool Routing   │  │                         │
└────────────┬───────────┘  └────────────┬────────────┘
             │                           │
             └─────────────┬─────────────┘
                           ↓
┌─────────────────────────────────────────────────────┐
│                   Tool Platform                     │
│                                                     │
│ Tool Registry │ Tool Schema │ Gateway │ Executor   │
│ Permission    │ Trace       │ Cost    │ Version    │
└─────────────────────────┬───────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│                    Action Layer                     │
│                                                     │
│ AI │ API │ Python │ Browser │ RPA │ Computer Use   │
│ Human Approval                                      │
└─────────────────────────┬───────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│                 Integration Layer                   │
│                                                     │
│ Amazon │ ERP │ Ads │ RPA │ 图片模型 │ 视频模型     │
│ Feishu │ DingTalk │ Search │ 其他 SaaS             │
└─────────────────────────┬───────────────────────────┘
                          ↓
        PostgreSQL / Redis / Milvus / Object Storage
```

---

# 4. V8 已实现区域：默认冻结

V9 开发开始前，本地 Coding Agent 必须先识别现有 V8 结构。

现有核心能力包括但不限于：

```text
apps/
├── web
├── api
└── worker

packages/
├── db
├── shared
├── ai
├── domain
├── integrations
└── existing workflow / tool modules
```

以及现有：

- Copilot
- Planner
- Skills / Tools
- Workflow
- Domain
- Integration
- SKU / Product 数据能力
- 已有业务页面
- 已有数据库结构
- 已有任务执行机制

## 开发红线

除非 V9 新能力无法接入，否则禁止：

1. 重写现有 Workflow Engine；
2. 重构已有 Domain；
3. 大面积移动目录；
4. 修改已有 Tool 的业务语义；
5. 替换现有数据库；
6. 替换现有任务队列；
7. 为了“架构更漂亮”进行无业务价值重构；
8. 新建第二套 Agent / Tool / Workflow 基础设施。

V9 应优先使用 Adapter、Wrapper、Registry 的方式接入旧能力。

---

# 5. V9 新增模块总览

```text
V9 Extension
│
├── 1. Tool Platform
├── 2. Tool Center
├── 3. Action Layer
├── 4. RPA Runtime / Adapter
├── 5. Creative Studio
├── 6. Operation Automation
├── 7. Business Intelligence
├── 8. Product Research
├── 9. Customer Service Lite
└── 10. Supply Chain Integration
```

业务优先级：

| 业务域 | V9 定位 | 实现方式 | 优先级 |
|---|---|---|---|
| Creative Studio | 素材生产 | AI Tool + Workflow | **P0** |
| Operation Automation | 运营自动化 | Workflow + RPA + AI | **P0** |
| Business Intelligence | 经营复盘 | Data + AI + Workflow | **P1** |
| Product Research | 选品辅助研究 | Search + Data + AI | P2 |
| Customer Service Lite | 客服辅助 | RAG + AI + Human | P2 |
| Supply Chain Integration | 供应链连接 | ERP / SaaS Integration | P3 |

---

# 6. Tool Platform

Tool Platform 是 V9 最重要的基础设施升级。

## 6.1 目标

把 V8 已经存在的零散 Tool 统一注册，而不是重写。

```text
Existing Tool
    ↓
Wrapper / Adapter
    ↓
Unified Tool Contract
    ↓
Tool Registry
    ↓
Tool Executor
```

---

## 6.2 Tool Contract

建议统一定义：

```text
ToolDefinition
├── id
├── name
├── description
├── category
├── inputSchema
├── outputSchema
├── executor
├── permissions
├── timeout
├── retryPolicy
├── costPolicy
├── version
└── metadata
```

示例 Tool ID：

```text
creative.image.generate
creative.background.replace
creative.video.generate

product.review.analyze
product.competitor.search
product.keyword.analyze

operation.listing.generate
operation.title.generate
operation.keyword.combine

finance.profit.calculate
data.excel.analyze
```

---

## 6.3 Tool Executor

统一执行流程：

```text
Tool Request
    ↓
Schema Validate
    ↓
Permission Check
    ↓
Execution
    ↓
Timeout / Retry
    ↓
Normalize Result
    ↓
Trace
    ↓
Return
```

统一返回建议：

```ts
type ToolExecutionResult<T> = {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    retryable?: boolean
  }
  traceId: string
  durationMs: number
  cost?: {
    amount?: number
    unit?: string
  }
}
```

---

# 7. Tool Center

新增独立前端入口：

```text
/tool-center
```

Tool Center 是员工手动使用 Tool 的地方。

## 7.1 分类

```text
Tool Center
│
├── Creative
│   ├── Product Image Generator
│   ├── Lifestyle Image Generator
│   ├── Background Replace
│   ├── Infographic Generator
│   ├── A+ Image Generator
│   ├── Resize / Crop
│   └── Video Generator
│
├── Product Research
│   ├── Review Analyzer
│   ├── Competitor Analyzer
│   ├── Keyword Analyzer
│   └── Market Research
│
├── Operation
│   ├── Title Generator
│   ├── Listing Optimizer
│   ├── Keyword Combiner
│   └── Batch Operation
│
├── Data
│   ├── Excel Analyzer
│   ├── Profit Calculator
│   └── Operation Diagnosis
│
└── Utility
    └── Other Internal Tools
```

---

## 7.2 UI 原则

Tool 页面统一采用：

```text
Tool Header
↓
Input Form
↓
Advanced Settings
↓
Run
↓
Running Status
↓
Result
↓
History
```

Tool UI 不保存业务逻辑。

必须调用：

```text
Tool Center
    ↓
Tool Platform API
    ↓
Tool Executor
```

---

# 8. Agent / Workflow 接入 Tool Platform

原有 Copilot / Planner 不重写。

原链路：

```text
User
 ↓
Copilot
 ↓
Planner
 ↓
Workflow / Tool
```

V9 改为：

```text
User
 ↓
Copilot
 ↓
Planner
 ↓
Tool Platform
 ↓
Tool Executor
```

Workflow 同理：

```text
Workflow Node
 ↓
Tool Platform
 ↓
Tool Executor
```

最终：

```text
                  Tool Platform
                  ↑           ↑
               Agent       Tool Center
                  ↑
              Workflow
```

---

# 9. Action Layer

V9 新增 Action Layer，用于统一各种真正执行动作的 Runtime。

建议：

```text
Action
├── AIAction
├── ApiAction
├── PythonAction
├── BrowserAction
├── RpaAction
├── ComputerUseAction
└── HumanAction
```

## 9.1 Runtime 选择原则

| Runtime | 适合任务 |
|---|---|
| API | 有稳定官方接口时优先 |
| Python | 数据转换、算法、文件处理 |
| AI | 理解、生成、判断 |
| RPA | 稳定、重复、固定 GUI 操作 |
| Browser | 中短链路网页操作 |
| Computer Use | 页面变化大、元素难定位 |
| Human | 高风险、不可逆、异常情况 |

默认优先级：

```text
API
↓
Deterministic Code / Python
↓
RPA
↓
Browser Automation
↓
Computer Use
```

AI 不应该直接代替所有 Runtime。

---

# 10. RPA Integration

V9 不开发自己的 RPA 平台。

采用 Adapter 模式：

```text
V9 Workflow
    ↓
RpaAction
    ↓
RpaAdapter
    ↓
Third-party RPA
```

建议目录：

```text
packages/integrations/rpa/
├── rpa.interface.ts
├── rpa.registry.ts
├── yingdao.adapter.ts
├── task.mapper.ts
└── result.parser.ts
```

统一接口示例：

```ts
interface RpaAdapter {
  execute(input: {
    workflow: string
    params: Record<string, unknown>
  }): Promise<RpaExecutionResult>
}
```

业务层禁止依赖某一家 RPA 厂商的私有接口。

---

# 11. Creative Studio

P0 新增业务。

## 11.1 第一阶段 Tool

```text
creative.image.generate
creative.image.lifestyle
creative.background.replace
creative.image.resize
creative.infographic.generate
creative.aplus.generate
creative.batch.generate
creative.storyboard.generate
creative.video.generate
```

## 11.2 使用方式

### 单独使用

```text
Tool Center
↓
Generate Product Image
↓
上传商品图
↓
场景 / 风格 / Prompt
↓
生成
```

### Agent 使用

```text
用户：
“给这个产品生成 5 张 Amazon 场景图”

↓
Copilot
↓
creative.image.generate
```

### Workflow 使用

```text
WF-Creative-01 Amazon Creative Pack
↓
Product Image
↓
Lifestyle Image
↓
Infographic
↓
A+
↓
Video
```

---

# 12. Operation Automation

P0 新增业务。

核心原则：

> **AI 负责理解和生成，RPA / API 负责稳定执行。**

## 12.1 Listing Publish Workflow

示例：

```text
Product Data
    ↓
AI：Generate Title
    ↓
AI：Generate Bullets / Description
    ↓
AI：Keyword Processing
    ↓
Creative Tools：Generate Assets
    ↓
Validator
    ↓
Human Approval
    ↓
RPA：Open Seller Central
    ↓
RPA：Create Listing
    ↓
RPA：Fill Fields
    ↓
RPA：Upload Images / Video
    ↓
RPA：Configure SKU
    ↓
Human Approval
    ↓
Publish
    ↓
Verify
```

## 12.2 第一阶段不要做

禁止一开始实现：

```text
一个 Agent
↓
自主控制浏览器
↓
从登录一直操作到发布
```

长链路优先拆成 Workflow。

---

# 13. Human Approval

高风险 Action 必须支持 Human Gate。

需要审批的典型场景：

- Listing 最终发布
- 修改价格
- 调整广告预算
- 删除商品
- 退款
- 补发
- 修改库存
- 财务相关操作

统一流程：

```text
Action Proposal
↓
WAITING_APPROVAL
↓
Human Approve / Reject
↓
Execute / Cancel
```

建议状态：

```text
PENDING
RUNNING
WAITING_APPROVAL
SUCCEEDED
FAILED
CANCELLED
```

---

# 14. Business Intelligence

P1。

已有或计划中的：

```text
WF-05 Daily Operation Diagnosis
```

继续保留，不重做。

建议升级成：

```text
Observe
 ↓
Analyze
 ↓
Diagnose
 ↓
Recommend
 ↓
Human Approval
 ↓
Execute
 ↓
Verify
```

例：

```text
SKU-001

CVR ↓
ACOS ↑
Traffic ≈

↓
Diagnosis

Possible Reasons:
- Main image CTR ↓
- Competitor price ↓
- Review rating ↓

↓
Recommended Actions

- Replace Main Image
- Adjust Ads
- Check Pricing

↓
Approval

↓
Tool / RPA

↓
Next-day Verify
```

最终目标：

```text
Observe → Think → Act → Learn
```

---

# 15. Product Research

不要叫 AI Product Selection。

正式模块名：

```text
Product Research
```

AI 定位：

> **Research Assistant，而不是 Final Decision Maker。**

## 15.1 能力

```text
Market Research
Competitor Research
Review Analysis
Keyword Analysis
Price Analysis
Trend Analysis
BSR Analysis
Supplier Information
Risk Analysis
```

## 15.2 输出

```text
Product Opportunity Report

├── Evidence
├── Market Signals
├── Competition
├── Customer Pain Points
├── Risks
├── Opportunities
└── Recommendation
```

最终选择：

```text
AI Research
↓
Human Decision
```

---

# 16. Customer Service Lite

P2。

第一版只做：

```text
Customer Service Lite
├── Product Knowledge Base
├── FAQ
├── Message Classification
├── RAG
├── Suggested Reply
└── Human Approval
```

暂时不自动执行：

- Refund
- Replacement
- Compensation
- Dispute Resolution

以后再接：

```text
Amazon Order
ERP
Logistics
Refund
Replacement
```

---

# 17. Supply Chain Integration

P3。

V9 不重新开发：

```text
ERP
WMS
采购系统
仓储系统
物流系统
```

V9 只负责：

```text
V9
 ↓
Integration Adapter
 ↓
ERP / Amazon / Logistics / Warehouse SaaS
```

并把数据提供给：

```text
Copilot
Workflow
BI
Customer Service
```

---

# 18. 建议代码目录

在不破坏现有 V8 的前提下，建议增量增加：

```text
apps/
├── web
├── api
└── worker

packages/
├── db
├── shared
├── domain
├── ai
├── integrations
│   ├── existing...
│   └── rpa/
│       ├── rpa.interface.ts
│       ├── rpa.registry.ts
│       ├── yingdao.adapter.ts
│       ├── task.mapper.ts
│       └── result.parser.ts
│
├── tool-platform/
│   ├── registry/
│   ├── contracts/
│   ├── executor/
│   ├── schema/
│   ├── permission/
│   ├── trace/
│   └── version/
│
├── actions/
│   ├── ai/
│   ├── api/
│   ├── python/
│   ├── browser/
│   ├── rpa/
│   ├── computer-use/
│   └── human/
│
└── workflows/
    ├── existing...
    ├── creative-pack/
    ├── listing-publish/
    └── daily-operation-diagnosis/
```

Web 新增：

```text
/tool-center
/creative
/operations/automation
/insights
```

注意：

> 如果现有项目目录与这里不同，以现有 V8 为准。不要为了匹配本文件而强制移动已有代码。

---

# 19. V9 开发阶段

## Phase 0：代码扫描与兼容性确认

开发前先做：

1. 扫描现有 V8 目录；
2. 找出已有 Tool 定义；
3. 找出已有 Workflow；
4. 找出 Copilot / Planner 调 Tool 的入口；
5. 找出 Worker / Job 执行入口；
6. 找出 Trace / Logging；
7. 列出 V9 新模块与现有模块的复用关系。

输出：

```text
V8_TO_V9_MAPPING.md
```

禁止直接开始大面积改代码。

---

## Phase 1：Tool Platform

目标：

```text
Existing Tools
↓
Unified Tool Contract
↓
Tool Registry
↓
Tool Executor
```

第一阶段只接 3～5 个已有 Tool 验证。

验收：

- [ ] Agent 可以通过 Tool Platform 调用已有 Tool
- [ ] 原有 Tool 行为不变
- [ ] 参数可以 Schema Validation
- [ ] Tool Execution 有 Trace
- [ ] Error 被统一标准化
- [ ] 不影响旧 Workflow

---

## Phase 2：Tool Center

实现：

```text
/tool-center
```

先上线 3～5 个工具。

验收：

- [ ] Tool 列表来自 Registry
- [ ] Tool Form 根据 Schema 渲染或可映射
- [ ] Tool Center 调用 Tool Platform
- [ ] 人和 Agent 使用同一个 Executor
- [ ] 可查看执行结果
- [ ] 可查看执行历史

关键里程碑：

```text
同一个 Tool

Agent 能调用 ✓
员工网页能调用 ✓
Workflow 能调用 ✓
```

---

## Phase 3：Creative Studio

第一阶段至少完成：

- [ ] Product Image
- [ ] Lifestyle Image
- [ ] Background Replace
- [ ] Image Resize
- [ ] Batch Image Generate

第二阶段：

- [ ] Infographic
- [ ] A+
- [ ] Storyboard
- [ ] Video

然后形成：

```text
WF-Creative-01
Amazon Creative Pack
```

---

## Phase 4：Action Layer + RPA

先建立：

- [ ] ApiAction
- [ ] RpaAction
- [ ] HumanAction
- [ ] Action Status
- [ ] Approval mechanism

然后接一个 RPA Adapter。

只选择 **一个真实长链路** 验证：

```text
Amazon Listing Publish
```

不要同时做十个运营自动化。

---

## Phase 5：Operation Automation

完成：

```text
WF-Operation-01
Listing Publish
```

验收：

- [ ] AI 内容生成可复用 Tool
- [ ] Creative Tool 可复用
- [ ] RPA 操作节点独立
- [ ] 可从失败节点重试
- [ ] 发布前有人审
- [ ] 每一步有 Trace
- [ ] 最后有 Verify

---

## Phase 6：Business Intelligence

完成 / 升级：

```text
WF-05 Daily Operation Diagnosis
```

加入：

```text
Recommend
↓
Approve
↓
Action
↓
Verify
```

验收：

- [ ] 数据异常可识别
- [ ] 生成诊断
- [ ] 推荐 Action
- [ ] 可人工审批
- [ ] Approved Action 能调用 Tool / RPA
- [ ] 第二周期能 Verify

---

## Phase 7：Product Research / Customer Service

最后再逐步增加。

不要阻塞 P0 / P1。

---

# 20. 开发任务拆分建议

建议 Issue / Epic：

```text
EPIC-V9-01 Tool Platform
EPIC-V9-02 Tool Center
EPIC-V9-03 Creative Studio
EPIC-V9-04 Action Layer
EPIC-V9-05 RPA Integration
EPIC-V9-06 Listing Automation
EPIC-V9-07 Business Intelligence
EPIC-V9-08 Product Research
EPIC-V9-09 Customer Service Lite
```

每个 Epic 再拆：

```text
Contract
Backend
Worker
Frontend
Integration
Trace
Test
Docs
```

---

# 21. Trace 与可观测性

所有 Tool / Action / Workflow 必须可追踪。

建议统一：

```text
traceId
workflowRunId
toolRunId
actionRunId
userId
toolId
toolVersion
inputSummary
outputSummary
durationMs
status
error
cost
createdAt
```

Workflow Trace：

```text
Workflow
├── Node
│   ├── Tool Call
│   ├── Action
│   └── Result
├── Node
├── Approval
└── Final Result
```

未来用于：

- Debug
- 成本分析
- Tool 成功率
- Agent Eval
- Workflow Eval
- Replay
- 回归测试

---

# 22. Tool / Workflow 评测

至少统计：

## Tool

```text
Success Rate
Latency
Retry Rate
Cost
Error Distribution
```

## Workflow

```text
Completion Rate
Human Intervention Rate
Failure Node Distribution
Average Runtime
Average Cost
```

## AI Tool

进一步统计：

```text
Format Compliance
Correctness
Groundedness / Faithfulness
Human Acceptance Rate
```

---

# 23. 错误处理

统一错误类别：

```text
VALIDATION_ERROR
AUTH_ERROR
PERMISSION_DENIED
INTEGRATION_ERROR
RATE_LIMIT
TIMEOUT
RPA_ELEMENT_NOT_FOUND
RPA_VERIFICATION_REQUIRED
MODEL_ERROR
OUTPUT_FORMAT_ERROR
HUMAN_REJECTED
UNKNOWN_ERROR
```

每个错误定义：

```text
retryable
fallback
humanRequired
```

例如：

```text
RPA_ELEMENT_NOT_FOUND
↓
Retry
↓
Browser / Computer Use fallback
↓
Human
```

---

# 24. V9 非目标

V9 当前不做：

1. 自研 ERP；
2. 自研 RPA 平台；
3. 六个“大而全 Agent”；
4. 全自动无审批高风险操作；
5. 自主 Agent 从头跑到底的超长浏览器链路；
6. 大规模重构 V8；
7. 为了架构统一而搬迁全部旧代码；
8. 一次性做完所有电商场景。

---

# 25. Coding Agent 执行约束

下面这段可以直接作为本地 Coding Agent 的总指令：

```text
你正在一个已经完成 V8 的现有项目上开发 V9。

重要约束：

1. V8 已经完成，禁止推倒重构。
2. 先完整扫描当前代码，识别已有 Tool、Workflow、Planner、Worker、Domain、Integration。
3. 优先复用已有能力，不重复造轮子。
4. V9 所有新增能力必须以增量模块接入。
5. Tool Platform 使用 Wrapper / Adapter 兼容已有 Tool，不要求一次性迁移全部 Tool。
6. Tool Center、Agent、Workflow 必须最终复用同一个 Tool Executor。
7. 不允许把所有业务逻辑塞进 Agent Prompt。
8. 固定流程优先 Workflow。
9. 确定性动作优先 API / Python / RPA。
10. 高风险动作必须经过 Human Approval。
11. RPA 通过 Adapter 接入，不让业务层绑定具体 RPA 厂商。
12. 每个阶段开发完成后先跑测试和回归，确认 V8 旧功能未受影响，再进入下一阶段。
13. 不进行与当前阶段无关的代码重构。
14. 如果文档建议目录与当前项目实际目录冲突，以现有项目结构为准。
15. 所有修改都必须说明：
    - 新增了什么
    - 修改了什么
    - 为什么修改
    - 是否影响旧功能
    - 如何验证
```

---

# 26. Coding Agent 第一条任务

不要直接让 Coding Agent 实现整个 V9。

第一条任务应该是：

```text
请完整扫描当前 V8 项目，不修改任何代码。

根据《V9 Final：跨境电商 AI 工作平台增量升级方案》，完成 V8 → V9 的代码映射分析。

重点识别：

1. 现有 Tool / Skill 的定义位置与调用链
2. Copilot / Planner 调 Tool 的入口
3. Workflow 的定义方式和执行方式
4. Worker / Queue 的任务执行方式
5. Integration 层的组织方式
6. 当前 Trace / Logging / Error Handling
7. Web 前端导航和页面结构
8. 哪些现有组件可以直接复用于 Tool Platform
9. Tool Platform 最小侵入式接入点
10. 预计会修改和新增哪些目录/文件

输出 V8_TO_V9_MAPPING.md。

注意：
- 本阶段禁止修改业务代码。
- 禁止设计第二套 Tool/Workflow 系统。
- 必须优先兼容当前项目。
```

确认映射没有问题后，再进入 Phase 1。

---

# 27. V9 最终产品形态

```text
                    AI Commerce OS
                          │
          ┌───────────────┼───────────────┐
          ↓               ↓               ↓
       Copilot        Tool Center     Workflow Center
          │               │               │
    自然语言完成任务    员工直接用工具     自动运行 SOP
          │               │               │
          └───────────────┼───────────────┘
                          ↓
                    Tool Platform
                          ↓
                     Action Layer
                          ↓
        AI / API / Python / RPA / Browser
              Computer Use / Human
                          ↓
        Amazon / ERP / Ads / Image / Video
                          ↓
                     Business Data
```

---

# 28. V9 版本升级总结

## V8

```text
Business Data
+
Copilot
+
Workflow
+
Skills / Tools
+
Domain
+
Integration
```

## V9

```text
V8 Core
+
Tool Platform
+
Tool Center
+
Action Layer
+
RPA Runtime
+
Creative Studio
+
Operation Automation
+
Business Intelligence
+
Product Research
+
Customer Service Lite
+
Supply Chain Integration
```

真正的升级点只有两件事：

### 1. Tool Platform

> 所有能力逐渐标准化，一份能力同时供 Agent、Workflow 和员工直接使用。

### 2. Execution Strategy

> 系统不再默认“什么都让 Agent 干”，而是根据任务选择 AI / Tool / API / Python / RPA / Browser / Computer Use / Human 最合适的执行方式。

---

# 29. 当前开发优先级

```text
Phase 0  V8 → V9 Mapping
   ↓
Phase 1  Tool Platform
   ↓
Phase 2  Tool Center
   ↓
Phase 3  Creative Studio
   ↓
Phase 4  Action Layer + RPA
   ↓
Phase 5  Listing Automation
   ↓
Phase 6  Business Intelligence
   ↓
Phase 7  Product Research / Customer Service
```

开发过程中始终遵守：

> **先复用、后扩展；先 Tool、后 Workflow、再 Agent；先单点跑通、再扩展场景；绝不为了 V9 重构已经完成的 V8。**

