# Elsewhere Module 4.5 — Authoritative Routing & Budget Gate 设计

**日期：** 2026-07-17
**状态：** 已批准，待独立 TDD 实施计划
**位置：** Module 4 Deterministic Facts 与 Module 5 Capability Executors 之间
**上位依据：** `docs/AGENTS.md`、`docs/Elsewhere_PRD_v3.0.md`、
`docs/Elsewhere_Google_First_Technical_Architecture_v1.0.md`、
`docs/superpowers/specs/2026-07-16-elsewhere-backend-program-design.md`
**输入基线：** 已验收的 `deterministic-media/v1`；不得修改其冻结历史、完成定义或验证证据。

## 1. 结论

Elsewhere 的付费处理链不得从上传后直接进入 OCR、Places、Embedding 或 Gemini。完整链路固定为：

```text
Module 3  Original Save
原件安全保存
        ↓
Module 4  Deterministic Facts
格式、签名、哈希、metadata、缩略图、重复候选
        ↓
Module 4.5  Authoritative Routing & Budget Gate
分组、代表项选择、执行计划、预算批准
        ↓
Module 5  Capability Executors
OCR / Places / Embedding / Gemini
```

Module 4.5 是后续处理链的**权威执行计划编译器**，不是建议模型。Module 5 处理器只能执行
当前、已批准、输入 revision 匹配且预算有效的 RoutePlan。处理器不得静默升级能力；信息不足时
只能提交结构化 EscalationRequest，由 Module 4.5 重新规划。

外部架构图可把本模块简写为 **Authoritative Routing Layer**；内部文档和提交继续使用
**Module 4.5 — Authoritative Routing & Budget Gate**，以保留已完成 Module 4 的历史真相。

## 2. 问题与成功标准

### 2.1 当前缺口

Module 4 已经可靠地产出 source revision、格式、SHA-256、metadata、缩略图、dHash 和重复候选，
但当前总路线仍允许 OCR、Places、Embedding 与 Gemini 分别决定是否执行。这会导致：

- 同一碎片被多个能力重复判断和重复读取；
- exact/near duplicate 与 burst 在代表项选出前产生重复付费调用；
- OCR 已足够时仍可能继续调用 Gemini；
- Places、Embedding 等非 Gemini 成本无法统一预算和审计；
- Processor 遇到不足时自行升级，破坏可解释性和幂等边界。

### 2.2 成功标准

1. 100% 付费调用关联调用时仍有效的 approved RoutePlan。
2. 任何能力升级都产生新 RoutePlan revision，不修改旧版决策正文。
3. Module 4.5 自身不调用受控的外部计费 capability、模型或外部分类 API。
4. exact duplicate 不产生重复付费处理；near/burst 只处理确定性选出的代表项。
5. supporting Fragment 始终保留、可查看、可导出并可作为辅助证据。
6. capability 的批准、预算预留、执行结果和实际成本可完整串联。
7. 成本优化不得以过度抑制有价值碎片为代价，质量 guardrail 与成本指标同时存在。

## 3. 方案与边界

### 3.1 采用的模块位置

采用独立 Module 4.5，而不是重命名已完成的 Module 4，也不把 Router 藏进 Module 5：

- Module 4 负责产生确定性事实；
- Module 4.5 负责决定哪些能力值得执行；
- Module 5 只负责按批准计划调用能力和保存结果。

### 3.2 Module 4.5 允许消费

- Source Descriptor 与 source type 声明；
- 文件格式、尺寸、方向与 Module 4 capability status；
- EXIF 白名单事实、GPS 和可靠时间是否存在；
- Storage source revision 与 SHA-256；
- dHash、exact/near duplicate candidate；
- 已生成的最大 512px WebP 缩略图；
- ImportBatch 的输入数量、上传和 deterministic 收敛状态；
- 用户已有确认、修正、拒绝和 AI/隐私偏好；
- 已持久化、输入 revision 匹配的能力结果。

### 3.3 Module 4.5 禁止调用

- Document AI、Places、Geocoding、Time Zone 或 Maps Grounding；
- Embedding；
- Gemini、Qwen、ML Kit 或其他模型/外部分类 API；
- 外部转码或语义解析服务。

Module 4.5 仍会产生现有 Cloud Run CPU、Firestore 读写和 bounded thumbnail 读取等基础设施成本；
这些进入运行成本指标，但不构成对 OCR/Places/Embedding/Gemini 的 capability 授权。文档中的
“零付费调用”专指零外部计费 capability 调用，不声称云基础设施免费。

Google 官方将 ML Kit 定位为 Android/iOS 移动端 SDK，不是当前 Node.js/Cloud Run 后端的默认
分类层：[ML Kit guides](https://developers.google.com/ml-kit/guides)。Document AI、Places 和
Vertex AI 均是需要独立计费与配额控制的能力，不能用“不调用 Gemini”代表零成本：
[Document AI pricing](https://cloud.google.com/document-ai/pricing)、
[Places usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)、
[Vertex AI generative AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)。

## 4. 两阶段编译

```text
deterministic terminal result
→ compile draft RoutePlan
→ persist bounded cohort membership
→ wait until current ImportBatch deterministic work settles
→ resolve cohorts
→ select representatives
→ compile per-capability decisions
→ reserve budget
→ atomically create approved RoutePlan + move RoutingHead
```

- draft 不授权任何付费调用；
- 单 Fragment 批次在 deterministic 收敛后立即解析；
- 多 Fragment 批次在代表项确定前不得启动付费能力；
- 未收敛请求只持久化 draft 后确认当前事件；
- 最后一个 deterministic task 可以在同一 ingestion 请求内触发 cohort resolution；
- Module 4.5 不等待 Module 5 的执行结果。

## 5. 领域对象

### 5.1 RoutePlan

```json
{
  "id": "route_xxx_r2",
  "ownerId": "uid_xxx",
  "fragmentRef": { "type": "fragment", "id": "frag_xxx" },
  "sourceRevision": {
    "bucket": "bucket-name",
    "objectName": "users/uid/originals/batch/fragment",
    "generation": "123",
    "inputHash": "sha256..."
  },
  "router": {
    "name": "fragment-routing",
    "version": "v1",
    "policyVersion": "v1",
    "costModelVersion": "v1"
  },
  "revision": 2,
  "state": "approved",
  "inputs": {
    "deterministicTaskId": "task_xxx",
    "deterministicProcessorName": "deterministic-media",
    "deterministicProcessorVersion": "v1",
    "cohortRevisionIds": [],
    "userDecisionVersion": 0
  },
  "classification": {
    "mediaKind": "photo",
    "documentKind": null,
    "confidence": 1,
    "basis": ["magic-bytes", "source-descriptor"]
  },
  "representation": {
    "role": "independent",
    "representativeRef": { "type": "fragment", "id": "frag_xxx" },
    "cohortRefs": [],
    "reasonCodes": ["not-near-duplicate"]
  },
  "capabilities": {
    "ocr": {
      "decision": "skipped",
      "executorClass": null,
      "scope": "self",
      "reasonCodes": ["not-document-like"],
      "budget": null
    },
    "places": {
      "decision": "skipped",
      "executorClass": null,
      "scope": "self",
      "reasonCodes": ["gps-sufficient"],
      "budget": null
    },
    "embedding": {
      "decision": "approved",
      "executorClass": "multimodal-embedding",
      "scope": "self",
      "reasonCodes": ["independent-fragment"],
      "budget": {
        "class": "standard",
        "currency": "USD",
        "estimatedMicros": 20,
        "ceilingMicros": 40,
        "maxBillableAttempts": 1
      }
    },
    "gemini": {
      "decision": "deferred",
      "executorClass": null,
      "scope": "self",
      "reasonCodes": ["await-structured-results"],
      "reconsiderOn": ["user-request", "policy-change"],
      "budget": null
    }
  },
  "routeReasons": [
    "gps-present",
    "capture-time-present",
    "not-near-duplicate"
  ],
  "createdAt": "...",
  "approvedAt": "..."
}
```

示例中的金额只展示字段与整数微单位，不是生产价格承诺；实际值由对应 `costModelVersion` 的已审阅
服务端配置生成。

RoutePlan 不持久化 `needsOCR`、`needsPlaces`、`needsEmbedding` 或 `needsGemini`。这些值如需用于
API，由 capability decision 动态投影，避免两个事实源互相矛盾。

capability decision 固定为：

```text
approved | skipped | deferred | blocked
```

- `approved`：已获得执行类别、范围、attempt 上限和预算 ceiling；
- `skipped`：现有事实已足够、输入不适用或可安全复用；
- `deferred`：等待更便宜能力的结果后再判断；
- `blocked`：预算、隐私、输入安全或用户策略禁止。

每个 deferred decision 必须保存非空 `reconsiderOn`，例如 `ocr-completed`、
`ocr-insufficient-input`、`user-request` 或 `policy-change`。deferred 不是正在执行的任务；计划可在
所有 approved capability 终态后 completed，指定事件到达时再创建新 revision。

### 5.2 代表角色

代表角色只保存：

```text
independent | representative | supporting
```

`excluded_from_paid_processing` 不作为第四种角色，因为 supporting Fragment 可能跳过 Gemini，
但仍需要独立 OCR。是否排除由每项 capability decision 表达。

`supporting` 不代表删除、隐藏或忽略。它仍可浏览、导出、参与数量统计、成为辅助来源，并可由
用户请求重新规划。

### 5.3 RoutingCohort

```text
id
ownerId
type: exact_duplicate | near_duplicate | burst |
      same_time_place | document_sequence
revision
inputRevisionRefs
memberRefs（稳定排序）
representativeRefs
selectorName / selectorVersion
basisCodes
state: open | resolved | superseded
createdAt / resolvedAt
```

一个 Fragment 可以属于多个 cohort；不同 capability 可以依赖不同 representative。Cohort 只
表达处理分组，不确认同一事件、地点或语义关系。

### 5.4 RoutingHead

每个 `ownerId + fragmentId + routerName` 只有一个 RoutingHead：

```text
currentPlanRef
currentRevision
sourceRevision
updatedAt
```

新 revision 与 RoutingHead 切换必须在同一事务完成。Executor 在调用前和结果发布前都复核
currentPlanRef 与 head 内的 sourceRevision。source revision 不属于 head 的文档键，否则原件变化后
旧 head 会错误地继续把旧计划视为 current。

### 5.5 BudgetReservation 与 CapabilityExecution

BudgetReservation 记录批准时的预留：

```text
routePlanRef
capability
estimatedCostMicros
ceilingMicros
currency
costModelVersion
maxBillableAttempts
state: reserved | settled | released | expired
```

实际调用保存为独立 CapabilityExecution：

```text
routePlanRef
capability
executorName / executorVersion
idempotencyKey
state
billableAttempts
estimatedCost
actualCost
resultRef
errorCode
startedAt / completedAt
```

CapabilityExecution 内部 lifecycle 至少区分：

```text
reserved | claimed | calling | provider_succeeded |
settling | completed | failed | billing_uncertain
```

调用 provider 前先持久化 `calling`。收到 provider 响应后先持久化不可变调用回执和 usage，进入
`provider_succeeded`，之后 settlement 重试不得再次调用 provider。如果 worker 在已发出请求但
尚未持久化回执时失联，而 provider 不支持幂等键，execution 进入 `billing_uncertain` 并禁止自动
重调；必须对账或显式重新规划。系统不得对外声称外部计费调用具备无法证明的 exactly-once。

RoutePlan 记录“批准了什么”；CapabilityExecution 记录“实际发生了什么”。实际成本不得回写并
篡改 approved 决策正文。

### 5.6 EscalationRequest

```text
fromRoutePlanRef
fromCapability
outcome: unsupported | insufficient_input
reasonCodes
producedFactRefs
requestedCapability
createdAt
```

EscalationRequest 本身不调用付费能力。它以 plan/reason/capability 确定性去重，并受到最大
revision 上限保护。同一 source revision 最多自动生成 5 个 plan revision；达到上限后只接受
用户显式重新处理或管理员发布的新 policyVersion。

## 6. RoutePlan 生命周期与不可变性

```text
draft → approved → executing → completed
   └────→ rejected
approved/executing → superseded
```

第一个 approved capability 被 claim 时，计划进入 `executing`。其他 capability 可在计划为
`approved` 或 `executing` 时获得授权。所有 approved capability 终态且没有未处理 escalation
request 后进入 `completed`；如果计划没有 approved capability，则批准事务可直接将其完成。

RoutePlan 批准后，以下正文不可原地修改：

- classification；
- representation；
- capabilities 与预算 ceiling；
- router/policy/cost version；
- sourceRevision 与输入引用。

只允许受控生命周期字段变化。任何决策变化都创建 `revision + 1`，原子切换 RoutingHead，并将
旧版标记为 superseded。

以下变化使当前计划过期：

- Storage generation、object identity 或 input hash 改变；
- deterministic processor version 改变；
- 影响路由的用户确认、修正、拒绝或 AI/隐私偏好改变；
- cohort membership 或 representative 改变；
- 收到有效 escalation request；
- 显式采用新 policyVersion 重新处理。

已完成且输入 revision 不变的结果可以成为新计划输入，但必须以已有 provenance/resultRef 引用，
不能伪装成新执行。

## 7. 本地 Routing Feature

Module 4.5 可以读取 Module 4 生成的最大 512px WebP 缩略图，用现有 Sharp 计算：

- 平均亮度；
- 亮度方差；
- 灰度熵；
- 边缘/清晰度代理值；
- 过暗、过曝和低信息标记。

这些信号只用于路由和代表项选择，不进入用户可见语义 facts。实现不得：

- 重新读取或解码原始文件；
- 生成新派生图片；
- 增加 OpenCV 或新运行时依赖；
- 做人脸、睁眼、情绪、审美或物体识别。

## 8. Cohort 与代表项规则

| Cohort | v1 确定性依据 | v1 代表项策略 |
| --- | --- | --- |
| exact_duplicate | owner-scoped SHA-256 相同 | canonical 是唯一代表项；相同 input hash 结果可复用 |
| near_duplicate | Module 4 dHash candidate 与稳定距离排序 | 2–4 张选 1；5 张以上选 2 |
| burst | 同批次 photo、可靠拍摄时间；相邻 ≤2 秒、总跨度 ≤15 秒 | 2–4 张选 1；5 张以上选 2 |
| same_time_place | 同批次、双方 GPS accuracy ≤50 米、可靠时间相距 ≤10 分钟、坐标距离 ≤50 米 | 只减少 photo embedding/Gemini；不跳过独立票据 OCR |
| document_sequence | 同批次、文档类声明与可靠顺序证据连续 | v1 不抑制成员；只提供上下文边界 |

当前 SourceDescriptor 没有可靠序列字段时不得生成 `document_sequence`。不得从文件名或 provider
ID 猜测顺序。

所有 cohort revision 最多包含 200 个成员；超出时按 cohort 类型的稳定主排序和 fragmentId
确定性分片并记录 warning。Near candidate 的传递闭包同样受此上限约束，防止 A≈B、B≈C 被
无限串成错误大组。缺少可靠时间、GPS 或顺序时保持 independent。

代表项排序固定为：

```text
可解码且 thumbnail complete
→ 非低信息
→ 曝光合理
→ 清晰度代理值更高
→ 原始分辨率更高
→ fragmentId ASC
```

不得使用文件名中的“best/final”等文字，不使用人脸或美学模型。

v1 低信息硬门槛由 versioned policy 固定为：归一化平均亮度 `≤0.02` 或 `≥0.98`，同时亮度
方差 `≤0.0004` 且灰度熵 `≤0.5 bits`。清晰度只在同一 cohort 内用于相对排序，不设置跨设备
绝对淘汰阈值。

## 9. v1 Capability Policy

| 输入条件 | OCR | Places | Embedding | Gemini |
| --- | --- | --- | --- | --- |
| exact duplicate supporting | skipped/reuse | skipped/reuse | skipped/reuse | skipped/reuse |
| near/burst supporting photo | skipped | skipped | skipped | skipped |
| independent/representative photo，有可靠 GPS+时间 | skipped | skipped | approved | deferred |
| independent/representative photo，缺少上下文 | skipped | deferred | approved | deferred |
| receipt/ticket/menu | approved | deferred，等待 OCR | representative-only | deferred |
| screenshot | approved | deferred | representative-only | deferred |
| text | skipped | deferred，仅在文本地点线索出现后重新规划 | approved | deferred |
| PDF 且 pageCount 当前未知 | approved，Module 5 仍执行自己的输入安全上限 | deferred | deferred | deferred |
| 损坏、无法解码或低信息图片 | blocked | blocked | blocked | blocked |

Gemini v1 默认不在首轮批准。典型路径：

```text
receipt → OCR approved → OCR sufficient → Gemini never called
```

```text
unknown screenshot → OCR approved → insufficient_input
→ EscalationRequest → RoutePlan revision + 1 → Gemini approved or blocked
```

相同 input hash 只允许复用被 Executor 明确标记为 `content_intrinsic`，且 processor/model/prompt
版本和用户隐私范围都匹配的结果。批次、时间、地点、用户确认等 contextual 结果即使 bytes 相同
也不得自动复用。禁止传播 near/burst 代表项的 OCR、地点、商户、语义标签、Gemini 描述、事件
或发现结论。

## 10. Budget Gate

每项 capability 独立审批，不保存笼统 `needsAI=true`。Budget Gate 事务同时检查：

- 用户日预算；
- ImportBatch 预算；
- 单 RoutePlan 上限；
- capability 上限；
- 已预留但未结算金额；
- 用户隐私和 AI 偏好；
- dev 环境总预算策略。

```text
approval: reserved += ceiling
settlement: reserved -= ceiling; spent += actual
release: reserved -= ceiling
```

预算不足是 `decision=blocked, reason=budget-limit`，不是 Fragment 或处理失败。priority 只影响
调度顺序，不能绕过预算。

预算与路由配置按三种版本拆分：

- `routerVersion`：编译算法、cohort 和 selector；
- `policyVersion`：capability decision、阈值、用户偏好；
- `costModelVersion`：provider class 价格快照与估算方法。

Module 4.5 不依赖具体模型 ID。模型与供应商版本由 Module 5 Executor 配置管理。

## 11. Module 5 授权协议

Executor 在付费调用前必须验证：

```text
RoutePlan.state in [approved, executing]
RoutingHead.currentPlanRef == requested plan
sourceRevision exact match
capability.decision == approved
executorClass match
routerVersion / policyVersion supported
budget reservation valid and unconsumed
idempotency key not completed
billableAttempts < maxBillableAttempts
```

保存结果前再次复核 current plan。如果调用期间计划 superseded：

- 已发生的调用如实结算；
- 结果保留在 CapabilityExecution audit；
- 不发布为 Fragment 当前事实；
- 不自动启动下一能力。

Executor 结果固定为：

```text
completed
unsupported
insufficient_input
escalation_requested
failed_retryable
failed_terminal
```

- `completed`：持久化结果、provenance、实际成本并结算；
- `unsupported`：当前 executor 不支持，不等于原件失败；
- `insufficient_input`：执行成功但事实不足；
- `escalation_requested`：请求重新规划，不直接触发能力；
- `failed_retryable`：只在当前批准 attempt 上限内重试；
- `failed_terminal`：关闭当前 executor，不自动切换更贵能力。

## 12. ImportBatch 与用户可见状态

Module 4 完成后，不把 `batch.status=completed` 重新改回 `processing`。新增独立版本化摘要：

```text
routingSummary:
  routerName
  routerVersion
  policyVersion
  eligible
  drafting
  approved
  blocked
  superseded
  completed
```

Module 5 维护自己的 capability processing summary。客户端读取精简 routing/capability summary，
不直接写 RoutePlan、BudgetReservation 或 CapabilityExecution。

## 13. 错误与降级

| 情况 | 行为 |
| --- | --- |
| Router 输入不满足 schema | RoutePlan rejected；Fragment 保留；稳定内部错误码 |
| Repository/transaction 暂时失败 | retryable；不批准、不预留预算 |
| cohort 超过安全上限 | 稳定分片并记录 warning；不做无界扫描 |
| 预算不足 | 对应 capability blocked |
| deterministic terminal failure | 编译 deterministic-only 计划；付费能力 blocked |
| stale plan 被 Executor 获取 | no-op；不调用 provider |
| escalation 重复或循环 | 按 plan/reason/capability 去重，并应用最大 revision 上限 |
| Budget settlement 失败 | 已有 provider receipt 时只重试结算；调用后无回执的歧义状态进入 billing_uncertain，禁止自动重调 |

## 14. 安全与隐私

- RoutePlan、RoutingHead、RoutingCohort、BudgetReservation、CapabilityExecution 仅服务端写入；
- 客户端只读取产品需要的精简状态；
- 成本 ceiling、内部策略原因和 provider 原始错误不进入公共 Fragment；
- 原件内容、OCR 正文、精确 GPS 和 prompt 不进入路由日志；
- 用户手动重新处理仍需新 RoutePlan 和预算批准；
- Repository 方法始终接收 uid，并在 transaction/query 中保持 owner scope；
- Security Rules 必须证明 owner/other/unauthenticated 均不能伪造计划或预算。

## 15. 指标

### 15.1 强制指标

- paid invocation with current approved plan = 100%；
- silent processor escalation = 0；
- stale/superseded plan provider invocation = 0；
- 已持久化 provider receipt 的 idempotency key 重复调用 = 0；
- exact duplicate repeated paid processing = 0；
- supporting Fragment retained/viewable/exportable = 100%；
- Module 4.5 external paid capability/model calls = 0。

### 15.2 观测指标

- 每个导入 Fragment 的平均付费成本；
- OCR、Places、Embedding、Gemini 分项成本；
- approved/skipped/deferred/blocked 比例；
- representative/supporting 比例；
- 首轮完成率、escalation rate 和平均 revision 数；
- estimated/actual cost 偏差；
- 用户重新处理率与 representative 修改率；
- 因过度抑制产生的遗漏反馈率；
- batch deterministic 收敛到 RoutePlan approved 的延迟。

没有真实基线前不承诺任意成本下降百分比。成本指标必须与遗漏、用户修正和来源完整性 guardrail
一起评估。

## 16. TDD 验收矩阵

### 16.1 Domain

- RoutePlan、RoutingCohort、RoutingHead、BudgetReservation、EscalationRequest schema；
- 状态机与 approved payload 不可变性；
- capability decision 与预算字段一致性；
- 拒绝持久化重复 needsX；
- source/router/policy/cost revision 强校验。

### 16.2 Routing feature

合成图片 golden 覆盖全黑、全白、低方差、正常曝光、模糊/清晰和 alpha；不得使用私人素材或
网络。验证输入只来自 bounded thumbnail，且不创建新派生物。

### 16.3 Cohort 与 selector

- 输入顺序不改变结果；
- exact/near/burst/same-time-place 边界值；
- transitive near group 不无界扩张；
- 一个 Fragment 同时属于多个 cohort；
- 并列以 fragmentId ASC 确定；
- supporting 不从统计或导出消失；
- 无可靠顺序时不生成 document_sequence。

### 16.4 Policy 与 budget

- 完整 capability 决策矩阵；
- OCR sufficient 后 Gemini 不自动执行；
- 预算不足只 blocked 对应能力；
- 并发审批不超额预留；
- settlement 重试不重复 provider；billing_uncertain 不自动重调；
- policyVersion 更新生成新 revision。

### 16.5 Repository contract

Memory 与 Firestore 运行同一契约：draft 幂等、cohort resolution 并发安全、approved revision
与 RoutingHead 原子切换、旧版 superseded、escalation 去重、budget reserve/settle 原子性和 stale
source 拒绝执行。

### 16.6 Integration 与 Emulator

固定三套 fixture：

- small：1 个 independent Fragment；
- current：12 个混合 Fragment，覆盖 burst、exact、near、票据、截图和文本；
- large：200 个 Fragment，验证上限、确定化和无界操作防护。

完整链路验证：

```text
Module 4 result → draft → batch settles → cohort
→ approved plan → fake Module 5 authorization
```

同时要求 Module 4.5 不导入付费 adapter、不新增运行时依赖、Rules 拒绝客户端写内部对象、普通
测试和 Emulator 0 fail，并通过依赖审计、Docker Linux 验证与 `git diff --check`。

## 17. 明确不包含

- OCR、Places、Embedding、Gemini、Qwen、ML Kit 调用；
- 外部分类 API；
- 人脸、睁眼、审美或情绪评分；
- Visit/Scene/Connection/Discovery 语义聚类；
- 自动删除、隐藏或合并重复原件；
- 自动传播 near/burst 语义结果；
- 前端重新处理 UI；
- Cloud Tasks、Pub/Sub 或生产部署；
- 从供应商价格页面实时抓取费用；
- Module 5 Capability Executor 的供应商实现。

## 18. 文档与实施顺序

本设计获书面审阅后，单独编写 Module 4.5 TDD 实施计划。计划必须遵守：

1. 不修改 Module 4 冻结设计、计划和实施证据；
2. 每个 production behavior 先出现原因正确的 RED；
3. RoutePlan/Budget/Cohort contract 先于 orchestration；
4. Memory 与 Firestore adapter 保持同契约；
5. 不引入运行时依赖或外部计费 provider；
6. Module 4.5 完成后停止，不自行进入 Module 5。
