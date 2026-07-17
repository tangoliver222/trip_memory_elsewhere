# Module 5A Capability Execution Kernel + OCR Design

**日期：** 2026-07-17

**状态：** Module 5 首切片范围已批准；详细设计待审

**上游模块：** Module 4 deterministic-media/v1、Module 4.5 Authoritative Routing & Budget Gate

**范围：** Cloud Tasks 调度、独立 capability worker、Document AI Enterprise Document OCR、结果与 provenance、预算结算

## 1. 目标与边界

本切片建立 Elsewhere 第一个真实付费 capability 的完整执行闭环：

```text
current approved RoutePlan
→ 持久化 CapabilityExecution
→ Cloud Tasks 只传内部引用
→ IAM 保护的 capability worker
→ 再次授权和输入复核
→ 固定版本 Enterprise Document OCR
→ raw artifact + normalized artifact + proposed facts
→ provider receipt + budget settlement
→ 必要时提交 escalation request
```

交付后，符合输入契约的 JPEG、PNG、WebP 文档类 Fragment 可以在 OCR RoutePlan 获批后被
幂等调度、执行、结算并留下可回源结果。原件、RoutePlan、预算和 OCR 结果之间保持完整引用。

本切片明确不实现：

- Places、Geocoding、Time Zone；
- text/image/multimodal Embedding；
- Gemini 或 Qwen；
- 商户、日期、地址、金额的低置信语义猜测；
- PDF OCR、HEIC/HEIF 转码、Document AI batch processing；
- 对外 capability API、前端 UI、Cloud Run/Terraform 正式部署；
- provider 自动重试和 `billing_uncertain` 自动恢复。

## 2. 方案比较与选择

### 方案 A：Storage Event 请求内同步调用 Document AI

代码最少，但会把 Eventarc ACK、Document AI 延迟、外部重试和计费状态绑在同一个请求中。请求
超时后无法判断 provider 是否已收费，Storage Event 重放还会扩大重复调用风险。拒绝。

### 方案 B：Cloud Tasks + 独立 worker（采用）

Router 持久化计划后只创建有界任务；worker 在调用前重新验证计划、source revision、reservation
和 execution lease。Cloud Tasks 提供队列级速率和重试，Firestore 仍是长期幂等真相。这条路径
增加两个官方依赖，但首次外部付费调用已经满足引入任务队列的条件。

### 方案 C：Pub/Sub 或 Document AI batch processing

适合多消费者广播或大批量离线回填，不适合当前单 Fragment、需精确重试和用户等待回执的 OCR。
batch processing 通常具有更长完成时间，也会扩大状态面。拒绝。

## 3. 官方限制快照

设计使用 2026-07-17 官方公开限制作为 `policy/v2` 和 `cost-model/v2` 的输入，而不是散落在
worker 中的临时判断：

- Cloud Tasks 单任务最大 1 MiB；同名任务去重窗口最长约 24 小时；
- Document AI online request 最大 40 MB；非 PDF 图片最大 40 MP；
- Enterprise Document OCR 同步请求默认最多 15 页；
- Enterprise OCR 支持 PDF、GIF、TIFF、JPEG、PNG、BMP、WebP；未列 HEIC/HEIF；
- 当前前 5,000,000 页公开价格为 US$1.50 / 1,000 页；
- processor 与 processor version 必须预创建并显式固定。

参考：

- <https://docs.cloud.google.com/tasks/docs/quotas>
- <https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks>
- <https://docs.cloud.google.com/document-ai/limits>
- <https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr>
- <https://docs.cloud.google.com/document-ai/docs/file-types>
- <https://cloud.google.com/document-ai/pricing>

限制与价格改变时必须发布新 policy/cost/executor version 并重新路由；不得原地改变已批准计划。

## 4. 模块结构

新增第三个 composition root：

```text
ELSEWHERE_SERVICE_MODE=capability-worker
```

三个运行根职责固定：

| Root | 允许创建的外部 client | 路由 |
| --- | --- | --- |
| `api` | Firebase Auth/App Check/Repository | 现有用户 Import API |
| `ingestion` | Storage/Repository；显式启用时可创建 Cloud Tasks client | Storage finalized event |
| `capability-worker` | Storage/Repository；显式启用时可创建 Document AI client | 内部 OCR task handler |

`api` 永远不创建 Cloud Tasks 或 Document AI client。`ingestion` 不创建 Document AI client；
`capability-worker` 不创建 Cloud Tasks client。client 只在对应真实 composition root 中延迟创建，
import 模块时不得读取 ADC 或发起网络请求。

建议代码边界：

```text
src/capabilities/
  contract.js             # dispatcher/provider/result-store ports
  identity.js             # idempotency key、execution/result/task identity
  scheduler.js            # approved OCR → reserved execution → enqueue
  worker.js               # lease、调用、receipt、settlement、escalation
  ocr-policy.js           # provider 输入能力与版本化限制
  ocr-normalizer.js       # provider response → normalized artifact/proposed facts
  errors.js               # 稳定内部错误分类

src/adapters/
  cloud-tasks-dispatcher.js
  document-ai-ocr.js
  firebase-capability-artifact-store.js

src/composition/
  capability-worker.js
```

现有 `routing/authorization.js` 继续作为所有 provider 调用前的权威授权入口，但它会从“直接创建
execution”调整为“领取已经预留的 execution”。Memory 与 Firestore Repository 必须继续通过同一
contract。

## 5. 配置与 fail-closed 规则

默认配置：

```text
CAPABILITY_EXECUTION_MODE=fake
CLOUD_TASKS_ENABLED=false
DOCUMENT_AI_ENABLED=false
```

Cloud Tasks 真实配置：

```text
CAPABILITY_EXECUTION_MODE=google
CLOUD_TASKS_ENABLED=true
CLOUD_TASKS_PROJECT_ID=<project>
CLOUD_TASKS_LOCATION=<region>
OCR_TASK_QUEUE=<queue>
OCR_WORKER_URL=<https-url>
OCR_WORKER_AUDIENCE=<worker-service-url>
OCR_TASK_SERVICE_ACCOUNT=<service-account-email>
```

Document AI 真实配置：

```text
CAPABILITY_EXECUTION_MODE=google
DOCUMENT_AI_ENABLED=true
DOCUMENT_AI_PROJECT_ID=<project>
DOCUMENT_AI_LOCATION=<region-or-multiregion>
DOCUMENT_AI_PROCESSOR_ID=<precreated-processor-id>
DOCUMENT_AI_PROCESSOR_VERSION=<fixed-version-id>
DOCUMENT_AI_ENDPOINT=<regional-endpoint>
```

规则：

1. `fake` 模式下任一真实 provider 开关为 true 都是启动错误；
2. `google` 模式只允许当前 root 所需的 provider 开关；
3. 开关为 true 时所有对应字段必填，字段不完整直接启动失败；
4. `NODE_ENV=test` 且 `RUN_REAL_GOOGLE_PROVIDER_TESTS` 不为 `true` 时，真实 provider 开关无条件拒绝；
5. fake dispatcher/provider 失败时不得 fallback 到真实 Google client；
6. 运行时账号没有 processor create/update 权限，只能调用指定 processor version；
7. endpoint、location、processor resource 必须相互一致。

`RUN_REAL_GOOGLE_PROVIDER_TESTS=true` 只控制手动 smoke 套件，不进入生产配置对象。

## 6. Route policy v2

当前 `policy/v1` 对 PDF page count 未知仍批准 OCR，与 Document AI 同步输入限制不匹配。新实现不
修改历史 RoutePlan，而是发布新的版本：

```text
router: fragment-routing/v1
policy: policy/v2
cost model: cost-model/v2
OCR executor: document-ocr/v1
```

`policy/v2` 的 OCR 决策：

| 输入 | 决策 |
| --- | --- |
| JPEG/PNG/WebP，文档类，`sizeBytes <= 40_000_000`，可靠像素数 `<= 40_000_000` | approved |
| JPEG/PNG/WebP 缺少可靠像素数 | deferred，等待可靠技术事实 |
| JPEG/PNG/WebP 超过大小或像素限制 | blocked，`document-ai-online-limit` |
| HEIC/HEIF | blocked，`document-ai-format-unsupported` |
| text | skipped，`ocr-not-required` |
| PDF 且当前 `pageCount === null` | deferred，`page-count-unknown` |
| deterministic terminal failure、低信息或 source revision 不完整 | blocked |

worker 保留同样的输入 guard，但它只是 fail-closed 防线，不能用 provider 报错代替 Router 决策。
旧 `policy/v1` 计划不可原地修改；新 routing event 或显式 reroute 生成新 revision 并 supersede 旧版。

## 7. CapabilityExecution 是长期幂等真相

Cloud Tasks 确定性任务名只减少短期重复，真正幂等身份固定为：

```text
uid
+ fragmentId
+ sourceRevision
+ routePlanRevision
+ capability
+ provider
+ providerVersion
```

由该 tuple 生成：

- `idempotencyKey`；
- `capabilityExecutionId`；
- `ocr-{capabilityExecutionId}` Cloud Task name；
- capability result 与 artifact path。

调度前先在 Repository 事务中创建 `CapabilityExecution.state=reserved`，`billableAttempts=0`。随后
创建 Cloud Task，成功或 `ALREADY_EXISTS` 都将 execution 标为 `queued`。如果 task 创建成功但
响应丢失，Eventarc 重试通过确定性 task name 与 execution 恢复，不重复产生 execution。

execution 生命周期：

```text
reserved → queued → claimed → calling → provider_succeeded → settling → completed
                     │          ├→ billing_uncertain
                     │          └→ failed_terminal
                     └→ queued   # provider 调用前的安全重试
```

约束：

- `reserved/queued` 不消耗 billable attempt；
- worker claim 获得有期限 lease，但不增加 billable attempt；
- `markCalling` 原子验证 lease、current plan 和 reservation，并将 billable attempt 加一；
- worker 在 `claimed` 且 lease 过期时可以安全重新领取；
- `calling` 后进程丢失或 provider timeout 默认进入 `billing_uncertain`，不得自动重调；
- 只有能够证明 provider 尚未接收请求的 pre-call 故障才是 `failed_retryable`；
- max billable attempts v1 为 1；任务系统重试不等于 provider 重试。

这一区分同时满足“provider 暂时故障可重试”和“不能因未知计费状态重复调用”：materialization、
Repository、任务派发等 pre-call 暂时故障返回 503；Document AI 请求发出后的模糊超时不返回 503
触发第二次调用。

## 8. Cloud Tasks payload 与调度

唯一 payload：

```json
{
  "capabilityExecutionId": "exec_xxx",
  "ownerId": "uid_xxx",
  "routePlanId": "route_xxx",
  "routePlanRevision": 2
}
```

payload 使用 strict schema，拒绝额外字段。禁止写入：

- 图片、PDF 或其他原件字节；
- OCR text、provider response；
- object path、EXIF、GPS、用户笔记；
- processor credentials 或 signed URL。

Cloud Task 使用 HTTP POST、JSON body、确定性 task name 和 OIDC token：

```text
serviceAccountEmail = OCR_TASK_SERVICE_ACCOUNT
audience = OCR_WORKER_AUDIENCE
url = OCR_WORKER_URL
```

ingestion 在 Router 返回 `drafted|approved|completed|terminal_noop` 后扫描该批次的 current approved
OCR plans，以稳定 Fragment ID 顺序准备和派发。即使 Router 在 Eventarc 重试中返回 no-op，scheduler
仍会补发已持久化但未成功入队的 execution。只有所有当前可调度 OCR execution 已持久化且 Cloud
Task create 成功或得到同名冲突，Storage Event 才返回 204。

## 9. Worker 安全边界

`elsewhere-capability-worker` 部署为独立 Cloud Run service：

```text
Cloud Tasks → OIDC → Cloud Run IAM → capability-worker composition root
```

它不使用 Firebase 用户 Auth/App Check。生产身份由 Cloud Run IAM 验证，部署时只向指定 task service
account 授予 worker invoker。应用层仍重新验证 owner、RoutePlan、RoutingHead、source revision、
reservation、execution、executor version 和 lease。

`X-CloudTasks-TaskName`、retry count 等 header 只用于一致性检查与脱敏指标；它们可被伪造，因此不
构成身份。worker 请求的 `request.id` 只取服务端 Fastify request ID。

API 和 ingestion composition 不注册 worker route。worker 只注册：

```text
POST /internal/capabilities/ocr
```

以及公开的 `/healthz`、`/readyz`。Cloud Run IAM 必须关闭 unauthenticated；本地集成测试通过明确
test harness 注入已验证的 service identity，不创建生产 `/protected` 探针。

## 10. Source material 与 Document AI 调用

worker 从 Repository 重新读取权威对象，再使用现有 generation-pinned source materializer：

1. 匹配 bucket、object name、generation、size、content type、crc32c、input hash；
2. 限制 40,000,000 bytes 和 40,000,000 pixels；
3. 流式写入随机 0700 临时目录与 0600 文件；
4. adapter 只读取已验证的临时文件，并在 finally 清理；
5. 整个调用只允许一个有界 buffer，不接受无界 stream 聚合。

Document AI request：

- 使用完整 processor version resource name，不使用 processor 默认版本；
- 使用显式 regional endpoint；
- 只发送 JPEG、PNG、WebP rawDocument；
- 不启用 OCR add-ons；
- 使用 field mask 排除不需要的嵌入图像与原始内容；
- request labels 只含无私人内容的 execution correlation hash 与版本；
- adapter 不创建、启用、更新或切换 processor。

官方同步 `ProcessRequest` 没有稳定、必返的 provider request ID 字段。因此 receipt 调整为：

```text
clientRequestId: 必填、确定性
providerRequestId: 可空，仅在 SDK/响应确实提供时保存
```

禁止用 execution ID 冒充 provider 返回的 request ID。

## 11. 结果三层存储

Document AI 结果不能直接覆盖 Fragment 事实。固定三层：

### 11.1 Provider artifact

将经过 field mask 的 provider response 规范化 JSON、gzip 后保存到 server-only Storage：

```text
users/{uid}/capability-results/{executionId}/provider.json.gz
```

使用 `ifGenerationMatch=0` 与 SHA-256；同路径不同内容是冲突，不覆盖。

### 11.2 Normalized OCR artifact

将确定性归一化结果 gzip 保存：

```text
users/{uid}/capability-results/{executionId}/normalized.json.gz
```

结构包括：完整 text、页数、语言、page/block/line/token text anchors、Document AI quality signals、
normalizer version。不得保存原件字节或 provider credentials。

### 11.3 CapabilityResult + proposed facts

Firestore `capabilityResults/{resultId}` 只保存有界索引：

- execution/plan/Fragment/source revision 引用；
- provider、processor ID 的不可逆审计标识、processor version、endpoint region；
- pricing version、request count、page count、quality summary；
- provider/normalized artifact refs、hash、generation、size；
- outcome：`completed|insufficient_input|unsupported`；
- proposed fact keys 与 provenance。

首切片不以正则猜商户、日期、地址和金额。只产生能由 OCR 响应直接证明的 suggested facts：

- `ocrResultRef`；
- `ocrPageCount`；
- `ocrLanguageCodes`；
- `ocrQualitySummary`。

每项使用 `sourceType=ocr`，引用 `capabilityResult` 与 Fragment，保存 executor/processor version、
confidence、`status=suggested`。用户、EXIF、GPS 或其他更高优先级事实不被覆盖；冲突进入既有
provenance 合并规则。

CapabilityResult 与 artifacts 默认仅服务端可读；客户端继续只读安全、精简的 Fragment facts 和
ImportBatch capability summary。完整 OCR 原文的受控读取 API 不属于本切片。

## 12. 成本、receipt 与结算

新增版本化价格配置：

```text
pricingVersion = document-ai-enterprise-ocr-2026-07-17
unit = page
unitCostMicros = 1500
```

OCR v1 只批准单页图片，因此 `estimatedPages=1`、`estimatedCostMicros=1500`。`cost-model/v2` 预留
ceiling；公开价格或适用范围变化必须产生 cost model 新版本和 RoutePlan revision。

成功结果记录：

- client request ID、可选 provider request ID；
- processor audit ID、processor version；
- estimated/actual pages；
- request count、Cloud Tasks delivery count；
- pricing version、estimated/actual cost；
- provider receipt time、resultRef。

结算顺序：

```text
provider artifact + normalized artifact + CapabilityResult persisted
→ record provider receipt
→ submit escalation if insufficient
→ settle reservation and publish current facts atomically
```

只有结果、receipt、预算和 Fragment 投影都成功持久化后 worker 返回 204。结果写入失败时不允许先
结算。actual cost 超过 reservation ceiling、调用状态未知或 receipt 无法持久化时进入
`billing_uncertain`，结果不得发布为当前 Fragment fact。

明确无 provider 调用的 unsupported/terminal input 释放 reservation。预算不足仍由 Module 4.5 在
调用前阻止；worker 不自行扩大预算。

## 13. Outcome 与 HTTP 重试语义

应用结果固定为：

| Outcome | 是否调用 provider | Budget | HTTP |
| --- | --- | --- | --- |
| `completed` | 是 | settle actual | 204 |
| `insufficient_input` | 是 | settle actual；提交 escalation | 204 |
| `unsupported` | 否 | release | 204 |
| `escalation_requested` | 取决于上一步 | 不新增调用预算 | 204 |
| `failed_retryable` | 否，或可证明请求未发送 | 保留 reservation | 503 |
| `failed_terminal` | 否或明确未计费 | release | 204 |
| `billing_uncertain` | 请求可能已发送 | 保守保留/结算审计 | 204，禁止自动重调 |

Cloud Tasks 的 retry count 不决定领域 outcome。`Retry-After` 不是正确性依赖。

## 14. ImportBatch capability summary

不改变 Module 3/4 已冻结的 `batch.status`。新增独立摘要：

```text
capabilitySummary:
  processorName: capability-execution
  processorVersion: v1
  eligible
  queued
  running
  completed
  insufficient
  unsupported
  failed
  billingUncertain
  updatedAt
```

计数按 `fragmentId + capability + executorName + executorVersion + sourceRevision` 去重。旧 executor
version 的迟到结果不能污染当前摘要；supporting/skipped/deferred 不计为失败。

## 15. 测试与零真实调用证明

默认测试必须在没有 ADC、真实 project、queue、processor 的环境中完成：

1. config matrix 证明默认 fake 与 fail-closed；
2. fake dispatcher/provider 端口契约；
3. Cloud Tasks payload、task name、OIDC audience golden test；
4. SDK client factory 只在真实 composition 延迟调用；
5. `policy/v2` 的 MIME、40 MB、40 MP、HEIC/text/PDF 决策；
6. execution prepare/enqueue/claim/lease/calling/receipt/settlement contract；
7. duplicate enqueue、task redelivery、lease expiry、stale plan/source/budget；
8. provider in-flight timeout进入 billing uncertain，不发生第二次 provider 调用；
9. provider-free retryable failure保持 reservation；
10. OCR golden response normalization、artifact hash 与 provenance；
11. insufficient OCR 先持久化结果，再提交 escalation；
12. Memory/Firestore Repository contract 同步；
13. Firestore/Storage Rules 拒绝所有客户端访问内部 execution/result/artifact；
14. Auth/Firestore/Storage Emulator 完成 dispatch→fake worker→result→settlement；
15. API/ingestion/worker composition 路由隔离；
16. 本机、Node 22 Linux、production dependency audit 和 Docker build。

测试必须向 fake Cloud Tasks client 和 fake Document AI client 注入调用计数，并断言默认完整套件中
真实 client constructor 与 provider method 调用数均为 0。

真实 smoke 独立为显式命令，必须同时满足：

```text
RUN_REAL_GOOGLE_PROVIDER_TESTS=true
CAPABILITY_EXECUTION_MODE=google
```

且只允许合成/脱敏的一页 fixture。默认 `npm test`、Emulator 和 CI 永远不运行该 smoke。

## 16. 文档与迁移

实施时同步修正：

- PRD 的 OCR 输入边界与 capability result/provenance；
- Google-first 技术架构中的 Module 5A 实际链路；
- 后端总路线中已过时的 Module 4.5 状态；
- `.env.example`、backend README 与手动 smoke 说明；
- Module 4.5 runbook 中 PDF OCR 从 v1 到 v2 的版本迁移说明。

不回写或改造已完成的历史 RoutePlan 文档；通过新 revision 迁移。

## 17. 完成标准

本切片只有同时满足以下条件才可标记完成：

- 两个官方依赖已锁定具体版本，生产依赖审计无未解释高危问题；
- 默认配置、普通测试、Emulator 测试对真实 Google 调用为 0；
- current approved OCR plan 才能准备 execution 和入队；
- 同一 source/plan/provider tuple 不会产生第二个 execution 或第二次 provider 调用；
- stale、deferred、blocked、supporting 不得调用 Document AI；
- JPEG/PNG/WebP 的大小与像素限制在 Router 和 worker 双层一致；
- HEIC/HEIF/text/PDF unknown page count 不发送 Document AI；
- 结果、provenance、receipt、实际成本和预算状态一致持久化；
- in-flight 不确定状态不会自动重调；
- 原件和用户事实不被 OCR 覆盖；
- capability worker 使用独立 composition root，API 不暴露内部 endpoint；
- 本机、Linux、Emulator、Rules、Docker、audit 取得刚执行的通过证据；
- 每个 RED、GREEN、REFACTOR 阶段独立提交；
- 完成后停止，不自行进入 Places、Embedding 或 Gemini。
