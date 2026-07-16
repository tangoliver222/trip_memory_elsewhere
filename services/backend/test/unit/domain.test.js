import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFragment,
  parseImportBatch,
  parseProvenance,
  parseReference,
} from '../../src/domain/index.js';
import { makePendingBatch, makeUploadedFragment } from '../fixtures/import.js';

const now = '2026-07-16T00:00:00.000Z';

test('reference accepts one canonical type/id shape', () => {
  assert.deepEqual(parseReference({ type: 'fragment', id: 'frag_12345678' }), {
    type: 'fragment',
    id: 'frag_12345678',
  });
  assert.throws(() => parseReference({ type: 'fragment', from: 'x' }));
});

test('provenance requires source, processor, confidence and status', () => {
  const result = parseProvenance({
    value: 'Common Grounds',
    sourceType: 'ocr',
    sourceRefs: [{ type: 'fragment', id: 'frag_12345678' }],
    processor: {
      name: 'document-ocr',
      version: '1.0.0',
      modelAlias: null,
      promptVersion: null,
    },
    confidence: 0.88,
    status: 'suggested',
    observedAt: now,
  });

  assert.equal(result.confidence, 0.88);
  assert.throws(() => parseProvenance({ ...result, confidence: 1.5 }));
});

test('fragment original path must stay inside its owner', () => {
  const fragment = makeUploadedFragment();

  assert.equal(parseFragment(fragment).ownerId, 'user_alpha');
  assert.throws(() => parseFragment({
    ...fragment,
    storage: {
      ...fragment.storage,
      originalPath: 'users/user_beta/originals/batch_12345678/frag_12345678',
    },
  }));
});

test('import batch counters cannot exceed the declared input count', () => {
  const batch = makePendingBatch();

  assert.equal(parseImportBatch(batch).counters.saved, 0);
  assert.throws(() => parseImportBatch({
    ...batch,
    counters: { ...batch.counters, saved: 2 },
  }));
});
