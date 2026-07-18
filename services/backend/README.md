# Elsewhere Backend

Module 1–5A 后端：Fastify 生命周期、owner-scoped Repository、Firebase Auth / App Check、
Import Batch 原件保存、确定性媒体处理、权威路由与预算门禁，以及受计划约束的 OCR 执行。
`elsewhere-api`、`elsewhere-ingestion`、`elsewhere-capability-worker` 共用代码包和镜像，但使用
完全分离的 composition root、runtime service account 和 Cloud Run IAM 边界。

Module 4 的任务身份、格式能力、失败语义、Rules 和最新验证证据见
[deterministic-processing-v1.md](../../docs/implementation/deterministic-processing-v1.md)。
Module 4.5 的 RoutePlan、cohort、预算与执行授权边界见
[authoritative-routing-v1.md](../../docs/implementation/authoritative-routing-v1.md)。
Module 5A 的 Cloud Tasks、固定版本 Document AI、结果、恢复与 IAM 边界见
[capability-execution-ocr-v1.md](../../docs/implementation/capability-execution-ocr-v1.md)。

## 支持的运行流程

在本目录执行：

```bash
npm install
npm test
node --test test/unit/routing-*.test.js test/integration/authoritative-routing-app.test.js
npm run smoke:media
npm run dev
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" \
JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
npm run test:emulator
```

`dev`、`start` 和 smoke scripts 使用 Node 22 原生 `--env-file-if-exists=.env`。先复制并填写：

```bash
cp .env.example .env
```

`.env` 已被 Git 忽略。测试命令故意不自动读取 `.env`，防止真实 provider 配置污染单元测试。

选择运行模式所需环境变量：

```text
ELSEWHERE_SERVICE_MODE=api|ingestion|capability-worker
FIREBASE_PROJECT_ID=<current Firebase project>
ELSEWHERE_ALLOWED_APP_IDS=<comma-separated App IDs>       # API mode
ELSEWHERE_STORAGE_BUCKETS=<comma-separated bucket names>  # ingestion / worker
```

三个模式都公开 `/healthz` 和 `/readyz`。`elsewhere-api` 是浏览器可访问服务，只注册
受 Firebase Auth / App Check 保护的 `POST /v1/import-batches` 与
`GET /v1/import-batches/:batchId`，并使用 API runtime service account。
`elsewhere-ingestion` 只注册 `/events/storage-finalized`。该事件按
original finalize → deterministic processing → authoritative routing 的顺序执行，只有 RoutePlan
草稿或审批状态成功持久化后才返回 204。生产环境必须关闭 unauthenticated
访问，只允许 Eventarc invoker，并使用权限更窄的 ingestion runtime service account。
`elsewhere-capability-worker` 只注册私有 OCR task route；生产关闭 unauthenticated，只允许专用
Cloud Tasks OIDC identity invoke，并以独立 worker runtime service account 调用固定版本
Document AI。API 与 ingestion 均没有该 route。
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
部署门禁单独验证。Module 4.5 不调用 Document AI、Places、Embedding、Gemini 或任何外部
分类器；它只用 Module 4 确定性事实编译权威计划并预留预算。Module 5A 只实现批准后的 OCR
调度与执行，默认 fake mode 对 Cloud Tasks / Document AI 为零调用。Places、Embedding、Gemini、
恶意内容扫描和完整语义解析仍未实现。
