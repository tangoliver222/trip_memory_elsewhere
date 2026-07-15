# Elsewhere Backend

Module 1 后端基础：Fastify 生命周期、最小领域契约、owner-scoped Repository、
Firestore/Storage Emulator 与安全规则。

## 支持的运行流程

在本目录执行：

```bash
npm install
npm test
npm run dev
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:emulator
```

`/healthz` 和 `/readyz` 是当前 foundation app 唯一注册的新端点。已有 Else 查询模块仍是
legacy 原型，未挂载到 foundation app，也未连接真实 Repository、Auth 或 App Check，
不得部署到公开环境。

Emulator 固定使用 `demo-elsewhere`，不会连接真实 Firebase 项目。Module 1 不包含
Auth/App Check、导入流程或 AI 运行链路；下一模块只建立 Auth Boundary。
