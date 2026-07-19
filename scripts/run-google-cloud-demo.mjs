import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'services/backend');
const frontend = path.join(root, 'design-lab/prototypes-vanilla');
const manifestPath = path.join(root, 'demo-data/bangkok/manifest.json');
const originalsDir = path.join(root, 'demo-data/bangkok/originals');
const browserManifest = path.join(frontend, 'public/competition-source-manifest.json');
const children = [];
let stopping = false;

for (const file of [
  path.join(backend, '.env.cloud.local'),
  path.join(frontend, '.env.cloud.local'),
  path.join(backend, '.env'),
]) {
  try { process.loadEnvFile(file); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function requireProviderGate() {
  if (process.env.RUN_REAL_GOOGLE_PROVIDER_TESTS !== 'true') {
    throw new Error('Set RUN_REAL_GOOGLE_PROVIDER_TESTS=true to permit real provider calls.');
  }
  for (const [name, expected] of [
    ['ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED', 'true'],
    ['CAPABILITY_EXECUTION_MODE', 'google'],
  ]) {
    if (process.env[name] !== expected) throw new Error(`${name} must be ${expected}.`);
  }
  if (!process.env.GEMINI_API_KEY
    && !(process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' && process.env.GOOGLE_CLOUD_PROJECT)) {
    throw new Error('A configured Gemini provider is required.');
  }
}

async function stageSourcePack() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await mkdir(originalsDir, { recursive: true });
  for (const [name, item] of Object.entries(manifest)) {
    await copyFile(path.join(root, item.demoSourcePath), path.join(originalsDir, name));
  }
  await writeFile(browserManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return Object.keys(manifest).length;
}

function start(name, command, args, environment = {}) {
  const child = spawn(command, args, {
    cwd: environment.cwd || root,
    env: { ...process.env, ...(environment.env || {}) },
    stdio: 'inherit',
  });
  child.demoName = name;
  children.push(child);
  return child;
}

function waitForPort(port, child, timeoutMs = 120_000) {
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
        if (Date.now() >= deadline) reject(new Error(`Timed out waiting for port ${port}.`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

function monitor(child) {
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${child.demoName} exited unexpectedly (${code ?? signal}).`);
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
  const verify = process.argv.includes('--verify');
  if (verify) requireProviderGate();
  const itemCount = await stageSourcePack();

  const cloudBackend = start('Elsewhere cloud demo backend', 'npm', ['run', 'demo:cloud'], {
    cwd: backend,
    env: { NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '8787' },
  });
  await waitForPort(8787, cloudBackend);

  const cloudFrontend = start(
    'Elsewhere cloud visual prototype',
    'npm', ['run', 'dev', '--', '--mode', 'cloud', '--port', '4174'],
    {
      cwd: frontend,
      env: {
        VITE_ELSEWHERE_DATA_MODE: 'live',
        VITE_ELSEWHERE_INFRA_MODE: 'cloud',
        VITE_ELSEWHERE_API_BASE_URL: 'http://127.0.0.1:4174',
      },
    },
  );
  await waitForPort(4174, cloudFrontend);
  [cloudBackend, cloudFrontend].forEach(monitor);

  console.log(`Elsewhere Google cloud demo ready: http://127.0.0.1:4174/#/world/import`);
  console.log(`Source pack: ${itemCount} project-owned files`);

  if (verify) {
    const e2e = start(
      'Google cloud E2E',
      path.join(frontend, 'node_modules/.bin/playwright'),
      ['test', '--config', 'playwright.google-cloud.config.js'],
      {
        cwd: frontend,
        env: {
          GOOGLE_CLOUD_DEMO_URL: 'http://127.0.0.1:4174',
          REQUIRE_GEMINI_DEMO: 'true',
        },
      },
    );
    const exitCode = await new Promise((resolve) => e2e.once('exit', (code) => resolve(code || 0)));
    await stop(exitCode);
  } else {
    await new Promise(() => {});
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Google cloud demo startup failed.');
  await stop(1);
}
