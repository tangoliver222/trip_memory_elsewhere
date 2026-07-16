# Auth Boundary TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Firebase ID Token + App Check boundary that injects an immutable, server-derived `{ uid, appId }` into protected Fastify routes before any handler or Repository call.

**Architecture:** Route definitions opt into a `requireAuth` preHandler returned by `registerAuthBoundary()`. Header parsing, stable errors, Firebase verification and Fastify composition remain separate units; production creates no `/protected` route, while a test-only harness proves the complete request path. Authentication Emulator verifies a real anonymous Firebase ID Token; App Check remains an injected test double because the Local Emulator Suite has no App Check emulator.

**Tech Stack:** Node.js `>=22`, Fastify `5.10.0`, Firebase Admin `14.1.0`, Firebase Web SDK `12.16.0`, Firebase Tools `15.22.2`, Node `node:test`, OpenJDK 21.

## Global Constraints

- Do not add runtime or development dependencies.
- Do not add a production business endpoint; `/protected` exists only under `services/backend/test/helpers/`.
- `/healthz` and `/readyz` remain public and unchanged.
- Every protected route requires both a Firebase ID Token and App Check token.
- `allowedAppIds` is a required, non-empty environment-specific allowlist; there is no allow-all default.
- App Check adapter reads `VerifyAppCheckTokenResponse.appId`, never `app_id`.
- `requestId` comes only from Fastify `request.id`.
- Client header, query and body values never define `uid`, ownerId or requestId.
- `registerAuthBoundary()` calls `decorateRequest('authContext', null)` before requests and installs no route.
- Successful context is `Object.freeze({ uid, appId })` on a non-writable request property.
- Reject empty, array, duplicate and comma-merged authentication headers.
- Do not implement frontend auth, sessions, roles, admin permissions, replay protection, revoked-token checks, rate limits, Import Batch or AI.
- Every RED command must be observed failing for the described missing behavior before production code is added.
- Every GREEN/refactor commit must run the phase tests and the ordinary regression suite.

---

### Task 1: Header parser, stable errors and verifier port

**Files:**
- Create: `services/backend/test/unit/auth-contracts.test.js`
- Create: `services/backend/src/auth/headers.js`
- Create: `services/backend/src/auth/errors.js`
- Create: `services/backend/src/auth/contract.js`

**Interfaces:**
- Produces: `parseBearerToken(value) -> string | null`.
- Produces: `parseAppCheckToken(value) -> string | null`.
- Produces: `authErrorResponse(code, requestId) -> frozen response object`.
- Produces: `TokenVerificationError` with a stable generic message and `kind`.
- Produces: `assertTokenVerifier(verifier)` requiring async-capable `verifyIdToken` and `verifyAppCheckToken` functions.

- [ ] **Step 1: Write the failing contract test**

Create `services/backend/test/unit/auth-contracts.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTokenVerifier } from '../../src/auth/contract.js';
import { authErrorResponse, TokenVerificationError } from '../../src/auth/errors.js';
import { parseAppCheckToken, parseBearerToken } from '../../src/auth/headers.js';

test('Bearer parser accepts exactly one non-empty token', () => {
  assert.equal(parseBearerToken('Bearer id-token'), 'id-token');
  assert.equal(parseBearerToken('bearer id-token'), 'id-token');
  for (const value of [undefined, '', ' ', [], ['Bearer a', 'Bearer b'],
    'Basic token', 'Bearer', 'Bearer ', 'Bearer a b', 'Bearer a, Bearer b']) {
    assert.equal(parseBearerToken(value), null);
  }
});

test('App Check parser rejects empty, repeated and comma-merged values', () => {
  assert.equal(parseAppCheckToken('app-check-token'), 'app-check-token');
  for (const value of [undefined, '', ' ', [], ['a', 'b'], 'a,b', 'a, b', 'a b']) {
    assert.equal(parseAppCheckToken(value), null);
  }
});

test('auth errors expose only stable public fields', () => {
  const response = authErrorResponse('auth/invalid-id-token', 'req-server');
  assert.deepEqual(response, {
    error: {
      code: 'auth/invalid-id-token',
      requestId: 'req-server',
      message: 'Refresh your session and retry.',
    },
  });
  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(response.error), true);
});

test('token verification errors never include the provider error', () => {
  const error = new TokenVerificationError('id-token');
  assert.equal(error.message, 'Token verification failed');
  assert.equal(error.kind, 'id-token');
  assert.equal(error.message.includes('secret-provider-message'), false);
});

test('token verifier contract requires both methods', () => {
  const verifier = {
    verifyIdToken: async () => ({ uid: 'user_alpha' }),
    verifyAppCheckToken: async () => ({ appId: 'elsewhere-web-dev' }),
  };
  assert.equal(assertTokenVerifier(verifier), verifier);
  assert.throws(() => assertTokenVerifier({}), /verifyIdToken/);
  assert.throws(() => assertTokenVerifier({ verifyIdToken() {} }), /verifyAppCheckToken/);
});
```

- [ ] **Step 2: Run RED and record the missing-module failure**

Run:

```bash
node --test test/unit/auth-contracts.test.js
```

Working directory: `services/backend`.

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/auth/contract.js`. This is the correct RED reason: the public contract does not exist yet.

- [ ] **Step 3: Commit the contract tests while RED is recorded**

```bash
git add services/backend/test/unit/auth-contracts.test.js
git commit -m "test(auth): define auth boundary contracts"
```

- [ ] **Step 4: Implement strict parsers**

Create `services/backend/src/auth/headers.js`:

```js
const singleToken = (value) => {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token.includes(',') || /\s/.test(token)) return null;
  return token;
};

export function parseBearerToken(value) {
  if (typeof value !== 'string' || value.includes(',')) return null;
  const match = /^Bearer ([^\s,]+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

export const parseAppCheckToken = (value) => singleToken(value);
```

- [ ] **Step 5: Implement stable errors and verifier assertion**

Create `services/backend/src/auth/errors.js`:

```js
const DEFINITIONS = Object.freeze({
  'auth/missing-id-token': 'Sign in and retry.',
  'auth/invalid-id-token': 'Refresh your session and retry.',
  'app-check/missing-token': 'Refresh the app session and retry.',
  'app-check/invalid-token': 'Refresh the app session and retry.',
});

export function authErrorResponse(code, requestId) {
  const message = DEFINITIONS[code];
  if (!message) throw new TypeError(`Unknown auth error code: ${code}`);
  return Object.freeze({
    error: Object.freeze({ code, requestId, message }),
  });
}

export class TokenVerificationError extends Error {
  constructor(kind) {
    super('Token verification failed');
    this.name = 'TokenVerificationError';
    this.kind = kind;
  }
}
```

Create `services/backend/src/auth/contract.js`:

```js
export function assertTokenVerifier(verifier) {
  for (const method of ['verifyIdToken', 'verifyAppCheckToken']) {
    if (typeof verifier?.[method] !== 'function') {
      throw new TypeError(`Token verifier must implement ${method}()`);
    }
  }
  return verifier;
}
```

- [ ] **Step 6: Run GREEN and regression tests**

```bash
node --test test/unit/auth-contracts.test.js
npm test
git diff --check
```

Expected: auth contract tests pass; existing ordinary tests remain 0 fail; diff check has no output.

- [ ] **Step 7: Commit the minimal implementation**

```bash
git add services/backend/src/auth
git commit -m "feat(auth): add strict auth header parsing and errors"
```

---

### Task 2: Firebase Admin Auth and App Check adapter

**Files:**
- Create: `services/backend/test/unit/firebase-token-verifier.test.js`
- Create: `services/backend/src/adapters/firebase-token-verifier.js`
- Modify: `services/backend/test/unit/firebase.test.js`
- Modify: `services/backend/src/adapters/firebase.js`

**Interfaces:**
- Consumes: `assertTokenVerifier()` and `TokenVerificationError` from Task 1.
- Produces: `createFirebaseTokenVerifier({ auth, appCheck })`.
- Extends: `createFirebaseAdmin({ projectId, appName }) -> { app, db, auth, appCheck }`.

- [ ] **Step 1: Write failing adapter tests**

Create `services/backend/test/unit/firebase-token-verifier.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseTokenVerifier } from '../../src/adapters/firebase-token-verifier.js';

test('Firebase verifier exposes only uid and VerifyAppCheckTokenResponse.appId', async () => {
  const verifier = createFirebaseTokenVerifier({
    auth: { verifyIdToken: async () => ({ uid: 'user_alpha', email: 'private@example.com' }) },
    appCheck: {
      verifyToken: async () => ({
        appId: 'elsewhere-web-dev',
        token: { app_id: 'wrong-nested-value' },
      }),
    },
  });

  assert.deepEqual(await verifier.verifyIdToken('id-token'), { uid: 'user_alpha' });
  assert.deepEqual(await verifier.verifyAppCheckToken('app-token'), {
    appId: 'elsewhere-web-dev',
  });
});

test('Firebase verifier rejects missing uid or appId with generic errors', async () => {
  const verifier = createFirebaseTokenVerifier({
    auth: { verifyIdToken: async () => ({ sub: 'not-accepted' }) },
    appCheck: { verifyToken: async () => ({ token: { app_id: 'not-accepted' } }) },
  });

  await assert.rejects(() => verifier.verifyIdToken('id-token'), {
    name: 'TokenVerificationError',
    message: 'Token verification failed',
    kind: 'id-token',
  });
  await assert.rejects(() => verifier.verifyAppCheckToken('app-token'), {
    name: 'TokenVerificationError',
    message: 'Token verification failed',
    kind: 'app-check',
  });
});

test('Firebase verifier does not leak provider error messages', async () => {
  const verifier = createFirebaseTokenVerifier({
    auth: { verifyIdToken: async () => { throw new Error('secret auth provider detail'); } },
    appCheck: { verifyToken: async () => { throw new Error('secret app provider detail'); } },
  });

  for (const operation of [
    () => verifier.verifyIdToken('id-token'),
    () => verifier.verifyAppCheckToken('app-token'),
  ]) {
    await assert.rejects(operation, (error) => (
      error.message === 'Token verification failed'
      && !error.message.includes('secret')
      && error.cause === undefined
    ));
  }
});
```

Update `services/backend/test/unit/firebase.test.js` to import `deleteApp` from `firebase-admin/app`, then add:

```js
test('Firebase initializer exposes Firestore, Auth and App Check managers', async (t) => {
  const admin = createFirebaseAdmin({
    projectId: 'demo-elsewhere',
    appName: `firebase-unit-${process.pid}-${Date.now()}`,
  });
  t.after(() => deleteApp(admin.app));

  assert.equal(typeof admin.db.doc, 'function');
  assert.equal(typeof admin.auth.verifyIdToken, 'function');
  assert.equal(typeof admin.appCheck.verifyToken, 'function');
});
```

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/firebase-token-verifier.test.js test/unit/firebase.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/adapters/firebase-token-verifier.js`; after that file exists, the initializer test must still fail until `auth` and `appCheck` are returned.

- [ ] **Step 3: Implement the Firebase token verifier**

Create `services/backend/src/adapters/firebase-token-verifier.js`:

```js
import { assertTokenVerifier } from '../auth/contract.js';
import { TokenVerificationError } from '../auth/errors.js';

export function createFirebaseTokenVerifier({ auth, appCheck }) {
  return assertTokenVerifier({
    async verifyIdToken(token) {
      try {
        const result = await auth.verifyIdToken(token);
        if (typeof result?.uid !== 'string' || !result.uid) throw new Error('missing uid');
        return Object.freeze({ uid: result.uid });
      } catch {
        throw new TokenVerificationError('id-token');
      }
    },
    async verifyAppCheckToken(token) {
      try {
        const result = await appCheck.verifyToken(token);
        if (typeof result?.appId !== 'string' || !result.appId) throw new Error('missing appId');
        return Object.freeze({ appId: result.appId });
      } catch {
        throw new TokenVerificationError('app-check');
      }
    },
  });
}
```

- [ ] **Step 4: Extend the Firebase initializer**

Modify `services/backend/src/adapters/firebase.js` to import `getAuth` from `firebase-admin/auth` and
`getAppCheck` from `firebase-admin/app-check`, then return:

```js
return {
  app,
  db: getFirestore(app),
  auth: getAuth(app),
  appCheck: getAppCheck(app),
};
```

Keep the existing `demo-` project guard unchanged.

- [ ] **Step 5: Run GREEN, ordinary regression and diff validation**

```bash
node --test test/unit/firebase-token-verifier.test.js test/unit/firebase.test.js
npm test
git diff --check
```

Expected: adapter tests pass, no provider detail appears in failures, and all ordinary tests remain 0 fail.

- [ ] **Step 6: Commit the adapter**

```bash
git add services/backend/src/adapters/firebase.js \
  services/backend/src/adapters/firebase-token-verifier.js \
  services/backend/test/unit/firebase.test.js \
  services/backend/test/unit/firebase-token-verifier.test.js
git commit -m "feat(auth): add Firebase token verifier adapter"
```

---

### Task 3: Fastify `requireAuth` preHandler

**Files:**
- Create: `services/backend/test/unit/auth-boundary.test.js`
- Create: `services/backend/src/auth/boundary.js`

**Interfaces:**
- Consumes: `parseBearerToken()`, `parseAppCheckToken()`, `authErrorResponse()` and `assertTokenVerifier()`.
- Produces: `registerAuthBoundary(app, { tokenVerifier, allowedAppIds }) -> requireAuth`.
- Produces on success: non-writable `request.authContext` whose value is frozen `{ uid, appId }`.

- [ ] **Step 1: Write the failing preHandler tests**

Create `services/backend/test/unit/auth-boundary.test.js`. It uses `createApp()` only to obtain a real Fastify instance and verify `decorateRequest`; it registers no route:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { registerAuthBoundary } from '../../src/auth/boundary.js';

const appConfig = { nodeEnv: 'test', bodyLimit: 32 * 1024, logLevel: 'silent' };
const validHeaders = {
  authorization: 'Bearer valid-id',
  'x-firebase-appcheck': 'valid-app',
};

function createReply() {
  return {
    sent: false,
    statusCode: null,
    payload: null,
    code(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    send(payload) {
      this.sent = true;
      this.payload = payload;
      return this;
    },
  };
}

function createVerifier({ appId = 'elsewhere-web-dev' } = {}) {
  const calls = { id: 0, appCheck: 0 };
  return {
    calls,
    verifier: {
      async verifyIdToken(token) {
        calls.id += 1;
        if (token !== 'valid-id') throw new Error('secret Firebase auth error');
        return { uid: 'user_alpha' };
      },
      async verifyAppCheckToken(token) {
        calls.appCheck += 1;
        if (token !== 'valid-app') throw new Error('secret Firebase app error');
        return { appId };
      },
    },
  };
}

async function execute(requireAuth, request) {
  const reply = createReply();
  const calls = { handler: 0, repository: 0, repositoryUid: null };
  await requireAuth(request, reply);
  if (!reply.sent) {
    calls.handler += 1;
    calls.repository += 1;
    calls.repositoryUid = request.authContext.uid;
  }
  return { reply, calls };
}

test('registers authContext decoration and rejects invalid allowlists', async (t) => {
  const app = createApp({ appConfig });
  t.after(() => app.close());
  const { verifier } = createVerifier();

  for (const allowedAppIds of [undefined, [], [''], [' elsewhere-web-dev ']]) {
    assert.throws(
      () => registerAuthBoundary(app, { tokenVerifier: verifier, allowedAppIds }),
      /allowedAppIds/,
    );
  }

  const requireAuth = registerAuthBoundary(app, {
    tokenVerifier: verifier,
    allowedAppIds: ['elsewhere-web-dev'],
  });
  assert.equal(typeof requireAuth, 'function');
  assert.equal(app.hasRequestDecorator('authContext'), true);
});

test('returns stable failures before handler or repository execution', async (t) => {
  const cases = [
    [{}, 'auth/missing-id-token'],
    [{ authorization: 'Bearer first, Bearer second' }, 'auth/invalid-id-token'],
    [{ authorization: 'Bearer invalid-id', 'x-firebase-appcheck': 'valid-app' },
      'auth/invalid-id-token'],
    [{ authorization: 'Bearer valid-id' }, 'app-check/missing-token'],
    [{ authorization: 'Bearer valid-id', 'x-firebase-appcheck': 'invalid-app' },
      'app-check/invalid-token'],
  ];

  for (const [headers, code] of cases) {
    const app = createApp({ appConfig });
    t.after(() => app.close());
    const { verifier, calls: verifierCalls } = createVerifier();
    const requireAuth = registerAuthBoundary(app, {
      tokenVerifier: verifier,
      allowedAppIds: ['elsewhere-web-dev'],
    });
    const request = { id: `server-${code}`, headers };
    const { reply, calls } = await execute(requireAuth, request);

    assert.equal(reply.statusCode, 401);
    assert.equal(reply.payload.error.code, code);
    assert.equal(reply.payload.error.requestId, request.id);
    assert.equal(JSON.stringify(reply.payload).includes('secret Firebase'), false);
    assert.equal(calls.handler, 0);
    assert.equal(calls.repository, 0);
    if (code.startsWith('auth/')) assert.equal(verifierCalls.appCheck, 0);
  }
});

test('rejects an App Check token from an app outside the allowlist', async (t) => {
  const app = createApp({ appConfig });
  t.after(() => app.close());
  const { verifier } = createVerifier({ appId: 'other-app' });
  const requireAuth = registerAuthBoundary(app, {
    tokenVerifier: verifier,
    allowedAppIds: ['elsewhere-web-dev'],
  });
  const { reply, calls } = await execute(requireAuth, {
    id: 'server-app-id',
    headers: validHeaders,
  });

  assert.equal(reply.payload.error.code, 'app-check/invalid-token');
  assert.equal(calls.handler, 0);
  assert.equal(calls.repository, 0);
});

test('installs a frozen context that client owner fields cannot replace', async (t) => {
  const app = createApp({ appConfig });
  t.after(() => app.close());
  const { verifier } = createVerifier();
  const requireAuth = registerAuthBoundary(app, {
    tokenVerifier: verifier,
    allowedAppIds: ['elsewhere-web-dev'],
  });
  const request = {
    id: 'server-success',
    headers: { ...validHeaders, 'x-user-id': 'user_beta' },
    body: { uid: 'user_beta', ownerId: 'user_beta' },
  };
  const { reply, calls } = await execute(requireAuth, request);

  assert.equal(reply.sent, false);
  assert.deepEqual(request.authContext, {
    uid: 'user_alpha',
    appId: 'elsewhere-web-dev',
  });
  assert.equal(Object.isFrozen(request.authContext), true);
  assert.equal(calls.repositoryUid, 'user_alpha');
  assert.throws(() => { request.authContext.uid = 'user_beta'; }, TypeError);
  assert.throws(() => { request.authContext = { uid: 'user_beta' }; }, TypeError);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test test/unit/auth-boundary.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/auth/boundary.js`.

- [ ] **Step 3: Implement the minimal registration and preHandler**

Create `services/backend/src/auth/boundary.js`:

```js
import { assertTokenVerifier } from './contract.js';
import { authErrorResponse } from './errors.js';
import { parseAppCheckToken, parseBearerToken } from './headers.js';

const reject = (reply, code, requestId) => (
  reply.code(401).send(authErrorResponse(code, requestId))
);

export function registerAuthBoundary(app, { tokenVerifier, allowedAppIds }) {
  const verifier = assertTokenVerifier(tokenVerifier);
  if (!Array.isArray(allowedAppIds)
    || allowedAppIds.length === 0
    || allowedAppIds.some((value) => typeof value !== 'string' || value !== value.trim() || !value)) {
    throw new TypeError('allowedAppIds must be a non-empty string array');
  }
  const allowed = new Set(allowedAppIds);
  app.decorateRequest('authContext', null);

  return async function requireAuth(request, reply) {
    const authorization = request.headers.authorization;
    if (authorization === undefined) {
      return reject(reply, 'auth/missing-id-token', request.id);
    }
    const idToken = parseBearerToken(authorization);
    if (!idToken) return reject(reply, 'auth/invalid-id-token', request.id);

    let identity;
    try {
      identity = await verifier.verifyIdToken(idToken);
      if (typeof identity?.uid !== 'string' || !identity.uid) throw new Error();
    } catch {
      return reject(reply, 'auth/invalid-id-token', request.id);
    }

    const appCheckHeader = request.headers['x-firebase-appcheck'];
    if (appCheckHeader === undefined) {
      return reject(reply, 'app-check/missing-token', request.id);
    }
    const appCheckToken = parseAppCheckToken(appCheckHeader);
    if (!appCheckToken) return reject(reply, 'app-check/invalid-token', request.id);

    let application;
    try {
      application = await verifier.verifyAppCheckToken(appCheckToken);
      if (!allowed.has(application?.appId)) throw new Error();
    } catch {
      return reject(reply, 'app-check/invalid-token', request.id);
    }

    Object.defineProperty(request, 'authContext', {
      value: Object.freeze({ uid: identity.uid, appId: application.appId }),
      writable: false,
      enumerable: true,
      configurable: false,
    });
  };
}
```

- [ ] **Step 4: Run GREEN and regression tests**

```bash
node --test test/unit/auth-contracts.test.js \
  test/unit/firebase-token-verifier.test.js \
  test/unit/auth-boundary.test.js
npm test
git diff --check
```

Expected: all auth unit tests pass; existing tests remain 0 fail.

- [ ] **Step 5: Commit the enforcement boundary**

```bash
git add services/backend/src/auth/boundary.js \
  services/backend/test/unit/auth-boundary.test.js
git commit -m "feat(auth): enforce Firebase auth and App Check boundary"
```

---

### Task 4: Test-only Fastify integration harness

**Files:**
- Create: `services/backend/test/helpers/create-protected-app.js`
- Create: `services/backend/test/integration/auth-boundary-app.test.js`
- Verify unchanged: `services/backend/src/app.js`
- Verify unchanged: `services/backend/src/server.js`

**Interfaces:**
- Consumes: `createApp()` and `registerAuthBoundary()`.
- Produces only for tests: `createProtectedTestApp({ tokenVerifier, allowedAppIds, repository }) -> { app, calls }`.
- Must not export or register a production `/protected` route.

- [ ] **Step 1: Write the failing integration test**

Create `services/backend/test/integration/auth-boundary-app.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { createProtectedTestApp } from '../helpers/create-protected-app.js';

const appConfig = { nodeEnv: 'test', bodyLimit: 32 * 1024, logLevel: 'silent' };

const tokenVerifier = {
  async verifyIdToken(token) {
    if (token !== 'valid-id') throw new Error('invalid id');
    return { uid: 'user_alpha' };
  },
  async verifyAppCheckToken(token) {
    if (token !== 'valid-app') throw new Error('invalid app');
    return { appId: 'elsewhere-web-dev' };
  },
};

function createRepository() {
  const calls = [];
  return {
    calls,
    async getFragment(uid, id) {
      calls.push({ uid, id });
      return { id, ownerId: uid };
    },
  };
}

test('health endpoints stay public and production has no protected probe', async (t) => {
  const app = createApp({ appConfig });
  t.after(() => app.close());
  assert.equal((await app.inject({ method: 'GET', url: '/healthz' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/readyz' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/protected' })).statusCode, 404);
});

test('test harness rejects before its handler and repository', async (t) => {
  const repository = createRepository();
  const { app, calls } = createProtectedTestApp({
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-dev'],
    repository,
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/protected?requestId=query-forged',
    headers: { 'x-request-id': 'header-forged' },
    payload: { requestId: 'body-forged' },
  });
  const body = response.json();
  assert.equal(response.statusCode, 401);
  assert.equal(body.error.code, 'auth/missing-id-token');
  assert.equal(typeof body.error.requestId, 'string');
  assert.notEqual(body.error.requestId, 'header-forged');
  assert.notEqual(body.error.requestId, 'query-forged');
  assert.notEqual(body.error.requestId, 'body-forged');
  assert.equal(calls.handler, 0);
  assert.equal(repository.calls.length, 0);
});

test('test harness uses verified uid and ignores forged owner fields', async (t) => {
  const repository = createRepository();
  const { app, calls } = createProtectedTestApp({
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-dev'],
    repository,
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/protected',
    headers: {
      authorization: 'Bearer valid-id',
      'x-firebase-appcheck': 'valid-app',
      'x-user-id': 'user_beta',
    },
    payload: { uid: 'user_beta', ownerId: 'user_beta' },
  });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.authContext, {
    uid: 'user_alpha',
    appId: 'elsewhere-web-dev',
  });
  assert.equal(calls.handler, 1);
  assert.deepEqual(repository.calls, [{ uid: 'user_alpha', id: 'frag_12345678' }]);
});

test('comma-merged credentials do not enter the test handler', async (t) => {
  const repository = createRepository();
  const { app, calls } = createProtectedTestApp({
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-dev'],
    repository,
  });
  t.after(() => app.close());

  for (const headers of [
    { authorization: 'Bearer valid-id, Bearer second', 'x-firebase-appcheck': 'valid-app' },
    { authorization: 'Bearer valid-id', 'x-firebase-appcheck': 'valid-app, second' },
  ]) {
    const response = await app.inject({ method: 'POST', url: '/protected', headers });
    assert.equal(response.statusCode, 401);
  }
  assert.equal(calls.handler, 0);
  assert.equal(repository.calls.length, 0);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test test/integration/auth-boundary-app.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `test/helpers/create-protected-app.js`. Production
`/protected` remains absent throughout.

- [ ] **Step 3: Implement the test harness only**

Create `services/backend/test/helpers/create-protected-app.js`:

```js
import { createApp } from '../../src/app.js';
import { registerAuthBoundary } from '../../src/auth/boundary.js';

const appConfig = { nodeEnv: 'test', bodyLimit: 32 * 1024, logLevel: 'silent' };

export function createProtectedTestApp({ tokenVerifier, allowedAppIds, repository }) {
  const app = createApp({ appConfig });
  const requireAuth = registerAuthBoundary(app, { tokenVerifier, allowedAppIds });
  const calls = { handler: 0 };

  app.post('/protected', { preHandler: requireAuth }, async (request) => {
    calls.handler += 1;
    return {
      authContext: request.authContext,
      fragment: await repository.getFragment(request.authContext.uid, 'frag_12345678'),
    };
  });

  return { app, calls };
}
```

No file under `services/backend/src/` is changed in this task.

- [ ] **Step 4: Run GREEN, production-route guard and regression tests**

```bash
node --test test/integration/app.test.js test/integration/auth-boundary-app.test.js
npm test
git diff --check
rg -n "['\"]\/protected" services/backend/src
```

Expected: integration tests pass; `rg` returns no match and exit code 1 because production source contains no `/protected`; ordinary suite remains 0 fail.

- [ ] **Step 5: Commit the integration coverage**

```bash
git add services/backend/test/helpers/create-protected-app.js \
  services/backend/test/integration/auth-boundary-app.test.js
git commit -m "test(auth): cover protected route integration"
```

---

### Task 5: Authentication Emulator integration

**Files:**
- Create: `services/backend/test/emulator/auth-boundary.emulator.test.js`
- Modify: `firebase/firebase.json`
- Modify: `services/backend/package.json`

**Interfaces:**
- Consumes: Firebase Web SDK anonymous auth, `createFirebaseAdmin()`, `createFirebaseTokenVerifier()` and the test-only protected app.
- Produces: verified equivalence between Web SDK anonymous `user.uid` and backend `authContext.uid`.
- Test composition only: fake App Check manager returns `{ appId: 'elsewhere-web-dev' }` for one explicit token.

- [ ] **Step 1: Write the Emulator test before enabling Auth Emulator**

Create `services/backend/test/emulator/auth-boundary.emulator.test.js`. Register one skipped test when
`FIREBASE_AUTH_EMULATOR_HOST` is absent. When present:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp as deleteClientApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { createFirebaseAdmin } from '../../src/adapters/firebase.js';
import { createFirebaseTokenVerifier } from '../../src/adapters/firebase-token-verifier.js';
import { createProtectedTestApp } from '../helpers/create-protected-app.js';

test('anonymous Auth Emulator identity reaches the protected handler', {
  skip: !process.env.FIREBASE_AUTH_EMULATOR_HOST,
}, async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const clientApp = initializeApp({
    apiKey: 'demo-api-key',
    projectId: 'demo-elsewhere',
  }, `auth-client-${suffix}`);
  const clientAuth = getAuth(clientApp);
  connectAuthEmulator(
    clientAuth,
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,
    { disableWarnings: true },
  );

  const admin = createFirebaseAdmin({
    projectId: 'demo-elsewhere',
    appName: `auth-admin-${suffix}`,
  });
  const tokenVerifier = createFirebaseTokenVerifier({
    auth: admin.auth,
    appCheck: {
      verifyToken: async (token) => {
        if (token !== 'test-app-check') throw new Error('invalid test token');
        return { appId: 'elsewhere-web-dev' };
      },
    },
  });
  const repository = {
    getFragment: async (uid) => ({ ownerId: uid }),
  };
  const { app } = createProtectedTestApp({
    tokenVerifier,
    allowedAppIds: ['elsewhere-web-dev'],
    repository,
  });

  t.after(async () => {
    await app.close();
    await deleteClientApp(clientApp);
    await deleteAdminApp(admin.app);
  });

  const credential = await signInAnonymously(clientAuth);
  const idToken = await credential.user.getIdToken();
  const verified = await tokenVerifier.verifyIdToken(idToken);
  assert.equal(verified.uid, credential.user.uid);

  const response = await app.inject({
    method: 'POST',
    url: '/protected',
    headers: {
      authorization: `Bearer ${idToken}`,
      'x-firebase-appcheck': 'test-app-check',
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().authContext.uid, credential.user.uid);
});
```

- [ ] **Step 2: Run RED before Auth Emulator configuration exists**

```bash
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" \
npm exec firebase -- emulators:exec \
  --project demo-elsewhere \
  --config ../../firebase/firebase.json \
  --only auth \
  "node --test test/emulator/auth-boundary.emulator.test.js"
```

Working directory: `services/backend`.

Expected: FAIL because `firebase.json` does not yet configure the Authentication Emulator. This is the correct RED reason for this integration stage.

- [ ] **Step 3: Configure Authentication Emulator and the unified script**

Add to `firebase/firebase.json` under `emulators`:

```json
"auth": {
  "port": 9099
}
```

Update `services/backend/package.json` `test:emulator` so `--only` is
`auth,firestore,storage` and the Node command includes:

```text
test/emulator/auth-boundary.emulator.test.js
```

Keep test concurrency at `1` so shared Emulator state is deterministic.

- [ ] **Step 4: Run Auth Emulator GREEN and ordinary regression**

```bash
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" \
npm exec firebase -- emulators:exec \
  --project demo-elsewhere \
  --config ../../firebase/firebase.json \
  --only auth \
  "node --test test/emulator/auth-boundary.emulator.test.js"
npm test
git diff --check
```

Expected: anonymous identity test passes, all apps are closed by `t.after`, the ordinary suite skips only Emulator-dependent tests and has 0 fail.

- [ ] **Step 5: Commit Emulator integration**

```bash
git add firebase/firebase.json services/backend/package.json \
  services/backend/test/emulator/auth-boundary.emulator.test.js
git commit -m "test(auth): verify anonymous identity with Auth Emulator"
```

---

### Task 6: Full regression and Module 2 documentation

**Files:**
- Modify: `services/backend/README.md`
- Create: `docs/implementation/auth-boundary-v1.md`

**Interfaces:**
- Documents: protected route composition, required headers, `allowedAppIds`, test-only harness, Emulator command and verified counts.
- Preserves: no production business endpoint and no frontend integration claim.

- [ ] **Step 1: Run focused Auth tests**

```bash
node --test \
  test/unit/auth-contracts.test.js \
  test/unit/firebase-token-verifier.test.js \
  test/unit/auth-boundary.test.js \
  test/integration/auth-boundary-app.test.js
```

Expected: all focused tests pass with 0 fail.

- [ ] **Step 2: Run all ordinary tests**

```bash
npm test
```

Expected: 0 fail; Emulator-only suites are explicitly skipped outside Emulator execution.

- [ ] **Step 3: Run the unified Auth, Firestore and Storage Emulator suite**

```bash
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:emulator
```

Expected: Auth anonymous identity, Firestore Repository contract, Firestore Rules and Storage Rules all pass with 0 fail. `emulators:exec` stops every Emulator after the command.

- [ ] **Step 4: Run security and diff checks**

```bash
npm audit --omit=dev
git diff --check
rg -n "['\"]\/protected" services/backend/src
git status --short
```

Expected: production audit reports 0 vulnerabilities; diff check has no output; production source search has no match; status contains only Task 6 documentation edits.

- [ ] **Step 5: Write the integration record**

Update `services/backend/README.md` to state:

- Module 2 provides `registerAuthBoundary()` but registers no business route;
- protected routes require `Authorization` and `X-Firebase-AppCheck`;
- production composition must pass explicit `allowedAppIds`;
- `test:emulator` starts Auth, Firestore and Storage under `demo-elsewhere`.

Create `docs/implementation/auth-boundary-v1.md` with:

- scope and explicit non-scope;
- exact function signatures and error codes;
- App Check `result.appId` mapping;
- immutable `authContext` behavior;
- test harness / production composition isolation;
- commands and the fresh pass/fail counts from Steps 1–4;
- remaining boundary: no frontend auth and no protected business endpoint;
- next module named but not started: Import Batch + Original Save.

- [ ] **Step 6: Re-run focused tests and diff check after documentation**

```bash
node --test \
  test/unit/auth-contracts.test.js \
  test/unit/firebase-token-verifier.test.js \
  test/unit/auth-boundary.test.js \
  test/integration/auth-boundary-app.test.js
git diff --check
```

Expected: 0 fail and no whitespace errors.

- [ ] **Step 7: Commit Module 2 verification docs**

```bash
git add services/backend/README.md \
  docs/implementation/auth-boundary-v1.md
git commit -m "docs(auth): document boundary integration and verification"
```

- [ ] **Step 8: Verify the complete Module 2 commit chain and stop**

```bash
git log --oneline --reverse ac98cdc..HEAD
git status --short --branch
```

Expected commits include:

```text
docs(auth): clarify Auth Boundary contracts
docs(auth): add auth boundary TDD implementation plan
test(auth): define auth boundary contracts
feat(auth): add strict auth header parsing and errors
feat(auth): add Firebase token verifier adapter
feat(auth): enforce Firebase auth and App Check boundary
test(auth): cover protected route integration
test(auth): verify anonymous identity with Auth Emulator
docs(auth): document boundary integration and verification
```

The worktree must be clean. Stop after Module 2; do not begin Import Batch or any Module 3 code.
