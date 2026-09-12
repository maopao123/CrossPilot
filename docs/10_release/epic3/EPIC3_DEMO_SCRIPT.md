# CrossPilot V9 Epic 3: Operations Today Release Demo Script

> **5~10 Minute Interactive Walkthrough for Operations Today & WF-05 HITL**  
> *Target Audience: Cross-Border E-Commerce Operators, Merchandisers, Team Leads*

---

## 1. 演示目标与前置准备 (Demo Objectives & Setup)

本演示脚本指导演示者在 5 至 10 分钟内，完整展示 CrossPilot V9 Epic 3（日常运营诊断与人机协同工作台）的核心业务流程与工程特性：
- **从发现到决策**：在每日运营驾驶舱中一屏看清“发生了什么、哪个最危险、为什么、先做什么”。
- **人机协同审批闭环**：对高风险动作进行人工审核，坚守 `Approval ≠ Execute` 边界。
- **多人并发防冲突**：现场体验乐观并发控制（OCC）如何防御多人协作覆盖。

### 前置准备
1. 启动 API 服务：`pnpm --filter @crosspilot/api run start:dev` (默认端口 `http://localhost:3001`)。
2. 启动前端工作台：`pnpm --filter @crosspilot/web run dev` (访问 `http://localhost:3000/app/operations/today`)。
3. 确保数据库连接或使用默认内存/本地持久化环境。

---

## 2. 演示操作步骤 (Step-by-Step Script)

### Step 1: 访问每日运营驾驶舱 (0:00 - 0:45)
1. 打开浏览器访问 `http://localhost:3000/app/operations/today`。
2. **话术要点**：
   > “这是 CrossPilot V9 的每日运营工作台。它不是一个被动的报表系统，也不是一个聊天对话框，而是每天早上运营人员的战备驾驶舱。它直接回答三个问题：今天店铺发生了什么？哪个 SKU 最危险？以及我们应该先做什么？”
3. 查看顶部栏：
   - 站点切换：默认 `AMAZON_US`。
   - 模式选择：切换到 `WORKSPACE` 全店批量模式。
   - 对比周期：最近 7 天对比基线 7 天。

---

### Step 2: 触发全店日常诊断并观察实时 DAG 编排 (0:45 - 2:00)
1. 点击右上角醒目的蓝色按钮 **“运行全店诊断” (Run Diagnosis)**。
2. 观察页面顶部出现的 **“WF-05 编排执行中” (Workflow Progress Banner)**：
   - 实时百分比进度条从 0% 流畅递增至 88%（暂停在审批门禁）。
   - 点击“展开步骤轨迹 (View Traces)”，实时查看 9 步固定 DAG 的执行顺序：
     1. `VALIDATE_INPUT` (入参校验)
     2. `RESOLVE_SKUS` (解析出 3 款核心 SKU: White, Green, Grey)
     3. `LOAD_CONTEXT` (批量加载 SKU 360 事实上下文)
     4. `DETECT_SIGNALS` (确定性业务异常规则检测)
     5. `DIAGNOSE` (跨域因果根因诊断)
     6. `RECOMMEND` (动作生成与优先级打分)
     7. `AGGREGATE` (跨 SKU 优先级与财务敞口排序)
     8. `APPROVAL_GATE` (人机协同审批门禁)
3. **话术要点**：
   > “注意看，整个工作流是通过服务器端推送事件（SSE）实时推送到浏览器的。没有轮询造成的网络开销，也没有私有思维链泄露。每个步骤耗时只有几十毫秒。”

---

### Step 3: 检查全店经营健康与 SKU 风险矩阵 (2:00 - 3:15)
1. 观察 **经营健康概览卡片 (Business Health Summary)**：
   - 全局状态显示为红色的 **CRITICAL (危机待决)**。
   - 明确标出：3 款已评估 SKU、2 个 P1 级紧急动作、1 个 P2 级改进建议、2 个待审批动作。
2. 浏览 **SKU 风险矩阵表 (SKU Risk Ranking Matrix)**：
   - `MTH-GREEN-001`：标红，CRITICAL 状态，主要风险为“库存耗尽/即将断货 (OUT_OF_STOCK)”。
   - `MTH-WHITE-001`：标黄，NEEDS_ATTENTION 状态，主要风险为“第 11 周广告花费飙升与利润下滑”。
   - `MTH-GREY-001`：标黄，主要风险为“退货率突增至 6.7% 与 VOC 孔径缺陷”。

---

### Step 4: 深入 Green SKU 缺货危机与因果证据链 (3:15 - 5:00)
1. 在建议动作列表中找到第一张置顶的 **P1 动作卡片**：
   - SKU: `MTH-GREEN-001` (Natural Marble Toothbrush Holder - Emerald Green)
   - 动作：`PREPARE_REPLENISHMENT`
   - 标签：**P1 紧急** | **高风险 (HIGH RISK)** | **需人工审批 (APPROVAL_REQUIRED)**
   - 期望影响：*预估避免断货损失 $2,400* (明确标为 `ESTIMATED`，杜绝把未发生的预估虚标为已实际损失)。
2. 点击该动作卡片右上角的 **“查看因果证据链” (View Details)**，右侧滑出 **Action Detail Drawer**：
   - **因果诊断根因**：销量爆发导致现有可用库存耗尽，在途补货周期无法覆盖当前 25.3 件/天的日销消耗。
   - **支撑指标**：可用库存 0、日销 25.3、库存储备 0 天、交期 15 天。
   - **底座事实证据项**：显示来自 ERP 与 FBA 的数据库实测数据，因果置信度为 **Confirmed (确定)**，数据新鲜度为 **FRESH (最新)**。

---

### Step 5: 高风险动作人工审批与免责声明验证 (5:00 - 6:15)
1. 在抽屉底部或卡片上点击 **“批准动作” (Approve)**。
2. 界面弹出专用的 **高风险操作确认弹窗 (Approval Confirmation Modal)**。
3. **重点展示法定免责声明**：
   - 界面上醒目的黄色警告框：
     > **“安全免责提醒：此审批仅在 CrossPilot 系统内标记决策通过，绝对不会向外部系统发起采购、向供应商下单或产生任何财务付款行为。审批 ≠ 执行。”**
4. 输入审批备注：“*业务主管已核验，同意启动空运补货规划流程*”，点击弹窗中的“确认批准”。
5. 弹窗关闭，卡片状态即刻更新为绿色的 **APPROVED (已批准)**，右上角待审批计数自动递减。

---

### Step 6: 现场演示多人协同 OCC 版本冲突拦截 (6:15 - 7:45)
1. 找到 White SKU 的广告动作（`REVIEW_AD_SPEND`）。
2. **模拟多操作员并发冲突场景**：
   > “在跨境电商大卖公司，一个店铺往往有多个运营人员同时协作。如果操作员 A 已经审批了动作，而操作员 B 还在看旧页面并尝试驳回，会发生什么？”
3. 打开浏览器开发者工具控制台，或者打开两个并排浏览器标签页：
   - 标签页 1：已经提交审批，内部版本号从 V1 升级到了 V2。
   - 标签页 2：仍然停留在 V1。在标签页 2 中尝试点击“驳回”。
4. **效果展现**：
   - 页面精准捕获 HTTP 409 `CHECKPOINT_VERSION_CONFLICT` 错误。
   - 屏幕弹出 **“版本冲突提示” (OccConflictModal)**：“*当前动作已被其他团队成员修改或审核。为防止数据覆盖，请立即刷新工作台。*”
   - 点击“立即刷新”，工作台重新水合，展现最新的已决策状态。
5. **话术要点**：
   > “这证明了 CrossPilot 在数据库底层实现了真正的乐观并发控制（OCC），彻底杜绝了 Last Write Wins（后写覆盖先写）的灾难性事故。”

---

### Step 7: 恢复工作流并完成每日闭环 (7:45 - 8:30)
1. 当待审批的动作处理完毕后，顶部进度横条显示所有前置审批已完成。
2. 点击 **“恢复并完成工作流” (Resume Workflow)**。
3. 观察工作流完成第 9 步 `FINALIZE`，状态流转为 **COMPLETED**。
4. 页面顶部显示绿色横幅：“今日日常运营诊断流程已全部完成并归档”。

---

## 3. 常见问答与技术答疑 (FAQ for Presenters)

- **Q: 为什么批准之后没有自动去亚马逊创建采购单？**  
  **A**: 这是 CrossPilot 的核心架构公理 `Approval ≠ Execute`。自动化操作如果涉及外部真实财务与库存，必须由专门的执行器和具备真实授权的通道独立执行，绝不允许在日常诊断编排层静默改动真实系统。
- **Q: 为什么诊断数据这么快（几十毫秒）？是不是假数据？**  
  **A**: 不是假数据。CrossPilot Phase 2 ~ Phase 5 实现了纯数学与确定性规则的跨域诊断推理机，所有指标计算在内存与数据库适配器内本地完成，绝不用笨重缓慢的 LLM 循环猜测数字。
