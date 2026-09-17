# CrossPilot 单产品选品方案（V1 最终冻结版 · 工程增强修订）

> **定位**：把一个“看起来能做”的产品，在下单前把市场、规格、供应商、利润、启动资金和风险说清楚。  
> **核心价值**：不是“更快找爆款”，而是**少把错品推进工厂**。  
> **适用场景**：认真推进一个具体产品，而不是每天批量刷几十个词。  
> **示例产品**：玻璃水果盒 + 沥水篮。  
> **最终目标**：用户能清楚回答——**做不做、为什么、还缺什么、下一步只做哪一件事。**

---

# 1. 产品一句话定位

不要对外讲：

> “提升选品效率。”

更准确的是：

> **防止一个看起来能做的品，在下单前算不清账。**

卖家真正认可的效率是：

```text
10 分钟内看到：
细分方向
+ 主流价格带
+ 代表竞品
+ 是否值得继续
        ↓
同一规格问 3 家工厂
        ↓
报价真正可比较
        ↓
一页同时看到：
单件赚多少
+ 首单要掏多少
        ↓
最终结论能解释
而不是一个“78 分”
```

---

# 2. 产品设计原则

后台可以严谨，前台必须简单。

后台继续保留：

```text
ProductCandidate
Specification
SupplierQuote
FX
Economics
Initial Cash
Risk
Evidence
Assumption
Decision
```

但用户只应该感受到：

```text
现在做到哪了？
还差哪一下？
下一步点哪里？
```

核心交互原则：

```text
每次只问用户一件事
        ↓
系统尽量自动做后台工作
        ↓
先给结论
        ↓
再给一个主按钮
        ↓
详细数据默认折叠
```

---

# 3. 首页支持多入口

不要强迫所有用户从 Step 1 开始。

首页直接问：

```text
┌────────────────────────────────────┐
│ 你现在处在哪一步？                 │
│                                    │
│ [我只有一个产品想法]               │
│                                    │
│ [我已经确定产品，想看看市场]       │
│                                    │
│ [我已经有工厂报价，帮我算账]       │
│                                    │
│ [我已经基本确定，帮我判断能不能做] │
└────────────────────────────────────┘
```

例如用户已经有：

```text
产品：玻璃水果盒 + 沥水篮
目标售价：$29.99
工厂报价：¥46
MOQ：500
```

则直接进入：

```text
规格确认
   ↓
工厂报价
   ↓
Amazon 费用 / 头程
   ↓
利润
   ↓
风险
   ↓
结论
```

不用强制重新跑完整市场研究。

---

# 4. 用户真正看到的主流程

```text
我想卖什么？
      ↓
这个市场有哪几种卖法？
      ↓
别人怎么卖、买家在抱怨什么？
      ↓
我准备做成什么样？
      ↓
按这个去询价
      ↓
工厂怎么报？
      ↓
运到 Amazon 还能剩多少？
      ↓
还有什么会让我不能做？
      ↓
最终：
继续 / 观察 / 补材料 / 放弃
```

---

# 5. 完整产品流程图

```text
┌──────────────────────────────────────────────┐
│ ① 我想卖什么？                               │
│                                              │
│ 用户输入：                                   │
│ 玻璃水果盒                                   │
│                                              │
│ 市场：Amazon US                              │
│                                              │
│                [开始看看]                    │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
             后台自动做市场展开
                       │
          ├─ 关键词扩展
          ├─ 搜索需求
          ├─ 趋势
          ├─ 相关 ASIN
          ├─ ASIN 反查关键词
          └─ 细分方向
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ ② 这个市场大概有 4 种卖法                    │
│                                              │
│ ① 普通塑料水果盒                             │
│ ② 普通玻璃水果盒                             │
│ ③ 玻璃盒 + 沥水篮                            │
│ ④ 分隔式水果盒                               │
│                                              │
│ 每个方向先只展示：                           │
│ • 主流价格带                                 │
│ • 需求概况                                   │
│ • 竞争概况                                   │
│ • 代表产品                                   │
│                                              │
│ 系统提示：                                   │
│ “玻璃盒 + 沥水篮值得继续看”                  │
│                                              │
│               [深入看看]                     │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
              第一轮快速判断
                       │
             值得继续研究吗？
                ╱             ╲
              否               是
              │                │
              ▼                ▼
            停止           继续深化
                               │
                               ▼
┌──────────────────────────────────────────────┐
│ ③ 别人怎么卖、买家在骂什么？                 │
│                                              │
│ 代表竞品：                                   │
│                                              │
│ A：$27.99 / 4.5★                            │
│    玻璃盒 + 塑料篮                           │
│                                              │
│ B：$32.99 / 4.3★                            │
│    大容量 + 密封                             │
│                                              │
│ C：$24.99 / 4.6★                            │
│    基础款                                    │
│                                              │
│ ─────────────────────────                   │
│                                              │
│ 买家主要在抱怨：                             │
│ • 洗完容易积水                               │
│ • 篮子不好拿                                 │
│ • 清洗麻烦                                   │
│ • 塑料质感一般                               │
│                                              │
│ 没抓到真实评语：                             │
│ “暂时没找到，不编。”                         │
│                                              │
│             [做成我的产品]                   │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ ④ 你准备做成什么样？                         │
│                                              │
│ 询价前只先确认 4 项：                        │
│                                              │
│ 材质：                                       │
│ [玻璃主体 + PP 沥水篮]                       │
│                                              │
│ 容量：                                       │
│ [约 1.5L]                                    │
│                                              │
│ 产品尺寸：                                   │
│ [25 × 15 × 10 cm]                            │
│                                              │
│ 计划售价：                                   │
│ [$29.99]                                     │
│                                              │
│ 净重 / 箱规 / 外箱毛重：                     │
│ 暂时不知道也可以。                           │
│                                              │
│             [按这个去询价]                   │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
          后台：Specification FROZEN
        前台不显示 DRAFT / FROZEN
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ ⑤ 系统生成可复制询价单                       │
│                                              │
│ 产品：玻璃水果保鲜盒 + 沥水篮                │
│ 材质：玻璃主体 + PP 沥水篮                   │
│ 容量：约 1.5L                                │
│ 尺寸：约 25 × 15 × 10 cm                    │
│                                              │
│ 需求：                                       │
│ • 可拆卸沥水篮                               │
│ • 易清洁结构                                 │
│                                              │
│ 请工厂提供：                                 │
│ • 单价                                       │
│ • MOQ                                        │
│ • 包装费用                                   │
│ • Logo 费用                                  │
│ • 样品费                                     │
│ • 交期                                       │
│ • 产品净重                                   │
│ • 包装尺寸                                   │
│ • 每箱数量                                   │
│ • 外箱尺寸                                   │
│ • 外箱毛重                                   │
│                                              │
│              [复制询价单]                    │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
         用户去 1688 / Alibaba / 微信
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ ⑥ 工厂怎么报？                               │
│                                              │
│             A厂       B厂       C厂           │
│                                              │
│ 单价        ¥42       ¥45       ¥39           │
│ 包装        ¥3        ¥2        ¥4            │
│ Logo        ¥1        ¥1        ¥1            │
│ MOQ         500       300       1000          │
│ 交期        25天      30天      20天          │
│                                              │
│ 系统只允许标事实：                           │
│                                              │
│ B厂 → MOQ 最低                               │
│ C厂 → 单价最低                               │
│ C厂 → 交期最短                               │
│                                              │
│ 禁止：                                       │
│ “A厂综合最均衡”                              │
│                                              │
│ [用 A 厂算账] [用 B 厂算账] [用 C 厂算账]   │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
         后台设置 primaryQuoteId
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ ⑦ 运到 Amazon 还能剩多少？                   │
│                                              │
│ 已知：                                       │
│ 工厂成本：¥46 / 个                           │
│                                              │
│ 用户只补关键费用：                           │
│                                              │
│ Amazon 佣金：                                │
│ [15%]                                        │
│                                              │
│ FBA：                                        │
│ [$4.80]                                      │
│                                              │
│ 头程：                                       │
│ [$1.80 / 个]                                 │
│                                              │
│ 汇率自动处理，来源小字显示。                 │
│                                              │
│                 ↓                            │
│                                              │
│ 直接进入“一页结论”                          │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ ⑧ 一页结论                                   │
│                                              │
│ 建议：先补食品接触资料，再进入打样           │
│                                              │
│ ─────────────────────────                   │
│                                              │
│ 单件大约剩：                                 │
│ $8.64                                        │
│                                              │
│ 首单大约需要：                               │
│ ¥2.3 万                                      │
│                                              │
│ ─────────────────────────                   │
│                                              │
│ 已确认：                                     │
│ ✓ 市场                                      │
│ ✓ 产品方案                                  │
│ ✓ 工厂报价                                  │
│ ✓ 利润                                      │
│                                              │
│ 还差：                                       │
│ ⚠ 食品接触                                  │
│ ⚠ 专利                                      │
│                                              │
│ 下一步只做一件事：                           │
│                                              │
│ → 向工厂索取食品接触材料报告                 │
│                                              │
│              [继续处理]                      │
│                                              │
│ ▸ 情况差一点会怎样                           │
│ ▸ 什么变化会改变结论                         │
│ ▸ 查看完整成本                               │
│ ▸ 查看完整证据                               │
└──────────────────────────────────────────────┘
```

---

# 6. 一页结论：不再拆成多个页面

原来的：

```text
利润
↓
三情景
↓
风险
↓
结论
↓
灵敏度
```

现在合并成一页：

```text
结论
+
单件利润
+
首单现金
+
还缺什么
+
下一步
```

下面默认折叠：

```text
▸ 情况差一点会怎样
▸ 什么变化会改变结论
▸ 完整成本
▸ 风险与 Evidence
```

---

# 7. 三情景怎么展示

后台仍然是：

```text
Conservative
Base
Optimistic
```

前台只显示：

```text
情况差一点
正常情况
情况比较好
```

示例：

```text
情况差一点
$4.20 / 件

正常情况
$8.64 / 件

情况比较好
$10.10 / 件
```

下面只加一行说明：

> 情况差一点 = 售价低一点、广告和退货高一点。

详细参数默认折叠。

---

# 8. Decision Sensitivity

不新增评分体系。

只回答：

> 什么变化会改变当前结论？

例如：

```text
当前：
建议继续

售价 $29.99 → $27.99
→ 可能变成“先观察”

头程 $1.80 → $3.00
→ 利润明显下降

Patent → FAIL
→ “不建议做”
```

---

# 9. Next Best Action 必须是确定性规则

不能让 LLM 自由决定下一步。

优先级固定：

```text
① 已确认致命阻断
   ↓
   直接 STOP / BLOCKED
   不推荐下一步

② 可能直接改变 Go / No-Go 的未验证项
   例如：
   Patent 未验证
   强制合规未验证

③ 缺了就不能完成财务计算的关键项
   sellingPrice
   productCost
   referralFeeRate
   fbaFeePerUnit
   freightPerUnit

④ 会改变“能不能启动”的项
   MOQ
   首单现金
   样品费
   模具费
   首批头程

⑤ 其他非阻断项
```

每次只推 1 条。

例如：

```text
当前缺：

Patent
Food Contact
Carton Weight
Storage Fee
```

如果 Patent 最可能直接改变结论：

前台只显示：

> **下一步：先查专利。**

处理完后，重新根据当前 Candidate 状态计算下一条。

## V1 不增加任务状态机

V1 不需要额外保存：

```text
lastResolvedActionId
```

Next Best Action 保持为确定性纯函数：

```text
getNextBestAction(candidate)
```

逻辑：

```text
读取当前 Candidate
      ↓
收集未解决问题
      ↓
按照固定优先级排序
      ↓
取第一条
```

只有未来真正出现：

```text
Skip
Snooze
任务指派
已忽略
历史追踪
```

时，再引入 Action State。

---

# 10. 卡点与停止规则

不要把“没数据”当成“失败”。

后台统一使用：

```text
CONTINUE
继续

NEEDS_DATA
缺证据，先补

STOP
已有明确反证，停止
```

例如：

```text
Search Volume = UNKNOWN
```

不等于：

```text
没有需求
```

应该是：

```text
NEEDS_DATA
```

---

# 11. Specification 规则

后台：

```text
DRAFT
FROZEN
```

前台：

```text
还在修改
已按这个去询价
```

询价前必填：

```text
材质
容量
产品尺寸
目标售价
```

可暂时 ESTIMATE：

```text
净重
包装尺寸
包装后重量
箱规
外箱尺寸
外箱毛重
```

---

# 12. 显式定义 CORE_SPEC_FIELDS

不能把“核心规格”只写在文档里，代码中要明确：

```text
CORE_SPEC_FIELDS = {
  material,
  capacity,
  dimensions,
  targetSellingPrice
}
```

用途：

```text
Spec V1
      ↓
字段级 diff
      ↓
CORE_SPEC_FIELDS 是否变化？
```

如果只是补：

```text
净重
包装尺寸
箱规
外箱毛重
```

可以写回当前 Spec。

如果修改：

```text
material
capacity
dimensions
targetSellingPrice
```

则视为核心规格变化。

> 说明：V1 对 Quote 采用保守策略——只要核心规格变化，整份 Quote 置为 `STALE`。  
> 不在 V1 做复杂的 Quote 字段级依赖图。

---

# 13. 询价结果回填规格

询价单要求工厂返回：

```text
净重
包装尺寸
每箱数量
外箱尺寸
外箱毛重
```

用户录入 Supplier Quote 时：

```text
Quote
  ↓
把这些非核心字段自动回填到当前 Specification
```

不要让用户去另一个页面再录一遍。

## 13.1 普通补充

例如：

```text
净重
箱规
包装后重量
```

原来为空：

```text
→ 直接补入当前 Spec
```

## 13.2 核心规格发生变化

例如工厂说：

```text
25cm 做不了
只能 27cm
```

则：

```text
CORE_SPEC_FIELDS 变化
      ↓
生成 Spec V2
      ↓
旧 Quote → STALE
旧 FBA → UNKNOWN
旧 Freight → UNKNOWN
```

不能拿新规格继续吃旧成本。

---

# 14. Supplier Quote

后台：

```text
SupplierQuote {
  id
  candidateId
  specVersionId

  supplierName

  unitPrice
  packagingCost
  logoCost

  moq
  sampleCost
  toolingCost

  leadTimeDays

  captureMethod
  sourceChannel

  currency
  capturedAt
}
```

---

# 15. Quote 来源拆成两个维度

不要做枚举爆炸：

```text
MANUAL_1688
MANUAL_WECHAT
MANUAL_EMAIL
API_1688
...
```

改成两个独立字段：

```text
captureMethod:
MANUAL | API | IMPORT
```

```text
sourceChannel:
1688 | ALIBABA | WECHAT | EMAIL | OTHER
```

组合后即可表示：

```text
MANUAL + WECHAT
MANUAL + 1688
API + 1688
IMPORT + EMAIL
```

这样未来扩展 Provider 不需要不断加新枚举。

---

# 16. Quote 可以草稿保存，但不能偷偷算错

为了降低输入摩擦：

Quote 草稿允许最少只填：

```text
unitPrice
MOQ
```

但这只代表：

```text
Quote Draft
```

不能直接用于完整 Economics。

如果用户点击：

```text
[用这家算账]
```

但：

```text
packagingCost = UNKNOWN
logoCost = UNKNOWN
```

系统必须明确问：

```text
包装有没有额外费用？
Logo 有没有额外费用？
```

用户可以选择：

```text
无额外费用 → FACT 0
有费用 → 填写
还不知道 → UNKNOWN
```

禁止：

```text
UNKNOWN
→ 偷偷按 0
```

---

# 17. 多 Supplier Quote

```text
Quote A
Quote B
Quote C
```

都绑定：

```text
specVersionId
```

用户选择：

```text
primaryQuoteId
```

Economics 只消费这一份。

禁止：

```text
A厂产品价
+
B厂包装价
+
C厂 MOQ
```

混算。

系统只允许显示事实标签：

```text
MOQ 最低
单价最低
交期最短
```

不允许：

```text
综合最优
最均衡
最值得选
```

除非未来正式设计 Supplier Recommendation Policy。

---

# 18. Quote → Product Cost

第一版：

```text
productCost
=
unitPrice
+
packagingCost
+
logoCost
```

必须保留分项。

例如：

```text
产品单价：¥42
包装：    ¥3
Logo：    ¥1
----------------
Product Cost：¥46
```

样品费 / 模具费不进入 `productCost`。

---

# 19. Unit Economics 与 Initial Cash 必须领域层分离

不能只在 UI 上分开。

建议分别建模。

## 19.1 Unit Economics

回答：

> 卖一件到底剩多少？

```text
Selling Price
- Product Cost
- Amazon Referral Fee
- FBA
- Freight
- Duty
- Ads
- Return
- Storage
----------------------
Contribution Profit
```

---

## 19.2 Initial Cash Requirement

回答：

> 第一次真正启动这个产品，要掏多少钱？

P0 至少：

```text
MOQ × Product Cost
+ Sample Cost
+ First Freight
----------------------
Minimum Initial Cash
```

如果有：

```text
Tooling / Mold
Packaging Setup
Other One-time Costs
```

继续加入。

代码层不要把：

```text
sampleCost
toolingCost
```

错误塞进：

```text
productCost
```

---

# 20. Provenance

关键数值继续使用：

```text
FACT
ESTIMATE
ASSUMPTION
UNKNOWN
```

前台翻译：

```text
FACT
→ 工厂正式报价 / 已确认数据

ESTIMATE
→ 估算值

ASSUMPTION
→ 暂时按这个算

UNKNOWN
→ 还不知道
```

---

# 21. 汇率 FX

人民币报价进入 USD Economics：

```text
¥46 CNY
      ↓
FX Snapshot
      ↓
USD Economics
```

后台保留：

```text
currencyPair
fxRate
source
capturedAt
```

前台只显示：

> 按当前汇率换算，可修改。

不单独做汇率页面。

---

# 22. 5 个 Critical Economics Input

继续沿用现有代码：

```text
sellingPrice
productCost
referralFeeRate
fbaFeePerUnit
freightPerUnit
```

任意一项缺失：

后台：

```text
Economics = INCOMPLETE
```

前台：

> 还差 FBA，填完才能判断是否值得做。

不要显示 `INCOMPLETE`。

---

# 23. 财务决策规则不改

继续沿用冻结政策：

```text
Base Profit < 0
或
Base Margin < 0
        ↓
BLOCKED
```

```text
Base Margin < 12%
或
Conservative Profit < 0
        ↓
WATCH
```

之后还要通过：

```text
Evidence Gate
Risk Gate
Assumption Gate
Missing Requirement Gate
```

才能：

```text
SHORTLIST
```

不改成 15%。

---

# 24. Risk Applicability：只做轻量映射

Next Best Action 需要知道：

> 哪些风险适用于当前产品？

但 V1 不建设巨型合规规则库。

只做轻量：

```text
RiskApplicabilityPolicy
```

示例：

```text
Food Contact Product
→ FOOD_CONTACT

Children Product
→ CHILD_SAFETY

Electrical Product
→ ELECTRICAL / FCC

Glass Product
→ BREAKAGE / PACKAGING
```

用途仅限：

```text
Product Type
      ↓
Applicable Risk Types
      ↓
生成需要核验的 Risk
      ↓
默认 UNVERIFIED
```

不能用于：

```text
自动判断合法 / 不合法
自动给 PASS
```

---

# 25. 风险前台必须讲人话

后台：

```text
PATENT = UNVERIFIED
COMPLIANCE = UNVERIFIED
```

前台：

```text
专利还没查
→ 先别开模

食品接触资料还没有
→ 向工厂要报告
```

没有 Evidence：

```text
不能 PASS
```

但用户看到的永远是：

```text
现在还差什么
下一步做什么
```

---

# 26. 玻璃产品的特殊风险

系统可以主动提醒：

```text
玻璃
→ 注意破损
→ 注意包装
→ 注意 Return
```

但不能隐藏写死：

```text
glass → returnRate × 1.3
```

正确方式：

```text
Glass Breakage Risk
        ↓
显式生成 Assumption
        ↓
用户确认 / 后续真实数据覆盖
```

允许用户：

```text
一键接受当前 Assumption
```

但必须仍然明确标记：

```text
ASSUMPTION
```

不能伪装成 FACT。

---

# 27. 前端只保留 6 个主模块

导航可以是：

```text
① 市场
      ↓
② 竞品与用户
      ↓
③ 产品方案
      ↓
④ 工厂与成本
      ↓
⑤ 利润与风险
      ↓
⑥ 结论
```

但不是强制 Stepper。

支持：

```text
跳入
跳过
回退
重新计算
```

---

# 28. Candidate 首页

用户再次进入某个 ProductCandidate 时，首页不要先展示表格。

应该直接：

```text
┌────────────────────────────────────┐
│ 玻璃水果盒 + 沥水篮                │
│                                    │
│ 建议：先补食品接触证明，再打样     │
│                                    │
│ 单件大约剩：$8.6                   │
│ 首单大约需要：¥2.3 万              │
│                                    │
│ 还差：                             │
│ 专利 / 食品接触                    │
│                                    │
│ 下一步：                           │
│ 向工厂索取食品接触材料报告         │
│                                    │
│ [继续处理]                         │
│                                    │
│ [复制询价单] [填工厂报价]          │
│ [查看完整结论]                     │
└────────────────────────────────────┘
```

用户永远知道：

```text
当前状态
+
两个关键数字
+
下一步
```

---

# 29. 后台状态翻译

| 后台 | 前台 |
|---|---|
| DRAFT | 还在修改 |
| FROZEN | 已按这个去询价 |
| STALE | 规格变了，需要重新问 |
| FACT | 工厂正式报价 / 已确认 |
| ESTIMATE | 估算值 |
| ASSUMPTION | 暂时按这个算 |
| UNKNOWN | 还不知道 |
| INCOMPLETE | 还差一项才能算 |
| NEEDS_VALIDATION | 先补这份材料 |
| WATCH | 先观察 |
| SHORTLIST | 建议继续打样 |
| BLOCKED | 不建议做 |

---

# 30. Phase 3 V1 P0

```text
P0-1
Specification Version
+ DRAFT / FROZEN
+ CORE_SPEC_FIELDS

P0-2
生成可复制询价单

P0-3
3 家 Supplier Quote
+ specVersionId
+ primaryQuoteId

P0-4
Quote Provenance
captureMethod
+ sourceChannel

P0-5
Quote → ProductCost
+ 分项保留

P0-6
FX Snapshot

P0-7
询价结果自动回填非核心规格

P0-8
核心规格变化
→ Quote / FBA / Freight 自动失效

P0-9
5 个 Critical Economics Input

P0-10
Unit Economics

P0-11
Initial Cash Requirement
独立模型
至少：
MOQ × ProductCost
+ Sample
+ First Freight

P0-12
RiskApplicabilityPolicy
轻量风险适用映射

P0-13
Risk Manual Evidence

P0-14
Next Best Action
确定性优先级
每次只推 1 条

P0-15
一页 Decision Packet
+ 三情景折叠
+ Sensitivity 折叠
```

---

# 31. P1

```text
多供应商报价比较体验优化

完整 Initial Cash 分项
Tooling / Packaging Setup / Other

Risk Evidence UI 优化

Decision Sensitivity 展示优化

报价文本 / 聊天自动提取
→ 自动填 Supplier Quote

工厂返回重量 / 箱规
→ 自动回填 Specification

汇率 / Amazon Fee / FBA
→ Provider 自动补
```

---

# 32. 第一版明确不做

```text
✗ Phase 2C 大规模漏斗
✗ 新评分体系
✗ 新 Decision Engine
✗ “综合最优供应商”隐形评分
✗ 强制所有用户从 Step 1 开始
✗ lastResolvedActionId / 新任务系统
✗ 巨型合规规则库
✗ AI 成功概率预测
✗ 1688 API / MCP
✗ Alibaba API / MCP
✗ Amazon SP-API
✗ Patent API
✗ 物流 API
✗ 自动 HTS 判断
✗ PDF / Excel / OCR 自动报价解析
```

---

# 33. AI 自动化的正确优先级

未来 AI 优先做：

```text
替用户搬数据
↓
替用户整理证据
↓
最后才替用户发表建议
```

优先级：

```text
1. 报价文本 / 聊天
   → 自动提取 Supplier Quote

2. 工厂返回重量 / 箱规
   → 自动回填 Specification

3. 汇率 / Amazon Fee / FBA
   → Provider 自动补

4. Patent / Compliance
   → AI 辅助检索 Evidence
```

暂不做：

```text
“成功概率 72%”
```

因为在没有：

```text
大量历史 Candidate
+ 最终销量
+ 最终利润
+ 成功/失败 Label
+ 校准集
```

之前，这种概率属于伪精确。

---

# 34. API 后续演进

第一版先证明工作流：

```text
Manual
↓
用户真的愿意用
↓
再自动化
```

以后：

```text
Supplier Quote
Manual
↓
1688 / Alibaba
```

```text
Amazon Fee
Manual
↓
SP-API
```

```text
Freight
Manual
↓
Logistics Provider
```

```text
HTS
Manual
↓
USITC Candidate + Human Confirm
```

```text
Patent
Manual Evidence
↓
USPTO 辅助检索
```

原则：

> **Provider 可以替换，Domain 契约不动。**

---

# 35. Product Analytics：V1 上线后必须验证“好不好用”

V1 最大风险不是逻辑不完整，而是：

> 用户是否愿意手动走完这条工作流？

所以必须埋点。

---

## 35.1 核心漏斗 1

```text
生成询价单
      ↓
录入第一份 Supplier Quote
```

关注：

```text
Quote Entry Conversion
```

回答：

> 用户生成询价单后，是否真的愿意回来继续？

---

## 35.2 核心漏斗 2

```text
录入第一份 Quote
      ↓
补齐关键费用
      ↓
看到一页结论
```

关注：

```text
Decision Packet Completion Rate
```

回答：

> 手工录入是否太麻烦？

---

## 35.3 核心漏斗 3

```text
看到一页结论
      ↓
点击 / 完成 Next Best Action
```

关注：

```text
Next Action Completion Rate
```

回答：

> 系统给出的“下一步”到底有没有实际帮助？

---

## 35.4 折叠区展开率

跟踪：

```text
“情况差一点”展开率
“完整成本”展开率
“风险证据”展开率
“什么变化会改变结论”展开率
```

例如：

```text
“情况差一点”展开率 > 50%
```

说明用户经常需要看。

下一版可以考虑：

```text
把“情况差一点：$4.20/件”
直接显示在主区域
```

而不是继续折叠。

---

# 36. 开发顺序

不要继续扩架构。

直接：

```text
ProductCandidate
      ↓
Specification UI
+ CORE_SPEC_FIELDS
      ↓
“按这个去询价”
      ↓
询价单
      ↓
Quote A / B / C
      ↓
用户选择一家算账
      ↓
FX
      ↓
Amazon Fee / FBA / Freight
      ↓
Unit Economics
      ↓
Initial Cash
      ↓
Risk Applicability
      ↓
Risk Evidence
      ↓
Existing Decision Engine
      ↓
Next Best Action
      ↓
一页 Decision Packet
      ↓
Product Analytics
```

---

# 37. 验收案例：玻璃水果盒 + 沥水篮

Phase 3 V1 必须真实跑通：

```text
输入：
玻璃水果盒
      ↓
看到：
细分方向
+ 代表竞品
+ 价格带
      ↓
选择：
玻璃盒 + 沥水篮
      ↓
看到：
竞品 + 用户痛点
      ↓
确认：
材质 / 容量 / 尺寸 / 售价
      ↓
生成询价单
      ↓
录入 3 家工厂报价
      ↓
系统只标：
MOQ 最低 / 单价最低 / 交期最短
      ↓
用户选择一家算账
      ↓
系统得到 Product Cost
      ↓
补 Amazon Fee / FBA / Freight
      ↓
得到：
单件利润
+ 首单现金
      ↓
生成适用风险
      ↓
录入 Risk Evidence
      ↓
得到 Decision
      ↓
一页结论：
结果
+ 两个关键数字
+ 下一步
+ 折叠三情景
+ 折叠 Sensitivity
```

---

# 38. V1 最终冻结标准

必须满足：

```text
① 支持多入口

② 市场前半段快速给价值

③ 能生成询价单

④ 核心 4 规格即可进入询价

⑤ CORE_SPEC_FIELDS 在代码层明确

⑥ 能录入 3 家报价

⑦ Quote 来源可追溯

⑧ 不做隐形供应商评分

⑨ 能选 primaryQuoteId

⑩ 能自动回填非核心规格

⑪ 核心规格变化后旧成本失效

⑫ 能正确处理 CNY → USD

⑬ Quote Draft 不允许 UNKNOWN 偷偷当 0

⑭ Unit Economics 与 Initial Cash 分模型

⑮ 能算单件贡献利润

⑯ 能算首单最低现金需求

⑰ Risk Applicability 只做适用性，不自动判合法

⑱ Risk 无证据不能 PASS

⑲ Next Best Action 有固定优先级

⑳ Next Best Action V1 保持纯函数

㉑ 每次只推 1 条下一步

㉒ 结论页合并成一页

㉓ 三情景默认折叠

㉔ Sensitivity 默认折叠

㉕ 前台不暴露后台术语

㉖ 上线后有核心漏斗埋点

㉗ 上线后能统计折叠区展开率
```

后台最终状态：

```text
SHORTLIST
WATCH
NEEDS_VALIDATION
BLOCKED
```

前台：

```text
建议继续打样
先观察
先补这份材料
不建议做
```

---

# 39. 最终一句话

CrossPilot 的单产品选品 V1，不是帮用户：

> 一次看更多产品。

而是帮用户：

> **把一个产品从“看起来能做”，推进到“下单前已经把账和风险说清楚”。**

用户真正感受到的流程只有：

```text
选一个方向
   ↓
问工厂
   ↓
看看还能不能赚
   ↓
把最大风险补掉
   ↓
决定做不做
```

后台严谨，前台简单。

做到这里：

```text
CrossPilot 单产品选品 V1
正式冻结
```
