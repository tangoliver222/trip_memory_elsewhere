# Elsewhere Import Batch + Original Save v1

**模块：** Module 3  
**状态：** 已实现并通过本地单元、集成、Rules 与 Firebase Emulator 验证  
**日期：** 2026-07-16

## 1. 已实现边界

Module 3 只建立“创建上传清单 → 客户端直传原件 → 校验 finalized 对象 → 幂等保存
Fragment → 读取最小回执”的闭环。

文件字节不经过 `elsewhere-api`。API 只创建 owner-scoped ImportBatch 和服务端控制的上传
清单；客户端通过 Firebase Storage SDK 直传；`elsewhere-ingestion` 接收 Storage finalized
CloudEvent，按指定 generation 检查对象，并在 Firestore transaction 中创建 Fragment 和更新
ImportBatch。

本模块不解析 EXIF，不执行 OCR、哈希、缩略图、地点/场景/连接推理或 AI 处理。

## 2. API 契约

两个业务路由只存在于 `ELSEWHERE_SERVICE_MODE=api` 的 composition：

```text
POST /v1/import-batches
GET  /v1/import-batches/:batchId
```

两者都要求：

```text
Authorization: Bearer <Firebase ID Token>
X-Firebase-AppCheck: <Firebase App Check Token>
```

ID Token 必须包含 uid；App Check token 的 `appId` 必须属于当前环境
`ELSEWHERE_ALLOWED_APP_IDS`。ownerId 只取冻结的服务端 `request.authContext.uid`，不信任请求
body、query 或 header 中的 owner/request ID。

### 2.1 创建 ImportBatch

请求是 strict JSON，包含 1–50 个 item：

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

客户端不能提供 `uid`、`ownerId`、batch/fragment ID、Storage path、policy、state、generation
或 counters。未知字段被拒绝。成功返回 `201`，只暴露最小 batch 状态及每项上传所需的
`fragmentId`、`originalPath`、`allowedContentTypes` 和 `maxBytes`。

### 2.2 最小回执

`GET /v1/import-batches/:batchId` 只返回 batch 状态、计数和每项的 `fragmentId`、
`sourceType`、`state`。完整 Source Descriptor、文件名、provider item ID、checksum 和内部失败
详情不会出现在回执中。

不存在的批次与其他 owner 的批次都返回相同的 `404 import/batch-not-found`。

### 2.3 稳定错误

| HTTP | code | 含义 |
|---:|---|---|
| 400 | `import/invalid-request` | strict request 或声明策略不合法 |
| 404 | `import/batch-not-found` | 当前 owner scope 中不存在 |
| 409 | `import/batch-conflict` | 服务端创建冲突 |
| 500 | `internal/error` | 已脱敏的未预期错误 |

此外保留四种稳定 `401`：`auth/missing-id-token`、`auth/invalid-id-token`、
`app-check/missing-token`、`app-check/invalid-token`。所有错误的 `requestId` 只来自 Fastify
`request.id`；原始 Zod、Firebase、Firestore、Storage 或 provider 错误不返回客户端。

## 3. Source Descriptor v1

当前只接受四组严格的 provider/importMethod 组合：

| provider | importMethod | 稳定来源信息 |
|---|---|---|
| `local_file` | `file_picker` | 文件名、修改时间、dimensions 等可用文件信息 |
| `device_camera` | `camera_capture` | 捕获时间、设备时区、获授权时的 camera location hint |
| `google_photos` | `google_photos_picker` | persistent item ID 与相机 metadata 白名单 |
| `pasted_text` | `paste` | 可选 title；正文作为 UTF-8 原件保存 |

通用字段保留原始名称、来源创建/修改时间、时区偏移、来源位置提示和 media dimensions；缺失
信息显式保存为 `null`。这些字段是来源提示，不会在 Module 3 中升级为 confirmed fact。

禁止保存 OAuth token、Picker session、cookie、临时 base/download URL、signed URL 或任何
访问凭据。`providerMetadata` 是 provider-specific strict object，不接受任意 JSON。

Apple Notes 等新来源尚未加入 v1。当前可通过 `pasted_text` 或未来受控导出进入；原生接入
必须新增严格 provider schema 或新 schemaVersion，不能复用开放 catch-all。

## 4. 服务端上传策略

所有策略按 `sourceType` 预分配，客户端不能扩展 MIME 或大小。

| sourceType | allowedContentTypes | maxBytes |
|---|---|---:|
| `photo`, `screenshot` | `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` | 50 MiB |
| `receipt`, `ticket`, `menu` | 上述图片 MIME + `application/pdf` | 50 MiB |
| `text` | `text/plain` | 50 MiB |

`audio` 不在 Module 3 范围内。

## 5. Storage path 与 Rules

每项 path 由服务端生成且固定为：

```text
users/{uid}/originals/{batchId}/{fragmentId}
```

Storage Rules 只允许 owner 首次 `create`，并通过一次 Firestore manifest 读取验证：batch 存在、
owner 匹配、fragment 已预分配、item 仍为 `pending`、path 完全相等、MIME 属于 item policy、
实际大小不超过 `maxBytes`。overwrite、update、delete 和其他路径全部拒绝。

Rules 的 MIME 检查只是上传边界，不证明字节格式真实；最终格式由 ingestion 重新校验。

## 6. Storage finalized 与对象校验

仅 `ELSEWHERE_SERVICE_MODE=ingestion` 注册：

```text
POST /events/storage-finalized
```

receiver 不使用浏览器 Firebase Auth。生产环境必须由 Cloud Run IAM 阻止匿名请求，只允许
Eventarc invoker。应用层继续严格验证单值 CloudEvent headers、事件 type、source、bucket
allowlist、object path 和 generation 一致性。

校验顺序固定：

1. 按 allowlisted bucket、exact objectName、指定 generation 获取 metadata；
2. 验证 generation、contentType、size、`crc32c` 和 manifest policy；
3. metadata 合格后才读取字节；
4. JPEG、PNG、WebP、HEIC/HEIF、PDF 只读取最多 32 字节签名前缀；
5. `text/plain` 用 fatal `TextDecoder` 流式验证完整 UTF-8，不做无界内存读取；
6. 验证格式与 `sourceType` 兼容后返回权威 Storage facts。

Fragment 的 `storage.generation`、`sizeBytes`、`crc32c` 必填；`md5Hash` 可为 `null`，不能因
缺少 MD5 拒绝合法对象。Source Descriptor 从 manifest 完整复制到 Fragment；`hashes` 和
`facts` 在本模块保持空对象。

文件签名只证明容器格式合理且与 sourceType 兼容，不代表恶意内容扫描、完整媒体解码或
语义解析。

## 7. 幂等、状态与失败处理

finalization 以 allowlisted bucket、exact manifest object path 和 generation 处理至少一次、
无序事件。同 path、同 generation 的重放返回成功 no-op；同 path、不同 generation 返回
`ingestion/original-conflict`，不会覆盖已保存原件。

成功与永久拒绝都通过 Firestore transaction 原子更新，保证同 generation 重放只创建一个
Fragment，并且 `saved` 或 `failed` 只增加一次。

| uploads 结果 | uploadStatus | batch.status |
|---|---|---|
| 仍有 pending | `pending` | `open` |
| 全部成功 | `complete` | `processing` |
| 部分成功 | `complete_with_errors` | `processing` |
| 全部失败 | `complete_with_errors` | `failed` |

`counters.processed` 在 Module 3 始终为 `0`。Storage/Firestore 暂时错误映射为 `503
internal/error`，不写失败状态，使 Eventarc 重试。永久格式、完整性或 policy 失败会记录稳定
failure code、把 item 标为 `failed`，receiver 对已收敛结果返回 `204`。

receiver 的外部状态为：合法的 applied/duplicate/rejected 结果返回 `204`；非法或未登记事件
返回 `400`；generation conflict 返回 `409`；暂时失败返回 `503`。响应同样只使用服务端
request ID 且不泄漏原件或 provider 信息。

## 8. 两个部署身份

同一 package 与容器镜像通过 `ELSEWHERE_SERVICE_MODE` 选择且只构建一棵依赖图：

```text
elsewhere-api
  browser reachable
  Firebase Auth + App Check + allowedAppIds
  API runtime service account
  Import Batch routes only

elsewhere-ingestion
  unauthenticated disabled
  Eventarc service account is the only run.invoker
  narrower ingestion runtime service account
  Storage finalized receiver only
```

部署时必须分别设置 `FIREBASE_PROJECT_ID`，以及 API 的 `ELSEWHERE_ALLOWED_APP_IDS` 或
ingestion 的 `ELSEWHERE_STORAGE_BUCKETS`。两个 Cloud Run service 必须使用不同 runtime
service account 和独立 IAM policy。

## 9. 已验证内容与本地限制

自动化测试已经覆盖：严格来源/manifest schema、owner scope、Auth/App Check 边界、memory 与
Firestore transaction contract、Storage Rules、实际签名与流式 UTF-8、CloudEvent 边界、
composition 隔离，以及 Auth + Firestore + Storage Emulator 的完整闭环。端到端测试通过 Web
SDK 匿名登录和 Storage upload，使用 Admin adapter 读取权威 metadata，再重复注入相同事件
验证幂等结果。

本地 Emulator **没有证明**：

- Cloud Run 对未授权调用的真实 IAM denial；
- Eventarc trigger 与 invoker IAM 已正确部署；
- staging/production Cloud Storage App Check enforcement 已开启且合法客户端无异常；
- 真实云环境的性能、配额和账单。

这些项目保留为 Module 10 staging/production deployment gates，不在本文中标记为已完成。

## 10. Module 4 停止边界

Module 3 到此停止。尚未实现的内容包括：EXIF/XMP 解析、SHA-256、感知哈希、重复识别、
缩略图、OCR、地点/时间消歧、场景与连接、Cloud Tasks/Pub/Sub 编排、恶意内容扫描，以及
任何 Gemini/Else 推理。下一模块必须在新的明确授权和独立 TDD 计划后开始。
