import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  OCR_FIELD_MASK,
  createDocumentAiOcr,
} from '../../src/adapters/document-ai-ocr.js';
import { assertOcrInput } from '../../src/capabilities/ocr-policy.js';

const CONFIG = Object.freeze({
  projectId: 'elsewhere',
  location: 'us',
  processorId: 'processor-1',
  processorVersion: 'version-1',
  endpoint: 'us-documentai.googleapis.com',
});
const SOURCE_BYTES = Buffer.from('bounded verified jpeg bytes');
const BASE_FACTS = Object.freeze({
  format: 'jpeg',
  mimeType: 'image/jpeg',
  sizeBytes: SOURCE_BYTES.byteLength,
  width: 1200,
  height: 800,
});

async function sourceFile(t) {
  const directory = await mkdtemp(join(tmpdir(), 'elsewhere-ocr-test-'));
  const filePath = join(directory, 'source.bin');
  await writeFile(filePath, SOURCE_BYTES, { mode: 0o600 });
  t.after(() => rm(directory, { recursive: true, force: true }));
  return filePath;
}

function input(filePath, overrides = {}) {
  return {
    ...BASE_FACTS,
    clientRequestId: 'ocrrequest_12345678',
    executionId: 'execution_12345678',
    filePath,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function harness(response = [{ document: { text: 'hello', pages: [] } }]) {
  const calls = [];
  let constructors = 0;
  const provider = createDocumentAiOcr({
    config: CONFIG,
    clientFactory(options) {
      constructors += 1;
      calls.push(['construct', options]);
      return new Proxy({
        async processDocument(request) {
          calls.push(['processDocument', request]);
          if (response instanceof Error) throw response;
          return response;
        },
      }, {
        get(target, property, receiver) {
          if (['createProcessor', 'enableProcessor', 'updateProcessor'].includes(property)) {
            throw new Error('processor management must not be accessed');
          }
          return Reflect.get(target, property, receiver);
        },
      });
    },
  });
  return { provider, calls, constructors: () => constructors };
}

test('policy admits only bounded JPEG PNG and WebP image inputs', () => {
  for (const facts of [
    BASE_FACTS,
    { ...BASE_FACTS, format: 'png', mimeType: 'image/png' },
    { ...BASE_FACTS, format: 'webp', mimeType: 'image/webp' },
    { ...BASE_FACTS, sizeBytes: 40_000_000, width: 8_000, height: 5_000 },
  ]) {
    assert.deepEqual(assertOcrInput(facts), facts);
  }
  for (const facts of [
    { ...BASE_FACTS, format: 'heic', mimeType: 'image/heic' },
    { ...BASE_FACTS, format: 'pdf', mimeType: 'application/pdf', width: null, height: null },
    { ...BASE_FACTS, format: 'text', mimeType: 'text/plain' },
    { ...BASE_FACTS, sizeBytes: 40_000_001 },
    { ...BASE_FACTS, width: 8_001, height: 5_000 },
    { ...BASE_FACTS, width: null },
  ]) {
    assert.throws(() => assertOcrInput(facts), { code: 'capability/input-unsupported' });
  }
});

test('lazily calls one fixed processor version with bounded source bytes and field mask', async (t) => {
  const filePath = await sourceFile(t);
  const { provider, calls, constructors } = harness([
    { document: { text: 'hello', pages: [] } },
    { requestId: 'provider-request-123' },
  ]);
  assert.equal(constructors(), 0);

  assert.deepEqual(await provider.process(input(filePath)), {
    document: { text: 'hello', pages: [] },
    providerRequestId: 'provider-request-123',
  });
  assert.equal(constructors(), 1);
  assert.deepEqual(calls, [
    ['construct', { apiEndpoint: 'us-documentai.googleapis.com' }],
    ['processDocument', {
      name: 'projects/elsewhere/locations/us/processors/processor-1/processorVersions/version-1',
      rawDocument: { content: SOURCE_BYTES, mimeType: 'image/jpeg' },
      fieldMask: OCR_FIELD_MASK,
      labels: { execution: '5d47d44499f562c2', executor: 'v1' },
    }],
  ]);
});

test('forbidden or oversized inputs fail before file read and client construction', async () => {
  const { provider, calls, constructors } = harness();
  for (const overrides of [
    { format: 'heic', mimeType: 'image/heic' },
    { sizeBytes: 40_000_001 },
    { width: 10_000, height: 10_000 },
  ]) {
    await assert.rejects(
      () => provider.process(input('/missing/source', overrides)),
      { code: 'capability/input-unsupported' },
    );
  }
  assert.equal(constructors(), 0);
  assert.deepEqual(calls, []);
});

test('missing document and raw Google errors become stable redacted provider errors', async (t) => {
  const filePath = await sourceFile(t);
  const privateMessage = 'private Google endpoint and credential detail';
  for (const [response, code] of [
    [[{}], 'capability/provider-result-invalid'],
    [new Error(privateMessage), 'capability/provider-unavailable'],
  ]) {
    const { provider } = harness(response);
    let caught;
    try {
      await provider.process(input(filePath));
    } catch (error) {
      caught = error;
    }
    assert.equal(caught?.code, code);
    assert.equal(caught?.message.includes(privateMessage), false);
    assert.equal(caught?.cause, undefined);
  }
});

test('provider boundary rejects extra private fields and does not mutate input', async (t) => {
  const filePath = await sourceFile(t);
  const { provider } = harness();
  const valid = input(filePath);
  await assert.rejects(() => provider.process({ ...valid, originalPath: '/private' }), TypeError);
  await provider.process(valid);
  assert.equal(valid.signal.aborted, false);
});
