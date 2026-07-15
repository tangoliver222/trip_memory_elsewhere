# Else AI Service

Elsewhere 的 Else 助手服务端（Gemini 路由 + 证据包 + 来源校验 + SSE）。
完整设计与 **前端对接契约** 见 [`docs/implementation/else-ai-service-v1.md`](../../docs/implementation/else-ai-service-v1.md)。

```bash
npm install
cp .env.example .env    # 填入 GEMINI_API_KEY
npm run dev             # http://127.0.0.1:8787
npm test                # 单元测试（无网络）
node scripts/smoke.mjs  # 真实调用冒烟（需服务运行中）
```

端点：`GET /healthz` · `GET /v1/else/suggestions` · `POST /v1/else/ask`（SSE / JSON）。
