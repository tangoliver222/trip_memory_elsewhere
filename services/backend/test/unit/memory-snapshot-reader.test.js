import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreMemorySnapshotReader } from '../../src/memory/reader.js';
import { makePendingBatch, makeUploadedFragment } from '../fixtures/import.js';

function document(value) {
  return Object.freeze({ data: () => structuredClone(value) });
}

function fakeDatabase({ fragments, importBatches }) {
  const calls = [];
  const values = { fragments, importBatches };
  return {
    calls,
    collection(path) {
      calls.push(['collection', path]);
      const name = path.endsWith('/fragments') ? 'fragments' : 'importBatches';
      let requestedLimit = null;
      const query = {
        orderBy(field) {
          calls.push(['orderBy', name, field]);
          return query;
        },
        limit(limit) {
          calls.push(['limit', name, limit]);
          requestedLimit = limit;
          return query;
        },
        async get() {
          const docs = values[name].slice(0, requestedLimit).map(document);
          return { docs, size: docs.length };
        },
        count() {
          return {
            async get() {
              return { data: () => ({ count: values[name].length }) };
            },
          };
        },
      };
      return query;
    },
  };
}

test('Firestore snapshot reader orders, bounds, counts and scopes both collections', async () => {
  const fragments = Array.from({ length: 201 }, (_, index) => makeUploadedFragment({
    id: `frag_${String(index + 1).padStart(8, '0')}`,
  }));
  const importBatches = Array.from({ length: 51 }, (_, index) => makePendingBatch({
    id: `batch_${String(index + 1).padStart(8, '0')}`,
  }));
  const db = fakeDatabase({ fragments, importBatches });
  const reader = createFirestoreMemorySnapshotReader({ db });

  const result = await reader.readOwnerSnapshot('user_alpha');

  assert.equal(result.fragments.length, 200);
  assert.equal(result.importBatches.length, 50);
  assert.equal(result.totalFragments, 201);
  assert.equal(result.totalImportBatches, 51);
  assert.equal(result.fragmentsTruncated, true);
  assert.equal(result.importBatchesTruncated, true);
  assert.deepEqual(db.calls.filter(([method]) => method === 'collection'), [
    ['collection', 'users/user_alpha/fragments'],
    ['collection', 'users/user_alpha/importBatches'],
  ]);
  assert.deepEqual(db.calls.filter(([method]) => method === 'limit').map((call) => call.slice(1)), [
    ['fragments', 201],
    ['importBatches', 51],
  ]);
  assert.equal(db.calls.filter(([method]) => method === 'orderBy').length, 2);
  assert.equal(Object.isFrozen(result), true);
});
