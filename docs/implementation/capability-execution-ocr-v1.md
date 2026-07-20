# Elsewhere Capability Execution — OCR v1

**日期：** 2026-07-18

**状态：** Module 5A 已部署生产，并通过本地、Firebase Emulator 与真实 Cloud Run 垂直链路验证

**上游：** Module 4.5 `fragment-routing/v1 + policy/v2 + cost-model/v2`

## 1. 范围与非范围

Module 5A 是 Elsewhere 第一个受权威 RoutePlan 约束的计费能力执行器。固定链路为：

```text
approved OCR decision + active RoutingHead + reserved budget
→ deterministic CapabilityExecution identity
→ Cloud Tasks named task
→ private capability-worker
→ generation-pinned source materialization
→ fixed-version Enterprise Document OCR
→ immutable provider / normalized artifacts
→ immutable CapabilityResult
→ atomic budget settlement + suggested Fragment facts
```

本模块只实现 OCR。Places、Embedding、Gemini、地图 grounding、恶意内容扫描、完整语义解析、
PDF OCR 和自动 `billing_uncertain` 对账均未实现。OCR 结果只发布可追溯的 suggested facts，不自动
确认商户、地点、事件或发现。

## 2. 三个独立运行根

三个 Cloud Run 服务共用同一镜像，但通过 `ELSEWHERE_SERVICE_MODE` 选择互斥 composition root：

| Mode | 公开面 | 可构造计费 adapter | 建议 runtime service account |
| --- | --- | --- | --- |
| `api` | health/readiness + Auth/App Check 保护的业务 API | Vertex sourced query（独立于 OCR RoutePlan） | `elsewhere-api-runtime` |
| `ingestion` | health/readiness + Eventarc finalized receiver | Cloud Tasks dispatcher | `elsewhere-ingestion-runtime` |
| `capability-worker` | health/readiness + internal OCR task route | Document AI OCR | `elsewhere-capability-worker-runtime` |

fake/default mode 下，三个 root 对 Cloud Tasks 与 Document AI 均为 **0 构造、0 调用**。API root
即使错误配置 provider 开关也 fail closed；ingestion 不能构造 Document AI；worker 不能构造 Cloud
Tasks。运行时不读取 service-account key 文件，生产只使用 Cloud Run service identity / ADC。
生产 Else 的 Vertex 开关和预算是单独 fail-closed 边界，不授权 OCR 或其他 RoutePlan capability。

## 3. 权威执行与幂等

Scheduler 只扫描当前 RoutingHead 指向、source revision 完全匹配、`policy/v2`、
`cost-model/v2`、非 supporting 且 OCR decision 为 approved 的 RoutePlan。任务身份绑定：

- owner、Fragment、source generation/hash；
- RoutePlan ID/revision；
- capability、executor/provider 及固定版本。

Cloud Tasks 使用确定性 task name；重复 create 视为同一调度，不生成第二个执行。worker task body
只携带 execution/owner/plan 引用，不携带可被信任的授权副本。claim 时 Firestore 事务重新读取：

- 当前 RoutingHead、RoutePlan 和 source revision；
- Fragment storage facts；
- BudgetReservation 与 ledgers；
- executor/provider/router/policy/cost-model 版本。

不满足任一条件即在 materialize 和 provider 调用之前终止。`X-CloudTasks-*` 仅作有界观测字段，
不参与身份或幂等判断。

## 4. OCR 输入策略 v2

生产 OCR 当前只接受：

| 格式 | MIME | 限制 |
| --- | --- | --- |
| JPEG | `image/jpeg` | ≤40,000,000 bytes 且 ≤40,000,000 pixels |
| PNG | `image/png` | 同上 |
| WebP | `image/webp` | 同上 |

输入使用 Module 3/4 已验证的 bucket、object path、generation、size、CRC32C 和可空 MD5；worker 按
指定 generation materialize。Document AI adapter 再核对临时文件大小，并以固定 processor version
调用 `processDocument`。它使用 field mask 限制返回字段，不记录原始文本到日志。

历史 `policy/v1` 曾允许 PDF 进入 OCR 计划，但 Module 4 不能可靠报告 PDF pageCount。Module 5A
因此只执行 `policy/v2`；旧计划不会被静默执行，必须由 Router 重新编译。`MAX_PAGE_COUNT` 不被
伪用于当前 PDF，PDF 仍保留原件并记录能力未支持。

## 5. 结果、隐私与事实发布

provider 原始响应和 normalized OCR JSON 以确定性 JSON、gzip、generation-match create-only 方式写入：

```text
users/{uid}/capability-results/{executionId}/provider.json.gz
users/{uid}/capability-results/{executionId}/normalized.json.gz
```

对象保存 owner/execution/kind/SHA-256 metadata。若同路径已存在，只有字节与 metadata 完全一致
才允许复用；否则进入不可自动重试的 artifact conflict。Storage Rules 对所有客户端读写均拒绝。

Firestore `capabilityResults` 同样是服务端私有、不可变结果。正常 settlement 只向 Fragment 写入
带 provenance 的：

- `ocrPageCount`；
- `ocrQualitySummary`；
- `ocrResultRef`。

全文留在私有 artifact，不复制到 Fragment，也不覆盖用户或其他来源事实。空 OCR 先保存证据，再
提交结构化 `escalation_requested`；处理器不得自行调用 Gemini。

## 6. 生命周期与恢复语义

```text
reserved → queued → claimed → calling → provider_succeeded → completed
                         ↘ failed_retryable
                         ↘ failed_terminal
                                  calling ↘ billing_uncertain
```

- provider 前的 Storage/Repository 暂时故障可以安全重试，不增加 billable attempt；
- `calling` 前在事务中增加 billable attempt，v1 最多 1 次；
- provider 成功后先持久化 artifacts、receipt 与 result，再结算；之后重投递从已保存结果恢复，不再
  调 Document AI；
- provider 调用已发出但返回/持久化结果的计费状态不确定时，标记 `billing_uncertain`，保留预算，
  HTTP 返回 204 阻止自动重调；
- `billing_uncertain` 必须由运维按 execution ID、hashed provider audit ID、时间与 Cloud Billing /
  Document AI 审计记录人工对账。本版本没有自动恢复命令；禁止简单重置为 queued；
- 只有 CapabilityExecution、CapabilityResult、RoutePlan、ImportBatch、Fragment 与预算 ledger 的
  对应事务成功后才确认终态。

## 7. 成本模型

实现中的价格快照 ID 固定为：

```text
document-ai-enterprise-ocr-2026-07-17
```

当前 `unitCostMicros = 1,500`，即首档 Enterprise Document OCR 每页 USD 0.0015 的快照。该值是
审计与预算估算输入，不是长期价格承诺；上线前必须复核项目实际 SKU、币种、阶梯价和税费。实际
费用以 provider receipt 页数计算并受 RoutePlan reservation ceiling 约束。

## 8. 配置与 fail-closed 矩阵

共同配置：

```text
CAPABILITY_EXECUTION_MODE=fake|google
OCR_PROVIDER_VERSION=<fixed processor version>
```

ingestion 的 google mode 必须同时配置：

```text
CLOUD_TASKS_ENABLED=true
CLOUD_TASKS_PROJECT_ID
CLOUD_TASKS_LOCATION
OCR_TASK_QUEUE
OCR_WORKER_URL=https://...
OCR_WORKER_AUDIENCE=https://...
OCR_TASK_SERVICE_ACCOUNT
```

capability-worker 的 google mode 必须同时配置：

```text
DOCUMENT_AI_ENABLED=true
DOCUMENT_AI_PROJECT_ID
DOCUMENT_AI_LOCATION
DOCUMENT_AI_PROCESSOR_ID
DOCUMENT_AI_PROCESSOR_VERSION
DOCUMENT_AI_ENDPOINT
```

`OCR_PROVIDER_VERSION` 必须等于 `DOCUMENT_AI_PROCESSOR_VERSION`。缺项、模式与开关交叉、API 开启
provider、ingestion 开 Document AI、worker 开 Cloud Tasks 均在启动时失败。test mode 的真实
provider 还必须显式设置 `RUN_REAL_GOOGLE_PROVIDER_TESTS=true`。

## 9. 生产 IAM 边界

权限边界已由部署脚本应用并在真实项目中核对：

- ingestion runtime identity：只对指定 queue 创建 task，并保留其既有 Firestore/Storage 最小权限；
  不授予 Document AI；
- `OCR_TASK_SERVICE_ACCOUNT`：只作为 Cloud Tasks OIDC 调用身份，并只对 capability-worker 拥有
  Cloud Run Invoker；不作为 ingestion 或 worker runtime identity；
- capability-worker runtime identity：只拥有读取指定 original generation、create/read 指定
  capability-results、Firestore 能力事务及固定 Document AI processor version 在线处理所需权限；
  不授予 Cloud Tasks enqueue；
- API runtime identity：仅额外拥有 Vertex `roles/aiplatform.user`，不授予 Cloud Tasks、Document AI
  或 capability artifact 权限；
- Cloud Tasks service agent 保持 Google 管理的 service-agent 边界。不要使用默认 Compute service
  account，也不要把基本 Owner/Editor 角色作为捷径。

staging 部署门禁必须验证 OIDC audience 与 worker URL 一致、worker 禁止 unauthenticated、只有任务
身份可 invoke、三个 runtime service account 不可互换，以及 API 无法读取私有 OCR artifacts。

## 10. Processor 与 smoke 边界

生产前人工预创建 Enterprise Document OCR processor，并固定一个明确 processor version；运行时
不创建、训练、部署或自动切换 processor。region、endpoint 和 processor version 必须一致。

真实 smoke 只允许使用合成或已脱敏的一页 JPEG/PNG/WebP，不得使用真实用户原件：

```bash
RUN_REAL_GOOGLE_PROVIDER_TESTS=true \
CAPABILITY_EXECUTION_MODE=google \
DOCUMENT_AI_ENABLED=true \
npm run smoke:document-ai -- /absolute/path/synthetic-one-page.png image/png
```

其余必填项来自 `.env.example`。smoke 只输出 provider request ID、页数和文本长度，不输出 OCR 文本。
它验证 adapter 与凭据，不证明完整 Cloud Tasks、IAM、预算或数据保留策略。

## 11. 验证范围

Module 5A 的验证覆盖：

- config、identity、domain、scheduler、Cloud Tasks、Document AI、normalizer、artifact store、worker；
- Memory 与 Firestore 同一 capability repository contract；
- Auth/Firestore/Storage Emulator 的调度、重投递、结果、结算和 Rules；
- fake/default 三个 runtime root 的付费 adapter 0 构造、0 调用；
- Node 22 production Docker image 与 dependency audit。

冻结前在 2026-07-18 重新执行的结果：

| 验证 | 结果 |
| --- | --- |
| capability focused unit tests | 50 passed，0 failed |
| backend integration tests | 33 passed，0 failed |
| backend full `npm test` | 567 total；559 passed，8 emulator-only skipped，0 failed |
| Firebase Emulator suite | 70 passed，0 failed，0 skipped |
| config tests | 13 passed，0 failed |
| fake/default zero-cloud-call composition | 6 passed，0 failed；付费 adapter 0 构造、0 调用 |
| `npm audit --omit=dev` | 0 vulnerabilities |
| production Docker build | `elsewhere-backend:module5a` 构建成功；镜像安装生产依赖时再次审计为 0 vulnerabilities |

完整开发依赖树的 `npm audit` 报告 3 个 moderate，均来自开发期
`firebase-tools → @google-cloud/pubsub → @opentelemetry/core`。npm 当前给出的自动修复会强制切换到
不同 major 范围的 `firebase-tools`，因此本阶段不执行破坏性的 `npm audit fix --force`；该风险不进入
生产镜像，后续应在 Firebase CLI 发布兼容修复后单独升级并回归 Emulator suite。

Emulator 测试本身不证明真实 Cloud Run IAM、OIDC、Document AI 配额或计费；这些已由 2026-07-20
production smoke 额外验证。该 smoke 经真实 Storage → Eventarc → routing → Cloud Tasks → Document AI
执行，并验证 owner 清理。Module 5A 仍不进入 Places、Embedding 或 ingestion Gemini capability。
