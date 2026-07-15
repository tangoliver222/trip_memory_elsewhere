# Elsewhere Backend Foundation v1 — 实施记录

**状态：** Module 1 完成，等待合并  
**日期：** 2026-07-16  
**设计依据：** `docs/superpowers/specs/2026-07-16-elsewhere-backend-program-design.md`

## 1. 范围

本模块只建立后续服务可以复用并验证的后端边界：

- 单一 `services/backend` Node 22 package；
- Fastify app factory、启动与优雅关闭；
- Fragment、ImportBatch、Reference、Provenance 的 Zod 契约；
- owner-scoped Repository contract，以及 memory / Firestore 两个实现；
- Firestore 与 Storage deny-by-default 规则；
- 只使用 `demo-elsewhere` 的本地 Emulator 验证。

明确不在本模块实现：Auth、App Check、导入处理、AI 接线、公开业务 API、云端项目、
Cloud Run 部署、向量检索和后台任务。foundation app 仅注册 `/healthz` 与 `/readyz`；
legacy Else 文件仍在仓库中，但不会被 app 加载。

## 2. 已解析依赖

| 依赖 | 版本 | 用途 |
|---|---:|---|
| Node.js | `>=22` | 服务运行时 |
| Fastify | `5.10.0` | app 生命周期与健康端点 |
| Zod | `4.4.3` | 环境变量与领域输入校验 |
| Firebase Admin | `14.1.0` | 服务端 Firestore 访问 |
| Firebase client SDK | `12.16.0` | 安全规则测试 |
| Firebase Tools | `15.22.2` | 本地 Emulator |
| Firebase Rules Unit Testing | `5.0.1` | Auth context 与规则断言 |
| OpenJDK | `21.0.11` | Emulator 运行时 |

`gaxios@6.7.1` 与 `teeny-request@9.0.0` 的 `uuid` 被窄范围覆盖到 `11.1.1`，以修复
Firebase 上游传递依赖的安全公告，同时避免 `npm audit fix --force` 将 Firebase Admin
错误降级到 10.x。覆盖后普通测试与 Emulator contract 均通过。

## 3. 领域契约

- 所有持久对象携带 `id`、`ownerId`、`schemaVersion: 1`、创建/更新时间与软删除字段；
- Fragment 原件路径必须严格等于
  `users/{ownerId}/originals/{batchId}/{fragmentId}`；
- Provenance 同时保存值、来源类型、来源引用、处理器版本、置信度、状态和观察时间；
- ImportBatch 计数必须为非负整数，且单项计数不得超过 `inputCount`；
- Reference 统一使用 `{ type, id }`，拒绝替代字段和多余字段。

## 4. Repository 边界

唯一冻结的方法为：

```text
createFragment(uid, fragment)
getFragment(uid, fragmentId)
createImportBatch(uid, batch)
getImportBatch(uid, batchId)
```

Firestore 路径：

```text
users/{uid}/fragments/{fragmentId}
users/{uid}/importBatches/{batchId}
```

每次访问必须显式提供 `uid`。create 会先检查 `uid === ownerId`，再执行 schema 校验；
重复创建返回稳定的 `repository/conflict`，owner 不匹配返回
`repository/owner-mismatch`。get 只读取带 uid 前缀的文档路径，不跨 collection 查询 ID。
memory 与 Firestore 实现运行同一套 contract tests，返回对象不会反向修改存储值。

## 5. 安全规则矩阵

| 资源 | Owner | 其他用户 / 未登录 | 写入策略 |
|---|---|---|---|
| Firestore Fragment | 可读 | 拒绝 | 客户端全部拒绝；仅 Admin Repository 写 |
| Firestore ImportBatch | 可读 | 拒绝 | 客户端全部拒绝；仅 Admin Repository 写 |
| Storage original | 可读 | 拒绝 | Owner 仅可 create；update/delete 拒绝 |
| 其他 Firestore / Storage 路径 | 拒绝 | 拒绝 | 拒绝 |

Storage create 额外限制为 50 MiB 以下，且仅允许图片、PDF 或纯文本。

## 6. 验证记录

在 `services/backend` 执行：

```bash
npm test
npm audit --omit=dev
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:emulator
```

2026-07-16 验证结果：

- Node tests：29 项，26 pass，3 个 Emulator-only 测试在普通环境 skip，0 fail；
- Emulator tests：12 项，12 pass，0 fail；
- production dependency audit：0 vulnerabilities；
- `git diff --check`：无输出。

## 7. 剩余风险与下一模块

- 尚无 Auth，当前不存在可公开调用的用户业务端点；
- 尚无 App Check、限流或滥用防护；
- 未创建或部署任何真实 Firebase / Google Cloud 资源；
- legacy Else 查询链路仍读取 fixtures，且被明确排除在 foundation app 之外；
- Emulator 使用 Admin SDK 时会出现无害的本机 metadata lookup warning，不影响 contract
  结果；真实服务必须使用 ADC / service identity，不使用测试凭据绕过。

下一模块只实现 **Auth Boundary**：验证身份、把 uid 注入 use case，并用测试证明匿名请求与
跨用户访问均在进入 Repository 之前被拒绝。导入和 AI 均不得提前混入该模块。
