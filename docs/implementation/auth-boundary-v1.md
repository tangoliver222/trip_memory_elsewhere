# Elsewhere Auth Boundary v1 — 实施记录

**状态：** Module 2 完成
**日期：** 2026-07-16
**设计依据：** `docs/superpowers/specs/2026-07-16-auth-boundary-design.md`
**TDD 计划：** `docs/plans/2026-07-16-auth-boundary-tdd-plan.md`

## 1. 范围

本模块只建立进入业务 handler 之前的 Firebase 身份与应用完整性边界：

- 严格解析单值 `Authorization: Bearer <token>` 和 `X-Firebase-AppCheck`；
- 通过 port 隔离 Firebase Admin Auth / App Check；
- 以当前环境 `allowedAppIds` 拒绝其他 Elsewhere App ID；
- 在验证成功后安装不可变的 `{ uid, appId }` 请求上下文；
- 在 handler 和 Repository 执行前返回稳定、无 provider 细节的失败响应；
- 使用真实 Auth Emulator 匿名 ID Token 验证完整测试链路。

明确不包含：前端登录 UI、session 数据库、角色或管理员权限、replay protection、
revoked-token 网络检查、限流、Import Batch、生产业务 API，以及新的运行时依赖。

## 2. 接口与组合

边界注册接口：

```js
registerAuthBoundary(app, { tokenVerifier, allowedAppIds }) => requireAuth
```

`tokenVerifier` port 必须实现：

```js
verifyIdToken(token) => Promise<{ uid }>
verifyAppCheckToken(token) => Promise<{ appId }>
```

Firebase adapter 只向边界返回 `uid` / `appId`。App Check 使用
`appCheck.verifyToken()` 返回对象的 `result.appId`，不读取 `app_id`，也不把
`VerifyAppCheckTokenResponse` 当作 `DecodedAppCheckToken`。

生产 composition 必须为每个环境显式提供非空 `allowedAppIds`。边界先执行
`app.decorateRequest('authContext', null)`；验证成功后为该请求定义：

```js
Object.freeze({ uid, appId })
```

该属性不可写、不可重新配置。handler 只从 `request.authContext.uid` 获取 owner 身份，
忽略客户端 body、query 或 header 中伪造的 `uid` / `ownerId`。

## 3. 稳定失败契约

所有边界失败返回 HTTP `401`：

| 场景 | code |
|---|---|
| 缺少 ID Token | `auth/missing-id-token` |
| ID Token 格式错误或验证失败 | `auth/invalid-id-token` |
| 缺少 App Check Token | `app-check/missing-token` |
| App Check 格式错误、验证失败或 appId 不在白名单 | `app-check/invalid-token` |

响应只包含稳定的 `code`、通用 `message` 和服务端 Fastify `request.id`。客户端传入的
`requestId` 不会被采用；Firebase 原始错误和 token 内容不会进入响应。

Header parser 拒绝空值、重复 header 形成的数组、逗号合并值、Bearer 之外的 scheme，
以及 token 内空白。ID Token 验证失败后不会调用 App Check verifier。

## 4. 测试与生产隔离

production app factory 仅注册 `/healthz` 与 `/readyz`。测试 helper
`test/helpers/create-protected-app.js` 才注册 `/protected`，并注入 fake Repository。
因此集成测试可以证明 handler / Repository 的调用边界，同时不会引入生产探针端点。

Auth Emulator 测试由 Firebase Web SDK 执行匿名登录，取得真实 Emulator ID Token，
再由 Firebase Admin Auth adapter 验证为同一个 uid。fake App Check verifier 只注入测试
composition root；生产 adapter 和 production app 均未被替换或绕过。

## 5. 2026-07-16 验证记录

在 `services/backend` 执行：

```bash
node --test \
  test/unit/auth-contracts.test.js \
  test/unit/firebase-token-verifier.test.js \
  test/unit/auth-boundary.test.js \
  test/integration/auth-boundary-app.test.js
npm test
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:emulator
npm audit --omit=dev
git diff --check
rg -n "['\"]\/protected" src
```

结果：

- Auth focused：16 pass，0 fail，0 skip；
- 普通 Node tests：48 项，44 pass，4 个 Emulator-only skip，0 fail；
- Auth + Firestore + Storage Emulator：13 pass，0 fail，0 skip；
- production dependency audit：0 vulnerabilities；
- `git diff --check`：无输出；
- production `/protected` 搜索：无匹配（`rg` exit 1）。

统一 Emulator 命令结束后依次停止 Firestore、Auth、Storage 与 hub。Firestore Admin SDK
仍会输出本机 metadata lookup warning，但测试为 0 fail，且 demo project 不会回退访问
非模拟服务。

## 6. 剩余边界

- 尚无前端匿名登录接线；
- 尚无受保护生产业务端点；
- 尚无真实 App Check provider / 客户端 token 接线；
- 尚未创建或部署真实 Firebase / Google Cloud 资源。

下一模块命名为 **Import Batch + Original Save**，但本次没有开始 Module 3 的设计、测试
或实现。
