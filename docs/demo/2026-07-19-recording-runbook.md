# Elsewhere 参赛演示录制手册

## 录制边界

这条路径使用真实文件字节、匿名 Auth Emulator 身份、Firestore/Storage Emulator 持久化、正式的确定性
处理与路由代码，以及可选的真实 Gemini 调用。它是本地可复现竞赛原型，不声称已经完成 Cloud Run
生产部署。Document AI 未配置时，票据 OCR 保持未完成，不用固定文字代替。

## 1. 配置 Gemini（录制 Else 前必需）

复制 `services/backend/.env.example` 为 `services/backend/.env`，只需要先填写：

```dotenv
GEMINI_API_KEY=你的_Google_AI_Studio_Key
ELSE_MODEL_FAST=gemini-2.5-flash
GOOGLE_GENAI_USE_VERTEXAI=false
```

Key 获取地址：[Google AI Studio API Keys](https://aistudio.google.com/apikey)。其他 Google Cloud OCR 字段
本次可保持为空。不要提交 `.env`。

## 2. 启动

在仓库根目录运行：

```bash
node scripts/run-competition-demo.mjs
```

脚本会启动三个 Firebase Emulator、隔离 demo backend 和 live Vite 页面，并把 8 个真实演示文件准备到：

```text
demo-data/bangkok/originals/
```

每次停止后重新启动都是新的临时 Emulator 数据环境，等同于干净重置。不要同时启动第二套相同端口服务。

## 3. 录制顺序

1. 打开 `http://127.0.0.1:4174/#/world/import`。
2. 选择 `demo-data/bangkok/originals/` 中全部 8 个文件。
3. 点击“开始整理 8 个原件”，保留上传、处理与真实回执画面。
4. 进入 World：确认显示 8 个碎片、1 座城市，地球与粒子由 live collection 驱动。
5. 进入 Bangkok：展示 Common Grounds、Riverside 与地点待确认三个实际数据团块。
6. 进入全部碎片：打开任意带图原件的 Fragment Lens，并展示 Storage Emulator 返回的原件/缩略图。
7. 进入发现：先展示 10 月 12、16、19 日三个持久化来源，再显影“3 个早晨”标题。
8. 打开 Else，问“我反复去过哪里？”。回答必须含至少一个可点击来源，点击后打开 Fragment Lens。

## 4. 自动验证

无 Gemini Key 时验证真实确定性主链及明确的不可用状态：

```bash
node scripts/run-competition-demo.mjs --verify
```

配置并导出 Gemini Key 后，要求 Playwright 同时通过真实来源问答门槛：

```bash
REQUIRE_GEMINI_DEMO=true GEMINI_API_KEY=你的_Key node scripts/run-competition-demo.mjs --verify
```

## 5. 录制前硬检查

- 页面导入控件实际选择本地文件，不是“开始演示”按钮。
- 回执、World、Field 的数量均为当前 snapshot 的 8，不出现旧 fixture 的 172。
- Field 节点的 `data-fragment-id` 为本次后端签发的 `frag_...`。
- Lens 图片 URL 指向本地 Storage Emulator，且内容是所选原件。
- Discovery 恰好列出三个不同日期的持久化来源。
- Else 回答来自配置后的 Gemini；无 Key 时页面必须说“Gemini 尚未配置”。
- Else 返回的来源可打开 Lens；没有来源的回答不能作为录制成功。
- 稳定录屏前等待 `window.__ELSEWHERE_VISUAL_READY__ === true`。
