# CrossPilot 外部设计吸收 Batch C（契约增量扩展与多店归因分析）实施实证

- **实施阶段**：外部设计吸收 Batch C
- **任务依据**：`docs/00_governance/more/CrossPilot_External_Design_Absorption_Plan.md` §12.3；契约定义见 §9；多店归因事实分析见 §6。
- **状态声明**：**执行方自报 READY_FOR_REVIEW**（等待统筹独立复验；严禁自行标 PASS；不提交、不推送、不部署）
- **基线 Git HEAD**：`e474c20882094d2d34ed0da52591319a077319a8`
- **验证时间**：2026-09-14

---

## 1. 核心任务闭环清单

| 任务项 | 权威依据 | 实施要点 | 验证结果 |
| :--- | :--- | :--- | :--- |
| **1. ToolExecutionResult 增量扩展** | 方案 §9.1, §12.3 | 在 `packages/tool-platform/src/contracts/tool.types.ts` 中增量添加可选字段 `evidenceMeta?: EvidenceMeta[]` 与 `errorEnvelope?: ToolErrorEnvelope`。**原字段 `success`, `data`, `error`, `traceId`, `durationMs`, `cost` 逐字保留，未做任何改动或重命名**。 | ✅ `git diff` 严格证实仅添加可选字段 |
| **2. Shared Contracts 增量导出** | 方案 §9.2, §9.3, §12.3 | 增量创建 `packages/shared/src/contracts/evidence-contracts.ts` 与 `approval-contracts.ts`，导出 `EvidenceMeta`, `EvidenceValueStatus`, `EvidenceFreshness`, `ApprovalProof`, `ApprovalVerifier`；在 `packages/shared/src/index.ts` 导出。 | ✅ 契约严格对齐主方案规范，构建通过 |
| **3. 运行时字段透传验证** | 方案 §12.3 | 选取真实生产工具 `bi.variance.attribute`（生产者）填入 `evidenceMeta` 与 `errorEnvelope`，由 `ToolCenterService`（消费方）调用并无损读取和持久化内存记录。 | ✅ 专项单测 6/6 + API 集成 3/3 PASS |
| **4. 向下兼容性保障** | 统筹复审要点 §4.1 | 消费方读取旧格式（无新字段）响应时完全安全，无任何运行时崩溃或字段污染。 | ✅ 专有旧格式兼容单测 PASS |
| **5. 多店归因文档建模** | 方案 §6 | 深入阐述内部实物 SKU（`skus`）与渠道映射（`channel_identities`）的三大业务场景，**严格不改动 `schema.prisma`，严禁对 `skus` 表破键迁移**。 | ✅ `git diff packages/db/prisma/` 严格为空 |

---

## 2. 多店归因分析与关系建模实证（主方案 §6）

### 2.1 实体关系模型事实基线

- **`skus` 表（`@@unique([workspaceId, skuCode])`）**：
  代表租户下的**内部实物主数据**。在当前架构中，承载了 10+ 张核心业务表的外键关联（采购单 `purchase_orders`、供应商报价 `supplier_quotes`、库存余额 `inventory_balances`、日利润 `profit_daily` 等）。
- **`channel_identities` 表（`@@unique([storeId, platform, entityType, externalId])`）**：
  代表**外部店铺渠道映射身份**。专门用于将内部实物主数据（`entityType: 'SKU', entityId: sku.id`）与外部店铺实体（`storeId`, `externalId: sellerSku / ASIN`）绑定。

### 2.2 三大典型数据场景样例定义与处理策略

| 场景编号 | 场景描述 | 业务数据特征与关系表达 | 系统处理与归因规则 |
| :--- | :--- | :--- | :--- |
| **场景 1** | **同一内部 SKU 在多店铺销售** | 内部实物 `SKU-A` 同时在 Store 1 和 Store 2 销售，外部 sellerSku 分别为 `US-A-01` 与 `US-A-02`。 | `skus` 表仅存一条实物记录；`channel_identities` 存两条记录，分别以不同 `storeId` 映射到同一个 `entityId: sku.id`。财务、采购与库存对账以内部实物为准，销售与广告按 `channel_identities.storeId` 拆分归因。 |
| **场景 2** | **不同店铺相同 sellerSku 对应不同实物** | Store 1 的 `T-SHIRT-BLK` 对应纯棉款 `sku_1`；Store 2 的 `T-SHIRT-BLK` 对应速干款 `sku_2`。 | `skus` 表必须存在两条独立的实物记录；由两条独立的 `channel_identities` 分别映射。**严禁放宽 Sku 唯一键或强行将不同实物合一**，否则直接导致采购下单与物理入库对账混乱。 |
| **场景 3** | **历史记录缺失店铺归因** | 历史数据仅记录了 `workspaceId` 与 `skuCode`，无 `storeId`。 | **严禁随意归入默认店铺或首个店铺**。必须保持 `storeId: null`，在业务层标明 `UNATTRIBUTED`，等待确凿证据（如渠道交易对账单）后安全回填。 |

### 2.3 数据库约束检查确认

```bash
$ git diff packages/db/prisma/
# 严格无任何输出（0 lines changed）
```

确认 `schema.prisma` 核心约束完好无损：
```prisma
model Sku {
  ...
  @@unique([workspaceId, skuCode])
  @@map("skus")
}

model ChannelIdentity {
  ...
  @@unique([storeId, platform, entityType, externalId])
  @@map("channel_identities")
}
```

---

## 3. 契约增量扩展与透传测试

### 3.1 契约定义与文件变更

1. **`packages/tool-platform/src/contracts/tool.types.ts`**：
   ```ts
   export interface ToolErrorEnvelope {
     code: string;
     category: 'VALIDATION' | 'AUTH' | 'RATE_LIMIT' | 'UPSTREAM' | 'CONFLICT' | 'UNSUPPORTED';
     message: string;
     why?: string;
     retryable: boolean;
     retryAfterMs?: number;
     suggestedFix?: Record<string, unknown>;
     docsRef?: string;
   }

   export interface ToolExecutionResult<T = any> {
     // === 原有核心字段：必须严格保留 ===
     success: boolean;
     data?: T;
     error?: ToolError;
     traceId: string;
     durationMs: number;
     cost?: {
       amount: number;
       unit: string;
     };

     // === 增量扩展字段：完全可选，向下兼容 ===
     evidenceMeta?: EvidenceMeta[];
     errorEnvelope?: ToolErrorEnvelope;
   }
   ```

2. **`packages/shared/src/contracts/evidence-contracts.ts`**：
   导出 `EvidenceValueStatus`（`KNOWN`, `DERIVED`, `ESTIMATED`, `MISSING`, `CONFLICTING`）、`EvidenceFreshness`（`FRESH`, `AGING`, `STALE`, `UNKNOWN`）以及 `EvidenceMeta`。

3. **`packages/shared/src/contracts/approval-contracts.ts`**：
   导出 `ApprovalProof` 与 `ApprovalVerifier`。

### 3.2 生产者与消费方透传实测

- **生产者（`BiVarianceAttributeTool`）**：
  在执行利润波动瀑布归因时，成功路径输出 `EvidenceMeta`（`sourceType: 'DERIVED'`, `valueStatus: 'KNOWN'`, `freshness: 'FRESH'`）；输入非法数值时抛出携带 `errorEnvelope`（`category: 'VALIDATION'`, `code: 'INVALID_PROFIT_INPUT'`）的结构化异常。
- **调度器（`ToolExecutor`）**：
  调度前/后无损提取 `evidenceMeta` 并包装返回；异常分支映射生成或提取 `errorEnvelope`，与 `error` 保持严格一致，杜绝冲突。
- **消费方（`ToolCenterService`）**：
  `executeTool` 调用 `ToolExecutor`，将 `evidenceMeta` 与 `errorEnvelope` 完整透传给调用方，并同时持久化保存在内部 `recentExecutions` 缓存与查询端点。
- **向下兼容性**：
  消费方处理不含 `evidenceMeta`/`errorEnvelope` 的旧格式数据时，安全降级为空/undefined，无任何崩溃。

---

## 4. 全量验证实测结果

### 4.1 Batch C 专项测试与独立探针

1. **Tool 平台契约透传单元测试（6/6 PASS）**：
   ```bash
   $ pnpm --filter @crosspilot/tool-platform test test/tool-contract-passthrough.spec.ts
   PASS test/tool-contract-passthrough.spec.ts (6 tests passed)
   ```

2. **API 消费方透传集成测试（3/3 PASS）**：
   ```bash
   $ pnpm --filter @crosspilot/api test apps/api/test/tool-center-passthrough.spec.ts
   PASS test/tool-center-passthrough.spec.ts (3 tests passed)
   ```

3. **Batch C 独立审查探针（8/8 PASS）**：
   ```bash
   $ node artifacts/external-absorption/batch-c/batch-c-probes.cjs
   [Batch C Probes] 8 passed, 0 failed. All probes OK.
   ```

### 4.2 历史批次与全局门禁回归

1. **G1 历史三套探针基线（29/29 PASS）**：
   - `artifacts/automation-v1/g1-review/review-probes.cjs` (10/10 PASS)
   - `artifacts/automation-v1/g1-review-round2/review-probes.cjs` (10/10 PASS)
   - `artifacts/automation-v1/g1-review-round2/remaining-probes.cjs` (9/9 PASS)
2. **Batch A 统筹审查探针（4/4 PASS）**：
   - `artifacts/external-absorption/batch-a/review-codex/batch-a-probes.cjs` (4/4 PASS)
3. **Batch B 审批加固测试与探针（12/12 PASS）**：
   - `apps/api/test/operation-automation-approval-hardening.spec.ts` (7/7 PASS)
   - `artifacts/external-absorption/batch-b/batch-b-probes.cjs` (5/5 PASS)
4. **自动化执行全链路场景（15/15 PASS）**：
   - `node scripts/run-automation-acceptance.cjs` (15/15 PASS in 28s)
5. **Monorepo Typecheck（10/10 workspaces CLEAN）**：
   - `pnpm -r typecheck` (0 errors across 10 packages)
6. **Web 端 Next.js 生产构建（24/24 页面编译成功）**：
   - `pnpm --filter @crosspilot/web build` (24/24 static pages generated)

---

## 5. 修改与新增文件 SHA-256 指纹

| 文件相对路径 | SHA-256 指纹 | 变更类型 |
| :--- | :--- | :--- |
| `packages/tool-platform/src/contracts/tool.types.ts` | `570BB08B3A5DF7CFDC83F29C4B70D7E91DB19A99CF57172CC5802739D1B91080` | 增量添加可选字段 |
| `packages/tool-platform/src/executor/tool.executor.ts` | `762D70A6F71EA4F5317C1A7C76133747FFA381557E96F8F9C1B73CB8E9C9130A` | 透传与错误封装支持 |
| `packages/tool-platform/src/tools/bi-variance-attribute.tool.ts` | `51C2722A61B73E3483FA66809299B154BD07FE6D3002E87EC70F6C4D1D60502D` | 真实 Tool 生产者扩展 |
| `packages/tool-platform/test/tool-contract-passthrough.spec.ts` | `C8E142F09964236C145BBB34333685170E001D56104EEA3852F347A1265E6F01` | 平台级透传单测 |
| `packages/shared/src/contracts/evidence-contracts.ts` | `96C5B4192B0B6D5462E440AD8C93A5FD3871A6F246C01B684E89CFAB83AF5154` | 增量导出 Evidence 契约 |
| `packages/shared/src/contracts/approval-contracts.ts` | `C1153D0A78D166C0F1B892AD982A60A6BEB0001F1D67C4DEE46C379D19F4EA20` | 增量导出 Approval 契约 |
| `packages/shared/src/index.ts` | `C0FCFDF7B24613BE02371517B38CECBC02A9041F26B9081F670245775E531950` | 增量导出新契约 |
| `apps/api/src/modules/tool-center/tool-center.service.ts` | `A00F2D0956C7CFFDA1D75A556BE85596ADAD337522D0B84A3E01F257284A2312` | 真实消费方透传与记录 |
| `apps/api/test/tool-center-passthrough.spec.ts` | `826EB2C093684226FC0C5E2CAB75343B22B7D925C44077A0461DA165BE0F2B18` | API 消费方集成测试 |
| `artifacts/external-absorption/batch-c/batch-c-probes.cjs` | `2DCE2F0CC08CD5FEAF6D07BA3D7740B4AF93FE3DF53B3279D3DC40F5EABFC3EC` | 独立复验探针套件 |

---

## 6. 纪律与当前状态

- **状态**：`READY_FOR_REVIEW`
- **代码保留**：所有改动严格保留在未提交工作区，未执行 `git commit`，未 push，未部署。
- **禁止事项遵循**：
  - 严禁删除或重命名已有字段（`success`, `traceId`, `durationMs` 严格原样保留）；
  - 严禁对 `skus` 表执行破键迁移（Prisma diff 严格为空）；
  - 多店归因仅作业务文档建模，不改 schema；
  - Batch D～E 严格未开始。
