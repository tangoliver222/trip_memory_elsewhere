import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImportItem,
  classifyImportFile,
  runLiveImport,
} from '../../src/data/live-import.js';

function file(name, type, size = 1024, lastModified = Date.parse('2024-10-12T08:42:00+07:00')) {
  return { name, type, size, lastModified };
}

test('file policy accepts only the competition media set and routes type deterministically', () => {
  assert.equal(classifyImportFile(file('bangkok.jpg', 'image/jpeg')).sourceType, 'photo');
  assert.equal(classifyImportFile(file('COMMON-GROUNDS-receipt.png', 'image/png')).sourceType, 'receipt');
  assert.equal(classifyImportFile(file('ferry-ticket.webp', 'image/webp')).sourceType, 'ticket');
  assert.equal(classifyImportFile(file('trip-note.txt', 'text/plain')).sourceType, 'text');
  assert.throws(() => classifyImportFile(file('phone.heic', 'image/heic')), /不支持/);
});

test('source descriptor preserves real File identity without inventing creation metadata', () => {
  const original = file('Bangkok 01.jpg', 'image/jpeg', 2_048);
  const item = buildImportItem(original);

  assert.equal(item.declaredContentType, original.type);
  assert.equal(item.declaredSizeBytes, original.size);
  assert.equal(item.source.originalName, original.name);
  assert.equal(item.source.sourceCreatedAt, null);
  assert.equal(item.source.sourceModifiedAt, new Date(original.lastModified).toISOString());
  assert.equal(item.source.locationHint, null);
});

test('real import creates the batch before upload and finalizes only successful bytes', async () => {
  const calls = [];
  const files = [file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')];
  const client = {
    async createImportBatch(items) {
      calls.push(['create', items.length]);
      return {
        batch: { id: 'batch_real0001' },
        uploads: files.map((_, index) => ({
          fragmentId: `frag_real000${index + 1}`,
          originalPath: `users/user_demo/originals/batch_real0001/frag_real000${index + 1}`,
        })),
      };
    },
    async uploadOriginal(upload, original, onProgress) {
      calls.push(['upload', upload.fragmentId, original.name]);
      onProgress(0.5);
      onProgress(1);
    },
    async finalizeUpload(batchId, fragmentId) {
      calls.push(['finalize', batchId, fragmentId]);
    },
    async getReceipt(batchId) {
      calls.push(['receipt', batchId]);
      return { id: batchId, status: 'completed' };
    },
    async getSnapshot() {
      calls.push(['snapshot']);
      return { revision: 'real-revision' };
    },
  };
  const states = [];

  const result = await runLiveImport({ client, files, onState: (state) => states.push(state) });

  assert.equal(result.batchId, 'batch_real0001');
  assert.deepEqual(calls.map(([name]) => name), [
    'create', 'upload', 'finalize', 'upload', 'finalize', 'receipt', 'snapshot',
  ]);
  assert.equal(states.some(({ progress }) => progress?.frag_real0001 === 0.5), true);
  assert.equal(result.failures.length, 0);
});

test('partial upload failure preserves successful items and never finalizes failed bytes', async () => {
  const finalized = [];
  const client = {
    async createImportBatch() {
      return {
        batch: { id: 'batch_real0002' },
        uploads: [
          { fragmentId: 'frag_success01', originalPath: 'users/user_demo/originals/batch_real0002/frag_success01' },
          { fragmentId: 'frag_failure01', originalPath: 'users/user_demo/originals/batch_real0002/frag_failure01' },
        ],
      };
    },
    async uploadOriginal(upload) {
      if (upload.fragmentId === 'frag_failure01') throw new Error('upload failed');
    },
    async finalizeUpload(_batchId, fragmentId) { finalized.push(fragmentId); },
    async getReceipt(batchId) { return { id: batchId, status: 'processing' }; },
    async getSnapshot() { return { revision: 'partial-revision' }; },
  };

  const result = await runLiveImport({
    client,
    files: [file('success.jpg', 'image/jpeg'), file('failure.jpg', 'image/jpeg')],
  });

  assert.deepEqual(finalized, ['frag_success01']);
  assert.deepEqual(result.succeeded, ['frag_success01']);
  assert.deepEqual(result.failures.map(({ fragmentId }) => fragmentId), ['frag_failure01']);
  assert.equal(result.status, 'partial');
});
