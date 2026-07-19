# Elsewhere 参赛演示录制手册

## 录制边界

录制优先使用真实 Google Cloud 路径：真实文件字节、Firebase Anonymous Auth、App Check、Firestore、
Storage、正式的确定性处理与权威路由、Google Document AI OCR，以及 Gemini。Emulator 路径仍保留为
无云费用的回归方案；两条路径都不使用前端固定结果冒充后端处理。Cloud Run 是否已部署以最后的验证记录为准。

## 1. 配置 Gemini（录制 Else 前必需）

复制 `services/backend/.env.example` 为 `services/backend/.env`，只需要先填写：

```dotenv
GEMINI_API_KEY=你的_Google_AI_Studio_Key
ELSE_MODEL_FAST=gemini-2.5-flash
GOOGLE_GENAI_USE_VERTEXAI=false
```

Key 获取地址：[Google AI Studio API Keys](https://aistudio.google.com/apikey)。仅跑 Emulator 回归时，
Google Cloud OCR 字段可以为空；真实云录制使用下一节的 cloud 配置。不要提交 `.env`。

## 2. 无云费用的 Emulator 回归

在仓库根目录运行：

```bash
node scripts/run-competition-demo.mjs
```

脚本会启动三个 Firebase Emulator、隔离 demo backend 和 live Vite 页面，并把 8 个真实演示文件准备到：

```text
demo-data/bangkok/originals/
```

每次停止后重新启动都是新的临时 Emulator 数据环境，等同于干净重置。不要同时启动第二套相同端口服务。

## 3. 真实 Google Cloud 录制门禁

真实云路径读取两个已被 Git 忽略的配置文件：

```text
services/backend/.env.cloud.local
design-lab/prototypes-vanilla/.env.cloud.local
```

后端文件必须保持 `DOCUMENT_AI_ENABLED=false`，因为正式 API 与 capability worker 的运行时边界不能混合；
开发专用 cloud-demo composition 通过下列独立同意开关构造 OCR worker：

```dotenv
CAPABILITY_EXECUTION_MODE=google
ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED=true
```

只有在明确同意把本次演示小票原始字节发送给 Google Document AI 后，才把第二项设为 `true`。该开关
不会被提交。运行验证命令本身还需要第二道显式费用门禁：

```bash
RUN_REAL_GOOGLE_PROVIDER_TESTS=true node scripts/run-google-cloud-demo.mjs --verify
```

脚本会启动本地 cloud-demo backend 与 cloud-mode Vite，但 Auth、App Check、Firestore、Storage、
Document AI 和 Gemini 都使用真实 Google 服务。验收只允许 1 次 Document AI 请求和 1 次 Gemini 请求；
结束时通过已验证 uid 删除该测试 owner 的 Firestore/Storage 数据。未提供费用门禁或原始字节同意开关时，
脚本必须在启动服务前失败。

演示包中的 Common Grounds 小票是项目自有、明确标注 `DEMO RECEIPT` 的真实 PNG 输入。manifest 只保存
类型、时间和位置提示，不保存商户、金额或 OCR 文本；页面显示的 OCR 摘要必须来自持久化的
Document AI normalized artifact。

最近一次完整门禁于 2026-07-19 通过：Playwright `1 passed (1.8m)`，8 个原件全部保存，只有 1 个
receipt 产生 Google Document AI artifact，Else 完成 1 次真实 Gemini 问答且来源可打开；清理后 snapshot
为零，测试身份随后删除。门禁结束后 `ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED` 已恢复为 `false`。

同一提交前的无费用回归结果：后端普通测试 610 项（602 通过、8 项为未启动 Emulator 的预期跳过）、
Firebase Emulator 70/70、前端单元测试 81/81、本地完整浏览器演示 1/1、默认与 cloud 生产构建均成功。
Emulator 命令需要 Homebrew OpenJDK 21 位于 PATH。

## 4. 录制顺序

1. 打开 `http://127.0.0.1:4174/#/world/import`。
2. 选择 `demo-data/bangkok/originals/` 中全部 8 个文件。
3. 点击“开始整理 8 个原件”，保留上传、处理与真实回执画面。
4. 进入 World：确认显示 8 个碎片、1 座城市，地球与粒子由 live collection 驱动。
5. 进入 Bangkok：展示 Common Grounds、Riverside 与地点待确认三个实际数据团块。
6. 进入全部碎片：打开 Common Grounds 小票的 Fragment Lens，展示原件、持久化处理轨迹与
   Google Document AI 文字摘录。
7. 进入发现：先展示 10 月 12、16、19 日三个持久化来源，再显影“3 个早晨”标题。
8. 打开 Else，问“我反复去过哪里？”。回答必须含至少一个可点击来源，点击后打开 Fragment Lens。

## 5. 自动验证

无 Gemini Key 时验证真实确定性主链及明确的不可用状态：

```bash
node scripts/run-competition-demo.mjs --verify
```

配置并导出 Gemini Key 后，要求 Playwright 同时通过真实来源问答门槛：

```bash
REQUIRE_GEMINI_DEMO=true GEMINI_API_KEY=你的_Key node scripts/run-competition-demo.mjs --verify
```

## 6. 录制前硬检查

- 页面导入控件实际选择本地文件，不是“开始演示”按钮。
- 回执、World、Field 的数量均为当前 snapshot 的 8，不出现旧 fixture 的 172。
- Field 节点的 `data-fragment-id` 为本次后端签发的 `frag_...`。
- Emulator 回归时 Lens 图片 URL 指向 Storage Emulator；真实云录制时 URL 指向当前 Firebase Storage
  owner 的受保护原件或缩略图。
- 真实云快照中恰好只有 1 个 receipt Fragment 含 `Google Document AI` 的持久化 OCR 结果。
- Common Grounds 商户名与文字摘录不来自 manifest 或前端 fixture。
- Discovery 恰好列出三个不同日期的持久化来源。
- Else 回答来自配置后的 Gemini；无 Key 时页面必须说“Gemini 尚未配置”。
- Else 返回的来源可打开 Lens；没有来源的回答不能作为录制成功。
- 稳定录屏前等待 `window.__ELSEWHERE_VISUAL_READY__ === true`。
