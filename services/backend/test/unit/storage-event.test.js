import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStorageFinalizedEvent } from '../../src/ingestion/storage-event.js';

const bucket = 'demo-elsewhere.appspot.com';
const objectName = 'users/user_alpha/originals/batch_12345678/frag_12345678';

const validInput = (overrides = {}) => ({
  headers: {
    'ce-id': 'event-12345678',
    'ce-type': 'google.cloud.storage.object.v1.finalized',
    'ce-source': `//storage.googleapis.com/projects/_/buckets/${bucket}`,
  },
  body: {
    bucket,
    name: objectName,
    generation: '1740000000000001',
  },
  allowedBuckets: [bucket],
  ...overrides,
});

test('parses one strict allowlisted Storage finalized CloudEvent', () => {
  const result = parseStorageFinalizedEvent(validInput());
  assert.deepEqual(result, {
    eventId: 'event-12345678',
    bucket,
    objectName,
    generation: '1740000000000001',
    uid: 'user_alpha',
    batchId: 'batch_12345678',
    fragmentId: 'frag_12345678',
  });
  assert.equal(Object.isFrozen(result), true);
});

test('rejects missing, duplicate and comma-merged CloudEvent headers', () => {
  for (const [header, value] of [
    ['ce-id', undefined],
    ['ce-id', ''],
    ['ce-id', ['one', 'two']],
    ['ce-id', 'one,two'],
    ['ce-type', ['one', 'two']],
    ['ce-source', 'one, two'],
  ]) {
    const input = validInput();
    input.headers = { ...input.headers, [header]: value };
    assert.throws(
      () => parseStorageFinalizedEvent(input),
      { code: 'ingestion/invalid-event', permanent: true },
    );
  }
});

test('rejects type, source, bucket, path and generation contradictions', () => {
  const cases = [
    { headers: { ...validInput().headers, 'ce-type': 'google.cloud.storage.object.v1.deleted' } },
    { headers: { ...validInput().headers, 'ce-source': '//storage.googleapis.com/other' } },
    { body: { ...validInput().body, bucket: 'other.appspot.com' } },
    { body: { ...validInput().body, name: 'users/user_alpha/other/frag_12345678' } },
    { body: { ...validInput().body, name: `${objectName}/extra` } },
    { body: { ...validInput().body, generation: '' } },
    {
      headers: { ...validInput().headers, 'ce-generation': 'different' },
      body: validInput().body,
    },
  ];

  for (const changed of cases) {
    assert.throws(
      () => parseStorageFinalizedEvent(validInput(changed)),
      { code: 'ingestion/invalid-event', permanent: true },
    );
  }
});
