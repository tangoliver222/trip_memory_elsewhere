const EMULATOR_HOSTS = Object.freeze([
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
  'FIREBASE_EMULATOR_HUB',
]);
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(field) {
  throw new Error(`Invalid cloud demo environment: ${field}`);
}

function list(value, field) {
  if (typeof value !== 'string') invalid(field);
  const values = value.split(',').map((item) => item.trim());
  if (values.some((item) => !item) || new Set(values).size !== values.length) invalid(field);
  return Object.freeze(values);
}

export function loadCloudDemoEnvironment(environment = {}) {
  if (environment.NODE_ENV !== 'development') invalid('NODE_ENV');
  if (environment.ELSEWHERE_CLOUD_DEMO_MODE !== 'true') invalid('ELSEWHERE_CLOUD_DEMO_MODE');
  for (const field of EMULATOR_HOSTS) {
    if (environment[field]) invalid(field);
  }

  const projectId = environment.FIREBASE_PROJECT_ID;
  if (typeof projectId !== 'string' || !projectId || projectId.startsWith('demo-')) {
    invalid('FIREBASE_PROJECT_ID');
  }
  const allowedAppIds = list(environment.ELSEWHERE_ALLOWED_APP_IDS, 'ELSEWHERE_ALLOWED_APP_IDS');
  const storageBuckets = list(environment.ELSEWHERE_STORAGE_BUCKETS, 'ELSEWHERE_STORAGE_BUCKETS');
  const expectedBucket = `${projectId}.firebasestorage.app`;
  if (storageBuckets.length !== 1 || storageBuckets[0] !== expectedBucket) {
    invalid('ELSEWHERE_STORAGE_BUCKETS');
  }
  const appCheckDebugToken = environment.ELSEWHERE_APP_CHECK_DEBUG_TOKEN;
  if (typeof appCheckDebugToken !== 'string' || !UUID4.test(appCheckDebugToken)) {
    invalid('ELSEWHERE_APP_CHECK_DEBUG_TOKEN');
  }

  return Object.freeze({
    projectId,
    allowedAppIds,
    storageBucket: expectedBucket,
    appCheckDebugToken,
  });
}
