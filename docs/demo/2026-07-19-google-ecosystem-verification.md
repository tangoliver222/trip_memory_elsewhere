# Elsewhere Google 生态参赛路径最终验证

## 结论

截至 2026-07-20（Asia/Bangkok），参赛录制主链已经使用真实输入完成端到端验证：8 个项目自有文件经
Firebase Anonymous Auth、App Check、Firestore 和 Storage 保存；Storage finalized 事件进入 Cloud Run
ingestion，经确定性处理、Module 4.5 权威路由、Cloud Tasks 和独立 worker 完成一次 Google Document AI
OCR；本地隔离的录制 composition 从持久化结果投影 World、City、Fragment Field、Lens 和 Discovery，
并完成一次带有效来源的 Gemini 回答。

这不是前端 fixture 或固定 AI 文案。当前没有部署完整生产前端：Firebase Hosting rewrite 已实现，但在生产
snapshot/Else 读模型完成独立边界审阅前保持未部署。录制入口因此是本地视觉应用加真实 Google Cloud 数据链，
而不是声称已经上线的完整产品。

## 最终验收矩阵

| 范围 | 状态 | 最近验证证据 |
| --- | --- | --- |
| 真实云浏览器主链 | 通过 | Playwright 1/1，46.7 秒；8 个真实文件；一次 OCR；一次 Gemini；来源可打开 Lens |
| Cloud Run ingestion 主链 | 通过 | Auth/App Check → ImportBatch → Storage → Eventarc → routing → Tasks → Document AI |
| 后端普通测试 | 通过 | 610 项：602 通过、8 项为未启动 Emulator 时的预期跳过、0 失败；7.9 秒 |
| Firebase Emulator 套件 | 通过 | 70/70，0 失败；43.5 秒；Auth、Firestore、Storage 和 Rules |
| 前端单元测试 | 通过 | 83/83，0 失败 |
| 本地无付费浏览器回归 | 通过 | Playwright 1/1，16.0 秒；Gemini 和真实云能力关闭 |
| 前端生产构建 | 通过 | 默认 build 与 cloud-mode build 均成功 |
| 云资源状态 | 通过 | 三个 Cloud Run revision Ready；Tasks queue RUNNING；Eventarc 精确绑定 Firebase bucket |
| 云端测试数据清理 | 通过 | Auth users 0、Firestore root user documents 0、Storage `users/` objects 0 |

前端构建仍会报告约 940 KB 的 JavaScript chunk 警告（gzip 约 275 KB）。它不是构建失败，也不影响本次
录制，但属于录制后应处理的性能债务。

## 真实云已验证

- Firebase Anonymous Auth：浏览器取得真实用户身份；服务端不接受客户端伪造 owner。
- Firebase App Check：cloud mode 使用真实 token；Emulator literal token 不进入云模式。
- Firestore：ImportBatch、Fragment、processing、RoutePlan、capability execution/result 和投影来源均持久化。
- Firebase Storage：浏览器上传实际文件字节；原件路径受 owner 和 batch 约束。
- Cloud Run：`elsewhere-api`、`elsewhere-ingestion`、`elsewhere-capability-worker` 使用同一镜像、不同
  composition root、不同 runtime service account 和不同 IAM 边界。
- Eventarc：只接收 `google.cloud.storage.object.v1.finalized`，并只过滤
  `elsewhere-memory-tyx-2026.firebasestorage.app`。
- Module 4：格式、哈希、metadata、缩略图及重复事实先于任何付费能力完成。
- Module 4.5：权威 RoutePlan 和预算批准决定 OCR 是否执行；processor 不会自行升级。
- Cloud Tasks：`elsewhere-ocr` 为 RUNNING，最大 2 dispatch/s、最大并发 2。
- Google Document AI：最终浏览器验收中只有 Common Grounds receipt 产生一份持久化 normalized artifact；
  manifest 不包含 merchant、amount 或 OCR text。
- Gemini：最终浏览器验收发出一次结构化回答请求；回答至少包含一个已验证 source id，点击来源可打开 Lens。
- 清理：验收结束后删除测试 owner 的 Auth、Firestore 和 Storage 数据。

## 当前云部署快照

| 资源 | 已验证状态 |
| --- | --- |
| `elsewhere-api` | Ready revision `elsewhere-api-00002-q9b`；外部 `/readyz` 为健康检查入口 |
| `elsewhere-ingestion` | Ready revision `elsewhere-ingestion-00002-lzw`；只允许 Eventarc invoker |
| `elsewhere-capability-worker` | Ready revision `elsewhere-capability-worker-00002-z44`；只允许 Tasks OIDC invoker |
| `elsewhere-ocr` | RUNNING；2 dispatch/s；2 concurrent |
| `elsewhere-original-finalized` | 绑定单一 Firebase bucket 和 ingestion receiver |

Cloud Run Google Front End 会在当前部署中先于 Fastify 截获精确 `/healthz` 并返回平台 404；外部验证使用
`/readyz`。未认证访问私有 ingestion/worker 时当前同样表现为平台 404，访问控制以各服务 IAM policy 为准，
不能把这个响应误写成应用 403。

## Provider 调用与成本口径

- 最终浏览器验收：1 次 Document AI 请求，领域账本持久化 `actualCostMicros=1500`，即 USD 0.0015。
  这是 Elsewhere `routing-admission-costs` v2/v3 的单页成本记录，不等同于 Google 最终账单。
- 最终浏览器验收：1 次 Gemini 请求，使用运行环境配置的 FAST model，`maxOutputTokens=700`。
  当前 demo provider 不持久化输入/输出 token usage，因此不能诚实给出实际金额。
- 每次成功执行 production Cloud Run smoke 都会额外产生 1 次 Document AI 请求；部署期间执行过多次开发验证。
- Google Cloud Billing 与 provider usage dashboard 是项目累计实际费用的唯一权威来源。本文件不以测试计数
  冒充账单，也不记录 API key、App Check debug token、processor ID 或测试用户标识。

## Emulator 已验证

以下命令在 OpenJDK 21 环境下通过 70/70：

```bash
PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH \
  npm --prefix services/backend run test:emulator
```

覆盖 Auth boundary、Firestore/Storage Rules、原件 finalize、确定性处理、权威路由、capability execution
以及 Firestore repository contract。普通后端测试的 8 项 skip 只表示该命令没有启动 Emulator，不表示缺测。

## 已实现但未部署

- Firebase Hosting 静态 SPA 配置和 `/v1/**` → `elsewhere-api` rewrite。
- cloud-mode Vite production build。
- 视觉原型所需的 snapshot/Discovery projection 和 Else endpoint 的隔离 demo composition。

未部署的原因是生产 API 目前只包含完成边界审阅的 ImportBatch 写入/回执接口；直接部署 cloud-mode SPA
会形成“界面上线、核心读模型仍依赖开发 composition”的误导状态。

## 本轮明确排除

- Places、Embedding、Agent Engine 和地图 Grounding。
- 外部来源导入与手机备忘录连接器。
- 前端登录 UI、角色/管理员权限、session 数据库。
- replay protection、限流和生产 snapshot/Else API。
- 完整 Hosting 上线。

这些项目不影响当前 Bangkok 核心故事的真实数据录制，但不得在参赛材料中描述为已经实现。

## 可复现命令

```bash
# 真实 Google 浏览器自动验收：会产生一次 OCR 和一次 Gemini 请求
RUN_REAL_GOOGLE_PROVIDER_TESTS=true \
ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED=true \
node scripts/run-google-cloud-demo.mjs --verify

# 生产 Cloud Run ingestion smoke：每次成功运行会产生一次 Document AI 请求
RUN_REAL_GOOGLE_PROVIDER_TESTS=true \
npm --prefix services/backend run smoke:cloud-run

# 后端普通测试
npm --prefix services/backend test

# 本地无付费浏览器回归
GEMINI_API_KEY= GOOGLE_GENAI_USE_VERTEXAI=false \
node scripts/run-competition-demo.mjs --verify
```

录制与验收完成后，`services/backend/.env.cloud.local` 中
`ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED` 必须保持 `false`。当前复核结果为 `false`。
