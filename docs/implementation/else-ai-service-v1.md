# Else AI Service v1 — 实施文档

**状态：** 生产查询边界已部署；legacy SSE 原型保留为历史记录
**日期：** 2026-07-15
**上位依据：** `Elsewhere_Google_First_Technical_Architecture_v1.0.md` §10（Else Agent 架构）、§6（模型路由）、§20（不推荐路径）
**范围声明：** 当前生产实现为经过 Auth / App Check、owner snapshot、来源白名单与日预算保护的
`POST /v1/else/ask`。本文 §1–§8 的 SSE/fixtures 描述保留为 2026-07-15 历史原型记录。

## 0. 当前生产边界（2026-07-20）

```text
Firebase ID Token + App Check
  -> POST /v1/else/ask
  -> owner-scoped Firestore MemorySnapshot (最多 200 个 Fragment)
  -> 最多 40 条安全证据 + source allowlist
  -> Firestore 原子 owner/day + project/day 预算预留
  -> Vertex AI gemini-2.5-flash (Cloud Run service identity)
  -> strict JSON
  -> 服务端再次剔除不在 allowlist 的 sourceIds
```

- 请求严格为 `{question, scope}`；question 为 1–500 字，scope 仅支持 `world`、`fragments`、
  `fragment`。额外字段拒绝。
- 空证据直接返回诚实的不确定回答，不预留预算、不调用 Vertex。
- 有证据时，owner 每 UTC 日最多 10 次，项目每 UTC 日最多 100 次；两本账在一个 Firestore
  transaction 内一起递增。provider 失败不退款，避免无界重试消耗。
- Vertex client 只在 `elsewhere-api` composition root 构造。API runtime 只有
  `roles/aiplatform.user` 与 `roles/datastore.user`；ingestion/worker 没有 Vertex 权限。
- 生产只允许 Workload Identity / Cloud Run service account，不上传 `GEMINI_API_KEY`。
- 当前是一次性 sourced query，不含 SSE、会话持久化、工具写操作、Places、Embedding 或 Agent Engine。

2026-07-20 真实 smoke 已完成上传、Document AI、production snapshot、Vertex answer、来源归属、
双层预算和测试 owner 清理。输出包括 `vertex_else_answer=sourced`、
`else_query_budget=passed`、`test_owner_cleanup=passed`。

---

以下内容是 legacy 原型的历史设计，不代表当前公开生产契约。

> 2026-07-16 审计结论：本实现保留为 legacy 查询原型，目录已迁移到
> `services/backend`。在 Auth、真实 Repository 和结构化来源验证完成前不得公开部署。
> 当前可运行边界与验证命令以 `services/backend/README.md` 和
> `docs/implementation/backend-foundation-v1.md` 为准。本文件以下接口、目录和运行说明
> 记录原型交付时的历史形态，不代表当前公开 API。Module 1 已建立 Firestore Repository
> 基础，但 legacy Else 仍读取前端 fixtures，二者尚未连接。

> **术语边界：** 本文的 Query Router 只在 Else 已获得证据包后选择回答模型别名；它不是
> ingestion 的 Authoritative Routing Layer，也无权批准 OCR、Places、Embedding 或 Gemini
> capability。所有碎片付费处理必须先经过 Module 4.5 的当前 approved RoutePlan。完整边界见
> `docs/superpowers/specs/2026-07-17-authoritative-routing-budget-gate-design.md`。

> **2026-07-18 状态补充：** Module 5A 已只实现 approved OCR 的 Cloud Tasks / Document AI
> 执行。它不会启用本文的 Gemini Query Router，也不会把 OCR 不足静默升级为 Gemini。Places、
> Embedding、Gemini capability 与 legacy Else 的真实 Repository 接线仍未实现。OCR 详情见
> `docs/implementation/capability-execution-ocr-v1.md`。

---

## 1. 本次要做什么（范围）

按总架构 P0（比赛/MVP）裁剪，实现 Else 查询链路的最小真实版本：

```text
问题 → Scope Resolver → Query Router(FAST/DEEP) → Evidence Pack
→ Gemini 合成 → 来源校验 → SSE 流式返回（或 JSON）
```

### 明确做
- 独立 Node 服务原型 `services/backend/`（含 Dockerfile，但审计后暂不允许公开部署）；
- 浏览器**不直连**模型（总架构"不推荐 1"）：前端只调本服务；
- 模型别名路由：`FAST_MULTIMODAL` / `DEEP_REASONING`，模型 ID 只存在于环境变量，业务代码零硬编码（总架构 §6）；
- 证据包：按页面范围（world/city/fragment/discovery/inbox…）从数据源取真实对象，拼装带 ID 的证据行；
- 来源校验：模型引用的 ID 必须存在于证据包，否则剔除并降级标注；
- 回答契约：直接答案 + 来源 + 不确定性 + 一个下一步（PRD §7.17 回答态）；
- 建议问题接口：按范围返回 2–4 条，**确定性生成，不调模型**（成本纪律，总架构 §18.1）；
- 单元测试（无网络依赖）+ 真实调用冒烟脚本。

### 明确不做（及理由）
| 不做 | 理由 | 归属 |
|---|---|---|
| ADK + Vertex AI Agent Engine | 总架构标注 P1；demo 阶段单服务即可承载查询流 | P1 |
| Firestore / 向量检索 | 当前产品数据仍是前端 fixtures；数据源做成可替换接口，后续换 Firestore 不动上层 | P1 |
| Qwen(BASIC_TEXT) | 本服务暂无低风险纯文本任务（建议问题走确定性生成） | P1 |
| Auth / App Check / 限流 | demo 本地与受控环境运行；上 Cloud Run 前补 | P1 |
| Agent 会话持久化 | 总架构 §10.6 会话非主数据库；v1 无状态，仅返回 sessionId | P1 |
| 工具型动作（confirm_relation 等写操作） | 涉及业务数据变更，需 Firestore 落地后做 | P1 |

## 2. 关键技术决策

1. **数据源 = 前端 fixtures 的只读复用。** `design-lab/prototypes-vanilla/src/fixtures/data.js` 是纯数据 ESM，服务直接 import，与前端 demo 单一真相源、零复制漂移。封装在 `datasource.js` 一个模块后面，换 Firestore 时只改这一个文件。
2. **一次模型调用完成"正文流式 + 结构化尾部"。** 输出协议：正文（内嵌 `[来源id]` 标注）→ 分隔行 `---ELSE---` → JSON（sourceIds/uncertainty/nextStep）。服务端流式转发正文 token，缓冲解析尾部并做来源校验。避免二次调用（成本）与纯 JSON 流（前端难渲染）。
3. **模型默认值**：`FAST=gemini-flash-latest`；`DEEP` 默认同 FAST，生产请在 env 指向 Pro 级模型（总架构建议 Gemini 3.1 Pro）。DEEP 调用失败自动回退 FAST（模型名漂移时服务不倒）。
4. **依赖只有 `@google/genai`**。HTTP 用 node:http（3 个端点 + SSE，不值得引框架）。SDK 同时支持 AI Studio key 与 Vertex（`GOOGLE_GENAI_USE_VERTEXAI=true`），与总架构的 Vertex 迁移路径一致。
5. **路由启发式**（总架构 §10.5）：跨对象/冲突/规律类关键词或证据包过大 → DEEP，否则 FAST；无需生成式回答的（建议问题）直接返回结构化结果。

## 3. 目录结构

```text
services/backend/
├─ package.json            # type:module，依赖仅 @google/genai
├─ .env.example            # 全部环境变量及说明
├─ README.md               # 快速启动
├─ Dockerfile              # Cloud Run 部署（从仓库根构建以携带 fixtures）
├─ src/
│  ├─ server.js            # node:http 路由 + SSE + CORS
│  ├─ config.js            # env 读取、模型别名表
│  ├─ datasource.js        # 数据源封装（fixtures 实现，Firestore 预留）
│  ├─ scope.js             # 范围解析 → 证据包 + 来源索引
│  ├─ router.js            # FAST/DEEP 启发式
│  ├─ prompt.js            # 系统提示词 + 用户消息拼装 + 输出协议
│  ├─ answer.js            # Gemini 调用、流式分隔解析、来源校验
│  └─ suggestions.js       # 确定性建议问题
├─ scripts/smoke.mjs       # 真实调用冒烟（需 GEMINI_API_KEY + 服务运行中）
└─ tests/                  # node --test，零网络
   ├─ scope.test.js
   ├─ router.test.js
   └─ parse.test.js
```

## 4. API 契约（前端对接用）

Base URL：本地 `http://127.0.0.1:8787`（`PORT` 可改）。CORS 默认放开（`ELSE_CORS_ORIGIN` 收紧）。

### 4.1 `GET /healthz`
`200 {"ok":true,"model":{"FAST_MULTIMODAL":"...","DEEP_REASONING":"..."}}`

### 4.2 `GET /v1/else/suggestions?type=<scopeType>&id=<可选>`
按当前页面范围取建议问题（不调模型，毫秒级）：

```json
{ "scopeLabel": "Bangkok · 2024 秋", "suggestions": ["我去过几次 Common Grounds？", "..."] }
```

### 4.3 `POST /v1/else/ask`
请求体：

```json
{
  "question": "10 月 18 日傍晚我在哪里？",
  "scope": { "type": "city", "id": "bangkok" },
  "stream": true
}
```

`scope.type` 支持：`world | city | fragments | fragment | scene | place | connection | discovery | discover | inbox | receipt`（未知值回退 world；`fragments` 可带 `query` 字段承载当前搜索词）。

**stream=true（默认）→ SSE**，事件序列：

```text
event: meta    data: {"sessionId":"…","scopeLabel":"…","modelAlias":"FAST_MULTIMODAL"}
event: token   data: {"text":"正文增量…"}        # 多次
event: done    data: {"answer":"完整正文","sources":[{"id":"frag-…","kind":"fragment","label":"照片 · 16 OCT …"}],"uncertainty":"…|null","nextStep":"…","sourcesFallback":false}
event: error   data: {"message":"…"}             # 仅出错时
```

正文中的来源以 `[frag-xxx]` 内联标注，`done.sources` 是经服务端校验过的白名单，前端据此渲染"来源"区并深链（来源 id 即 fixtures 对象 id，可直接开 Fragment Lens / 对象页）。

**stream=false → 普通 JSON**：`done` 事件的数据体 + `sessionId`、`scopeLabel`、`modelAlias`。

错误码：`400` 参数问题；`503 {"error":"GEMINI_API_KEY missing"}` 未配置密钥；`502` 模型调用失败（含回退后仍失败）。

### 4.4 回答纪律（服务端强制）
- 只依据证据包回答，证据不足必须明说（prompt 强制 + 温度 0.3）；
- 不推断情绪/性格/心理（PRD §3.4，写入系统提示词）；
- 状态优先级：用户解释 > 已确认 > 建议 > 未决/冲突（证据行携带状态标签）；
- 引用 ID 服务端白名单校验：模型编造的 id 会被剔除；若全部无效，`sources` 回退为证据包 Top 项并置 `sourcesFallback:true`。

## 5. 环境变量

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `GEMINI_API_KEY` | 是（非 Vertex） | — | AI Studio key，仅存在于服务端 |
| `ELSE_MODEL_FAST` | 否 | `gemini-flash-latest` | FAST_MULTIMODAL 别名指向 |
| `ELSE_MODEL_DEEP` | 否 | 同 FAST | 生产指向 Pro 级；失败自动回退 FAST |
| `GOOGLE_GENAI_USE_VERTEXAI` | 否 | `false` | `true` 时走 Vertex（配合下两项） |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` | Vertex 时 | — / `global` | Vertex 项目与区域 |
| `PORT` | 否 | `8787` | Cloud Run 会注入 |
| `ELSE_CORS_ORIGIN` | 否 | `*` | 生产收紧为前端域名 |

## 6. 历史运行说明

原型 smoke 脚本仍保留供后续接线参考，但 legacy Else 路由当前未挂载。不要以本节历史
接口说明部署服务；实际支持的本地命令见 `services/backend/README.md`。

## 7. 实施记录

- [x] 2026-07-15 文档建立，契约冻结
- [x] 服务代码完成：8 个 src 模块 + Dockerfile + smoke 脚本，唯一依赖 `@google/genai@1.9`，共约 600 行
- [x] 单元测试通过：13/13（scope 证据包 6、路由 3、流式解析与来源校验 4；零网络依赖）
- [x] 无密钥端点验证通过：
  - `GET /healthz` → `{"ok":true,"credentials":false,"models":{…}}`
  - `GET /v1/else/suggestions?type=city&id=bangkok` → `{"scopeLabel":"Bangkok · 2024 秋","suggestions":[3 条]}`（确定性，含数据驱动槽位）
  - `POST /v1/else/ask` 无密钥 → `503 {"error":"GEMINI_API_KEY missing"}`；空问题 → `400`；未知路径 → `404`
- [x] 冒烟脚本就绪：`node scripts/smoke.mjs`（**待办给使用者**：`cp .env.example .env` 填入 `GEMINI_API_KEY` 后运行，验证真实流式回答与来源）
- [x] 提交至 `claude/elsewhere-visual-rebuild-v5` 分支

### 已知边界（诚实声明）
1. 默认模型别名 `gemini-flash-latest` 未经真实调用验证（本机无 API key）；若该别名不可用，改 `.env` 中 `ELSE_MODEL_FAST` 即可，无需改代码。
2. `DEEP_REASONING` 未配置时与 FAST 同源，路由差异仅体现在别名标注；配置 Pro 模型后生效。
3. 证据包上限 40 行按当前 fixtures 体量设定；接 Firestore 后应改为检索式（向量 + 结构化过滤）而非全量装包。

## 8. 后续路线（P1，不在本次范围）

Auth Boundary → App Check/限流 → 导入链路 → legacy Else 与 Repository 接线 → 会话落库（TTL）→ 工具型写操作（confirm_relation 等，走事务 API）→ ADK + Agent Engine 编排 → 向量检索接入（Firestore Vector Search）→ Cloud Run 部署流水线。
