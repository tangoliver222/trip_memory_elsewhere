import { createFirebaseObjectInspector } from '../adapters/firebase-object-inspector.js';
import { createFirebaseTokenVerifier } from '../adapters/firebase-token-verifier.js';
import { createFirebaseAdmin } from '../adapters/firebase.js';
import { createFirestoreRepository } from '../repositories/firestore.js';
import { createApiComposition } from './api.js';
import { createIngestionComposition } from './ingestion.js';

export function createRuntimeApp(appConfig, {
  firebaseFactory = createFirebaseAdmin,
  repositoryFactory = createFirestoreRepository,
} = {}) {
  const firebase = firebaseFactory({
    projectId: appConfig.firebaseProjectId,
    appName: `elsewhere-${appConfig.serviceMode}`,
  });
  const repository = repositoryFactory({ db: firebase.db });

  if (appConfig.serviceMode === 'api') {
    return createApiComposition({
      appConfig,
      repository,
      tokenVerifier: createFirebaseTokenVerifier({
        auth: firebase.auth,
        appCheck: firebase.appCheck,
      }),
      allowedAppIds: appConfig.allowedAppIds,
    });
  }

  if (appConfig.serviceMode === 'ingestion') {
    return createIngestionComposition({
      appConfig,
      repository,
      objectInspector: createFirebaseObjectInspector({
        storage: firebase.storage,
        allowedBuckets: appConfig.storageBuckets,
      }),
      allowedBuckets: appConfig.storageBuckets,
    });
  }

  throw new TypeError('Unsupported Elsewhere service mode');
}
