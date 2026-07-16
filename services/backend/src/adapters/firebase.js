import { initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export function createFirebaseAdmin({ projectId, appName }) {
  if (!projectId || !appName) {
    throw new TypeError('Firebase projectId and appName are required');
  }
  if (process.env.NODE_ENV === 'test' && !projectId.startsWith('demo-')) {
    throw new Error('Firebase tests require a demo project ID');
  }

  const app = initializeApp({ projectId }, appName);
  return {
    app,
    db: getFirestore(app),
    auth: getAuth(app),
    appCheck: getAppCheck(app),
    storage: getStorage(app),
  };
}
