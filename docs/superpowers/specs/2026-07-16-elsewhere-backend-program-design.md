# Elsewhere 后端开发总路线与基础模块设计

**日期：** 2026-07-16

**状态：** 待书面审阅

**实施方式：** Firebase Emulator 本地闭环完成后，再部署独立 `elsewhere-dev` 环境

**上位依据：** `Elsewhere_PRD_v3.0.md`、`Elsewhere_Google_First_Technical_Architecture_v1.0.md`、`ELSEWHERE_PAGE_LOGIC_MAP_v1.md`、`docs/AGENTS.md`

## 1. 结论

Google-first 总方向合理，但原文中的 P0 同时包含 Firestore、Storage、Cloud Run、Eventarc、Pub/Sub、Cloud Tasks、Document AI、两类 Gemini、Qwen、Vector Search、BigQuery 和 FCM，作为真实开发起点过宽。它描述了完整终局，却没有给出足够窄的首个可验证闭环。

本项目采用以下修正版路线：

> **一个模块化 Node.js 后端 + Firebase Emulator + Firestore/Storage 适配器 + 可替换 AI 端口。先证明原件安全入库和字段可追溯，再建立连接、发现和 Else。**

第一阶段不建设微服务群，不引入 Agent Engine，不引入第二个模型供应链，也不建设向量数据库。所有延后项必须由数据量、质量或成本指标触发。

## 2. 前提与成功标准

### 2.1 明确前提

- 当前正式前端位于 `design-lab/prototypes-vanilla`，本后端阶段不修改它。
- 本地阶段只使用 Emulator 和 fake AI adapter，不需要云账号或真实私人素材。
- `elsewhere-dev` 只允许测试账号与合成/脱敏素材；真实用户数据不得进入 dev。
- 后端以单用户数据隔离为硬边界，但数据模型从第一天支持多个 `uid`。
- Node.js 22、ESM、JavaScript + JSDoc、运行时 schema 校验；不为了类型系统重写现有 JavaScript 项目。
- 现有 `services/else-service` 冻结为原型，等真实 Repository 与鉴权完成后迁移进统一后端并删除旧服务，不长期维护两套实现。

### 2.2 后端程序完成标准

1. 任意持久化对象都位于 `users/{uid}` 范围，后端不会因 scope 错误扩大查询范围。
2. 原件上传成功后，即使 OCR、地点或 AI 全部失败，Fragment 仍可查询和导出。
3. 重复收到 Storage/Eventarc/Task 事件不会重复创建对象或重复扣费。
4. 每个 AI/系统字段保留来源、置信度、状态、处理器版本和时间。
5. Connection、Discovery、Else 回答都能回到真实 Fragment 或用户文字。
6. 本地 Emulator、Repository 契约测试、规则测试和关键 API 集成测试全部通过后，才允许创建 dev 云资源。
7. dev 月度目标成本不超过 **US$25**；50%、80%、100% 设置预算提醒，任何持续超额都先降级功能而非扩大预算。

## 3. 方案比较

### 方案 A：继续补丁式扩建 `else-service`

速度最快，但同步 fixture 接口无法自然替换异步 Firestore，且当前服务没有 `uid`、幂等、规则、批次处理和稳定领域契约。继续扩建会把错误边界固化。拒绝。

### 方案 B：模块化单体、Emulator-first（采用）

建立一个 `services/backend` 包，领域逻辑只依赖 Repository/Provider 接口；本地使用 Emulator 与 fake provider，云端替换为 Firebase Admin、Document AI、Gemini。只有一个部署单元和一套数据契约，成本和运维最低，同时保留以后拆服务的边界。

### 方案 C：直接完整落地 Google Cloud 终局架构

可以提前验证云服务，但会在产品对象和处理规则尚未稳定时引入十余种资源、IAM、区域和账单问题。对当前阶段成本与返工风险过高。拒绝。

## 4. 架构边界

```text
Web / tests
  -> HTTP API
     -> Auth context (uid + App Check state)
     -> Application modules
        -> Domain schemas and state transitions
        -> Repository ports
        -> Job dispatcher port
        -> AI / OCR / Places provider ports
     -> Adapters
        -> Emulator or Firebase Admin
        -> In-memory fake providers
        -> Later: Document AI / Gemini / Places
```

### 4.1 单一部署单元，清晰模块边界

目标目录：

```text
services/backend/
├─ package.json
├─ src/
│  ├─ app.js                 # 创建 HTTP app，不自动监听
│  ├─ server.js              # 唯一进程入口
│  ├─ config.js              # 启动时一次性校验环境变量
│  ├─ domain/                # schema、状态、纯函数
│  ├─ auth/                  # uid 与 App Check 验证
│  ├─ repositories/          # 接口契约与 Firestore 实现
│  ├─ imports/               # ImportBatch、上传登记、回执
│  ├─ ingestion/             # object.finalized 幂等处理
│  ├─ processing/            # 元数据/OCR/地点/连接任务
│  ├─ discoveries/           # 候选与质量门槛
│  ├─ else/                  # scope、检索、回答、来源验证
│  └─ adapters/              # Firebase、AI、OCR、Places
└─ test/
   ├─ contract/
   ├─ unit/
   └─ integration/

firebase/
├─ firebase.json
├─ firestore.rules
├─ firestore.indexes.json
└─ storage.rules
```

一个模块只暴露用例函数和小型数据接口，不直接读取其他模块的 Firestore 路径。未来如果某个模块因流量需要拆出 Cloud Run，领域代码无需重写。

### 4.2 HTTP 框架与依赖纪律

- 使用 Fastify 处理路由、body limit、生命周期、统一错误和无端口集成测试；不继续手写逐渐膨胀的 `node:http` 路由。
- 使用 Zod 做外部输入与持久化对象的运行时校验；JSDoc 从 schema 推导/记录类型含义。
- 使用 Firebase Admin SDK 访问 Firestore、Storage、Auth 和 App Check。
- 测试使用 Node 内置 `node:test` 与 Fastify `inject()`；不再增加第二套测试框架。
- 每增加一个运行时依赖，必须能删除一段自写基础设施或承担真实外部适配；否则不加入。

## 5. 唯一领域契约

所有 ID 使用服务端生成的不可猜测 ID。引用统一使用 `{ type, id }`，禁止继续混用 `from/to`、`nodeRefs`、`supportingFragments` 等多套同义字段。

### 5.1 公共元数据

```js
{
  id,
  ownerId,
  schemaVersion: 1,
  createdAt,
  updatedAt,
  deletedAt: null
}
```

### 5.2 Provenance

```js
{
  value,
  sourceType: 'exif|ocr|gps|places|gemini|system|user',
  sourceRefs: [{ type, id }],
  processor: { name, version, modelAlias: null, promptVersion: null },
  confidence,
  status: 'suggested|confirmed|corrected|rejected|unresolved|conflicted',
  observedAt
}
```

用户确认产生新版本并成为当前值，不覆盖或删除旧来源。历史进入 `auditEvents`/`modelRuns`，避免主对象无限增长。

### 5.3 核心对象命名

- Fragment：原件路径、哈希、媒介类型、处理摘要、字段级 facts、当前 journey/scene/place 引用。
- ImportBatch：输入数、保存数、处理数、失败数、待判断数和代表 Fragment；统计由服务端更新。
- Entity/Place：标准实体与候选来源。
- Visit/Scene：时间范围、placeRef、参与 Fragment 查询条件或小规模引用。
- Connection：`nodeRefs`、`supportingEvidenceRefs`、`contradictingEvidenceRefs`、状态和评分。
- Discovery：`sourceFragmentRefs`、`connectionRefs`、为什么显影、缺口、系统标题与用户标题分离。
- UserNote：用户文字和显式 `relatedRefs`。

城市、旅程或地点不保存无限增长的 Fragment ID 大数组；通过 `ownerId + journeyId/placeId/sceneId` 索引查询。

## 6. 数据与处理流

### 6.1 导入闭环

```text
authenticated request
-> create ImportBatch
-> client uploads to users/{uid}/originals/{batchId}/{fragmentId}
-> object.finalized CloudEvent
-> idempotency key = bucket + object generation
-> create or confirm Fragment
-> mark original saved
-> dispatch deterministic processing
-> update receipt counters
```

客户端可以显示上传进度，但不能写“已处理、已确认关系、发现完成”等受信状态。

### 6.2 处理闭环

每个处理步骤使用唯一键：

```text
uid + fragmentId + processorName + processorVersion + inputHash
```

任务记录状态为 `queued|running|succeeded|failed|superseded`。重试只复用同一任务，输入或处理器版本变化才创建新任务。

执行顺序：

1. SHA-256、媒介类型、基本元数据；
2. 缩略图/预览；
3. 文档类 OCR 或图片上下文提取；
4. 时间/地点候选与字段级 provenance；
5. Visit/Scene 确定性聚类候选；
6. Connection 确定性候选；
7. 达到证据门槛后才进入 Discovery 筛选。

单一步骤失败不会把 Fragment 变成不可访问；UI 读取处理摘要显示局部失败。

### 6.3 Else 查询闭环

```text
verified uid + strict scope
-> structured retrieval with per-kind quotas
-> optional semantic retrieval (later)
-> immutable evidence pack
-> Gemini structured response
-> validate every source and action target
-> return answer or explicit insufficient-evidence result
```

- 无效 scope 返回 `400/404`，绝不回退到更大范围。
- OCR、用户文字和外部字段视为不可信内容，不能改变系统指令。
- 不再使用“正文先流出、尾部再验证”的分隔符协议。
- 回答不超过 120 个中文字，先完整验证结构，再通过 SSE 发送已验证段落；短回答可直接 JSON。
- 模型编造来源时返回 grounded failure 或进行一次受控重试，禁止用任意前三条证据冒充来源。
- `nextAction` 是服务端枚举 `{ type, targetRef }`，不是模型任意文本。

## 7. 身份、隐私与错误边界

- 本地测试可注入明确的 emulator test token；非测试环境必须验证 Firebase ID Token。
- 自定义 API 同时验证 App Check；身份验证与 App Check 失败均不查询 Firestore。
- Repository 的每个方法必须接收 `uid`，对象返回前再次检查 `ownerId`。
- 原件、OCR、用户笔记、完整 prompt、signed URL 不进入日志。
- 客户端错误只返回稳定 code、requestId 和可操作提示；模型/数据库原始异常仅记录脱敏类别。
- 删除与导出在导入功能可用前至少实现数据清单和影响计算，完整异步删除放在后续独立模块。

## 8. 成本设计

### 8.1 第一阶段启用

| 能力 | 本地 | `elsewhere-dev` | 成本约束 |
|---|---|---|---|
| Auth/Firestore/Storage | Emulator | Firebase/GCP | 一个 Firestore 数据库；只订阅当前页面需要的数据 |
| API | 本地进程 | 一个 Cloud Run service | request-based、min instances=0、max instances=2、512 MiB 起步 |
| 上传事件 | 直接注入 CloudEvent handler | Eventarc Standard -> 同一 Cloud Run | 只发送对象引用，不在事件中复制原件 |
| 任务 | in-memory fake | Cloud Tasks（有模型/Places 调用后） | 每个幂等任务最多有限重试 |
| OCR | fake/golden | Document AI OCR，仅文档类 | 不对普通照片调用；OCR 结果持久化 |
| AI | fake/golden | Gemini 3.5 Flash 固定版本 | 证据包 ≤12k input tokens，回答 ≤256 output tokens；Developer API 只处理合成数据，真实私人数据走 Vertex AI |
| Places | fake | 证据不足时调用 | 先 EXIF/OCR，结果按允许字段缓存 |

成本依据：Cloud Run 按使用计费并可 scale-to-zero；Firestore 提供每日 50,000 reads、20,000 writes 和 1 GiB 存储免费额度；Eventarc Standard 每月前 50,000 个计费事件免费且 Google 来源事件本身为 US$0/百万，仍需考虑传输层；Cloud Tasks 每月前 100 万次操作免费；Document AI Enterprise OCR 当前为 US$1.50/1,000 页；Gemini Developer API 的 Gemini 3.5 Flash 付费档当前为 US$1.50/百万输入 token、US$9/百万输出 token。Vertex AI 价格单独在云部署模块复核。价格只用于预算预估，部署前重新核对官方页面。

### 8.2 明确延后

| 组件 | 延后原因 | 启用门槛 |
|---|---|---|
| Pub/Sub | 单一消费者时 Cloud Tasks 足够 | 同一领域事件出现两个以上独立消费者或需要回放 |
| Firestore Vector Search | 结构化筛选先满足 MVP | 单用户约 2,000+ Fragment 且结构化检索召回不足 |
| Vertex AI Vector Search | 运维和固定复杂度更高 | Firestore 向量限制或延迟经测量成为瓶颈 |
| Qwen | 第二供应链与隐私评估成本 | 基础文本任务的 Gemini 成本持续显著且确定性代码不可替代 |
| ADK / Agent Engine | 当前 Else 没有复杂工具编排 | 至少 3 个受控工具、多轮状态成为核心且单次编排难维护 |
| BigQuery | 开发期 Firestore/结构化日志足够 | staging 产生稳定事件或需要跨版本离线评估 |
| FCM | 尚无已验证通知价值 | 高价值发现/冲突通知在产品测试中通过 |
| Spanner Graph | Firestore 显式边足够 | 多跳图查询成为高频且成本/延迟有测量证据 |

### 8.3 防失控措施

- `elsewhere-dev` 月预算 US$25，禁止 min instances、Provisioned Throughput 和常驻自定义 Document AI processor。
- 模型调用记录 alias、输入/输出 token、feature、uid hash、latency 和 estimatedCost；不记录正文。
- 每个 dev 用户默认每日最多处理 200 个新 Fragment、50 次 Else 问答；配置只允许服务端修改。
- 相同原件、处理器版本、prompt 版本和输入哈希命中结果时不重复调用付费服务。
- Deep model 默认关闭；只有回归评估证明 Flash 不足且单次价值足够高时启用。

## 9. 分模块执行顺序

每个模块拥有独立 spec、TDD 计划、验收和提交；未通过不进入下一模块。

1. **Backend Foundation**：统一 package、配置、schema、Repository contract、Emulator、Rules、测试骨架。
2. **Auth Boundary**：Firebase ID Token、App Check、uid 隔离和稳定错误契约。
3. **Import Batch + Original Save**：批次、上传路径、Fragment 幂等创建、最小回执。
4. **Deterministic Processing**：哈希、元数据、处理任务状态、重复识别、缩略图。
5. **OCR + Multimodal Adapters**：Document AI/Gemini adapter、golden 测试、字段 provenance。
6. **Place / Visit / Connection**：确定性候选、用户确认、Inbox、Receipt 聚合。
7. **Discovery**：候选评分、质量门槛、来源、命名与保存。
8. **Else Migration**：迁移可复用 router/prompt 思路，删除 fixture、分隔符和旧 `else-service`。
9. **Privacy / Export / Delete**：数据清单、影响计算、导出与幂等删除。
10. **Dev Deployment**：Terraform 最小资源、Cloud Run、预算、日志、staging smoke。

不把整个路线写成一份巨型代码计划。首先只为模块 1 生成实现计划；模块 1 验收后再写模块 2。

## 10. 模块 1：Backend Foundation 的精确范围

### 10.1 包含

- 将 `services/else-service` 迁移为统一 `services/backend` 包，同时保持原 13 个测试在迁移提交中可运行；
- 创建 `createApp()` 与独立 `server.js`，导入模块不会自动监听端口；
- 启动时配置 schema；
- 创建核心 ID/reference、Fragment、ImportBatch、Provenance 最小 schema；
- 定义异步 Repository contract 和 in-memory contract-test adapter；
- 初始化 Firebase Emulator 配置、最小 deny-by-default Firestore/Storage Rules；
- 建立 `health/readiness`，不暴露模型 ID、密钥状态或内部错误；
- 保留 Else 原型代码但不扩展功能，后续模块 8 正式迁移。

### 10.2 不包含

- 真实 Firebase/GCP 项目创建；
- 前端 Firebase 接入；
- 上传、OCR、Gemini、Places、连接或发现业务；
- 生产部署、Terraform 和真实账单；
- 修复 Else 的回答协议；这些由模块 8 在真实 Repository 上重做。

### 10.3 模块 1 验收

1. `npm test` 覆盖 schema、config、Repository contract、app health 和原 Else 回归；
2. `firebase emulators:exec` 中规则测试证明跨 uid 读写被拒绝；
3. 导入 `app.js` 不打开端口；
4. 无效环境变量在启动前以稳定错误退出；
5. `git diff --check`、依赖审计和完整测试无新增错误；
6. README 只描述实际可运行命令，不声称未完成能力。

## 11. 风险与回滚

- **目录迁移风险：** 先用原测试保护行为；单独提交目录迁移，便于回退。
- **规则测试误判：** Emulator 规则使用独立测试账号和清理数据，禁止复用真实项目。
- **schema 过早固化：** 只冻结公共元数据、Reference、Fragment/Batch/Provenance 最小字段；其他对象在对应模块再冻结。
- **依赖膨胀：** 模块 1 只接受 Fastify、Zod、Firebase Admin 和规则测试所需 Firebase 工具。
- **现有前端受影响：** 新后端不修改 frontend fixture 或页面；接口接入另立模块。
- **回滚方式：** 每个模块独立提交；任何模块失败可回到上一模块仍可运行的基线。

## 12. 官方成本与平台依据

- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Firestore pricing and free quota](https://firebase.google.com/docs/firestore/pricing)
- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Document AI pricing](https://cloud.google.com/document-ai/pricing)
- [Eventarc pricing](https://cloud.google.com/eventarc/pricing)
- [Cloud Tasks pricing](https://cloud.google.com/tasks/pricing)
- [Firebase App Check custom backend verification](https://firebase.google.com/docs/app-check/custom-resource-backend)
- [Gemini model lifecycle and stable/latest naming](https://ai.google.dev/gemini-api/docs/models)
