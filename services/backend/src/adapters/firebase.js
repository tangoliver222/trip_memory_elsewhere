import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export function createFirebaseAdmin({ projectId, appName }) {
  if (!projectId || !appName) {
    throw new TypeError('Firebase projectId and appName are required');
  }
  if (process.env.NODE_ENV === 'test' && !projectId.startsWith('demo-')) {
    throw new Error('Firebase tests require a demo project ID');
  }

  const app = initializeApp({ projectId }, appName);
  return { app, db: getFirestore(app) };
}
