import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDerivativePath,
  makeExactCandidateId,
  makeNearCandidateId,
  makePairKey,
  makeProcessingTaskId,
} from '../../src/processing/identity.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const sourceRevisionInput = Object.freeze({
  ownerId: 'user_alpha',
  fragmentId: 'frag_12345678',
  processorName: 'deterministic-media',
  processorVersion: 'v1',
  bucket: 'demo-elsewhere.appspot.com',
  objectName: 'users/user_alpha/originals/batch_12345678/frag_12345678',
  generation: '1740000000000001',
  inputHash: HASH_A,
});

test('processing task ID is a fixed source-revision identity that excludes inputHash', () => {
  const expected = 'task_266f53e08f01df209dc4fa22e03c31930172f3855f7c1f05a48e927fe5475ed7';

  assert.equal(makeProcessingTaskId(sourceRevisionInput), expected);
  assert.equal(makeProcessingTaskId({ ...sourceRevisionInput, inputHash: HASH_B }), expected);

  for (const [field, value] of [
    ['bucket', 'archive-elsewhere.appspot.com'],
    ['objectName', `${sourceRevisionInput.objectName}-replacement`],
    ['generation', '1740000000000002'],
    ['processorVersion', 'v2'],
  ]) {
    assert.notEqual(makeProcessingTaskId({ ...sourceRevisionInput, [field]: value }), expected);
  }
});

test('length-prefixed task tuples do not collide when field boundaries move', () => {
  const first = makeProcessingTaskId({
    ...sourceRevisionInput,
    bucket: 'bucket-ab',
    objectName: 'c',
  });
  const second = makeProcessingTaskId({
    ...sourceRevisionInput,
    bucket: 'bucket-a',
    objectName: 'bc',
  });

  assert.notEqual(first, second);
});

test('candidate identities preserve roles while pair identity sorts without mutation', () => {
  assert.equal(makeExactCandidateId({
    algorithmVersion: 'v1',
    canonicalFragmentId: 'frag_existing',
    candidateFragmentId: 'frag_new0001',
  }), 'dup_3ae32c8be3a2e4dfa369d117d9785a540c93b4c7f662398a615f24087c113927');

  const forward = makeNearCandidateId({
    algorithmVersion: 'v1',
    queryFragmentId: 'frag_query123',
    matchedFragmentId: 'frag_match123',
  });
  const reverse = makeNearCandidateId({
    algorithmVersion: 'v1',
    queryFragmentId: 'frag_match123',
    matchedFragmentId: 'frag_query123',
  });
  assert.equal(forward,
    'dup_7eb99010ec4ee416bf1fd35158fd0eb63922e662c3b70484865a6435d98d740c');
  assert.notEqual(reverse, forward);

  const fragmentIds = ['frag_query123', 'frag_match123'];
  const pairKey = makePairKey(fragmentIds);
  assert.equal(pairKey,
    'pair_95e8d052faaee0988358fcbcc2e7566653c8147ff30f3b4a7f48c2bd2ee4618d');
  assert.equal(makePairKey([...fragmentIds].reverse()), pairKey);
  assert.deepEqual(fragmentIds, ['frag_query123', 'frag_match123']);
  assert.deepEqual([...fragmentIds].sort(), ['frag_match123', 'frag_query123']);
});

test('derivative path is canonical and identity helpers reject incomplete input', () => {
  assert.equal(makeDerivativePath({
    ownerId: 'user_alpha',
    fragmentId: 'frag_12345678',
    processorName: 'deterministic-media',
    processorVersion: 'v1',
    inputHash: HASH_A,
  }), `users/user_alpha/derived/frag_12345678/deterministic-media/v1/${HASH_A}/thumbnail.webp`);

  assert.throws(() => makeProcessingTaskId({ ...sourceRevisionInput, bucket: '' }), TypeError);
  assert.throws(() => makeExactCandidateId({
    algorithmVersion: 'v1',
    canonicalFragmentId: 'frag_same0001',
    candidateFragmentId: 'frag_same0001',
  }), TypeError);
  assert.throws(() => makePairKey(['frag_only0001']), TypeError);
  assert.throws(() => makeDerivativePath({
    ownerId: 'user_alpha',
    fragmentId: 'frag_12345678',
    processorName: 'deterministic/media',
    processorVersion: 'v1',
    inputHash: HASH_A,
  }), TypeError);
});
