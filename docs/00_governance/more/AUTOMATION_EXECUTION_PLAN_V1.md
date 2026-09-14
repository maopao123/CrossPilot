# CrossPilot AI Automation 执行计划 V1

> **For agentic workers：** 逐任务执行下列复选框。支持 writing-plans / executing-plans 技能时可以使用；其他 AI 直接按本文工作，不需要安装技能或启动子 Agent。每批完成后回交统筹 AI 复审。
>
> **Goal：** 在隔离环境交付一条经过真实 HTTP 边界、可恢复、可对账的「库存 → 补货建议 → 人工审批 → ERP 建单 → 分批到货 → 入库核对」闭环。
>
> **Architecture：** 复用 Commerce Ports、现有 Action、采购状态机、库存计算和 BullMQ。先治理假成功，再为外部操作增加最小持久化回执与恢复机制；Simulator 只补采购场景所需行为，不建设完整 ERP 或新 Workflow Framework。
>
> **Tech Stack：** TypeScript、NestJS、Prisma、PostgreSQL、BullMQ、Jest；HTTP 测试优先 Node 内置能力；沿用 Next.js 现有页面。
>
> **日期 / 状态：** 2026-09-14 / PLAN_READY，A0～A8 均未执行。本文是未来实施规格，不是实现或测试通过证明。

## 1. 目标、范围与授权解释

项目根目录：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。下文代码路径均相对此目录。

原始方向见 [Roadmap V1](./CrossPilot_AI_Automation_Roadmap_V1.md)。本文是审核后的近期执行收敛版；保留原文，不改写其历史。

用户分工：其他 AI 工具执行，当前统筹 AI 制定计划、检查交付、提出修复清单和判定阶段是否通过。**用户把本包交给执行工具并要求实施后，从第一批开始；不能把本次“写计划”当作已经允许当前统筹 AI 改业务代码。**

### 1.1 本期做到什么算成功

1. API / RPA / Browser 等未实现、缺授权或失败时，不出现真实执行成功；显式模拟成功始终标识模拟。
2. 同一审批动作重复提交、并发提交、进程重启后恢复，远端只有一张采购单。
3. ERP 已提交但响应丢失时，先通过业务关联键查询；不会盲目再建单。
4. 多次部分收货、重复通知、通知乱序和并发收货，不重复增加库存、不超收。
5. 可以从界面或 API 查询审批内容、操作进度、生效证据、恢复记录和人工处理原因。
6. 使用真实 PostgreSQL 和真实 HTTP 验证；使用真实隔离 Redis 验证 worker 重启恢复。测试端点仍属于 Simulator，不能宣称已接入商业 ERP。
7. 工程可靠性与 AI 增量价值分别报告；不靠模拟利润上涨给工程验收“加分”。

### 1.2 明确不在本期实施

- 不建设完整公司数字孪生、多仓调拨、多币种财务、客服系统、Shopify 全量接入。
- 不接真实店铺写入、不向供应商发送订单、不执行真实付款或发送飞书/邮件。
- 不重写 Agent / RAG / WF-05，不引入第二套通用工作流框架，不为了列技能栈新增 Python 服务。
- 不改旧 V1 世界参数、既有广告 Simulator v2 业务公式、OppScore 或诊断阈值。
- 不把真实 ERP 厂商适配器名称注册成“已实现”；本期只有独立 HTTP SimulatorERPAdapter。

### 1.3 环境与发布边界

- 编码、增量迁移文件、隔离测试、必要修复属于交给执行工具后的实施范围；不因历史文档中的“此能力未授权”重复询问同一局部开发范围。
- 默认只启动测试进程：隔离 PG、隔离 Redis、绑定 `127.0.0.1` 的临时 HTTP 测试服务；端口由测试分配并负责关闭。不能启动连接现有 `.env` 的整套业务 API / Web / worker。
- 数据库连接只来自专用测试变量；禁止回退到 `DATABASE_URL`。如果需要应用迁移，先检查测试目标，限定该子进程连接，不能直接运行未核实目标的根目录 `db:migrate`。
- 读取或创建测试环境前核对环境标识。没有可确认的隔离环境时，先完成无依赖任务与测试代码，依赖项标 `NOT_RUN`，不得改用共享或生产库。
- 原有 Windows“不起业务服务”的限制保留；本包的临时测试服务不是生产部署。后台进程隐藏窗口，清理仅限当前测试创建的 PID 和数据。
- 本包不包含提交、推送、部署、修改生产数据库或生产配置。若用户在执行会话另外授权，按该授权操作并记录。
- 不清理已有未跟踪文件，不打印凭证，不修改根目录历史记录以掩盖事实。开发开始时固定实际 HEAD 与工作树指纹。

## 2. 已核实基线与复用地图

2026-09-14 静态核查 HEAD：`be4b8f6`。当时工作区仅原始 Roadmap 未跟踪。后续 HEAD 有变化时核对增量，不 reset 到此版本。

`docs/HANDOFF.md` 旧段落仍写 `dd69e63`、未提交；这是文档漂移，不代表当前 Git 状态。旧文档测试数字仅供查历史，本轮未重跑，不得复制为新证据。

| 当前代码 | 核实到的能力 / 问题 | 本期处理 |
|---|---|---|
| `packages/actions/src/action.router.ts` | 未实现分支返回 executed=true；RPA 返回状态未归一；幂等使用进程内 Map | 消除假成功；持久化恢复放组合层，不能给 actions 包引入 Prisma |
| `packages/integrations/src/rpa/rpa.registry.ts` | 默认选 Mock RPA | 按显式环境与 provider 选择；无配置不自动替代真实执行 |
| `packages/integrations/src/rpa/yingdao.adapter.ts` | 缺凭证回退 Mock；getStatus 走 Mock；cancel 恒 true | 无真实能力返回 AUTH_REQUIRED / UNSUPPORTED；不假实现厂商接口 |
| `apps/api/src/modules/operation-automation/operation-automation.service.ts` | 固定 Listing 文案、固定 Feed ID、固定发布确认；工作流在内存 | 首批治理成功语义和模拟标签；本期不重做 Listing 生成或实现真实发布 |
| `packages/domain/src/commerce-ports/commerce.ports.ts` | 已有 Catalog / Order / Inventory / Ads / Profit Port | 增量补采购契约，避免重复 Integration Hub |
| `apps/api/src/modules/action-layer/action-layer.service.ts` | 已有审批、v2 执行、回执回放、补偿 | 新采购动作接入现有入口，保留已有动作行为 |
| `packages/db/src/simulator/v2-run-store.ts` | v2 广告动作、状态/回执事务与 OCC | 保留；不能给外部操作伪造 runId 来复用模拟专属回执 |
| `apps/api/src/modules/purchase/purchase.service.ts` | 创建、确认、发货、部分/全部收货已实现 | 补业务关联、收货去重、并发与投影，不另写一套采购服务 |
| `packages/domain/src/purchase/purchase-order.state-machine.ts` | 已有 PARTIALLY_RECEIVED；缺少连续多次部分收货自转换 | 测试驱动做必要增量，不替换原枚举 |
| `packages/domain/src/inventory/inventory-planning.service.ts` | 已有确定性补货计算 | 原样复用，并校验数据时效与输入 |
| `apps/worker/src/worker.service.ts` | 已有 BullMQ 调度与闭环队列 | 新增薄恢复 processor；不在 scheduler 写业务公式 |
| `scripts/run-commerce-experiments.cjs` | 明确为规则实验，无 LLM 调用 | 不改标记，不拿该实验证明 AI 收益 |

## 3. 分批与统筹复审

| 批次 | 任务 | 交付物 | 复审门禁 |
|---|---|---|---|
| 第一批：执行真实性 | A0～A2 | 入口地图、失败复现、真实度/状态契约、消除假成功 | G1：失败不会成功、模拟不会冒充真实、旧核心功能无回归 |
| 第二批：采购闭环 | A3～A6 | 操作持久化、HTTP ERP、采购审批执行、幂等收货与核对 | G2：PG + HTTP 故障矩阵通过，远端单据和本地记录一致 |
| 第三批：恢复与交付 | A7～A8 | 真实队列恢复、最小 UI、完整演示和证据包 | G3：重启/并发/未知结果可恢复，测试覆盖实际生产调用链 |

批次内连续推进，不为每个测试或文件请求许可。到 G1/G2/G3 时停止扩范围，提交证据给统筹 AI。这个暂停来自用户“其他工具执行、我负责统筹”的分工与本计划的批次安排，不是重新索要常规编码权限。

复审结论只有 `PASS`、`CHANGES_REQUESTED`、`BLOCKED_ENV`。执行 AI 只能报 `READY_FOR_REVIEW`，不能代替统筹 AI 填 PASS。环境缺失不妨碍交付代码，但依赖该环境的门禁不能通过。

## 4. 必须固定的跨任务契约

### 4.1 分离生命周期、生效结果与恢复动作

新增契约建议放 `packages/shared/src/contracts/automation-contracts.ts`，从 `packages/shared/src/index.ts` 导出。以下是本期目标类型，尚未存在；不得不加类型定义就从后续任务引用。

```ts
export type AutomationMode = 'MOCK' | 'SIMULATOR' | 'LIVE';
export type AutomationPhase =
  | 'READY' | 'SUBMITTED' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'NEEDS_ATTENTION';
export type AutomationEffect = 'APPLIED' | 'NOT_APPLIED' | 'PARTIALLY_APPLIED' | 'UNKNOWN';
export type RecoveryAction = 'NONE' | 'RETRY' | 'QUERY' | 'REAUTHORIZE' | 'MANUAL';

export interface ExecutionEvidence {
  mode: AutomationMode;
  provider: string;
  operationId: string;
  phase: AutomationPhase;
  effect: AutomationEffect;
  recovery: RecoveryAction;
  errorCode?: string;
  externalId?: string;
  requestId?: string;
  verifiedAt?: string;
  evidenceRef?: string;
}
```

- 旧 `PlannedActionStatus` / `ActionStatus` 不整体改名，新增 evidence 信息并明确映射。只有 `COMPLETED + APPLIED` 可以映射当前环境的 SUCCESS；MOCK/SIMULATOR 的成功必须持续展示环境。
- `FAILED/NOT_APPLIED`、`NEEDS_ATTENTION/UNKNOWN` 都不能映射成功；处理中映射 EXECUTING/RUNNING。
- HTTP 200、任务 jobId、提交被接受均不能单独作为 APPLIED 证明。优先通过查询读回目标状态。
- 超时默认 UNKNOWN + QUERY；只有确定未发出/未生效，或端点有经过验证的幂等保证，才能 RETRY。
- AUTH_REQUIRED 走 REAUTHORIZE；UNSUPPORTED 走 MANUAL 或结束为未生效；不能切换 Mock。
- 旧 UNKNOWN 恢复不得因重试次数耗尽就改成“未生效”；转 NEEDS_ATTENTION 并保留 UNKNOWN。

### 4.2 本期最小 ERPPort

契约共享 DTO 放 `packages/shared/src/contracts/erp-contracts.ts`，端口声明放 `packages/domain/src/commerce-ports/erp.port.ts`。实现 `SimulatorERPAdapter` 放 integrations。它通过 shared 类型实现结构兼容，**不得新增 integrations → domain 依赖形成现有依赖环**。

```ts
export interface ErpScope {
  workspaceId: string;
  storeId: string;
  connectionId: string;
}
export interface ErpOrderLine {
  skuId: string;
  quantity: number;
  unitCostMinor: number;
}
export interface ErpCreateCommand {
  operationId: string;
  payloadHash: string;
  supplierId: string;
  currency: 'USD';
  lines: ErpOrderLine[];
}
export interface ErpPurchaseOrder {
  externalId: string;
  operationId: string;
  payloadHash: string;
  version: number;
  status: 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'SHIPPED'
    | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  lines: Array<ErpOrderLine & { receivedQuantity: number }>;
}
export interface ErpLookup {
  kind: 'FOUND' | 'ABSENT_CONFIRMED' | 'UNKNOWN';
  order?: ErpPurchaseOrder;
}
export interface ErpInventory {
  skuId: string;
  available: number;
  inbound: number;
  version: number;
  observedAt: string;
}
export interface ERPPort {
  getCapabilities(): {
    mode: 'SIMULATOR' | 'LIVE';
    idempotentCreate: boolean;
    lookupByOperationId: boolean;
  };
  getInventory(scope: ErpScope, skuId: string): Promise<ErpInventory>;
  createPurchaseOrder(scope: ErpScope, command: ErpCreateCommand): Promise<ExecutionEvidence>;
  findPurchaseOrder(scope: ErpScope, operationId: string): Promise<ErpLookup>;
  getPurchaseOrder(scope: ErpScope, externalId: string): Promise<ErpPurchaseOrder>;
}
```

`ExecutionEvidence` 从 automation-contracts 导入。scope 中的 connection 必须由服务端绑定，不能让请求者覆盖 baseUrl、环境或密钥。UNKNOWN 查询结果不能当 ABSENT_CONFIRMED；FOUND 后要校验 scope、payloadHash 和订单内容。

Simulator 最小 HTTP 合同：

| 路由 | 语义 |
|---|---|
| `GET /erp/inventory/:skuId` | 读取带单调版本号的库存快照 |
| `POST /erp/purchase-orders` | 按 scope + operationId 去重；同键异参 409；返回 SUBMITTED 后必须读回 |
| `GET /erp/purchase-orders/by-operation/:operationId` | 通过唯一业务关联键查询；响应说明查无结果是否权威 |
| `GET /erp/purchase-orders/:externalId` | 返回单据、当前状态、累计收货数量与版本 |

发货、收货、延迟、故障注入是**测试环境控制端**行为；不得作为 Agent 工具对外暴露。首版无 cancel 端点，不声称支持外部补偿撤单。

### 4.3 持久化与不变量

优先复用 `PlannedAction`、`ActionExecution`、`Approval`。允许增加一张最小 `AutomationOperation` 表，因为 `SimulationExecutionReceipt` 强绑定模拟 Run，不能覆盖真实外部操作。

新增表需要：id、workspaceId、actionId、connectionId、operationKind、idempotencyKey、payloadHash、approvedPayloadHash、mode、provider、phase、effect、recovery、externalId、version、leaseOwner、leaseUntil、attemptCount、nextAttemptAt、lastErrorCode、evidence JSON、createdAt、updatedAt。ActionExecution 记录每次尝试；不再建第二张通用审计平台表。

必要唯一约束：`(workspaceId, connectionId, operationKind, idempotencyKey)`，以及同一 action 的同种操作不重复创建。记录到 PlannedAction 的真实外键，不用虚构 actionId。外部单据映射按 `(workspaceId, connectionId, externalId)` 唯一，优先在现有采购表增量字段。

1. 调用前先落库操作意图，再提交队列。数据库扫描 READY/到期记录补偿“已落库、未入队”，不依赖 Redis 作为唯一事实源。
2. worker 用 version/OCC + 有期限 lease 领取；远端 HTTP 请求不包在长数据库事务中。
3. worker lease 过期可能导致重复投递；远端幂等键与查询恢复才是防止重复副作用的关键，不能宣称 exactly-once delivery。
4. payloadHash 使用排序稳定的 JSON，包含 actionType、scope、supplier、SKU、数量、币种、价格、预期版本；不包含时间戳、attempt。哈希字段要服务端计算。
5. 审批绑定不可变 payloadHash、目标 scope、有效期与版本；执行时重新校验成员/角色。任一业务参数变化必须重新审批。
6. 本期所有采购需要人工审批，审批和执行是独立请求；禁用客户端 autoApprove。已发生外部副作用的恢复查询可继续，不能因审批过期隐藏远端已生效事实。
7. 幂等键重放同输入返回原操作；异参 409；跨租户不可命中缓存、查询单据或恢复任务。
8. 收货事件唯一键至少为 `(workspaceId, connectionId, externalReceiptId)`；存事件和更新采购/库存同事务提交。若使用累计快照，只按单调版本接受快照，不能把累计数反复当增量。
9. 撤销审批只能阻止尚未提交的请求；已提交/UNKNOWN 先查询。已发货不能通过本地逆操作“撤回库存”，本期转人工。

## 5. 文件责任与任务清单

标“新增”的路径是目标设计，执行时若已有同职责文件则复用，并在证据说明。对应 package index / exports 按需更新；不因组织代码进行全仓重构。

### A0：固定基线与验收入口（第一批）

**文件：** 更新 `AUTOMATION_EXECUTION_EVIDENCE.md`；读取 `docs/HANDOFF.md`、`docs/00_governance/CURRENT_SYSTEM_AUDIT_BASELINE.md`、`DOCUMENT_AUTHORITY_MAP.md` 和本计划 §2 的代码。

- [ ] 记录 HEAD、分支、已有变更列表、Node/pnpm 版本和测试环境可用性；标出文档与 Git 不一致的内容，不将旧文档日期当部署事实。
- [ ] 列出所有 ActionRouter / ActionLayer / operation-automation 调用者、API 路由、审批来源、当前真实度与成功依据；先查图工具，可用性不足后用代码搜索。
- [ ] 检查现有 package test/build 配置。尤其 integrations 测试使用 Node CJS 且读取 dist，必须先构建；不能把旧 dist 或 passWithNoTests 当成功。
- [ ] 运行本批相关基线：actions 测试、API v93 与 v10-audit-p0、typecheck；记录真实发现的测试数和失败原因。
- [ ] 在证据的任务表填写 A0 完成，列出第一批准确影响范围。

**验收：** 每个入口都能指向实际源码；每个预期改动能对应原审核问题。没有运行的测试标 NOT_RUN。

### A1：消除 Router 与 RPA 的假成功（第一批）

**修改：** `packages/actions/src/action.router.ts`、`action.types.ts`；`packages/integrations/src/rpa/rpa.interface.ts`、`rpa.registry.ts`、`yingdao.adapter.ts`、`mock-rpa.adapter.ts`；按需修改上述模块实际调用者。

**新增：** §4.1 类型；`packages/actions/test/automation-execution-truth.spec.ts`。

**接口：** dispatch 保留当前签名；context 增加服务端提供的 executionMode/providerId，result 增加可选 executionEvidence。未传 mode 按 LIVE 处理，不默认 Mock；显式演示入口由服务端固定 MOCK。

- [ ] 先写以下断言并运行，确认失败源于当前假成功：未注册 API/PYTHON/BROWSER executor 返回 FAILED + UNSUPPORTED；RPA 返回 FAILED/TIMEOUT/RUNNING 时不能变 SUCCEEDED。
- [ ] 修正结果归一：RPA 的返回对象和抛异常都处理；RUNNING 必须保留外部 jobId 等待查询，TIMEOUT 保留 UNKNOWN。
- [ ] 删除真实路径的隐式 Mock fallback；MOCK 只在明确选择后运行，日志与截图标识模拟，不说真实启动 Chromium 或登录 Seller Central。
- [ ] 缺影刀凭证返回 AUTH_REQUIRED；未验证的 getStatus/cancel 返回 UNSUPPORTED，禁止用 Mock 状态或恒 true 补齐。此任务不实现未核对官方合同的影刀 API。
- [ ] 覆盖高风险动作未审批、跨 workspace 相同 operationId 不共享缓存；进程内 Map 不作为真实执行幂等保证。
- [ ] 运行 actions 测试和 typecheck；更新旧测试中“默认就是 Mock”的预期为显式模拟，不能直接删掉该回归覆盖。

**关键测试形状：** 在现有 Jest 套件中构造同一 ActionProposal，只替换 adapter 返回值，断言外层状态和 evidence；不能只测归一 helper、不经过 dispatch。

```ts
test.each(['FAILED', 'TIMEOUT', 'RUNNING'] as const)(
  'RPA %s cannot become SUCCEEDED', async (status) => {
    const registry = new RpaRegistry();
    registry.register({
      id: 'truth-test-rpa', name: '测试 RPA',
      execute: async () => ({ jobId: 'job-1', status, durationMs: 1 }),
    });
    const router = new ActionRouter(registry);
    const result = await router.dispatch({
      id: 'act-1', type: 'RPA', name: '测试提交', description: '执行真实性测试',
      requiresHumanApproval: true, targetEntity: 'SKU', targetId: 'sku-1',
      payload: {}, riskLevel: 'HIGH', status: 'PENDING',
      createdAt: '2026-09-14T00:00:00.000Z',
    }, {
      workspaceId: 'ws-1', isApproved: true,
      executionMode: 'LIVE', providerId: 'truth-test-rpa',
    });
    expect(result.status).not.toBe('SUCCEEDED');
    expect(result.executionEvidence?.effect).not.toBe('APPLIED');
  },
);
```

新增 context / result 类型是本任务实施内容，测试文件从实际 src 导入 ActionRouter 和 RpaRegistry；不得测试时另造一个 Router。

### A2：发布确认与显示口径治理（第一批，结束交 G1）

**修改：** `apps/api/src/modules/operation-automation/operation-automation.service.ts`；其 controller、返回 DTO 和实际 UI 消费者；`apps/web/src/constants/ui-labels.ts`。

**新增：** `apps/api/test/automation-publish-truth.spec.ts`。

- [ ] 复现：adapter 仅提交成功/处理中/失败、或未提供查询证据时，业务层不得写 PUBLISHED、ACTIVE、syncVerified=true。
- [ ] 删除固定 Feed ID 的真实成功用途；显式 Mock 演示可以展示模拟值，但结果标 MOCK、步骤标“模拟发布”，不触发真实 Outcome。
- [ ] 固定 Listing 文案不得描述成“本次 AI 已生成”；本期标演示或引用已有 Listing 工件，不重写 14 步生成流程。
- [ ] 找到真实页面调用链，显示环境、执行状态、待验证/人工处理原因。只改相关状态文案，不重设计页面。
- [ ] API 失败、刷新或重启后无法恢复的旧内存演示 run 如实显示不可用，不伪造成功历史。本期真实采购恢复由 A3 起落库，不强行迁移所有旧 Listing run。
- [ ] G1 回交：失败测试、修复结果、调用链、变更文件、旧 v93 / Listing 生成回归结果。

**G1 通过条件：** 无凭证、未实现、RPA 失败、处理中、未回查五类路径均无真实成功；原显式模拟仍可使用且标识清晰。

### A3：外部操作持久化与审批绑定（第二批）

**修改：** `packages/db/prisma/schema.prisma`、新增增量 migration；`packages/shared/src/contracts/action-layer-contracts.ts`；`packages/domain/src/action-layer/action-registry.ts`、`action-validator.ts`、必要的 `action-planner.ts` 分支；`apps/api/src/modules/action-layer/action-layer.service.ts` 及 controller/module。

**新增：** `packages/db/src/automation/automation-operation-store.ts`；`apps/api/test/automation-operation-postgres.spec.ts`。

**接口：** AutomationOperationStore 提供 createOrReplay(scope, command)、claim(operationId, expectedVersion, leaseOwner)、recordEvidence(operationId, expectedVersion, evidence)、listDue(now, limit)。精确参数类型复用 §4；方法结果包含持久化版本，查询必须带服务器核实的 workspace/scope。

- [ ] PG 红灯：同键同参回放；同键异参冲突；两个并发执行只领取一次；租户隔离；审批篡改/过期/无权限不能提交。
- [ ] 实现 §4.3 的表、唯一约束、lease/OCC、意图先落库、证据与尝试审计。禁止仅用 find 后 create 实现唯一性。
- [ ] 增量增加 `CREATE_PURCHASE_ORDER` 业务动作，不把它注册进默认 Mock 工具后算“执行完成”。Registry 明确绑定 ERP executor。
- [ ] 同步已知动作清单、payload校验、risk分支及UI映射。采购始终high risk、needApproval=true；不能落入现有默认low risk免审批分支。加入真实ActionLayer入口测试，证明新动作可达且缺审批拒绝。
- [ ] 审批绑定 payloadHash 与有效期；审批 API 只 APPROVED，执行 API 才进入 READY。请求不能携带 isApproved=true 绕过服务端数据库审批。
- [ ] 演练落库后入队失败：记录仍可扫描恢复；外部请求前后记录的阶段可判断是否需要查询。
- [ ] 真 PG 验证事务回滚、唯一键、版本冲突与外键；迁移前后旧 Action、旧模拟 Run 能读取。

**验收：** 新表仅解决远端操作恢复，不复制 PlannedAction 主体；无环境时本任务不得报告 PG PASS。

### A4：最小 ERP HTTP 适配器与隔离模拟端（第二批）

**新增：** §4.2 契约；`packages/integrations/src/erp/simulator-erp.adapter.ts`；`apps/api/test/fixtures/erp-http-server.ts`；`apps/api/test/automation-erp-http.spec.ts`。从 packages 相应 index 导出。

**复用：** ERP 模拟端使用现有 PurchaseService、采购状态机与库存服务；测试应用只装必要模块，不启动依赖共享 .env 的 AppModule。

- [ ] 启动真实 loopback HTTP 服务，服务端使用独立测试 schema/数据库，客户端使用另一隔离 schema/数据库。仅共享测试 PostgreSQL 进程，不共享 Prisma 事务或直接改对方记录。
- [ ] 实现 §4.2 四个路由；Simulator 的 scope + operationId 唯一性必须落库，服务重启后仍去重。
- [ ] Adapter 通过实际 fetch 调用，不允许 jest.mock(fetch) 作为本任务唯一证明；模拟端事务提交后再返回/丢弃响应。
- [ ] 加入可确定复现的测试故障：401、429、提交前失败、提交后断连接、200 畸形结果、延迟可见、服务重启。注入开关只存在于测试控制端。
- [ ] Adapter 对 429 读取重试提示并有上限；提交后超时返回 UNKNOWN；查无结果若非权威则保持 UNKNOWN。禁止 API 超时后自动换 RPA 再创建同一单。
- [ ] 明确能力为 SIMULATOR + idempotentCreate + lookupByOperationId；环境、provider 和版本进入 evidence。
- [ ] 凭证仅绑定测试连接，校验 scope；跨租户访问 403/404，错误不泄露其他单据。

**验收：** 客户端操作 ID、服务端 PO、查询响应和数据库记录可以关联。HTTP 真实不等于商业 ERP 已接入，证据分类必须是 `SIMULATOR_HTTP_VERIFIED`。

### A5：库存到采购动作与审批闭环（第二批）

**新增：** `apps/api/src/modules/purchase/purchase-automation.service.ts`；`apps/api/test/automation-procurement-flow.spec.ts`。

**修改：** `purchase.controller.ts`、`purchase.module.ts`；A3 ActionLayer 的采购 binding；复用 `InventoryPlanningService.calculatePlanning`。

**接口与 API：** 在现有 `@Controller('purchase-orders')` 中新增 `POST /purchase-orders/automation/proposals`（继承应用全局 `/api/v1` 前缀），输入 storeId、skuId、supplierId；workspace 来自守卫。返回现有 PlannedAction ID、建议数量、金额、证据与数据时效。审批/执行复用 ActionLayer 路由，A0 记录其实际 URL；不再新建第三套审批 API。

- [ ] 准备单店、单仓、USD、3 个 SKU、1 个供应商的独立采购 fixture；不写入 legacy-v1 或既有广告 v2 Run。
- [ ] 从 ERPPort 库存快照、已发生销量和有效报价取输入；历史不足、leadTime 缺失、过期报价/库存不创建可执行动作。时效首版固定：库存/报价有效性按来源时间或有效期核实，库存超过 15 分钟需刷新；模拟时间从 fixture 注入。
- [ ] ADS首版取同scope最近7个完整已提交日的销量均值；不足7日阻断建议。固定销量fixture只生成订单/出库事实，不直接写“应补40件”的结论。测试端通过现有库存服务形成出库，建议端重新读取快照与销量；不增设第二个世界引擎。
- [ ] 调用既有补货计算；示例 available=30、inbound=0、ADS=10、leadTime=3、safetyDays=2、targetDays=5，结果 quantity=40、reorderPoint=50。报价 250 美分/件，总额 10000 美分。
- [ ] 数量按有效 MOQ 向上取整后重新算总额；数量正整数、价格非负整数且金额使用 minor units。不得信任客户端 totalAmount。演示预算上限 20000 美分/单，超过上限直接需人工处理，不偷偷截断数量。
- [ ] 对同 SKU 尚未完成的采购动作/采购单做补货去重。创建远端 PO 后至正式 inbound 前，待交付承诺数量也要参与去重，不能每天再生成同一补货。
- [ ] 创建 recommendation/PlannedAction，保留库存版本、报价版本、公式输入与来源 ID；修改数量、报价或供应商后重新审批。
- [ ] 用户审批后执行，通过 ERPPort 创建订单，查询读回后持久化 externalId；通知与查询只允许推进正确 scope 的单据。

**验收：** 禁止 Agent 直接创建供应商订单；执行成功只表示 ERP 单据创建已核实，不表示货已到或业务收益已实现。

### A6：分批到货、幂等入库与独立对账（第二批，结束交 G2）

**修改：** `apps/api/src/modules/purchase/purchase.service.ts`；`packages/domain/src/purchase/purchase-order.state-machine.ts`；必要的采购版本字段与收货去重存储。

**新增：** `apps/api/test/automation-receipt-postgres.spec.ts`；`apps/api/test/automation-procurement-reconcile.spec.ts`。

**接口：** 为收货增加稳定 externalReceiptId/幂等键；旧人工 API 保持兼容，新自动路径强制使用。自动路径从服务端 ERP connection 获取 scope，不能由 payload 覆盖租户。

- [ ] 红灯：同一 PO 连续三次部分收货；重复收货 ID；同一 ID 异参；两个并发收货累计超量；同 SKU 多个 PO 并发收货。
- [ ] 复用现有收货计算，增加收货事件唯一约束和采购/库存 OCC 或行锁。只给必要状态增加 `PARTIALLY_RECEIVED → PARTIALLY_RECEIVED`；收货事件去重仍是强制条件。
- [ ] 同一事务写收货事件、PO 明细累计量、库存和单据状态；注入中途异常验证全部回滚。跨 PO 同 SKU 不能发生覆盖丢失更新。
- [ ] 远端 ERP 是该模拟连接的库存权威源；本地表是可追溯投影。本期固定采用“库存快照+单调version”同步：远端PurchaseService负责收货增量，本地按更高版本更新累计快照与单据映射。不得再在本地调用一次receivePurchaseOrder重复加库存。旧纯内部采购继续使用原服务，二者由connection绑定隔离。
- [ ] 远端 version 5 先到、version 4 后到时，本地不倒退；同步过期或数据不足时标未知，不能将旧值显示成最新。
- [ ] 对账输出 ordered、shipped、received、inbound、available、差异、数据时效与 sourceVersion。由独立查询重新核算，不复用被测代码生成“预期结果”。
- [ ] 固定样例：初始 available=30，PO=40；发货后 inbound=40；收货 10/15/15，available 依次 40/55/70、inbound 30/15/0。每次重放均不变；若夹有销售，按期初+入库-出库核对，不硬编码最终70。
- [ ] 保留短收、超收拒绝、破损或取消需人工处理的状态。本期不自动撤回已发货单，也不把差异归零。

**G2 回交：** A3～A6 实际调用链、两端数据库证据、故障矩阵 E01～E12、旧采购和旧 v2 回归。模拟端与执行器属于同一代码库的限制必须披露。

### A7：worker 恢复、预算与人工接管（第三批）

**新增：** `apps/worker/src/processors/automation-recovery.processor.ts`；`apps/worker/test/automation-recovery.spec.ts`；`apps/api/test/automation-recovery-integration.spec.ts`。

**修改：** `apps/worker/src/worker.service.ts` 注册 `crosspilot-automation-recovery` 隔离队列与 worker；共享恢复业务放 db/domain 适当服务，不能 worker import API Service 形成反向依赖。

- [ ] 单元测试先覆盖 READY 扫描、UNKNOWN 查单、lease 过期、无凭证、永久错误和审批过期。
- [ ] 扫描已落库到期操作，数据库条件必须限制连接启用/模式/租户/阶段；按 operationId 去重排队。查询 ERP FOUND 后校验内容再补写成功；查询权威不存在时才按幂等能力决定重新提交。
- [ ] 默认最多 3 次提交尝试、8 次查询，指数退避起点 5 秒、上限 60 秒；遵守服务端更长 Retry-After，达到次数上限转人工。测试使用受控时钟，不实际等几分钟。
- [ ] 使用真实隔离 PG + Redis + HTTP，先让 ERP 提交成功，再让客户端在写本地回执前退出；重启客户端/worker 后查询恢复，同一 PO 数保持1。
- [ ] 重启 ERP 模拟服务验证其关联键仍存在；队列丢失后 DB 扫描可重新入队；两 worker 竞争时无重复副作用。
- [ ] 暂停连接后不派发新写入，但保留已提交结果的查询、审计与人工核对。人工处理不能通过一个“标记成功”按钮覆盖无证据的 UNKNOWN。
- [ ] worker 未连接 Redis 或队列注册失败时，验收应失败/NOT_RUN，不因主进程打印 started 就算通过。

**验收：** 测试必须实际经过 WorkerService 的队列注册、processor 和生产恢复服务。单独调用 processor 的 mock 单测只算补充证据。

### A8：最小展示、回归与证据交付（第三批，结束交 G3）

**修改：** 现有采购页与 Action 卡片的实际消费者（A0 定位并在证据记录准确路径）；`apps/web/src/constants/ui-labels.ts`。

**新增：** `scripts/run-automation-acceptance.cjs`、`scripts/run-automation-integration-tests.cjs`；验收工件目录 `artifacts/automation-v1/`。不要增加独立控制台产品。

- [ ] 页面/API 展示三件事：采购业务状态、执行状态与环境、可查看的证据/恢复原因。刷新从数据库读，禁止读取内存数组作为真实运行历史。
- [ ] 验收脚本执行 E01～E15，保存各场景的 operationId/actionId/externalId、两端查询摘要、测试数、退出码与源码指纹；不包含凭证。
- [ ] `run-automation-integration-tests.cjs` 在缺 PG/Redis 测试变量时以非零退出并输出 BLOCKED_ENV；设置测试连接只对测试子进程生效；核实所有选定测试被发现且无 skip。不得将整个 suite 被跳过计为成功。
- [ ] 生成一次标准演示：销量导致库存风险→建议40件→审批→创建PO→提交后响应丢失→查询恢复→三批入库→对账。演示不宣称真实商家使用或利润提升。
- [ ] 运行下节回归，修复本次引入的失败；历史失败单独列出，不调整阈值/删除用例来通过。
- [ ] 填完整证据与下一步建议，更新项目 HANDOFF 当前入口；不覆盖旧 IMPLEMENTATION_EVIDENCE 的 Simulator 历史测试数字。

**G3 通过条件：** 第一节7项成功标准全部有证据；E01～E15 全部 PASS，环境缺失不能通过；旧核心回归无本次引入失败。

## 6. 验收矩阵（所有预期值是目标，不是已测结果）

| ID | 场景 | 必须观察到的结果 | 证据级别 |
|---|---|---|---|
| E01 | 未实现 API / Browser / Python | UNSUPPORTED、未生效、无成功假数据 | Router 单测 + API |
| E02 | RPA FAILED / TIMEOUT / RUNNING / 缺凭证 | 不映射成功；真实路径不回退 Mock | Router + Service |
| E03 | Listing 提交被接受但无回查 | 不写 PUBLISHED / syncVerified | Service + UI/DTO |
| E04 | 同操作顺序/并发重放 | 1 operation、1 remote PO；异参409 | 真 PG + HTTP |
| E05 | 跨租户 / 篡改审批 / 过期审批 | 拒绝写入，另一租户数据不可见 | API 守卫 + PG |
| E06 | ERP提交成功后丢响应 | UNKNOWN→QUERY→FOUND→APPLIED，PO仍1张 | 真 PG + HTTP |
| E07 | 429 / 查询暂不可见 / 畸形200 | 有界恢复；不盲目写、不假成功 | HTTP + 受控时钟 |
| E08 | 多次部分收货与重复事件 | 10/15/15正确累计，重放无变化 | 真 PG |
| E09 | 并发超收 / 跨PO同SKU | 超收拒绝，无库存丢失更新 | 真 PG 并发 |
| E10 | 收货事务中途失败 | 事件、PO、库存全部回滚，可安全重试 | 真 PG 故障注入 |
| E11 | 通知重复/乱序 | version不倒退，无累计数重复加库存 | HTTP + PG |
| E12 | 库存、报价过期/缺失、待执行采购重复 | 无错误新采购、无编造默认值 | 业务服务 |
| E13 | 客户端/worker重启、Redis丢队列 | DB扫描补队列、查回远端已生效订单 | 真 Redis + PG + HTTP |
| E14 | ERP重启、双worker、暂停、预算耗尽 | 远端去重持续有效；保留UNKNOWN并可人工接管 | 真进程/队列 |
| E15 | 完整标准演示与旧功能回归 | 每步证据关联；界面不把模拟写成真实 | 集成 + Web检查 |

### 6.1 命令基线

从项目根运行。RTK 不可用的执行工具可运行等价原命令并记录。所有命令均要保存退出码、发现的 suite/test 数，不能只保存最后一行。

```powershell
rtk git status --short
rtk git rev-parse HEAD
rtk pnpm --filter @crosspilot/shared build
rtk pnpm --filter @crosspilot/integrations build
rtk pnpm --filter @crosspilot/actions build
rtk pnpm --filter @crosspilot/domain build
rtk pnpm --filter @crosspilot/db build
rtk pnpm --filter @crosspilot/actions test --runInBand
rtk pnpm --filter @crosspilot/api test --runInBand --testPathPattern=automation
rtk pnpm --filter @crosspilot/worker test --runInBand --testPathPattern=automation
rtk pnpm run typecheck
rtk git diff --check
```

A3 以后迁移先在明确测试库应用再 build db。数据库包 test 脚本只 echo 文案，不能充当数据库验收。

G3 必跑相关回归：

```powershell
rtk pnpm --filter @crosspilot/domain test --runInBand
rtk pnpm --filter @crosspilot/actions test --runInBand
rtk pnpm --filter @crosspilot/integrations test
rtk pnpm --filter @crosspilot/api test --runInBand --testPathPattern='v93-action-layer|v10-audit-p0|core-commerce|v10-outcome-tracking|closed-loop-v2|automation'
rtk pnpm --filter @crosspilot/worker test --runInBand
rtk pnpm --filter @crosspilot/web build
rtk node scripts/run-automation-integration-tests.cjs
rtk node scripts/run-automation-acceptance.cjs
```

最后两个脚本在 A8 创建后才运行；此前使用任务对应 Jest 文件，不把不存在的脚本写成已通过。专用变量至少包括 `AUTOMATION_TEST_DATABASE_URL`、`AUTOMATION_TEST_ERP_DATABASE_URL`、`AUTOMATION_TEST_REDIS_URL`；现有 v2 PG 套件使用 `TEST_DATABASE_URL`。测试 runner 核实这些目标相互隔离且均为测试环境，不能自动读取业务 .env 补值。Redis 使用独立数据库/队列前缀，禁止 FLUSHALL。

如果 PG Jest 文件设计为无环境跳过，日常单元测试可以 SKIP，但 G2/G3 必须通过上述严格 runner 确认执行；保存每个命名验收案例结果。

## 7. 本期之后如何继续，防止无限扩展

| 后续方向 | 启动条件 | 最小下一交付 |
|---|---|---|
| 商业 ERP 验证 | G3通过且有明确目标厂商/合法测试权限 | 核对官方接口、能力差异与权限；只读/沙箱合同测试，然后再定真实写范围 |
| RPA / Browser 真操作 | 目标 JD 确实要求，且有可控测试页面 | 同一采购场景经真实浏览器填写、提交、查询；登录失效/DOM变化/重复提交验收；不自动作为 UNKNOWN API 的fallback |
| Daily Operations | 已有可靠执行与恢复基础 | 调度→诊断→持久化日报→Action；消息先测试接收端，不默认群发 |
| Listing Publish | 有目标平台合同和测试环境 | 产品类型校验→审批→提交→异步状态/问题回查；提交被接受不等于可售 |
| AI 增量评测 | 工程G3通过，固定至少20例正常/异常/缺失数据样例 | 纯规则 vs LLM辅助；盲评建议质量、人工修改量、耗时、成本；LLM无凭证标NOT_RUN |
| 财务、多平台、客服 | 前述闭环通过且岗位/用户需求有证据 | 单独规格与计划；不附带进入本期 |

真实平台接入证据按 `CONTRACT_REVIEWED`、`VENDOR_SANDBOX_VERIFIED`、`LIVE_READ_VERIFIED`、`LIVE_WRITE_VERIFIED` 分开记录。自建 HTTP 模拟端只能标 `SIMULATOR_HTTP_VERIFIED`。新增厂商契约应引用当时官方文档和版本，不能声称“仅替换Adapter、全部上层不改”。

本期可以交付可靠自动化工程；没有执行 LLM 对照试验，就不能称“已证明 AI 优于规则”。模拟器利润变化仅是特定假设下的结果，不是实店收益。

## 8. 交付与复审规则

每批执行 AI 更新 [执行证据](./AUTOMATION_EXECUTION_EVIDENCE.md)，按 [交接入口](./AUTOMATION_EXECUTION_HANDOFF.md) 回交。

证据必须绑定当前源码：有提交记录实际 commit；未提交则记录 base HEAD、`git diff --binary` 工件哈希、所有新增源文件 SHA256 与文件清单。只填 HEAD 不能证明未提交代码的测试对象。

统筹复审优先顺序：成功语义→远端副作用与幂等→审批/租户→收货一致性→恢复可达性→兼容性→展示。截图与测试数不能替代业务证据。发现问题使用 `G1-R01` 等编号，给出文件、复现、预期和复验要求；执行工具完成后逐项回填。

计划自查覆盖：原审核的执行入口收敛=A0～A3；最小采购=A4～A6；状态与恢复=A1/A3/A7；Adapter边界=A4/§7；模拟证据与AI边界=A8/§7；真实度与验收=§6。所有代码、迁移、测试均仍待执行。
