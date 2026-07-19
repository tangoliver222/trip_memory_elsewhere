import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'services/backend');
const frontend = path.join(root, 'design-lab/prototypes-vanilla');
const manifestPath = path.join(root, 'demo-data/bangkok/manifest.json');
const originalsDir = path.join(root, 'demo-data/bangkok/originals');
const generatedManifest = path.join(frontend, 'public/competition-source-manifest.json');
const children = [];
let stopping = false;

async function stageSourcePack() {
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  await mkdir(originalsDir, { recursive: true });
  for (const [name, item] of Object.entries(manifest)) {
    await copyFile(path.join(root, item.demoSourcePath), path.join(originalsDir, name));
  }
  await writeFile(generatedManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return Object.keys(manifest).length;
}

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, ...(options.env || {}) },
    stdio: 'inherit',
  });
  children.push(child);
  child.demoName = name;
  return child;
}

function waitForPort(port, child, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const onExit = (code, signal) => reject(new Error(
      `${child.demoName} exited before port ${port} was ready (${code ?? signal}).`,
    ));
    child.once('exit', onExit);
    const attempt = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        child.off('exit', onExit);
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error(`Timed out waiting for port ${port}`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

function monitor(child) {
  if (child.exitCode !== null) {
    throw new Error(`${child.demoName} exited before the demo became ready (${child.exitCode}).`);
  }
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${child.demoName} exited before the demo was stopped (${code ?? signal}).`);
      void stop(code || 1);
    }
  });
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of [...children].reverse()) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  await Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  })));
  process.exit(code);
}

process.once('SIGINT', () => void stop(0));
process.once('SIGTERM', () => void stop(0));

try {
  const itemCount = await stageSourcePack();
  const emulatorEnvironment = {
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    GCLOUD_PROJECT: 'demo-elsewhere',
    JAVA_HOME: '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    PATH: `/opt/homebrew/opt/openjdk@21/bin:${process.env.PATH || ''}`,
  };
  const firebase = start('Firebase Emulators', path.join(backend, 'node_modules/.bin/firebase'), [
    'emulators:start',
    '--project', 'demo-elsewhere',
    '--config', path.join(root, 'firebase/firebase.json'),
    '--only', 'auth,firestore,storage',
  ], { env: emulatorEnvironment });
  await Promise.all([
    waitForPort(9099, firebase),
    waitForPort(8080, firebase),
    waitForPort(9199, firebase),
  ]);

  const backendProcess = start('Elsewhere demo backend', 'npm', ['run', 'demo'], {
    cwd: backend,
    env: {
      ...emulatorEnvironment,
      NODE_ENV: 'development',
      ELSEWHERE_DEMO_MODE: 'true',
      ELSEWHERE_SERVICE_MODE: 'api',
      CAPABILITY_EXECUTION_MODE: 'fake',
      OCR_PROVIDER_VERSION: 'fake-processor-v1',
      CLOUD_TASKS_ENABLED: 'false',
      DOCUMENT_AI_ENABLED: 'false',
    },
  });
  await waitForPort(8787, backendProcess);

  const frontendProcess = start('Elsewhere visual prototype', 'npm', ['run', 'dev', '--', '--port', '4174'], {
    cwd: frontend,
    env: {
      VITE_ELSEWHERE_DATA_MODE: 'live',
      VITE_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
      VITE_FIREBASE_STORAGE_EMULATOR: '127.0.0.1:9199',
      VITE_FIREBASE_PROJECT_ID: 'demo-elsewhere',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-elsewhere.appspot.com',
      VITE_FIREBASE_APP_ID: 'elsewhere-web-local',
    },
  });
  await waitForPort(4174, frontendProcess);
  [firebase, backendProcess, frontendProcess].forEach(monitor);

  console.log(`Elsewhere competition demo ready: http://127.0.0.1:4174/#/world/import`);
  console.log(`Source pack (${itemCount} real files): ${originalsDir}`);

  if (process.argv.includes('--verify')) {
    const verify = start('Competition E2E', path.join(frontend, 'node_modules/.bin/playwright'), [
      'test',
      '--config', 'playwright.competition.config.js',
    ], {
      cwd: frontend,
      env: { COMPETITION_DEMO_URL: 'http://127.0.0.1:4174' },
    });
    const exitCode = await new Promise((resolve) => verify.once('exit', (code) => resolve(code || 0)));
    await stop(exitCode);
  } else {
    await new Promise(() => {});
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Competition demo startup failed.');
  await stop(1);
}
