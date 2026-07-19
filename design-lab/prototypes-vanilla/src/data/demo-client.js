import { initializeApp } from 'firebase/app';
import {
  getToken as getAppCheckToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import {
  connectAuthEmulator,
  deleteUser,
  getAuth,
  signInAnonymously,
} from 'firebase/auth';
import {
  connectStorageEmulator,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';

const DEMO_HEADER = 'local-competition-v1';
const APP_CHECK_TOKEN = 'local-demo-app-check';

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required`);
  return value;
}

function splitHost(value, name) {
  const match = /^(?:https?:\/\/)?([^:/]+):(\d+)$/.exec(required(value, name));
  if (!match) throw new TypeError(`${name} must be host:port`);
  return { host: match[1], port: Number(match[2]) };
}

export function demoClientConfigFromEnv(environment = {}) {
  const infrastructureMode = environment.VITE_ELSEWHERE_INFRA_MODE || 'emulator';
  if (!['cloud', 'emulator'].includes(infrastructureMode)) {
    throw new TypeError('VITE_ELSEWHERE_INFRA_MODE must be emulator or cloud');
  }
  const isCloud = infrastructureMode === 'cloud';
  const value = (name, fallback) => (
    isCloud ? required(environment[name], name) : environment[name] || fallback
  );
  return Object.freeze({
    infrastructureMode,
    apiBaseUrl: environment.VITE_ELSEWHERE_API_BASE_URL || '',
    authEmulatorUrl: isCloud
      ? null
      : environment.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099',
    storageEmulator: isCloud
      ? null
      : environment.VITE_FIREBASE_STORAGE_EMULATOR || '127.0.0.1:9199',
    firebase: Object.freeze({
      apiKey: value('VITE_FIREBASE_API_KEY', 'demo-api-key'),
      authDomain: value('VITE_FIREBASE_AUTH_DOMAIN', 'demo-elsewhere.firebaseapp.com'),
      projectId: value('VITE_FIREBASE_PROJECT_ID', 'demo-elsewhere'),
      storageBucket: value('VITE_FIREBASE_STORAGE_BUCKET', 'demo-elsewhere.appspot.com'),
      appId: value('VITE_FIREBASE_APP_ID', 'demo-elsewhere-web'),
      messagingSenderId: value('VITE_FIREBASE_MESSAGING_SENDER_ID', 'demo-messaging-sender'),
    }),
    appCheck: isCloud ? Object.freeze({
      siteKey: required(
        environment.VITE_FIREBASE_APP_CHECK_SITE_KEY,
        'VITE_FIREBASE_APP_CHECK_SITE_KEY',
      ),
      debugToken: environment.ELSEWHERE_APP_CHECK_DEBUG_TOKEN || null,
    }) : null,
  });
}

function createAppCheckProvider({ app, siteKey, debugToken }) {
  const compiledDebugToken = typeof __ELSEWHERE_APP_CHECK_DEBUG_TOKEN__ === 'string'
    ? __ELSEWHERE_APP_CHECK_DEBUG_TOKEN__
    : null;
  const localDebugToken = debugToken || compiledDebugToken;
  if (localDebugToken) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = localDebugToken;
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return Object.freeze({
    async getToken() {
      const result = await getAppCheckToken(appCheck);
      return result.token;
    },
  });
}

export function createDemoClient(config, {
  appCheckFactory = createAppCheckProvider,
  connectAuthEmulatorFn = connectAuthEmulator,
  connectStorageEmulatorFn = connectStorageEmulator,
  deleteUserFn = deleteUser,
  fetchFn = globalThis.fetch,
  signInAnonymouslyFn = signInAnonymously,
} = {}) {
  if (!config?.firebase) throw new TypeError('Firebase client config is required');
  const app = initializeApp(config.firebase, `elsewhere-demo-${Date.now()}`);
  const auth = getAuth(app);
  const storage = getStorage(app);
  let appCheckProvider = null;
  if (config.infrastructureMode === 'cloud') {
    appCheckProvider = appCheckFactory({ app, ...config.appCheck });
    if (typeof appCheckProvider?.getToken !== 'function') {
      throw new TypeError('App Check provider is invalid');
    }
  } else {
    const storageEmulator = splitHost(config.storageEmulator, 'storageEmulator');
    connectAuthEmulatorFn(auth, required(config.authEmulatorUrl, 'authEmulatorUrl'), {
      disableWarnings: true,
    });
    connectStorageEmulatorFn(storage, storageEmulator.host, storageEmulator.port);
  }
  const apiBaseUrl = config.apiBaseUrl || '';
  let signInPromise = null;

  async function signIn() {
    if (!signInPromise) signInPromise = signInAnonymouslyFn(auth);
    const credential = await signInPromise;
    return credential.user;
  }

  async function request(path, { method = 'GET', body } = {}) {
    const user = auth.currentUser || await signIn();
    const idToken = await user.getIdToken();
    const appCheckToken = appCheckProvider
      ? required(await appCheckProvider.getToken(), 'App Check token')
      : APP_CHECK_TOKEN;
    const response = await fetchFn(`${apiBaseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
        'x-firebase-appcheck': appCheckToken,
        'x-elsewhere-demo': DEMO_HEADER,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const error = new Error(payload?.error?.message || `Request failed (${response.status})`);
      error.code = payload?.error?.code || 'demo/request-failed';
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  return Object.freeze({
    signIn,
    createImportBatch(items) {
      return request('/v1/import-batches', { method: 'POST', body: { items } });
    },
    uploadOriginal(upload, file, onProgress = () => {}) {
      if (typeof upload?.originalPath !== 'string' || !file) {
        return Promise.reject(new TypeError('Upload target and File are required'));
      }
      return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage, upload.originalPath), file, {
          contentType: file.type,
        });
        task.on('state_changed', (snapshot) => {
          onProgress(snapshot.totalBytes === 0 ? 0 : snapshot.bytesTransferred / snapshot.totalBytes);
        }, reject, () => resolve(task.snapshot));
      });
    },
    finalizeUpload(batchId, fragmentId) {
      return request('/demo/v1/finalize-upload', {
        method: 'POST',
        body: { batchId, fragmentId },
      });
    },
    getReceipt(batchId) {
      return request(`/v1/import-batches/${encodeURIComponent(batchId)}`);
    },
    getSnapshot() {
      return request('/demo/v1/snapshot');
    },
    saveInboxDecision(itemId, decision) {
      return request(`/demo/v1/inbox/${encodeURIComponent(itemId)}/decision`, {
        method: 'POST',
        body: decision,
      });
    },
    askElse(question, scope) {
      return request('/demo/v1/else/ask', { method: 'POST', body: { question, scope } });
    },
    reset() {
      return request('/demo/v1/reset', {
        method: 'POST',
        body: { confirm: 'reset-local-demo' },
      });
    },
    async deleteIdentity() {
      const user = auth.currentUser || await signIn();
      await deleteUserFn(user);
      signInPromise = null;
    },
    resolveStoragePath(path) {
      return getDownloadURL(ref(storage, path));
    },
  });
}
