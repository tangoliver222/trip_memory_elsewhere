# Elsewhere Deterministic Processing v1

更新日期：2026-07-17
状态：Module 4 已实现并在本地、Firebase Emulator 与 Linux 容器验证；未部署生产环境。

## 1. 范围与边界

本模块在原件完成 Module 3 finalize 后，同步执行一条可重试的确定性处理链：

```text
Eventarc Storage finalized event
→ generation-pinned original finalize
→ claim ProcessingTask
→ revalidate Storage metadata
→ bounded stream + SHA-256
→ metadata whitelist
→ image thumbnail + dHash（仅运行时支持的像素格式）
→ immutable WebP derivative
→ exact / near duplicate candidates
→ atomic Task + Fragment + ImportBatch completion
→ HTTP 204
```

只有 ProcessingTask 终态、Fragment 结果和 ImportBatch 摘要全部成功持久化后才返回
204。active lease、软超时、Storage/Repository 瞬时故障、终态事务失败返回稳定 503，
Eventarc 重试正确性不依赖 `Retry-After`。

本模块不包含 OCR、外部 AI、完整语义解析、恶意内容扫描、Cloud Tasks、生产部署或
新的业务 API。文件签名只证明容器格式与声明类型合理，解码成功也不等于文件安全。

## 2. 任务身份、租约与重试

ProcessingTask ID 是以下字段的长度前缀哈希：

```text
ownerId + fragmentId + processorName + processorVersion
+ bucket + objectName + generation
```

`inputHash` 不属于 Task ID；必须先 claim，再读取原件并计算 SHA-256。Task 保存
`inputHash` checkpoint，过期租约由新 attempt 重新 claim；重新物化后必须得到同一
SHA-256，否则终止为 `processing/invalid-media`。同一 source revision 的终态 Task
直接 no-op，不增加 attempt 或批次计数。

默认时间边界：

- soft deadline：180000 ms；
- lease：240000 ms；
- Cloud Run request：300000 ms；
- cleanup margin：30000 ms；
- 必须满足 soft deadline < lease ≤ request - cleanup margin。

读取、worker、缩略图上传与 metadata 回读均服从同一绝对 soft deadline 和
`AbortSignal`。临时目录权限为 `0700`，匿名临时文件为 `0600`，所有终态和失败路径都
执行幂等 cleanup。

## 3. 原件、派生物与权限

Storage 路径：

```text
users/{uid}/originals/{batchId}/{fragmentId}
users/{uid}/derived/{fragmentId}/deterministic-media/v1/{sha256}/thumbnail.webp
```

原件读取绑定 `bucket + objectName + generation`，并在读取字节前复核 generation、size、
contentType 与 crc32c。SHA-256 在受大小上限约束的流上计算。派生缩略图使用
`ifGenerationMatch=0` create-only 写入；遇到 412 时，仅在 live generation、
metageneration、size、crc32c、MIME 和全部自定义 identity metadata 完全一致时复用。

Firestore Rules：

- owner 可读自己的 Fragment、ImportBatch 和 DuplicateCandidate；客户端均不可写；
- ProcessingTask 和 ContentHash 对所有客户端不可读写；
- catch-all 继续拒绝其他路径。

Storage Rules：

- owner 可读自己的 original 与 derived object；
- original 只允许符合预分配 ImportBatch manifest 的首次 create；
- derived object 对所有客户端禁止 create、update、delete；
- other owner 与未认证客户端均不可读。

服务端写入依赖 Admin SDK。`elsewhere-api` 与 `elsewhere-ingestion` 共用镜像，但生产部署
必须使用不同 runtime service account 和 Cloud Run IAM 边界；ingestion 仅允许 Eventarc
invoker，不能公开 anonymous invocation。

## 4. 元数据、图片与格式能力

运行时依赖固定为：

```text
sharp 0.35.3
libvips 8.18.3
libheif 1.23.1
libwebp 1.6.0
exifreader 4.41.0
```

2026-07-17 本地与 `node:22-slim` 镜像的实际 smoke 输出一致：

```json
{"ok":true,"library":{"sharp":"0.35.3","libvips":"8.18.3","heif":"1.23.1","webp":"1.6.0"},"capabilities":{"decode":{"jpeg":true,"png":true,"webp":true,"heic":false,"heif":false},"encode":{"webp":true}},"smoke":{"jpegInput":true,"pngInput":true,"webpInput":true,"webpOutput":true}}
```

| 输入 | metadata | thumbnail / dHash | 说明 |
| --- | --- | --- | --- |
| JPEG | 白名单字段 | 支持 | orientation 后处理；缩略图最长边 ≤ 512，WebP quality 82 |
| PNG | 宽高与 nullable 字段 | 支持 | alpha 先铺白底 |
| WebP | 宽高与 nullable 字段 | 支持 | 只处理可靠报告的首帧；可靠 frame count 才应用 `MAX_PAGE_COUNT` |
| HEIC / HEIF | partial 或 unsupported | 当前 unsupported | `libheif` 版本存在不等于 HEVC HEIC decode；当前 suffix 仅 AVIF |
| PDF | partial | unsupported | `pageCount=null`，记录 `processing/page-count-unsupported`，不伪造为 1 |
| text/plain | 严格流式 UTF-8 验证 | unsupported | fatal UTF-8，无界读取被禁止 |

测试包含一个无个人数据的 2×2 真实 HEVC HEIC golden（`ftypheic` + `hvcC`）。当前运行时
报告 HEIC=false，因此该原件产生 unsupported capability，而不是失败或伪造结果。

硬上限：原件 50 MiB、60000000 pixels、单边 20000 px、可靠 frame/page count 100、
metadata 解压 16 MiB。`MAX_PAGE_COUNT` 只用于 decoder 能可靠报告页/帧数的格式；当前
PDF page count 明确保留 null。

## 5. 去重语义

Exact duplicate 以 owner-scoped SHA-256 ContentHash 选择一个 canonical Fragment，但每个
上传 Fragment 都保留。第二个相同原件产生一个 exact DuplicateCandidate，包含 canonical
与 candidate 角色和排序后的 `pairRefs`。

Near duplicate 使用 dHash v1：64 bit、16 个小写十六进制字符、8 个位置前缀 band。
band query 后去重、排除自身，按 Fragment ID 稳定扫描最多 200 条，再精确计算 Hamming
distance；按 `distance ASC, fragmentId ASC` 取前 5。Near candidate 同时保存
`queryFragmentRef`、`matchedFragmentRef` 与排序 `pairRefs`，rank 只相对于 query Fragment。

## 6. 批次计数与失败语义

`processingSummary.deterministic` 保存 `processorName=deterministic-media` 和
`processorVersion=v1`。eligible/running/succeeded/failedRetryable/failedTerminal 按
`fragmentId + processorName + processorVersion` 幂等迁移，新版本不能污染旧版本计数。

- 上传失败与 deterministic terminal failure 在内部摘要中分开；
- 顶层 `counters.failed` 是去重后的失败原件数；
- unsupported capability 只累加 `unsupportedCapabilities`，不计失败；
- 全部确定性任务成功后 batch 为 `completed`；存在任一上传或确定性终态失败时为
  `completed_with_errors`（全部上传失败仍由 Module 3 表示为 `failed`）。

## 7. 何时迁移到 Cloud Tasks

v1 保持 Eventarc request 内同步处理，减少基础设施与运行成本。只有出现以下可观测信号时
才引入 Cloud Tasks，而不是预先增加队列复杂度：

- p95 处理时间持续接近 soft deadline 或 Cloud Run request budget；
- Eventarc 重投递产生明显的重复长处理成本；
- 新 decoder/OCR 需要独立并发、速率限制或更长执行时间；
- 需要以队列 backpressure 隔离 ingestion 接收与 CPU/内存密集处理。

迁移时保留当前 Task ID、lease、checkpoint 与终态事务语义；不得把 `Retry-After` 当作队列
正确性的组成部分。

## 8. 2026-07-17 验证证据

以下命令均在本次实现后实际执行：

```bash
# services/backend
node --test test/unit/processing-domain.test.js test/unit/processing-identity.test.js \
  test/unit/dhash.test.js test/unit/near-duplicates.test.js \
  test/unit/processing-config.test.js test/unit/source-materializer.test.js \
  test/unit/media-metadata-reader.test.js test/unit/sharp-image-processor.test.js \
  test/unit/firebase-derivative-store.test.js test/unit/deterministic-processor.test.js \
  test/unit/ingestion-pipeline.test.js
# 219 pass, 0 fail, 0 skip

node --test test/integration/ingestion-processing-app.test.js \
  test/integration/ingestion-app.test.js test/integration/composition.test.js
# 12 pass, 0 fail, 0 skip

PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH \
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
npm run test:emulator
# 50 pass, 0 fail, 0 skip

npm test
# 389 total: 383 pass, 0 fail, 6 expected Emulator-environment skips

npm audit --omit=dev
# found 0 vulnerabilities

npm run smoke:media
# exit 0; JSON 如第 4 节
```

从仓库根目录：

```bash
docker build -f services/backend/Dockerfile -t elsewhere-backend:module4 .
docker run --rm elsewhere-backend:module4 npm run smoke:media
# build 通过；container smoke exit 0，能力 JSON 与本地一致

rg -n "(/protected|test/helpers|test/fixtures)" services/backend/src
# 无匹配

git diff --check
# 无输出
```

Emulator E2E 使用真实 anonymous Auth、Firestore、Storage、真实 PNG、生产确定性 adapters 和
仅存在于测试 composition 的 fake App Check verifier。它验证同一 source revision 的
finalized event 重投递为 no-op，以及
第二个相同 bytes Fragment 被保留并产生唯一 exact candidate；结束时删除 Auth user、
Storage objects、Firestore user tree 和 Admin/client apps。
