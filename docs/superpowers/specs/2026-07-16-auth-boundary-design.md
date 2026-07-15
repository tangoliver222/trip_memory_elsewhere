# Elsewhere Auth Boundary — 设计规格

**状态：** 已冻结，待实施  
**日期：** 2026-07-16  
**上位依据：** `2026-07-16-elsewhere-backend-program-design.md` Module 2

## 1. 目标与成功标准

Auth Boundary 只解决一个问题：自定义后端在调用任何用例或 Repository 前，同时确认
“是谁在请求”和“请求是否来自 Elsewhere 客户端”。

完成后必须满足：

1. 受保护路由同时验证 Firebase ID Token 与 Firebase App Check token；
2. 业务代码只能使用服务端验证得到的 `uid`，不信任 header、query 或 body 中的 ownerId；
3. 任一验证失败时，路由 handler 和 Repository 均不执行；
4. 匿名 Firebase 用户与已绑定登录方式的用户使用同一条后端身份路径；
5. 错误响应只有稳定 code、requestId 和安全提示，不包含 token 或 Firebase 原始异常；
6. `/healthz`、`/readyz` 继续公开，Module 2 不新增公开业务端点；
7. 普通测试、Auth Emulator 集成测试和现有 Firestore/Storage Emulator 测试全部通过。

## 2. 方案选择

### 采用：显式 route-level preHandler

每个受保护路由显式配置 `requireAuth`。边界验证成功后以不可写属性形式挂载冻结的
`request.authContext = { uid, appId }`，再进入 handler。

选择原因：

- 权限要求在路由定义处可见，后续审查不依赖隐式全局状态；
- 健康检查、未来受控 webhook 与用户业务 API 可以使用不同边界；
- 不要求现在创建一个没有产品价值的 `/session` 或测试专用生产端点；
- 只复用现有 Fastify 和 Firebase Admin，不增加运行时依赖。

### 不采用：全局保护全部 `/v1/*`

代码略少，但会把未来所有路由锁在同一种安全策略中。需要 webhook、上传回调或高风险重认证
时只能增加例外，容易形成不可见的权限分支。

### 不采用：只依赖 Cloud Run IAM / 网关

网关不能替代 Firebase 最终用户 ID Token，也不能为应用提供 App Check 证明，无法产生可信的
用户 `uid`，不满足私人数据隔离要求。

## 3. 模块边界

### 3.1 包含

- Bearer token 的严格提取；
- `X-Firebase-AppCheck` header 提取；
- Firebase Admin Auth / App Check adapter；
- Fastify preHandler；
- 只包含 `uid` 与 `appId` 的认证上下文；
- 稳定 HTTP 错误契约；
- fake verifier 单元测试和 Auth Emulator 集成测试。

### 3.2 明确不包含

- 前端登录 UI、Google/Apple/Email Link 接线；
- 用户资料、角色、团队或管理员权限；
- token session 数据库；
- App Check replay protection；
- 每次请求执行 revoked-token 网络检查；
- 限流、配额、导入、AI 或任何新的业务 API；
- 真实 Firebase 项目或 Cloud Run 部署。

删除、导出等高风险操作后续使用独立的 recent-login / revocation / replay 策略，不能让普通读取
请求承担额外网络往返和 IAM 配置成本。

## 4. 接口设计

### 4.1 Token verifier port

```js
{
  verifyIdToken(token) -> Promise<{ uid }>,
  verifyAppCheckToken(token) -> Promise<{ appId }>
}
```

`createFirebaseTokenVerifier({ auth, appCheck })` 适配 Firebase Admin：

- `auth.verifyIdToken(token)` 的 decoded `uid` 映射为 `{ uid }`；
- `appCheck.verifyToken(token)` 的 decoded `app_id` 映射为 `{ appId }`；
- 不把完整 decoded token 传给应用模块；
- 缺失 `uid` 或 `app_id` 视为无效 token。

### 4.2 Fastify boundary

```js
const requireAuth = createAuthBoundary({ tokenVerifier });

app.get('/protected', { preHandler: requireAuth }, async (request) => {
  return useCase({ uid: request.authContext.uid });
});
```

验证顺序固定为：

1. 读取并校验 `Authorization: Bearer <ID_TOKEN>`；
2. 调用 `verifyIdToken()`；
3. 读取 `X-Firebase-AppCheck`；
4. 调用 `verifyAppCheckToken()`；
5. 冻结 `{ uid, appId }` 并写入 `request.authContext`；
6. 进入 handler。

不并行验证两个 token：顺序执行能在身份已失败时避免不必要的 App Check 调用，并保持错误行为
稳定。客户端传入的 `x-user-id`、ownerId 或 uid 字段不参与此流程。

## 5. 错误契约

所有认证失败返回 HTTP `401`：

```json
{
  "error": {
    "code": "auth/missing-id-token",
    "requestId": "req-1",
    "message": "Sign in and retry."
  }
}
```

冻结的错误 code：

| 条件 | Code | Message |
|---|---|---|
| Authorization 缺失 | `auth/missing-id-token` | `Sign in and retry.` |
| Bearer 格式错误或验证失败 | `auth/invalid-id-token` | `Refresh your session and retry.` |
| App Check header 缺失 | `app-check/missing-token` | `Refresh the app session and retry.` |
| App Check 验证失败 | `app-check/invalid-token` | `Refresh the app session and retry.` |

边界捕获 Firebase 原始错误后只返回上表内容。token、完整 header、decoded claims、email 和底层
异常 message 均不进入响应或业务日志。

## 6. Firebase 与本地验证

`createFirebaseAdmin()` 扩展为返回：

```js
{ app, db, auth, appCheck }
```

测试继续固定使用 `demo-elsewhere`：

- `firebase.json` 增加 Authentication Emulator `9099`；
- Firebase Web SDK 连接 Auth Emulator 并匿名登录，取得真实 emulator ID Token；
- Firebase Admin 在 `FIREBASE_AUTH_EMULATOR_HOST` 下验证该 token；
- App Check 没有等价本地 Emulator，集成测试注入明确的 fake App Check verifier；
- fake verifier 只通过依赖注入存在于测试，非测试环境没有 bypass 配置。

Auth Emulator 发出的未签名 ID Token 只在明确配置 Emulator 的 Admin SDK 中被接受；使用
`demo-` project ID 可防止测试误触真实云资源。

## 7. 测试矩阵

### 7.1 单元测试

- Firebase adapter 只返回 `uid` / `appId`；
- 缺失、格式错误和 verifier 抛错映射到四个稳定 code；
- ID Token 失败后不调用 App Check verifier；
- 所有成功结果被冻结；
- Firebase 原始错误内容不出现在响应中。

### 7.2 Fastify 集成测试

- 公开健康端点不要求 token；
- 四种失败场景均不进入 handler；
- 合法 token 进入 handler，且使用 verified `uid`；
- 客户端伪造 `x-user-id` 或 body ownerId 不能覆盖 verified `uid`。

### 7.3 Emulator 集成测试

- 匿名用户从 Auth Emulator 取得 ID Token；
- Firebase Admin adapter 验证后得到同一用户 `uid`；
- 合法 App Check fake token 与 emulator ID Token 共同通过边界；
- 原有 Repository、Firestore Rules 和 Storage Rules 测试继续通过。

## 8. 成本与后续接线

Module 2 不新增运行时依赖或云资源。普通 token 验证使用 Firebase Admin 标准验证；不启用
App Check replay protection，因为它会增加额外网络往返，只在未来高风险端点按需启用。

Module 2 完成后，Module 3 Import Batch 的所有路由必须显式挂载 `requireAuth`，并把
`request.authContext.uid` 作为 Repository 的唯一 owner scope。Module 3 不得重新解析 token
或创建第二套用户上下文。

## 9. 官方依据

- [Firebase Admin 验证 ID Token](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [App Check 自定义后端验证](https://firebase.google.com/docs/app-check/custom-resource-backend)
- [Authentication Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth)
