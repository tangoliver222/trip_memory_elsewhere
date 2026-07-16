import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp } from 'firebase-admin/app';
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

test('Firebase initializer exposes Firestore, Auth, App Check and Storage managers', async (t) => {
  const admin = createFirebaseAdmin({
    projectId: 'demo-elsewhere',
    appName: `firebase-unit-${process.pid}-${Date.now()}`,
  });
  t.after(() => deleteApp(admin.app));

  assert.equal(typeof admin.db.doc, 'function');
  assert.equal(typeof admin.auth.verifyIdToken, 'function');
  assert.equal(typeof admin.appCheck.verifyToken, 'function');
  assert.equal(typeof admin.storage.bucket, 'function');
});
