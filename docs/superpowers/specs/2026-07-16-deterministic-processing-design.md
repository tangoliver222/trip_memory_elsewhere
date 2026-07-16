# Elsewhere Module 4 — Deterministic Processing 设计

**日期：** 2026-07-16

**状态：** 已完成设计冻结，等待书面审阅

**实施方式：** 先在 Firebase Emulator 建立完整闭环，再进入任何真实云部署

**上位依据：**

- `docs/superpowers/specs/2026-07-16-elsewhere-backend-program-design.md`
- `docs/superpowers/specs/2026-07-16-import-batch-original-save-design.md`
- `docs/implementation/import-batch-original-save-v1.md`
- `docs/Elsewhere_PRD_v3.0.md`
- `docs/Elsewhere_Google_First_Technical_Architecture_v1.0.md`

## 1. 结论

Module 4 在 Module 3 已安全保存的原件上建立第一个可恢复的确定性处理闭环：持久化
ProcessingTask、流式 SHA-256、白名单技术元数据、受限缩略图、dHash、owner-scoped 精确/
近似重复候选，以及版本化批次处理摘要。

当前仍由 `elsewhere-ingestion` 在收到 Storage finalized Eventarc 请求后同步执行完整任务，
最后才确认事件。不引入 Cloud Tasks、Pub/Sub、OCR、Gemini、Places、向量检索或其他网络
服务。领域 pipeline 与 dispatcher 通过 port 分离；达到明确门槛后只替换 dispatcher。

最重要的产品约束是：

> 原件永远先于派生结果。处理失败、格式能力不足或判断为重复，都不会删除、覆盖、合并或
> 隐藏新 Fragment。

## 2. 方案比较

### 2.1 直接塞入 finalized handler

代码最少，但没有独立任务身份、租约、版本或恢复状态。实例在处理中退出后无法可靠判断
是否应重做，后续 OCR/Places 也难以拆出。拒绝。

### 2.2 持久化 ProcessingTask、当前请求内执行（采用）

Firestore 保存任务状态与 lease，Eventarc 重投负责当前阶段的外部重试触发。处理步骤只依赖
Repository、source materializer、metadata、derivative 和 duplicate-search ports。成本低，
同时保留迁移到 Cloud Tasks 的结构。

### 2.3 立即使用 Cloud Tasks + 独立 worker

隔离和重试能力更强，但当前步骤没有付费或外部网络调用。此时引入队列、IAM、部署、限流和
额外 Emulator 替身属于过度建设。延后到第 18 节门槛触发。

## 3. 完整数据流与 acknowledgement

```text
Storage finalized event / Eventarc retry
→ ensureOriginalFinalized(event)
→ 即使 Module 3 返回 same-generation duplicate 也继续
→ derive source revision identity
→ ensure + transactional claim ProcessingTask
→ generation-pinned materialize + streaming SHA-256
→ checkpoint inputHash
→ register owner-scoped content hash
→ extract supported metadata
→ generate supported thumbnail and dHash
→ idempotently create/reuse derivative
→ deterministic same-user near search
→ terminal Firestore transaction
→ cleanup temporary material
→ only then return HTTP
```

Module 3 原件 finalize 与 Module 4 ProcessingTask 是两套独立幂等状态。以下链路必须可恢复：

```text
第一次事件创建 Fragment
→ Module 4 中途失败
→ Eventarc 重投
→ Module 3 返回 duplicate
→ Module 4 重新 ensure / claim / resume
```

禁止 fire-and-forget。任务终态、Fragment 当前结果和 ImportBatch 摘要未成功持久化之前，
不得返回 `204`。终态 transaction 失败返回 `503`。

## 4. Source Revision 与 Task identity

Module 4 将 `bucket` 加入 Fragment 原始 Storage facts：

```json
{
  "bucket": "demo-elsewhere.appspot.com",
  "originalPath": "users/uid/originals/batch_x/frag_x",
  "generation": "1740000000000001",
  "contentType": "image/jpeg",
  "sizeBytes": 2841930,
  "crc32c": "...",
  "md5Hash": null
}
```

ProcessingTask 首次 claim 时尚未计算 SHA-256，因此 `inputHash` 不能参与初始任务 identity。
固定 identity tuple：

```text
ownerId
+ fragmentId
+ processorName
+ processorVersion
+ bucket
+ objectName
+ storageGeneration
```

```text
taskId = "task_" + sha256(canonical tuple)
```

`inputHash` 初始为 `null`，完成原件流式读取后写入 64 字符小写 SHA-256。未来可按
`ownerId + processorName + processorVersion + inputHash` 建立同用户派生缓存，但缓存 identity
不能替代 source-revision task identity。

## 5. ProcessingTask 契约

路径：

```text
users/{ownerId}/processingTasks/{taskId}
```

最小持久化形态：

```json
{
  "id": "task_...",
  "ownerId": "uid",
  "schemaVersion": 1,
  "fragmentId": "frag_...",
  "batchId": "batch_...",
  "processorName": "deterministic-media",
  "processorVersion": "v1",
  "sourceRevision": {
    "bucket": "...",
    "objectName": "...",
    "generation": "..."
  },
  "inputHash": null,
  "state": "running",
  "currentStep": "hashing",
  "leaseOwner": "exec_...",
  "attemptCount": 1,
  "outputs": {},
  "lastErrorCode": null,
  "createdAt": "...",
  "updatedAt": "...",
  "firstStartedAt": "...",
  "attemptStartedAt": "...",
  "lastHeartbeatAt": "...",
  "softDeadlineAt": "...",
  "leaseAcquiredAt": "...",
  "leaseExpiresAt": "...",
  "completedAt": null,
  "deletedAt": null
}
```

状态固定为：

```text
pending
running
succeeded
failed_retryable
failed_terminal
```

`currentStep` 固定为：

```text
queued
hashing
hash_registered
metadata
derivatives
duplicate_search
committing
complete
```

状态不变量：

- `pending`：无 lease，attemptCount 为 0；
- `running`：lease、attemptStartedAt、softDeadlineAt 必填，attemptCount 至少为 1；
- `failed_retryable`：lease 已释放，completedAt 为空，lastErrorCode 必填；
- `succeeded|failed_terminal`：lease 已释放，completedAt 必填；
- `succeeded` 允许 capability output 为 `partial|unsupported`；
- Task 只保存可恢复 checkpoint 和处理摘要，不复制原件、完整 EXIF 或临时路径。

当前同步模式可以从不存在直接 transaction-create 为 `running`；保留 `pending` 是为了以后
队列 dispatcher。

## 6. Lease、heartbeat 与软截止

claim transaction：

```text
task 不存在
→ create running + lease + attemptCount=1

pending / failed_retryable
→ claim running + new lease + attemptCount+1

running + unexpired lease
→ busy，不抢占

running + expired lease
→ reclaim + new executionId + attemptCount+1

succeeded / failed_terminal
→ terminal no-op
```

`leaseOwner` 使用服务端生成的 attempt execution ID，不使用客户端字段。Heartbeat 只有持有
当前 lease 的 execution 才能更新 `lastHeartbeatAt/currentStep/leaseExpiresAt`。

默认 runtime config：

```text
PROCESSING_SOFT_TIMEOUT_MS=180000
PROCESSING_LEASE_MS=240000
CLOUD_RUN_REQUEST_TIMEOUT_MS=300000
PROCESSING_CLEANUP_MARGIN_MS=30000
```

启动时强制验证：

```text
softTimeout < lease
lease <= requestTimeout - cleanupMargin
```

这些值是 runtime/deployment config，不是领域常量。每个耗时 adapter 接收：

```js
{ signal, deadlineAt }
```

达到软截止时必须销毁 Storage/文件流和 Sharp pipeline、清理临时文件、写
`failed_retryable` 并返回非 2xx。只在步骤前检查时间不够，因为一次解码或读取本身可能
跨过截止线。

Cloud Run 默认请求超时为 5 分钟；超时后连接关闭并返回 504，但实例不一定终止。因此设计
不依赖平台停止后台代码。

## 7. Generation-pinned materialization 与内存边界

对象 materializer 必须：

1. 先用 Fragment 的 bucket/path/generation/size 校验 source revision；
2. 使用指定 generation 创建只读 Storage handle；
3. 创建随机、task-scoped 临时目录，目录权限 `0o700`、文件权限 `0o600`；
4. 不使用 `originalName` 或其他用户输入构造路径；
5. 流式写入临时文件，同时用 Node `crypto.createHash('sha256')` 计算 hash；
6. 按已验证 size 设置 hard byte counter，超出立即 abort；
7. 在所有退出路径的 `finally` 中删除文件和目录。

Cloud Run 可写文件系统位于实例内存中。50 MiB 压缩文件解码后可能远大于 50 MiB，因此
`maxBytes + concurrency=1 + 1 GiB` 不是永久安全保证，只是受限起点。

运行时安全配置：

```text
MAX_INPUT_BYTES=52428800
MAX_INPUT_PIXELS=60000000
MAX_IMAGE_WIDTH=20000
MAX_IMAGE_HEIGHT=20000
MAX_PAGE_COUNT=100
MAX_METADATA_DECOMPRESSED_BYTES=16777216
```

这些值可向下配置，不得超过设计 hard cap。部署前以合成大图、压缩炸弹和真实手机照片
benchmark；ingestion 初始 concurrency 固定为 1，内存从 1 GiB 评估。

## 8. 格式能力矩阵

| 输入 | SHA-256 | metadata | thumbnail | dHash |
|---|---:|---:|---:|---:|
| JPEG | 必须 | Sharp + ExifReader | 必须 | 必须 |
| PNG | 必须 | Sharp | 必须 | 必须 |
| WebP | 必须 | Sharp | 必须 | 必须 |
| HEIC/HEIF | 必须 | ExifReader / capability | capability-based | capability-based |
| PDF | 必须 | Storage 基础事实；pageCount=null | unsupported | unsupported |
| text | 必须 | UTF-8、字节数 | unsupported | unsupported |

AVIF 不在 Module 3 Import Policy 中，Module 4 不扩展输入契约。

adapter 统一返回：

```text
complete | partial | unsupported | failed
```

任务可以 `succeeded`，同时 metadata 为 `partial`、thumbnail/dHash 为 `unsupported`。未知不
写成 `0` 或 `1`；unsupported 不写成 failed。

`MAX_PAGE_COUNT` 只对当前 decoder 能可靠报告页数/帧数的格式生效。当前 PDF 不引入 PDF
parser，`pageCount` 必须保持 `null` 并记录 `processing/page-count-unsupported`，不得伪造为
1 或声称已验证页数上限。多页/动画且 decoder 能可靠报告时只处理第一个主画面；超过限制
终止解码并记录稳定 terminal failure。

进程启动时生成 capability report，明确当前镜像是否支持 HEIC/HEIF pixel decode。存在
`heif` metadata 字段不等于支持 HEVC 解码，禁止按扩展名宣称支持。

## 9. Metadata、nullable 字段与 Provenance

Fragment 技术元数据字段按能力可空：

```json
{
  "format": "pdf",
  "width": null,
  "height": null,
  "orientation": null,
  "pageCount": null,
  "cameraMake": null,
  "cameraModel": null,
  "lensModel": null,
  "focalLengthMm": null,
  "apertureFNumber": null,
  "isoEquivalent": null,
  "exposureTimeSeconds": null,
  "metadataStatus": "partial",
  "warningCodes": ["processing/page-count-unsupported"],
  "processorVersion": "v1"
}
```

只读取严格白名单。禁止保存完整 EXIF、MakerNote、XMP、MPF、embedded thumbnail、设备序列号
或未知 tag。

ExifReader 固定采用：

```text
local temp path input
length='auto'
expanded=true
includeOffsets=true
strict includeTags
exclude makerNotes / mpf / thumbnail / xmp / icc
decompress.maxDecompressedSize=16 MiB
```

精确 option 以锁定版本 compatibility test 为准。`length='auto'` 不能替代 hard byte、像素和
deadline 限制。adapter 必须把第三方 parser warning 转换为稳定 warning code；不得把原始
metadata、文件内容或第三方异常直接写入应用日志。

EXIF 时间 Provenance value：

```json
{
  "localDateTime": "2024-10-12T08:42:00",
  "offsetMinutes": null,
  "zoneId": null
}
```

没有 offset 时不附加 `Z`、不转换 UTC、不使用服务器时区猜测，status 为 `unresolved`。有
明确 offset 才能计算 instant，仍保持 `suggested`，等待后续 resolver 或用户确认。

GPS 写 `sourceType=gps`、status=`suggested`，不覆盖 Source Descriptor。Module 4 只在对应
fact 不存在或已由同一 processor/source revision 拥有时更新；遇到其他来源或用户状态时保留
原值，并在 technical metadata 中保留新白名单 hint 与 conflict warning，后续 Place/Time
resolver 负责合并。

## 10. Image safety 与 dHash-v1

Sharp 初始化必须使用：

```text
limitInputPixels=60,000,000
failOn='error'
pages=1
```

在解码前检查 reported width、height、pages/frames；未知保持 null。不得一次解码全部多页或
动画帧。

`dhash-v1` 固定算法：

1. 应用 EXIF orientation；
2. alpha 合成到 `#ffffff`；
3. 转为灰度；
4. 显式使用 `lanczos3` resize 到 `9×8`；
5. row-major 比较每行相邻 8 组像素；
6. `left > right` 写 bit 1；
7. 第一组比较为最高位；
8. 输出 16 字符小写 hex；
9. 切为 8 个带位置前缀的 8-bit bands：`0:ff` 到 `7:ff`。

汉明距离使用 64-bit XOR popcount。Near threshold 固定为 `distance <= 6`。8 个同位置 band
保证距离不超过 7 时至少存在一个完全相等的 8-bit band；4 个 16-bit band 不提供这一召回
保证，因此不采用。

## 11. Derivative identity、创建与复用

缩略图固定：

```text
auto orientation
最长边 512px
不放大
fit=inside
WebP quality=82
strip nonessential metadata
```

路径：

```text
users/{ownerId}/derived/{fragmentId}/
deterministic-media/v1/{inputHash}/thumbnail.webp
```

创建使用 `ifGenerationMatch: 0`。成功后保存：

```text
path
generation
metageneration
contentType
sizeBytes
crc32c
width
height
```

对象 custom metadata：

```text
ownerId
fragmentId
processorName
processorVersion
inputHash
```

收到 `412 Precondition Failed`：

```text
读取 live object metadata
→ custom metadata 全部匹配
→ generation/metageneration/contentType/size/crc32c/尺寸合法
→ 复用

任一不匹配
→ processing/derivative-conflict
→ 不覆盖
```

若实例在 Storage 创建后、Firestore terminal transaction 前退出，重试通过确定性 path 和
metadata 校验复用已存在对象。

## 12. Exact duplicate：owner-scoped ContentHash

路径：

```text
users/{ownerId}/contentHashes/{sha256}
```

结构：

```json
{
  "algorithm": "sha256",
  "algorithmVersion": "v1",
  "canonicalFragmentRef": {"type": "fragment", "id": "frag_first"},
  "fragmentCount": 2,
  "createdAt": "...",
  "updatedAt": "..."
}
```

transaction 规则：

```text
index 不存在
→ 当前 Fragment 成为 canonical

index 已存在
→ 读取 canonical ref
→ deterministic exact candidate
→ fragmentCount + 1

Fragment 已登记相同 hash
→ 不重复 fragmentCount，不重复 candidate
```

两个相同文件并发处理时，Firestore transaction retry 决定唯一 canonical。transaction body
只允许 Firestore reads/writes；禁止 Storage、临时文件和进程副作用。

## 13. DuplicateCandidate 角色与 deterministic identity

路径：

```text
users/{ownerId}/duplicateCandidates/{candidateId}
```

Exact candidate：

```json
{
  "id": "dup_...",
  "ownerId": "uid",
  "kind": "exact",
  "canonicalFragmentRef": {"type": "fragment", "id": "frag_existing"},
  "candidateFragmentRef": {"type": "fragment", "id": "frag_new"},
  "pairRefs": [
    {"type": "fragment", "id": "frag_existing"},
    {"type": "fragment", "id": "frag_new"}
  ],
  "algorithm": "sha256",
  "algorithmVersion": "v1",
  "distance": 0,
  "createdByTaskId": "task_...",
  "status": "suggested",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Near candidate：

```json
{
  "id": "dup_...",
  "ownerId": "uid",
  "kind": "near",
  "queryFragmentRef": {"type": "fragment", "id": "frag_query"},
  "matchedFragmentRef": {"type": "fragment", "id": "frag_match"},
  "pairRefs": [
    {"type": "fragment", "id": "frag_match"},
    {"type": "fragment", "id": "frag_query"}
  ],
  "pairKey": "pair_...",
  "algorithm": "dhash",
  "algorithmVersion": "v1",
  "distance": 4,
  "rank": 1,
  "createdByTaskId": "task_...",
  "status": "suggested",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`pairRefs` 永远按 Fragment ID 排序；`rank` 只相对于 `queryFragmentRef`。Near candidate 是
方向性 query observation，因此 ID 固定为：

```text
sha256(kind|algorithmVersion|queryFragmentId|matchedFragmentId)
```

`pairKey` 则使用排序后的 pair，供后续 Inbox/merge 视图聚合。这样反向 query 不会覆盖另一
方向的 rank 语义。

Exact ID：

```text
sha256(kind|algorithmVersion|canonicalFragmentId|candidateFragmentId)
```

所有 candidate 只在 owner scope 内。禁止自动删除、合并、覆盖、跨用户索引或向用户泄漏
其他账户存在相同内容。

## 14. Near candidate 的确定查询

固定流程：

1. 仅查询 `users/{ownerId}/fragments`；
2. 使用带位置前缀的 `perceptualHashBands array-contains-any`；
3. Firestore adapter 显式按 document ID 升序查询；Memory adapter 使用同一排序；
4. 由 Repository 对 band 命中去重并排除 query Fragment；
5. 按 `fragmentId ASC` 建立稳定候选序列，最多对前 200 条做精确距离计算；adapter 可以额外
   读取第 201 条候选以判断截断，但不得计算其距离或把它加入结果；
6. 对每条计算 64-bit 精确 Hamming distance；
7. 丢弃 distance > 6；
8. 按 `distance ASC, fragmentId ASC`；
9. 取前 5 并设置 rank 1–5。

达到 scan cap 时记录 `processing/near-scan-truncated` warning，任务仍可成功。Memory 与
Firestore adapter 必须返回相同稳定结果；不得依赖 Firestore 未指定的自然顺序。

## 15. Fragment 当前结果

Fragment 只保存当前查询和展示所需结果，不复制完整 Task：

```json
{
  "hashes": {
    "sha256": "...",
    "perceptualHash": "...",
    "perceptualHashAlgorithm": "dhash",
    "perceptualHashVersion": "v1",
    "perceptualHashBands": [
      "0:0f", "1:1e", "2:a2", "3:03",
      "4:91", "5:7c", "6:40", "7:ee"
    ]
  },
  "technicalMetadata": {},
  "derivatives": {
    "thumbnail": {
      "path": "...",
      "generation": "...",
      "metageneration": "...",
      "contentType": "image/webp",
      "sizeBytes": 48291,
      "crc32c": "...",
      "width": 512,
      "height": 384
    }
  },
  "processing": {
    "deterministic": {
      "taskId": "task_...",
      "processorName": "deterministic-media",
      "processorVersion": "v1",
      "state": "succeeded",
      "metadataStatus": "complete",
      "thumbnailStatus": "complete",
      "perceptualHashStatus": "complete",
      "updatedAt": "..."
    }
  }
}
```

各可选字段必须在 schema 中显式 nullable，不能用空字符串、0 或 1 伪装未知。Task running 时
Fragment status=`processing`；成功后 status=`unresolved`，等待 Place/OCR/用户判断；terminal
processing failure 才设 status=`failed`。

## 16. ImportBatch 版本化处理摘要与计数

```json
{
  "processingSummary": {
    "deterministic": {
      "processorName": "deterministic-media",
      "processorVersion": "v1",
      "eligible": 5,
      "running": 1,
      "succeeded": 3,
      "failedRetryable": 1,
      "failedTerminal": 0,
      "unsupportedCapabilities": 2,
      "updatedAt": "..."
    }
  }
}
```

计数 identity 是：

```text
fragmentId + processorName + processorVersion
```

transaction 根据 Task 旧状态与新状态移动计数，不能盲目 increment。重试、transaction 重跑和
task reclaim 不得重复累加。未来启用新 processor version 时必须显式初始化该版本摘要；旧版
Task 迟到完成不能修改当前版本 summary，也不能污染顶层 counters。

`unsupportedCapabilities` 的单位固定为当前 active processor name/version 下所有 eligible
Fragment 的 unsupported capability outcome 数，而不是失败 Fragment 数；一个 Fragment 可以
贡献多个 unsupported outcome。transaction 依据该 Task 的旧、新 capability status 差量移动，
不得因重试重复累加。

内部失败分开：

- upload terminal failures：由 manifest item state=`failed` 推导；
- deterministic terminal failures：由当前 processor name/version 的 Task 推导；
- unsupported capability：只进入 capability 统计，不进入失败。

这两类失败的权威内部计数分别保留在 upload manifest/counters 与
`processingSummary.deterministic.failedTerminal`；禁止用单一内部 `failed` 数互相覆盖。

若保留顶层 `counters.failed`，其语义固定为去重后的失败原件数：

```text
count(unique fragmentId in upload failures ∪ active deterministic terminal failures)
```

其他顶层 counters：

- `saved`：成功保存原件数；
- `processed`：当前 deterministic name/version succeeded Fragment 数；
- `needsReview`：当前版本成功处理且至少有一个 duplicate candidate 的 Fragment 数。

状态转换：

| 条件 | batch.status |
|---|---|
| 仍有 pending upload | `open` |
| 上传已收敛，active deterministic 未全部终态 | `processing` |
| 所有 eligible Fragment active deterministic 成功且无 upload failure | `completed` |
| active deterministic 已终态但存在 upload/process terminal failure | `completed_with_errors` |
| 所有原件 upload terminal failure | `failed` |

`unsupported` 不影响成功状态。

## 17. Repository transaction 边界

Repository 增加独立 ports：

```text
claimProcessingTask(uid, claim)
heartbeatProcessingTask(uid, heartbeat)
checkpointProcessingHash(uid, checkpoint)
registerContentHash(uid, registration)
findNearDuplicateInputs(uid, query)
completeDeterministicProcessing(uid, completion)
failDeterministicProcessing(uid, failure)
```

推荐 transaction 切分：

1. claim transaction：Task + Fragment processing/running + batch running summary；
2. hash registration transaction：Task checkpoint + Fragment sha + ContentHash + exact candidate；
3. terminal transaction：Task terminal + Fragment current outputs + near candidates + versioned batch
   summary/counters；
4. retryable failure transaction：只更新持有 lease 的 Task 和 batch versioned summary；
5. terminal failure transaction：Task + Fragment failed + batch summary/counters。

Storage derivative 创建不在 Firestore transaction 中。所有 transaction body 只做 Firestore
reads/writes；外部调用必须在 transaction 之前完成。

Terminal transaction 失败时 Task 仍非终态，handler 返回 `503`。重投后通过 task checkpoint、
确定性 derivative path 和 candidate ID 恢复。

## 18. HTTP、错误与 Cloud Tasks 迁移门槛

| 情况 | 持久化结果 | HTTP |
|---|---|---:|
| 本请求完成 | succeeded | 204 |
| 已成功 | succeeded no-op | 204 |
| 已 terminal failure | failed_terminal no-op | 204 |
| 暂时性 Storage/Firestore 错误 | failed_retryable | 503 |
| soft timeout | failed_retryable | 503 |
| 其他 execution 持有有效 lease | 不变 | 503 |
| stale lease | running/reclaimed | 继续执行 |
| unsupported capability | succeeded + warning | 204 |
| derivative metadata conflict | failed_terminal | 204，安全日志 |

`Retry-After` 可以作为提示返回，但 Eventarc 正确性只依赖非 2xx acknowledgement 和其重投
策略，不依赖该 header。

稳定错误码：

```text
processing/task-busy
processing/soft-timeout
processing/storage-unavailable
processing/repository-unavailable
processing/media-limits-exceeded
processing/invalid-media
processing/derivative-conflict
```

响应与日志不包含原件、完整 EXIF、文件名、Source Descriptor、token、临时路径、完整 object
path 或 provider 原始异常。

满足任一条件重新评估 Cloud Tasks：

- 加入 OCR、Gemini、Places 或其他外部网络调用；
- p95 deterministic processing 超过 60 秒；
- soft-timeout 或内存失败超过 1%；
- 需要 ingestion concurrency >1；
- 需要延迟、限速、人工单项重跑或不同步骤重试；
- Eventarc 重投不足以支撑恢复；
- 需要独立 worker 扩缩容。

迁移后：

```text
Eventarc handler
→ ensure task
→ dispatch taskId
→ 204

Cloud Tasks worker
→ claim task
→ execute the same deterministic pipeline
```

## 19. Security Rules

Firestore：

- Fragment、ImportBatch、DuplicateCandidate：owner 可读，客户端不可写；
- ProcessingTask、ContentHash：客户端不可读写；
- 其他路径继续 deny by default。

Storage：

- original 规则保持不变；
- `users/{uid}/derived/**`：owner 可读；
- 客户端 create/update/delete 全部拒绝；
- ingestion Admin identity 才能创建派生对象。

Hash、band 和 duplicate 查询永远限制在 owner scope。不得建立全局 SHA/perceptual index，不得
让用户根据响应探测其他账户是否拥有相同文件。

## 20. 依赖、成本与构建边界

新增运行时依赖只允许：

- `sharp`：受限像素解码、orientation、WebP thumbnail、dHash raw pixels；
- `exifreader`：白名单 EXIF/GPS/HEIC metadata。

实施计划阶段必须锁定精确版本，验证 Node 22、macOS ARM64、本地测试和 Cloud Run Linux
x86_64 image，并执行 dependency audit。不得加入独立 dHash、hash、PDF 或 HEIC 付费转换库。

Module 4 无外部付费 API。主要单位成本来自一次原件读取、最多一次 derivative create、数次
Firestore transaction/query 和 Cloud Run CPU/内存。不得在设计文档承诺永久固定调用次数或
费用；在 dev deployment 通过 metrics 验证。

## 21. TDD 验证矩阵

### 21.1 Domain 与 config

- taskId canonical tuple 与 inputHash 分离；
- ProcessingTask 严格状态、时间、lease 和 step 不变量；
- runtime timeout/lease/cleanup margin 配置关系；
- Fragment nullable technical metadata 与 capability status；
- versioned processingSummary 与去重失败计数；
- DuplicateCandidate exact/near role、pairRefs、pairKey、directional rank。

### 21.2 Task 与 Repository

- create claim、retryable claim、active lease busy、stale reclaim、terminal no-op；
- 只有当前 lease owner 可以 heartbeat/checkpoint/terminal；
- transaction retry 不重复 summary、hash count 或 candidate；
- 两个相同文件并发只产生一个 owner-scoped canonical ContentHash；
- 新 processor version 不污染旧版计数；
- terminal transaction 失败返回 retryable，不能确认事件。

### 21.3 Materializer、metadata 与 media safety

- generation-pinned read、size hard cap、abort、deadline 和 finally cleanup；
- 临时路径不含原始文件名且权限正确；
- EXIF 有 offset、无 offset、GPS 和 HEIC metadata golden fixtures；
- PDF pageCount=null + page-count-unsupported；
- text SHA/UTF-8，无 derivative；
- pixel/width/height/page/decompressed metadata limits；
- startup HEIC capability report 不虚报 decode。

### 21.4 dHash、near query 与 derivative

- orientation、alpha white、lanczos3、bit order、hex 和 8 bands golden vectors；
- Hamming threshold 6；
- band result 去重、排除自身、fragmentId stable scan 200、distance/id sort、top 5；
- query/matched/pairRefs/rank 语义；
- derivative first create、412 reuse、generation/metageneration/custom metadata mismatch conflict。

### 21.5 Integration、Rules 与 Emulator

- Module 3 duplicate 后 Module 4 仍执行；
- active lease 503、stale lease resume、soft timeout 503；
- only terminal persisted -> 204；
- owner 可读 derived/candidate，其他用户拒绝；
- client 不能读 ProcessingTask/ContentHash，不能写任何 derived；
- Auth + Firestore + Storage Emulator：upload → finalize → processing → thumbnail → receipt；
- 并发相同文件产生一个 canonical index 和确定性 exact candidate；
- ordinary tests、Emulator tests、Docker Linux smoke、`npm audit --omit=dev`、
  `git diff --check` 全部通过。

## 22. 明确不包含

- OCR、Document AI、Gemini visual understanding；
- Places、Time Zone API、地点或旅程消歧；
- Visit/Scene/Connection/Discovery；
- 用户确认 duplicate 的写 API、自动 merge/delete；
- PDF 页面解析或 PDF thumbnail；
- 保证 HEIC/HEIF pixel decode；
- AVIF、audio 或 location export；
- Cloud Tasks、Pub/Sub、Cloud Run 实际部署；
- malware scanning、完整媒体解码验证或内容安全分类。

## 23. 完成定义与停止边界

Module 4 只有同时满足以下条件才完成：

- 设计规格和详细 TDD 计划分别提交；
- 每个生产行为都出现原因正确的 RED；
- memory 与 Firestore adapters 运行相同 task/repository contracts；
- media safety、dHash、capability、lease 和并发 hash index 测试通过；
- 完整 Auth + Firestore + Storage Emulator 闭环 0 fail、环境内 0 skip；
- Docker Linux capability smoke 明确报告 HEIC decode 能力；
- `npm test` 0 fail；
- `npm audit --omit=dev` 0 vulnerabilities；
- production route/helper scan 无测试 route；
- `git diff --check` 无输出；
- commit chain 可逐阶段回滚，worktree 干净；
- 文档只描述实际实现和验证结果。

完成后停止。不得自行进入 Module 5 OCR + Multimodal Adapters。

## 24. 平台依据

- [Eventarc retry and at-least-once delivery](https://cloud.google.com/eventarc/docs/retry-events)
- [Cloud Run request timeout](https://cloud.google.com/run/docs/configuring/request-timeout)
- [Cloud Run container filesystem and memory](https://cloud.google.com/run/docs/container-contract)
- [Firestore transaction retries](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Cloud Storage request preconditions](https://cloud.google.com/storage/docs/request-preconditions)
- [Node.js streaming Hash](https://nodejs.org/api/crypto.html)
- [Sharp installation and prebuilt input formats](https://sharp.pixelplumbing.com/install/)
- [Sharp input metadata](https://sharp.pixelplumbing.com/api-input/)
- [ExifReader usage and metadata limits](https://github.com/mattiasw/ExifReader)
