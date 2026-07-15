import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseAdmin } from '../../src/adapters/firebase.js';

test('test mode refuses a non-demo Firebase project', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';

  try {
    assert.throws(
      () => createFirebaseAdmin({
        projectId: 'elsewhere-production',
        appName: 'unsafe-test-app',
      }),
      /demo project/i,
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
