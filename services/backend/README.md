# Elsewhere Backend

Module 1–2 后端基础：Fastify 生命周期、最小领域契约、owner-scoped Repository、
Firebase Auth / App Check 边界，以及 Auth、Firestore、Storage Emulator 验证。

## 支持的运行流程

在本目录执行：

```bash
npm install
npm test
npm run dev
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:emulator
```

`/healthz` 和 `/readyz` 是当前 production app 唯一注册的端点。Module 2 提供
`registerAuthBoundary()`，但不注册业务路由；`/protected` 只存在于测试 harness。生产
composition root 后续挂载受保护业务路由时，必须显式传入当前环境的 `allowedAppIds`。

受保护请求必须同时携带：

```text
Authorization: Bearer <Firebase ID Token>
X-Firebase-AppCheck: <Firebase App Check Token>
```

已有 Else 查询模块仍是 legacy 原型，未挂载到 production app，也未连接真实 Repository
或 Auth Boundary，不得部署到公开环境。

`test:emulator` 会在 `demo-elsewhere` 下启动 Auth、Firestore 和 Storage Emulator，命令
完成后统一清理，不会连接真实 Firebase 项目。当前不包含前端登录、受保护业务 API、
导入流程或 AI 运行链路。
