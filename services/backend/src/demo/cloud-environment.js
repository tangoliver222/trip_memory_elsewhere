const EMULATOR_HOSTS = Object.freeze([
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
  'FIREBASE_EMULATOR_HUB',
]);
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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

export function loadCloudOcrEnvironment(environment = {}, projectId) {
  const invalidOcr = (field) => {
    throw new Error(`Invalid cloud OCR environment: ${field}`);
  };
  if (environment.ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED === undefined
    || environment.ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED === 'false') return null;
  if (environment.ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED !== 'true') {
    invalidOcr('ELSEWHERE_DOCUMENT_AI_DEMO_ALLOWED');
  }
  const providerVersion = environment.OCR_PROVIDER_VERSION;
  const location = environment.DOCUMENT_AI_LOCATION;
  const processorVersion = environment.DOCUMENT_AI_PROCESSOR_VERSION;
  const endpoint = environment.DOCUMENT_AI_ENDPOINT;
  if (environment.CAPABILITY_EXECUTION_MODE !== 'google') invalidOcr('CAPABILITY_EXECUTION_MODE');
  if (typeof projectId !== 'string'
    || environment.DOCUMENT_AI_PROJECT_ID !== projectId) invalidOcr('DOCUMENT_AI_PROJECT_ID');
  for (const [field, value] of [
    ['OCR_PROVIDER_VERSION', providerVersion],
    ['DOCUMENT_AI_LOCATION', location],
    ['DOCUMENT_AI_PROCESSOR_ID', environment.DOCUMENT_AI_PROCESSOR_ID],
    ['DOCUMENT_AI_PROCESSOR_VERSION', processorVersion],
  ]) {
    if (typeof value !== 'string' || !LABEL.test(value)) invalidOcr(field);
  }
  if (processorVersion !== providerVersion) invalidOcr('DOCUMENT_AI_PROCESSOR_VERSION');
  if (endpoint !== `${location}-documentai.googleapis.com`) invalidOcr('DOCUMENT_AI_ENDPOINT');
  return Object.freeze({
    providerVersion,
    documentAi: Object.freeze({
      projectId,
      location,
      processorId: environment.DOCUMENT_AI_PROCESSOR_ID,
      processorVersion,
      endpoint,
    }),
  });
}
