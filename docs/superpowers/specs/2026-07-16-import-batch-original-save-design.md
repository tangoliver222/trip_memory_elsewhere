# Elsewhere Module 3 — Import Batch + Original Save 设计

**日期：** 2026-07-16

**状态：** 已冻结，等待实施计划

**上位依据：**

- `docs/superpowers/specs/2026-07-16-elsewhere-backend-program-design.md`
- `docs/superpowers/specs/2026-07-16-auth-boundary-design.md`
- `docs/Elsewhere_PRD_v3.0.md`
- `docs/Elsewhere_Google_First_Technical_Architecture_v1.0.md`

## 1. 结论

Module 3 建立第一个受保护业务闭环：服务端创建有界 ImportBatch 和不可猜测上传清单，
客户端使用 Firebase Storage SDK 直接 resumable upload，Storage Rules 只允许清单内对象首次
创建，IAM 保护的 ingestion service 接收 Storage finalized CloudEvent，重新验证实际对象并在
Firestore transaction 中幂等创建 Fragment 和更新最小回执。

本模块坚持“原件先保存、来源不丢失、提示不冒充事实”。它保存原始字节、Storage 权威事实
和来源阶段提供的稳定信息，但不在本模块执行 EXIF、OCR、地点、场景、连接或 AI 推理。

## 2. 已比较方案

### 2.1 上传传输

采用 Firebase Storage SDK 直传。API 只创建批次和返回 Storage 路径，文件字节不经过
Cloud Run。相比签发 resumable URL，它不需要额外签名凭据和 URL 生命周期；相比 Cloud Run
代理上传，它避免 API 带宽、内存和超时成本。

### 2.2 上传意图持久化

采用 ImportBatch 内的有界预分配 map。单批最多 50 项，map 足够小，可被 Storage Rules
用一次 Firestore 文档读取校验。拒绝独立 upload-intents 子集合，因为当前规模不值得增加
领域对象与读写；拒绝只信任 owner path，因为客户端会绕过批次数量和服务端 ID。

### 2.3 ingestion 部署边界

采用同一代码包、同一容器镜像、两个 composition root 和两个 Cloud Run service。用户 API
需要浏览器可达后再验证 Firebase Token，而 Eventarc receiver 必须由 Cloud Run IAM 阻止匿名
调用；Cloud Run invoker 是 service-level 边界，不能靠同一公开 service 中的不同路径安全隔离。

```text
same package / same image
  ├─ elsewhere-api
  │    public transport
  │    Firebase ID Token + App Check + allowedAppIds
  │    Import API only
  └─ elsewhere-ingestion
       private Cloud Run IAM
       Eventarc service account is the only run.invoker
       Storage finalized receiver only
```

两个 service 部署时使用不同 runtime service account 和不同 Cloud Run IAM policy。两者均
保持 min instances=0；实际资源创建属于 Module 10 Dev Deployment，不在 Module 3 执行。

## 3. 固定范围

### 3.1 包含

- `POST /v1/import-batches` 创建 owner-scoped 批次和上传清单；
- `GET /v1/import-batches/:batchId` 返回 owner-scoped 最小回执；
- 两个路由都显式挂载 Module 2 `requireAuth`；
- 单批 1–50 个原件，单对象最大 50 MiB；
- 服务端生成 batchId、fragmentId 和 exact originalPath；
- Source Descriptor v1；
- ImportBatch upload manifest、uploadStatus 和严格状态转换；
- Storage Rules 跨 Firestore 校验预分配项；
- Storage object inspector port 与 Firebase Admin Storage adapter；
- production ingestion CloudEvent receiver；
- Firestore transaction 幂等创建 Fragment、更新 item 和批次计数；
- memory / Firestore contract、Fastify integration 和 Emulator 完整闭环测试；
- 稳定 API / ingestion 错误契约和脱敏日志边界。

### 3.2 明确不包含

- 前端上传 UI 或 Firebase 客户端接线；
- iOS app、Share Extension 或 Apple Notes 原生接入；
- 从 EXIF/XMP 生成 facts；
- OCR、Gemini、Places、地图、时间地点消歧；
- SHA-256、感知哈希、重复识别、缩略图或预览；
- Cloud Tasks、Pub/Sub 业务编排；
- Terraform、Eventarc trigger 或 Cloud Run 实际部署；
- signed URL 或 Cloud Run 文件代理；
- 取消、删除、替换、覆盖或恢复已上传原件；
- 限流、每日配额、病毒扫描或恶意内容扫描；
- Import Receipt 的城市、旅程、地点、连接或发现结果；
- Module 4 Deterministic Processing 的任何代码。

## 4. API 契约

### 4.1 创建批次

```text
POST /v1/import-batches
Authorization: Bearer <Firebase ID Token>
X-Firebase-AppCheck: <App Check Token>
```

严格请求：

```json
{
  "items": [
    {
      "sourceType": "photo",
      "declaredContentType": "image/jpeg",
      "declaredSizeBytes": 2841930,
      "source": {
        "schemaVersion": 1,
        "provider": "local_file",
        "importMethod": "file_picker",
        "providerItemId": null,
        "originalName": "IMG_1842.JPG",
        "sourceCreatedAt": null,
        "sourceModifiedAt": "2026-07-12T10:22:14Z",
        "timezoneOffsetMinutes": 420,
        "locationHint": null,
        "media": { "width": 4032, "height": 3024 },
        "providerMetadata": {}
      }
    }
  ]
}
```

客户端不能提供或覆盖 uid、ownerId、batchId、fragmentId、originalPath、allowedContentTypes、
maxBytes、state、generation 或 counters。未知字段一律拒绝。

成功返回 HTTP `201`：

```json
{
  "batch": {
    "id": "batch_...",
    "status": "open",
    "uploadStatus": "pending",
    "inputCount": 1,
    "counters": {
      "saved": 0,
      "processed": 0,
      "failed": 0,
      "needsReview": 0
    }
  },
  "uploads": [
    {
      "fragmentId": "frag_...",
      "originalPath": "users/uid/originals/batch_.../frag_...",
      "allowedContentTypes": [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif"
      ],
      "maxBytes": 52428800
    }
  ]
}
```

ID 使用 Node `crypto.randomUUID()` 加稳定前缀生成，不新增 ID 依赖。

### 4.2 最小回执

```text
GET /v1/import-batches/:batchId
```

成功返回 HTTP `200`：

```json
{
  "id": "batch_...",
  "status": "processing",
  "uploadStatus": "complete",
  "inputCount": 1,
  "counters": {
    "saved": 1,
    "processed": 0,
    "failed": 0,
    "needsReview": 0
  },
  "items": [
    {
      "fragmentId": "frag_...",
      "sourceType": "photo",
      "state": "finalized"
    }
  ]
}
```

回执不返回完整 Source Descriptor、providerItemId、originalName、Storage checksum、token、
临时 URL 或内部 failure detail。已验证 uid 的 owner scope 内不存在批次时返回同一个
`404 import/batch-not-found`；不能由响应区分“其他用户所有”和“根本不存在”。

## 5. Source Descriptor v1

### 5.1 目标

每个 Fragment 同时保留：原件、来源、来源当时提供的稳定信息和明确缺失项。来源提示不是
confirmed fact；Module 4 后续把 EXIF/GPS 等转换为字段级 Provenance，并保留冲突。

### 5.2 公共字段

```text
schemaVersion: 1
provider: local_file | device_camera | google_photos | pasted_text
importMethod: file_picker | camera_capture | google_photos_picker | paste
providerItemId: string | null
originalName: string | null
sourceCreatedAt: RFC 3339 | null
sourceModifiedAt: RFC 3339 | null
timezoneOffsetMinutes: integer[-840, 840] | null
locationHint: { lat, lng, accuracyMeters, source } | null
media: { width, height } | null
providerMetadata: strict provider-specific object
```

`providerItemId` 和 `originalName` 只保存在 owner-scoped Firestore；它们不能用于 Storage
路径、日志或错误响应。OAuth token、Picker session、cookie、临时 base URL、下载 URL 和
访问凭据禁止持久化。

### 5.3 当前 provider snapshot

- `local_file`：originalName、MIME、size、file modified time 和可用 dimensions；文件修改
  时间不得冒充拍摄时间。
- `device_camera`：明确的 capture time、device timezone；只有在相机捕获时获得授权的定位
  才能标记为 `camera_device` location hint。
- `google_photos`：persistent item ID、createTime、MIME、dimensions、camera make/model、
  focal length、aperture、ISO 和 exposure time 的稳定白名单；不保存临时 base URL。
- `pasted_text`：可选 title 和客户端创建时间；正文自身编码为 UTF-8 `text/plain` 原件，
  不复制进 Source Descriptor。

未来 `apple_notes`、Notion、Keep、邮件、GPX/KML 等来源通过新的严格 provider schema 或
schemaVersion 扩展，不在 v1 接受 arbitrary provider JSON。Apple Notes 当前可通过复制文本
或导出文件进入；原生 Share Extension 以后仍复用同一 Source Descriptor。

## 6. 每项上传策略

服务端根据 `sourceType` 生成 `allowedContentTypes` 和 `maxBytes`；客户端声明不能扩大策略。

| sourceType | allowedContentTypes | maxBytes | finalize format check |
|---|---|---:|---|
| `photo` | JPEG, PNG, WebP, HEIC, HEIF MIME | 50 MiB | 对应文件签名 |
| `screenshot` | JPEG, PNG, WebP, HEIC, HEIF MIME | 50 MiB | 对应文件签名 |
| `receipt` | 上述图片 MIME + PDF | 50 MiB | 图片或 PDF 签名 |
| `ticket` | 上述图片 MIME + PDF | 50 MiB | 图片或 PDF 签名 |
| `menu` | 上述图片 MIME + PDF | 50 MiB | 图片或 PDF 签名 |
| `text` | `text/plain` | 50 MiB | 流式严格 UTF-8 |

`audio` 在 Module 3 拒绝。Storage Rules 校验 exact path、item state、contentType membership
和 `request.resource.size <= maxBytes`。这只是上传前边界；Content-Type 是可由上传方设置的
对象 metadata，不是文件真实性证明。

## 7. ImportBatch 与 Fragment

### 7.1 ImportBatch

```json
{
  "id": "batch_...",
  "ownerId": "uid",
  "schemaVersion": 1,
  "status": "open",
  "uploadStatus": "pending",
  "inputCount": 1,
  "counters": {
    "saved": 0,
    "processed": 0,
    "failed": 0,
    "needsReview": 0
  },
  "uploads": {
    "frag_...": {
      "fragmentId": "frag_...",
      "sourceType": "photo",
      "state": "pending",
      "originalPath": "users/uid/originals/batch_.../frag_...",
      "declaredContentType": "image/jpeg",
      "declaredSizeBytes": 2841930,
      "allowedContentTypes": ["image/jpeg", "image/png"],
      "maxBytes": 52428800,
      "source": {},
      "finalizedGeneration": null,
      "failureCode": null
    }
  },
  "createdAt": "...",
  "updatedAt": "...",
  "deletedAt": null
}
```

`uploads` 的 key、fragmentId 和 path 必须一致；大小为 1–50；inputCount 必须等于 key 数；
counters 不能超过 inputCount。客户端只能读取自己的 batch，不能创建、修改或删除 batch、
uploads、state、generation、约束、计数器或服务端派生字段。

### 7.2 固定状态转换

```text
存在 pending item
  uploadStatus=pending
  batch.status=open

全部成功
  uploadStatus=complete
  batch.status=processing

部分成功
  uploadStatus=complete_with_errors
  batch.status=processing

全部失败
  uploadStatus=complete_with_errors
  batch.status=failed
```

`processing` 只表示存在已保存原件并等待后续处理；`counters.processed` 在 Module 3 始终为
0。暂时性 finalize 错误不把 item 变为 failed；它保持 pending 等待 Eventarc 重试。永久格式、
完整性或约束错误以同一 transaction 把 item 标记为 failed，并只增加一次 failed counter。

### 7.3 Fragment

成功 finalize 创建：

```json
{
  "id": "frag_...",
  "ownerId": "uid",
  "batchId": "batch_...",
  "type": "photo",
  "status": "uploaded",
  "storage": {
    "originalPath": "users/uid/originals/batch_.../frag_...",
    "generation": "174...",
    "contentType": "image/jpeg",
    "sizeBytes": 2841930,
    "crc32c": "...",
    "md5Hash": null
  },
  "source": {},
  "hashes": {},
  "facts": {},
  "journeyId": null,
  "sceneId": null,
  "placeId": null
}
```

storageFacts 中 `generation`、`sizeBytes`、`crc32c` 必填；`md5Hash` 可为空，合法对象不能因
缺少 MD5 被拒绝。Source Descriptor 从 manifest 复制到 Fragment，使 Fragment 不依赖批次
才能解释来源。`facts` 保持空对象。

## 8. Storage Rules

对象路径固定为：

```text
users/{uid}/originals/{batchId}/{fragmentId}
```

create 必须同时满足：

1. `request.auth != null`；
2. `request.auth.uid == uid`；
3. 对应 `users/{uid}/importBatches/{batchId}` 存在；
4. `fragmentId` 是 batch.uploads 的 key；
5. item.state 是 `pending`；
6. request path 等于 item.originalPath；
7. request contentType 位于 item.allowedContentTypes；
8. request size 不超过 item.maxBytes；
9. 当前对象不存在，仅允许 create。

update、delete 和其他路径全部拒绝。Storage Rules evaluation 只读取一个 ImportBatch 文档；
每个独立对象 create 估算一次规则侧 Firestore document read，单批最多约 50 次。resumable
upload 的实际底层 evaluation 和计费以 Emulator、staging metrics 与账单为准，不写成永久
次数承诺。

Cloud Storage App Check 不由 Module 2 自定义 API boundary 代替。开发与测试使用 Auth +
Rules Emulator；staging 先观察 App Check metrics；production 确认合法客户端无异常后启用
Cloud Storage App Check enforcement。

## 9. finalized CloudEvent 与对象检查

### 9.1 receiver 边界

`elsewhere-ingestion` 只注册 production Storage finalized receiver。Cloud Run 禁止匿名调用，
Eventarc trigger service account 是唯一 `run.invoker`。receiver 不挂 Firebase `requireAuth`，
而依赖 Cloud Run IAM，并在应用内继续校验：

- CloudEvent type 必须是 `google.cloud.storage.object.v1.finalized`；
- source 必须匹配允许的 Storage source；
- bucket 必须位于环境 allowlist；
- object name 必须严格匹配 owner/batch/fragment path；
- generation 必须存在；
- data bucket/name/generation 与 envelope 不矛盾。

测试 composition 可注入 CloudEvent 到 ingestion app，但不能在 `elsewhere-api` 或 production
API composition 注册绕过 IAM 的测试 route。IAM 本身属于 Cloud Run 平台行为，Module 3
本地测试只证明 composition 隔离；真实未经 IAM 调用被平台拒绝是 Module 10 部署验收项。

### 9.2 metadata-first、generation-pinned inspection

对象 inspector 固定顺序：

1. 按 bucket、objectName、generation 获取 object metadata；
2. 检查 generation、size、crc32c、contentType 和 manifest 约束；
3. 仅在 metadata 合格后，按指定 generation 读取最少必要字节；
4. JPEG、PNG、WebP、HEIC/HEIF、PDF 只读取识别容器签名需要的前缀；
5. text/plain 使用流式 `TextDecoder(..., { fatal: true })` 验证完整 UTF-8，不把整个对象读入
   内存；
6. 返回 frozen storageFacts 和 detected format；
7. 不把字节、文件名、path 或 metadata 内容写入日志。

签名验证只证明格式合理并与 sourceType 兼容，不等于恶意内容扫描、完整图片解码或语义
解析。这些属于 Module 4 或后续安全模块。

## 10. 幂等 transaction

Eventarc 按至少一次、无顺序保证设计。固定幂等键：

```text
(bucket, objectName, generation)
```

成功 transaction：

```text
read owner-scoped batch and fragment
verify upload item and exact path

same path + same finalizedGeneration already recorded
  -> outcome=duplicate
  -> success no-op

same path + different generation
  -> ingestion/original-conflict

fragment absent + item pending
  -> create uploaded Fragment with storageFacts and Source Descriptor
  -> item.state=finalized
  -> item.finalizedGeneration=generation
  -> counters.saved += 1 exactly once
  -> derive uploadStatus and batch.status
```

永久拒绝 transaction 同样记录 generation，把 item 设为 failed、写稳定 failureCode 并只增加
一次 failed counter。同 generation 重放 N 次仍只有一个 Fragment 和一次计数。暂时性 Storage
读取、Firestore contention 或 unavailable 不写失败状态，直接抛出使 Eventarc 重试。

Storage Rules 禁止 overwrite；即便未来规则错误允许同名新 generation，handler 仍返回冲突，
绝不覆盖权威原件。

## 11. Repository 与 ports

通用 Repository 保留现有 owner-scoped create/get，并增加 Module 3 所需原子 port：

```text
finalizeOriginal(uid, validatedOriginal)
rejectOriginal(uid, rejectedOriginal)
```

两者在 memory adapter 和 Firestore adapter 运行同一套 contract。Firestore 实现必须使用单一
transaction 同时读写 batch 与 fragment，不能由 use case 先 create Fragment 再单独更新
counter。

对象 inspector port：

```text
inspectOriginal({ bucket, objectName, generation, expectedPolicy })
  -> { detectedFormat, storageFacts }
```

use case 只依赖 Repository 和 inspector ports。Firebase Admin Storage adapter 通过现有
`firebase-admin` 暴露的 Storage 能力实现，不新增运行时依赖。

## 12. 稳定错误和日志

### 12.1 用户 API

```text
400 import/invalid-request
404 import/batch-not-found
409 import/batch-conflict
500 internal/error
```

继续复用 Module 2 四种 `401`。所有响应 `requestId` 只使用服务端 Fastify `request.id`。原始
Zod、Firebase、Firestore、Storage 和 provider 错误不暴露。

### 12.2 ingestion

```text
ingestion/invalid-event
ingestion/unregistered-original
ingestion/invalid-original
ingestion/original-conflict
```

错误分类必须区分 permanent 与 retryable。日志只记录 requestId/eventId 的安全摘要、稳定
错误类别、hashed uid、batch/fragment ID 的不可逆摘要和延迟；禁止记录原件、Source
Descriptor、originalName、providerItemId、token、完整 object path、signed URL 或原始异常正文。

## 13. TDD 验证矩阵

1. Source Descriptor 四种当前 provider 均通过严格 schema，未知字段和凭据字段被拒绝；
2. 批次 1、常规数量和 50 项通过，0 与 51 项失败；
3. allowedContentTypes 与 maxBytes 由 sourceType 服务端生成；
4. 所有 ID 和 path 由服务端生成，客户端伪造 uid/path/id 无效；
5. 未经 Auth/App Check 时 use case、Repository 和 Storage 均不执行；
6. owner-scoped GET 对不存在和其他用户批次都返回相同 404；
7. 客户端不能创建、修改或删除 ImportBatch.uploads、计数和派生状态；
8. Storage Rules 拒绝跨用户、未登记 fragment、非 pending、错误 path、错误 MIME、超限、
   update、delete 和其他路径；
9. 上传声明 MIME 合法但实际 magic bytes 错误时不创建 Fragment；
10. generation、size、crc32c 缺任一项拒绝，缺 MD5 不拒绝；
11. finalize 验证非法 CloudEvent type、source、bucket、path 和 generation；
12. API composition 不暴露 ingestion receiver，ingestion composition 不暴露用户业务 API；
13. 同 generation 重放 N 次仍只有一个 Fragment 和一次 saved/failed 计数；
14. 同 path 不同 generation 返回 original-conflict；
15. 暂时性 finalize 失败保持 pending 并可重试，永久失败按冻结状态表收敛；
16. Fragment 保留 storageFacts 和完整 Source Descriptor，facts 为空且 processed 为 0；
17. Auth + Firestore + Storage Emulator 完整闭环通过：匿名登录、创建批次、SDK 直传、注入
    finalized CloudEvent、创建 Fragment、读取最小回执。

真实 Cloud Run IAM rejection 和 Cloud Storage App Check enforcement 不在 Emulator 中伪造；
它们作为 Module 10 staging/production deployment gate 保留。

## 14. 完成定义与停止边界

Module 3 只有同时满足以下条件才完成：

- 设计规格和详细 TDD 计划分别提交；
- 每个生产行为都先出现原因正确的 RED，再做最小 GREEN 和保持全绿的 REFACTOR；
- 每个阶段在相关完整测试通过后单独提交；
- Auth focused tests 0 fail；
- Import unit / contract / Fastify integration tests 0 fail；
- Auth + Firestore + Storage Emulator tests 0 fail；
- `npm test` 0 fail；
- `npm audit --omit=dev` 为 0 vulnerabilities；
- `git diff --check` 无输出；
- production API source 不包含 `/protected` 或测试 finalize route；
- package lock 没有非计划依赖变化；
- commit chain 可逐阶段回滚，worktree 干净；
- 实施记录只描述实际通过的命令和计数。

Module 3 完成后停止。不得自行进入 Module 4 Deterministic Processing，不得提前加入 EXIF、
SHA-256、缩略图、OCR、地点、连接或 AI 代码。

## 15. 平台依据

- [Firebase Storage resumable upload and metadata](https://firebase.google.com/docs/storage/web/upload-files)
- [Firebase Storage Rules conditions and Firestore access](https://firebase.google.com/docs/storage/security/rules-conditions)
- [Firebase App Check enforcement](https://firebase.google.com/docs/app-check/enable-enforcement)
- [Cloud Storage object metadata and generation](https://cloud.google.com/storage/docs/metadata)
- [Eventarc overview](https://cloud.google.com/eventarc/docs/overview)
- [Route Cloud Storage events to authenticated Cloud Run](https://cloud.google.com/eventarc/standard/docs/run/route-trigger-cloud-storage)
- [Cloud Run authentication overview](https://cloud.google.com/run/docs/authenticating/overview)
- [Google Photos Picker media item metadata](https://developers.google.com/photos/picker/reference/rest/v1/mediaItems)
- [Apple App Extension support](https://developer.apple.com/documentation/foundation/app-extension-support)
