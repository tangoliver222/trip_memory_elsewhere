# Backend Foundation v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Elsewhere 唯一后端包、稳定运行入口、最小领域 schema、可替换 Repository 和经过 Emulator 验证的用户数据隔离，不开发任何导入或 AI 新功能。

**Architecture:** 将现有 `services/else-service` 机械迁移为 `services/backend`，保留 Else 原型代码作为未扩展 legacy；新基础层使用 Fastify app factory、Zod runtime schema、异步 Repository contract、in-memory/Firestore 两种 adapter。Firebase Emulator 只验证 Firestore/Storage 规则和 adapter，不连接任何真实项目。

**Tech Stack:** Node.js 22 ESM、Fastify 5.10、Zod 4.4、Firebase Admin 14.1、Firebase JS 12.16、Firebase Tools 15.22、`@firebase/rules-unit-testing` 5.0、Node `node:test`。

## Global Constraints

- 只在 `/Users/tangyixuan/trip_memory_elsewhere/.worktrees/backend-foundation-v1` 工作。
- 不修改 `design-lab/prototypes-vanilla` 或任何前端 fixture。
- 每个行为变更先写失败测试、确认 RED、写最小实现、确认 GREEN。
- 每个 Task 结束必须独立 Git 提交；不把多个 Task 合并提交。
- 运行时代码只增加 Fastify、Zod、Firebase Admin；Firebase CLI、JS SDK、Rules Unit Testing 都是 dev dependency。
- 所有 Repository 方法显式接收 `uid`；无效 owner 不读取或写入数据。
- 不实现 Auth/App Check、导入、OCR、Gemini、Places、Connection 或 Discovery；这些属于后续模块。
- 不修补现有 Else 回答协议；只保证 legacy 单元测试继续运行。
- 不使用真实 Firebase project ID；Emulator 固定使用 `demo-elsewhere`。

---

### Task 1: 机械迁移为唯一 backend package

**Files:**
- Move: `services/else-service/` -> `services/backend/`
- Move: `services/backend/tests/` -> `services/backend/test/legacy/`
- Modify: `services/backend/package.json`
- Modify: `services/backend/README.md`
- Modify: `docs/implementation/else-ai-service-v1.md`

**Interfaces:**
- Consumes: 现有 13 个 legacy 单元测试与 `src/*.js` 相对导入。
- Produces: `services/backend` 唯一 package；`npm test` 继续运行 legacy 测试。

- [ ] **Step 1: 记录迁移前基线**

Run:

```bash
npm --prefix services/else-service test
```

Expected: 13 tests pass, 0 fail.

- [ ] **Step 2: 机械移动目录和测试**

Run:

```bash
git mv services/else-service services/backend
mkdir -p services/backend/test
git mv services/backend/tests services/backend/test/legacy
```

将三个 legacy 测试中的导入从 `../src/` 改为 `../../src/`。不要修改测试断言或生产逻辑。

- [ ] **Step 3: 收紧 package 脚本与名称**

`services/backend/package.json` 改为：

```json
{
  "name": "elsewhere-backend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "node --env-file=.env --watch src/server.js",
    "start": "node src/server.js",
    "test": "node --test",
    "test:legacy": "node --test test/legacy/*.test.js"
  },
  "dependencies": {
    "@google/genai": "1.52.0"
  }
}
```

同步执行 `npm install --package-lock-only` 更新 lockfile，不升级 legacy SDK。

- [ ] **Step 4: 标记 Else 实现为 legacy 原型**

`services/backend/README.md` 只写：

```markdown
# Elsewhere Backend

Elsewhere 的统一后端包。当前提交仅迁移已有 Else 查询原型；新的基础设施会按
`docs/superpowers/specs/2026-07-16-elsewhere-backend-program-design.md` 分模块建立。

```bash
npm install
npm test
```

现有 Else 代码尚未连接真实 Repository、Auth 或 App Check，不得部署到公开环境。
```

在 `docs/implementation/else-ai-service-v1.md` 顶部状态后增加：

```markdown
> 2026-07-16 审计结论：本实现保留为 legacy 查询原型，目录已迁移到
> `services/backend`。在 Auth、真实 Repository 和结构化来源验证完成前不得公开部署。
```

- [ ] **Step 5: 验证迁移没有行为变化**

Run:

```bash
npm --prefix services/backend install
npm --prefix services/backend test
git diff --check
```

Expected: 13 tests pass；`git diff --check` 无输出。

- [ ] **Step 6: 提交迁移**

```bash
git add services/backend docs/implementation/else-ai-service-v1.md
git commit -m "chore: migrate Else service into backend package"
```

---

### Task 2: 可测试的配置和 HTTP 生命周期

**Files:**
- Modify: `services/backend/package.json`
- Modify: `services/backend/package-lock.json`
- Modify: `services/backend/src/config.js`
- Create: `services/backend/src/app.js`
- Replace: `services/backend/src/server.js`
- Create: `services/backend/test/unit/config.test.js`
- Create: `services/backend/test/integration/app.test.js`

**Interfaces:**
- Consumes: Task 1 package。
- Produces: `loadConfig(env)`、`config`、`hasCredentials()`、`createApp({ appConfig })`；`server.js` 是唯一监听入口。

- [ ] **Step 1: 安装固定主版本依赖**

Run:

```bash
npm --prefix services/backend install fastify@5.10.0 zod@4.4.3
```

Expected: package-lock 固定实际版本，`npm audit --omit=dev` 不出现 high/critical。

- [ ] **Step 2: 写配置失败测试**

Create `services/backend/test/unit/config.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';

test('loadConfig returns safe local defaults', () => {
  const result = loadConfig({ NODE_ENV: 'test' });
  assert.equal(result.nodeEnv, 'test');
  assert.equal(result.host, '127.0.0.1');
  assert.equal(result.port, 8787);
  assert.equal(result.bodyLimit, 32 * 1024);
});

test('loadConfig rejects an invalid port before startup', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'test', PORT: '70000' }),
    /Invalid backend configuration/,
  );
});
```

Run:

```bash
npm --prefix services/backend test -- test/unit/config.test.js
```

Expected: FAIL because `loadConfig` is not exported.

- [ ] **Step 3: 实现最小配置 schema，保留 legacy 字段**

Replace `services/backend/src/config.js` with:

```js
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(1024 * 1024).default(32 * 1024),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  GEMINI_API_KEY: z.string().default(''),
  GOOGLE_GENAI_USE_VERTEXAI: z.enum(['true', 'false']).default('false'),
  GOOGLE_CLOUD_PROJECT: z.string().default(''),
  GOOGLE_CLOUD_LOCATION: z.string().default('global'),
  ELSE_MODEL_FAST: z.string().default('gemini-flash-latest'),
  ELSE_MODEL_DEEP: z.string().optional(),
  ELSE_CORS_ORIGIN: z.string().default('*'),
});

export function loadConfig(env = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid backend configuration: ${fields}`);
  }
  const value = parsed.data;
  return Object.freeze({
    nodeEnv: value.NODE_ENV,
    host: value.HOST,
    port: value.PORT,
    bodyLimit: value.BODY_LIMIT_BYTES,
    logLevel: value.LOG_LEVEL,
    apiKey: value.GEMINI_API_KEY,
    useVertex: value.GOOGLE_GENAI_USE_VERTEXAI === 'true',
    vertexProject: value.GOOGLE_CLOUD_PROJECT,
    vertexLocation: value.GOOGLE_CLOUD_LOCATION,
    models: Object.freeze({
      FAST_MULTIMODAL: value.ELSE_MODEL_FAST,
      DEEP_REASONING: value.ELSE_MODEL_DEEP || value.ELSE_MODEL_FAST,
    }),
    corsOrigin: value.ELSE_CORS_ORIGIN,
    evidenceLimit: 40,
    maxQuestionLength: 500,
  });
}

export const config = loadConfig();
export const hasCredentials = () => Boolean(
  config.apiKey || (config.useVertex && config.vertexProject),
);
```

Run the config test again. Expected: 2 pass.

- [ ] **Step 4: 写 app 生命周期失败测试**

Create `services/backend/test/integration/app.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';

test('health endpoints are stable and reveal no model or credential details', async (t) => {
  const app = createApp({
    appConfig: { nodeEnv: 'test', bodyLimit: 32 * 1024, logLevel: 'silent' },
  });
  t.after(() => app.close());

  const health = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: 'ok' });
  assert.equal(JSON.stringify(health.json()).includes('model'), false);

  const ready = await app.inject({ method: 'GET', url: '/readyz' });
  assert.equal(ready.statusCode, 200);
  assert.deepEqual(ready.json(), { status: 'ready' });
});
```

Run the test. Expected: FAIL because `src/app.js` does not exist.

- [ ] **Step 5: 实现 app factory 和唯一 server 入口**

Create `services/backend/src/app.js`:

```js
import Fastify from 'fastify';
import { config } from './config.js';

export function createApp({ appConfig = config } = {}) {
  const app = Fastify({
    logger: appConfig.logLevel === 'silent' ? false : { level: appConfig.logLevel },
    bodyLimit: appConfig.bodyLimit,
  });
  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ status: 'ready' }));
  return app;
}
```

Replace `services/backend/src/server.js` with:

```js
import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

const close = async (signal) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};

process.once('SIGINT', () => void close('SIGINT'));
process.once('SIGTERM', () => void close('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'startup failed');
  process.exit(1);
}
```

Run:

```bash
npm --prefix services/backend test
npm --prefix services/backend audit --omit=dev
git diff --check
```

Expected: all tests pass；no high/critical runtime advisory；diff check clean.

- [ ] **Step 6: 提交配置与生命周期**

```bash
git add services/backend
git commit -m "feat: add validated backend app lifecycle"
```

---

### Task 3: 最小领域 schema

**Files:**
- Create: `services/backend/src/domain/common.js`
- Create: `services/backend/src/domain/provenance.js`
- Create: `services/backend/src/domain/fragment.js`
- Create: `services/backend/src/domain/import-batch.js`
- Create: `services/backend/src/domain/index.js`
- Create: `services/backend/test/unit/domain.test.js`

**Interfaces:**
- Consumes: Zod 4.4.
- Produces: `ReferenceSchema`、`ProvenanceSchema`、`FragmentSchema`、`ImportBatchSchema` 和对应 `parse*` functions。

- [ ] **Step 1: 写 schema 行为测试**

Create `services/backend/test/unit/domain.test.js` with four tests:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFragment,
  parseImportBatch,
  parseProvenance,
  parseReference,
} from '../../src/domain/index.js';

const now = '2026-07-16T00:00:00.000Z';

test('reference accepts one canonical type/id shape', () => {
  assert.deepEqual(parseReference({ type: 'fragment', id: 'frag_12345678' }), {
    type: 'fragment', id: 'frag_12345678',
  });
  assert.throws(() => parseReference({ type: 'fragment', from: 'x' }));
});

test('provenance requires source, processor, confidence and status', () => {
  const result = parseProvenance({
    value: 'Common Grounds',
    sourceType: 'ocr',
    sourceRefs: [{ type: 'fragment', id: 'frag_12345678' }],
    processor: { name: 'document-ocr', version: '1.0.0', modelAlias: null, promptVersion: null },
    confidence: 0.88,
    status: 'suggested',
    observedAt: now,
  });
  assert.equal(result.confidence, 0.88);
  assert.throws(() => parseProvenance({ ...result, confidence: 1.5 }));
});

test('fragment original path must stay inside its owner', () => {
  const fragment = {
    id: 'frag_12345678', ownerId: 'user_alpha', schemaVersion: 1,
    createdAt: now, updatedAt: now, deletedAt: null,
    batchId: 'batch_12345678', type: 'photo', status: 'uploaded',
    storage: { originalPath: 'users/user_alpha/originals/batch_12345678/frag_12345678' },
    hashes: {}, facts: {}, journeyId: null, sceneId: null, placeId: null,
  };
  assert.equal(parseFragment(fragment).ownerId, 'user_alpha');
  assert.throws(() => parseFragment({
    ...fragment,
    storage: { originalPath: 'users/user_beta/originals/batch_12345678/frag_12345678' },
  }));
});

test('import batch counters cannot exceed the declared input count', () => {
  const batch = {
    id: 'batch_12345678', ownerId: 'user_alpha', schemaVersion: 1,
    createdAt: now, updatedAt: now, deletedAt: null,
    status: 'open', inputCount: 2,
    counters: { saved: 1, processed: 0, failed: 0, needsReview: 0 },
  };
  assert.equal(parseImportBatch(batch).counters.saved, 1);
  assert.throws(() => parseImportBatch({
    ...batch, counters: { ...batch.counters, saved: 3 },
  }));
});
```

Run the file. Expected: FAIL because domain exports do not exist.

- [ ] **Step 2: 实现 common 和 provenance schema**

Create `common.js` with `IdSchema`, `IsoDateTimeSchema`, `ReferenceSchema`, `CommonFields` and `parseReference()`. IDs use `/^[A-Za-z0-9_-]{8,128}$/`; reference type is one of `fragment|entity|place|visit|scene|connection|discovery|note|journey|city|importBatch`.

Create `provenance.js` with exactly the fields shown in the test. Use `z.json()` for `value`, confidence `0..1`, strict objects, and export `parseProvenance()`.

- [ ] **Step 3: 实现 Fragment 和 ImportBatch schema**

`FragmentSchema` must be strict, use common fields, and enforce:

```js
fragment.storage.originalPath ===
  `users/${fragment.ownerId}/originals/${fragment.batchId}/${fragment.id}`
```

Allowed Fragment types: `photo|receipt|ticket|screenshot|menu|text|audio`。Allowed status: `uploaded|processing|placed|unresolved|failed`。`facts` is `z.record(z.string(), ProvenanceSchema)`；journey/scene/place IDs are nullable.

`ImportBatchSchema` must be strict, allow `open|processing|completed|completed_with_errors|failed`, require non-negative integer counters, and reject any individual counter greater than `inputCount`.

Export all four parse functions from `domain/index.js`.

- [ ] **Step 4: 运行 domain 与完整测试**

```bash
npm --prefix services/backend test -- test/unit/domain.test.js
npm --prefix services/backend test
git diff --check
```

Expected: domain 4 pass；full suite pass；diff check clean.

- [ ] **Step 5: 提交领域契约**

```bash
git add services/backend/src/domain services/backend/test/unit/domain.test.js
git commit -m "feat: define backend domain contracts"
```

---

### Task 4: Repository contract 和 in-memory adapter

**Files:**
- Create: `services/backend/src/repositories/errors.js`
- Create: `services/backend/src/repositories/contract.js`
- Create: `services/backend/src/repositories/memory.js`
- Create: `services/backend/test/contract/repository.contract.js`
- Create: `services/backend/test/contract/memory-repository.test.js`

**Interfaces:**
- Consumes: `parseFragment()`、`parseImportBatch()`。
- Produces: `createMemoryRepository()` 和异步方法 `create/getFragment`、`create/getImportBatch`。

- [ ] **Step 1: 写可复用 Repository contract tests**

Create `repository.contract.js` exporting:

```js
export function runRepositoryContract({ name, createRepository }) {
  const now = '2026-07-16T00:00:00.000Z';
  const fragment = {
    id: 'frag_12345678', ownerId: 'user_alpha', schemaVersion: 1,
    createdAt: now, updatedAt: now, deletedAt: null,
    batchId: 'batch_12345678', type: 'photo', status: 'uploaded',
    storage: { originalPath: 'users/user_alpha/originals/batch_12345678/frag_12345678' },
    hashes: {}, facts: {}, journeyId: null, sceneId: null, placeId: null,
  };
  const batch = {
    id: 'batch_12345678', ownerId: 'user_alpha', schemaVersion: 1,
    createdAt: now, updatedAt: now, deletedAt: null,
    status: 'open', inputCount: 1,
    counters: { saved: 0, processed: 0, failed: 0, needsReview: 0 },
  };

  test(`${name}: creates and returns owner-scoped objects`, async () => {
    const repository = await createRepository();
    await repository.createImportBatch('user_alpha', batch);
    await repository.createFragment('user_alpha', fragment);
    assert.deepEqual(await repository.getImportBatch('user_alpha', batch.id), batch);
    assert.deepEqual(await repository.getFragment('user_alpha', fragment.id), fragment);
  });

  test(`${name}: never returns another owner's object`, async () => {
    const repository = await createRepository();
    await repository.createFragment('user_alpha', fragment);
    assert.equal(await repository.getFragment('user_beta', fragment.id), null);
  });

  test(`${name}: rejects owner mismatch and duplicate create`, async () => {
    const repository = await createRepository();
    await assert.rejects(() => repository.createFragment('user_beta', fragment), /owner/i);
    await repository.createFragment('user_alpha', fragment);
    await assert.rejects(() => repository.createFragment('user_alpha', fragment), /already exists/i);
  });
}
```

The file imports `test` and `assert` from Node. Create `memory-repository.test.js` calling the contract with `createMemoryRepository`.

Run it. Expected: FAIL because the adapter does not exist.

- [ ] **Step 2: 实现最小错误和 contract assertion**

Create `errors.js` with `RepositoryConflictError` and `RepositoryOwnerError` carrying stable `code` values `repository/conflict` and `repository/owner-mismatch`.

Create `contract.js` exporting `assertRepository(repository)`, checking exactly the four required async method names and returning the repository.

- [ ] **Step 3: 实现 in-memory adapter**

`createMemoryRepository()` owns two Maps keyed by `${uid}/${id}`。Every create:

1. validates `uid === object.ownerId` before schema parsing;
2. parses with the corresponding domain schema;
3. throws conflict on existing key;
4. stores `structuredClone(parsed)`.

Every get returns `structuredClone(value)` or `null`; it never searches without the uid prefix.

- [ ] **Step 4: 验证 contract**

```bash
npm --prefix services/backend test -- test/contract/memory-repository.test.js
npm --prefix services/backend test
git diff --check
```

Expected: contract tests pass and full suite remains green.

- [ ] **Step 5: 提交 Repository contract**

```bash
git add services/backend/src/repositories services/backend/test/contract
git commit -m "feat: add owner-scoped repository contract"
```

---

### Task 5: Firebase Emulator、Firestore adapter 和安全规则

**Files:**
- Modify: `services/backend/package.json`
- Modify: `services/backend/package-lock.json`
- Create: `services/backend/src/adapters/firebase.js`
- Create: `services/backend/src/repositories/firestore.js`
- Create: `services/backend/test/contract/firestore-repository.test.js`
- Create: `services/backend/test/rules/firestore.rules.test.js`
- Create: `services/backend/test/rules/storage.rules.test.js`
- Create: `firebase/firebase.json`
- Create: `firebase/firestore.rules`
- Create: `firebase/firestore.indexes.json`
- Create: `firebase/storage.rules`

**Interfaces:**
- Consumes: Task 4 Repository contract；Firebase Emulator。
- Produces: `createFirestoreRepository({ db })`；rules that allow only owner reads and owner original-file creates.

- [ ] **Step 1: 确认 Java 21 前置条件**

Run:

```bash
java -version
```

Expected: Java 21。If missing, request approval and run:

```bash
brew install openjdk@21
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
```

- [ ] **Step 2: 安装固定依赖**

```bash
npm --prefix services/backend install firebase-admin@14.1.0
npm --prefix services/backend install --save-dev firebase@12.16.0 firebase-tools@15.22.2 @firebase/rules-unit-testing@5.0.1
```

- [ ] **Step 3: 创建 Emulator 配置和 deny-by-default rules**

`firebase/firebase.json` points Firestore and Storage to sibling rule/index files, uses ports 8080 and 9199, disables UI, and enables `singleProjectMode`.

`firestore.rules`:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function owns(userId) { return request.auth != null && request.auth.uid == userId; }
    match /users/{userId}/fragments/{fragmentId} {
      allow read: if owns(userId);
      allow write: if false;
    }
    match /users/{userId}/importBatches/{batchId} {
      allow read: if owns(userId);
      allow write: if false;
    }
    match /{document=**} { allow read, write: if false; }
  }
}
```

`storage.rules` allows authenticated owner read and create only at `users/{uid}/originals/{batchId}/{fragmentId}` when size < 50 MiB and content type matches `image/.*|application/pdf|text/plain`; update/delete and every other path are denied.

- [ ] **Step 4: 写 rules failure/success tests**

Use `initializeTestEnvironment({ projectId: 'demo-elsewhere', firestore: { rules }, storage: { rules } })`.

Firestore tests must seed with `withSecurityRulesDisabled`, then prove:

- owner can read own Fragment;
- another uid cannot read it;
- even owner cannot client-write derived Fragment.

Storage tests must prove:

- owner can create an allowed JPEG under own original path;
- another uid cannot create at that path;
- unsupported content type is denied.

Run via:

```bash
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" \
npm --prefix services/backend exec firebase -- \
  emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json \
  --only firestore,storage "npm test -- test/rules/*.test.js"
```

Expected: tests fail before rules/config are complete, then pass after the exact rules above exist.

- [ ] **Step 5: 写 Firestore Repository contract test**

The test initializes Admin with `projectId: 'demo-elsewhere'`, uses `FIRESTORE_EMULATOR_HOST`, creates a unique app name, passes `getFirestore(app)` to `createFirestoreRepository`, and invokes the same `runRepositoryContract` from Task 4.

Expected RED: module does not exist.

- [ ] **Step 6: 实现 Firebase initializer 和 Firestore adapter**

`createFirebaseAdmin({ projectId, appName })` returns `{ app, db }` and refuses a projectId not starting with `demo-` while `NODE_ENV === 'test'`.

`createFirestoreRepository({ db })` implements the four contract methods at:

```text
users/{uid}/fragments/{id}
users/{uid}/importBatches/{id}
```

Use `docRef.create(parsed)` for create-only semantics; translate Firestore `already-exists` to `RepositoryConflictError`; return parsed data or null on get. Never issue a collection query to find an ID without uid.

- [ ] **Step 7: 运行完整 Emulator 和普通测试**

```bash
npm --prefix services/backend test
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" \
npm --prefix services/backend exec firebase -- \
  emulators:exec --project demo-elsewhere --config ../../firebase/firebase.json \
  --only firestore,storage \
  "npm test -- test/rules/*.test.js test/contract/firestore-repository.test.js"
git diff --check
```

Expected: unit/legacy/in-memory tests green；Emulator rules and Firestore contract green.

- [ ] **Step 8: 提交 Firebase foundation**

```bash
git add services/backend firebase
git commit -m "feat: add Firebase repository and owner rules"
```

---

### Task 6: 文档、依赖审计和 Module 1 验收

**Files:**
- Modify: `services/backend/README.md`
- Modify: `docs/implementation/else-ai-service-v1.md`
- Create: `docs/implementation/backend-foundation-v1.md`

**Interfaces:**
- Consumes: Tasks 1–5 verified commands。
- Produces: commands that match actual implementation and an evidence-based Module 1 record。

- [ ] **Step 1: 写实际运行文档**

`services/backend/README.md` must contain only these supported flows:

```bash
npm install
npm test
npm run dev
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:emulator
```

It must explicitly say:

- `/healthz` and `/readyz` are the only new foundation endpoints;
- legacy Else modules are not production-ready;
- Emulator uses `demo-elsewhere` and never a real project;
- Auth/App Check, import and AI are not implemented in Module 1.

Add a `test:emulator` package script containing the proven command from Task 5.

- [ ] **Step 2: 写实施记录**

Create `docs/implementation/backend-foundation-v1.md` with:

- scope and explicit non-scope;
- dependency versions from package-lock;
- domain contracts created;
- Repository paths and owner guarantees;
- rules matrix;
- exact verification output counts;
- remaining risks: Auth/App Check absent, no cloud deployment, legacy Else disabled from foundation app;
- next module is Auth Boundary only.

- [ ] **Step 3: 运行最终验证**

```bash
npm --prefix services/backend test
npm --prefix services/backend audit --omit=dev
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm --prefix services/backend run test:emulator
git diff --check
git status --short
```

Expected:

- all Node tests pass with 0 fail;
- all Emulator tests pass with 0 fail;
- no high/critical runtime advisory;
- diff check has no output;
- status lists only Task 6 documentation/script edits before commit.

- [ ] **Step 4: 提交 Module 1 验收**

```bash
git add services/backend docs/implementation/backend-foundation-v1.md docs/implementation/else-ai-service-v1.md
git commit -m "docs: record backend foundation verification"
```

- [ ] **Step 5: 确认可回溯提交链**

```bash
git log --oneline --reverse 42ae54c..HEAD
git status --short --branch
```

Expected: design、plan、Tasks 1–6 each have separate commits；worktree clean。
