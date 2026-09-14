# AI Automation G1 独立复审与修复清单

> 日期：2026-09-14。统筹结论：**CHANGES_REQUESTED**。第一批尚未通过，先修 G1-R01～G1-R05，不进入 A3～A6。
> 项目：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。
> 范围：执行计划 A0～A2 的验收复审；包含本批声称已治理的既有路径，不限于逐行新增代码。

## 1. 已经独立核实的事实

- 当前 HEAD：`be4b8f635fb5261a4c8ec09878a7b4f7c6e53055`，本批业务修改仍未提交。
- 报告中11项源码 SHA256 全部与当前文件相符；不是拿另一版本的代码评审。
- 已重新构建 shared、integrations、actions，退出码均为0；探针调用这些当前构建的生产类。
- 独立重跑 actions：2 suites、17 tests 全通过；API automation：1 suite、3 tests 全通过。
- 新增10个针对性探针：0通过、10失败，归属5类问题。探针退出码1是验收反例复现成功，不是构建失败。
- 未调用真实影刀/Amazon、未访问数据库或部署。HTTP响应由当前进程内fetch替身提供；模式测试使用记录调用次数的适配器；UI只执行实际页面handler代码，不声称跑过真实浏览器。
- 未重跑整仓typecheck、Web build或其余回归；执行方对应报告仍作为其自报结果，不改称统筹已独立验证。

证据目录：`artifacts/automation-v1/g1-review/`。

| 工件 | 用途 |
|---|---|
| `review-manifest.json` | base HEAD、受审业务diff哈希、新增源码哈希、探针哈希 |
| `reviewed-code.diff` | 本次受审已有业务文件变更快照 |
| `fingerprints.json` | 11项执行报告指纹与实际文件匹配情况 |
| `actions-test.log` / `api-test.log` | 统筹实际重跑的20项测试结果 |
| `review-probes.cjs` | 可复现10个验收反例的隔离探针 |
| `probe-results.json` | 每个探针的输入摘要、实际返回与失败结果 |

受审业务diff SHA256：`ea7f784680a238169c5ac156d1da3438ab3df216ad7665a3e84b479a00530cef`。

## 2. 修复清单

### G1-R01 / P1：HTTP提交被接受仍被包装成真实生效

**代码位置：**
- `packages/integrations/src/rpa/yingdao.adapter.ts:49`，200响应直接返回SUCCESS并可补造jobId。
- `packages/actions/src/action.router.ts:102`，SUCCESS直接返回LIVE + COMPLETED + APPLIED，并用当前时间补verifiedAt。

**独立复现：** 给真实YingdaoRpaAdapter的fetch提供HTTP200，分别返回`{jobId:'accepted-job',status:'RUNNING'}`和`{}`。再通过真实ActionRouter.dispatch，两者都返回SUCCEEDED/APPLIED/verifiedAt；空响应还得到本地编造的外部jobId。

**问题：** 新增ExecutionEvidence只是把原假成功包装得更完整，未验证的提交结果仍冒充目标已生效。违反计划§4.1及G1“未回查无真实成功”的标准。

**修复要求：**
1. 解析并校验实际响应，不以HTTP200、jobId或泛化SUCCESS充当业务生效证据。
2. 尚未核实影刀执行合同与查状态能力时，选择保守路径：LIVE执行返回UNSUPPORTED且不发送请求；本批不要求完成真实厂商接入。
3. 如果保留受控提交能力，返回SUBMITTED/UNKNOWN，只有来自已核实终态/查询证据才能APPLIED；不能为了通过本批臆造厂商接口。
4. 不生成伪外部jobId或verifiedAt。内部operationId可生成，但不能冒充远端标识。
5. 增加Adapter→Router完整测试，覆盖200空对象、仅jobId、RUNNING、明确失败和有合法生效证据的结果；不能仅在测试里直接mock Router为失败。

### G1-R02 / P1：模拟模式没有隔离真实适配器

**代码位置：** `packages/actions/src/action.router.ts:70`、`:100`；`packages/integrations/src/rpa/rpa.registry.ts:21`。

**独立复现：**
- MOCK + providerId='yingdao-rpa'：真实适配器入口被调用1次，回执却标MOCK。
- SIMULATOR + 未传providerId：默认选择yingdao-rpa，被调用1次，成功分支还将mode改为LIVE。

复现使用记录调用的替身，没有向真实平台发请求。它证明路由会进入真实provider路径，不能声称已发生真实店铺写入。

**修复要求：**
1. 在execute之前校验provider能力与mode，必须双向隔离；不只检查LIVE不能选mock-rpa。
2. MOCK仅允许明确模拟provider；SIMULATOR没有匹配provider时返回UNSUPPORTED，不能默认影刀；LIVE不得选择Mock/Simulator。
3. 用明确provider元数据或受控注册规则识别能力，不能只靠一个字符串id排除Mock。
4. evidence环境来自校验后的绑定，不由请求mode或返回SUCCESS猜测。
5. 增加模式/provider组合测试，断言不匹配时adapter.execute调用次数为0；匹配模式的成功/失败保持环境一致。

### G1-R03 / P1：异常和FAILED被错误认定为未生效

**代码位置：** `packages/integrations/src/rpa/yingdao.adapter.ts:60`；`packages/actions/src/action.router.ts:162`、`:182`。

**独立复现：**
- 测试adapter先记录一次远端副作用，再抛“response lost after remote commit”，Router返回NOT_APPLIED + MANUAL。
- Yingdao fetch在请求发出后抛连接错误，经Adapter和Router后也变成NOT_APPLIED。

**问题：** 失败状态只说明调用未正常结束，不能证明远端没写入。现有新增测试甚至把“Process crashed unexpectedly → NOT_APPLIED”固定为正确结果，属于测试预期错误。

**修复要求：**
1. 区分确定的提交前拒绝与提交后结果不明。无凭证、未支持且未调用可以NOT_APPLIED；连接中断、进程异常、未分类FAILED保守为UNKNOWN。
2. UNKNOWN有查询能力时QUERY；没有查询能力时NEEDS_ATTENTION + MANUAL，仍保留UNKNOWN，禁止自动重放写入。
3. 类型化表达错误来源/是否已提交/生效证据，避免仅用error字符串includes决定所有状态。
4. 修改现有错误测试预期，增加“已发生副作用后抛异常”“有jobId但后续失败”“明确提交前拒绝”的对照。
5. 经过OperationAutomationService等上层消费者后，不得丢掉UNKNOWN、externalId和恢复建议，或把RUNNING笼统改成最终失败。保持本期的演示边界，无需提前建设A3数据库。

### G1-R04 / P1：缓存提前返回，掩盖当前环境、审批和恢复结果

**代码位置：** `packages/actions/src/action.router.ts:33`、`:225`。

**独立复现：**
- 同workspace、同operationId先MOCK成功，再换actionId/payload、切LIVE且isApproved=false：直接返回旧MOCK成功和旧actionId，审批与provider校验根本没运行。
- 首次adapter明确返回AUTH_REQUIRED/NOT_APPLIED；凭证条件恢复后同operationId再次调用，adapter调用总数仍为1，始终返回旧FAILED。

**问题：** 增加workspace前缀只解决跨租户冲突；本次还把FAILED/RUNNING/TIMEOUT全部缓存，导致可恢复失败被永久短路。该反例没有发生越权真实写入，但系统将另一次动作误报成成功。

**修复要求：**
1. 本期可选最小方案：移除Router的执行结果缓存；它不是本期真实持久化幂等基础，A3以后再承担远端操作恢复。
2. 如果保留显式Mock缓存，先校验当前上下文与审批，再检查workspace、mode、provider、actionId与payload身份；同键异参冲突，不能返回另一动作结果。
3. 不将NOT_APPLIED/AUTH_REQUIRED的失败永久缓存；不得通过缓存让UNKNOWN“恢复成功”。UNKNOWN不得盲目再次执行，应查询或转人工。
4. 测试覆盖同租户模式切换、payload变化、撤销/缺审批、凭证补齐；保持原跨租户测试。
5. 不要求本轮提前建设持久化操作表；不能用“A3会处理”跳过当前缓存错误。

### G1-R05 / P2：页面仍伪造审批与成功日志

**代码位置：** `apps/web/src/app/app/operations/automation/page.tsx:46`、`:107`、`:149`、`:157`。

**独立复现：** 从实际页面源码提取handleApprove并在隔离VM运行：
- 审批HTTP404，approvalStatus仍是APPROVED，因为请求前就设置了批准。
- HTTP200但响应body.status=FAILED，仍追加“Amazon Batch Feed confirmed”和“Completed Seller Central automated upload”。

**静态补充：** 初始state含虚构workflowId/approvalId、已完成节点和固定审计日志；刷新没有从实际API恢复对应运行。页面横幅改成Mock不能把请求失败掩盖成“模拟执行成功”。

**修复要求：**
1. 初始无真实run时显示未开始；若需要示例，明确标只读示例且不能对虚构approvalId发送审批。
2. 审批状态由服务器确认后更新；404/403/超时/空响应保持未确认并展示错误，不能先改为APPROVED。
3. 日志消费返回的steps/evidence，不以“data存在”生成成功文案。若服务器确认审批但执行失败，可显示“已批准、执行失败”，不能确认Feed。
4. 示例日志与实际运行日志分离；Mock日志保留环境，去掉伪造真实上传与回查的文案。
5. 增加页面handler/组件测试：审批失败、返回FAILED/RUNNING、显式MOCK成功、刷新无run；不要求现在重做整个页面或引入新前端框架。

## 3. 对测试与报告的要求

执行方现有20个测试通过是事实，但未覆盖上述组合；测试总数不能替代G1语义验收。

- 保留已有有效测试，修正G1-R03的错误预期。
- 将5类反例落实到仓库正常测试套件，不只让本报告的独立探针“看起来通过”。
- 本探针是当前实现的复现工件。若接口变化，可调整测试fixture以符合新合同；不得删除关键断言、移除场景或让所有provider都被拒绝来回避有效执行的回归验证。
- 保留MOCK正常流程，以及被允许的测试provider的真实状态归一对照。没有商业凭证不妨碍验证这些合同。
- 缺凭证测试必须显式隔离进程环境；当前`apiKey:''`仍可能回退读取环境变量，不能依赖开发机恰好未设置密钥，更不能导致测试意外联网。
- 每个修复保存失败→通过记录、命令/退出码、发现/通过/失败/跳过数量和新的源码指纹。原作者未保存的历史红灯日志不得补造。

复验命令参考（先构建受影响依赖）：

```powershell
rtk pnpm --filter @crosspilot/shared build
rtk pnpm --filter @crosspilot/integrations build
rtk pnpm --filter @crosspilot/actions build
rtk pnpm --filter @crosspilot/actions test --runInBand
rtk pnpm --filter @crosspilot/api test --runInBand --testPathPattern=automation
rtk pnpm --filter @crosspilot/web test
rtk pnpm run typecheck
rtk pnpm --filter @crosspilot/web build
rtk git diff --check
```

若修改影响API兼容，重跑计划指定的相关回归。整个修复仍只针对第一批，不需要生产服务、真实店铺或数据库迁移。

## 4. 可直接复制给执行AI的修复提示词

```text
你继续负责CrossPilot第一批A0～A2，统筹独立复审结论为G1 CHANGES_REQUESTED，禁止进入第二批A3～A6。

项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot
先读：
1. docs\00_governance\more\AUTOMATION_G1_REVIEW_20260914.md
2. docs\00_governance\more\AUTOMATION_EXECUTION_PLAN_V1.md
3. docs\00_governance\more\AUTOMATION_EXECUTION_EVIDENCE.md
4. artifacts\automation-v1\g1-review\probe-results.json 与 review-probes.cjs

当前代码仍基于be4b8f6且未提交；先核实工作树，保留所有已有改动。统筹复跑你的20个测试全部通过，11项源码指纹一致，但10个新增探针复现了5类问题：
G1-R01：HTTP200/RUNNING/空响应仍变LIVE APPLIED，还编造verifiedAt/jobId。
G1-R02：MOCK可选择影刀执行，SIMULATOR默认选LIVE provider。
G1-R03：远端生效后异常或网络结果不明仍返回NOT_APPLIED。
G1-R04：缓存绕过上下文/审批，异参动作复用成功，AUTH_REQUIRED恢复后仍缓存失败。
G1-R05：页面404仍显示APPROVED，FAILED响应仍记录Feed确认和上传成功。

逐项按复审文档修复。先把反例写进正常测试并复现，再最小实现，不重建Runtime，不提前引入A3持久化表。未核实的影刀LIVE能力可明确UNSUPPORTED，不需要为通过G1接真实厂商。模拟模式与真实provider必须在execute前隔离。未知结果保留UNKNOWN，不能盲目重试。页面状态和日志以服务器结果为准。

修正错误的“Process crashed→NOT_APPLIED”测试，测试缺凭证时隔离环境变量并禁止外部网络调用。保留显式Mock正常流程和旧有效回归，不删除测试换通过。

完成后更新AUTOMATION_EXECUTION_EVIDENCE.md中G1-R01～R05逐项修复证据，填G1 READY_FOR_REVIEW（第二次），不要自己填写PASS。提供新源码指纹、测试命令和数量、日志、遗留项。不得提交、推送、部署或进入第二批，交回统筹AI复审。
```

## 5. 统筹边界

本次统筹只重建相关包、重跑定向测试、增加隔离复现工件并记录审核结论，未修改业务实现。上述修复由执行工具完成后再复审。批准第二批前，五项问题必须关闭且第一批正常模拟流程与相关回归通过。
