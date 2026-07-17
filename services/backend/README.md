# Elsewhere Backend

Module 1–4 后端基础：Fastify 生命周期、owner-scoped Repository、Firebase Auth / App
Check 边界、Import Batch 原件保存与确定性媒体处理链路。`elsewhere-api` 与
`elsewhere-ingestion` 共用代码包和镜像，但使用完全分离的 composition root。

Module 4 的任务身份、格式能力、失败语义、Rules 和最新验证证据见
[deterministic-processing-v1.md](../../docs/implementation/deterministic-processing-v1.md)。

## 支持的运行流程

在本目录执行：

```bash
npm install
npm test
npm run smoke:media
npm run dev
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" \
JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
npm run test:emulator
```

选择运行模式所需环境变量：

```text
ELSEWHERE_SERVICE_MODE=api|ingestion
FIREBASE_PROJECT_ID=<current Firebase project>
ELSEWHERE_ALLOWED_APP_IDS=<comma-separated App IDs>       # API mode
ELSEWHERE_STORAGE_BUCKETS=<comma-separated bucket names>  # ingestion mode
```

两个模式都公开 `/healthz` 和 `/readyz`。`elsewhere-api` 是浏览器可访问服务，只注册
受 Firebase Auth / App Check 保护的 `POST /v1/import-batches` 与
`GET /v1/import-batches/:batchId`，并使用 API runtime service account。
`elsewhere-ingestion` 只注册 `/events/storage-finalized`，生产环境必须关闭 unauthenticated
访问，只允许 Eventarc invoker，并使用权限更窄的 ingestion runtime service account。
`/protected` 只存在于测试 harness。

受保护请求必须同时携带：

```text
Authorization: Bearer <Firebase ID Token>
X-Firebase-AppCheck: <Firebase App Check Token>
```

已有 Else 查询模块仍是 legacy 原型，未挂载到 production app，也未连接真实 Repository
或 Auth Boundary，不得部署到公开环境。

`test:emulator` 会在 `demo-elsewhere` 下启动 Auth、Firestore 和 Storage Emulator，命令
完成后统一清理，不会连接真实 Firebase 项目。本地 Emulator 验证不证明 Cloud Run IAM
或 Cloud Storage App Check enforcement 已正确部署；两项必须作为 staging/production
部署门禁单独验证。当前不包含 OCR、外部 AI、恶意内容扫描、完整语义解析或 Cloud Tasks。
