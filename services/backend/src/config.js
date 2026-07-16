import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(1024 * 1024).default(32 * 1024),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  GEMINI_API_KEY: z.string().default(''),
  GOOGLE_GENAI_USE_VERTEXAI: z.enum(['true', 'false']).default('false'),
  GOOGLE_CLOUD_PROJECT: z.string().default(''),
  GOOGLE_CLOUD_LOCATION: z.string().default('global'),
  ELSE_MODEL_FAST: z.string().default('gemini-flash-latest'),
  ELSE_MODEL_DEEP: z.string().optional(),
  ELSE_CORS_ORIGIN: z.string().default('*'),
  ELSEWHERE_SERVICE_MODE: z.enum(['api', 'ingestion']).default('api'),
  FIREBASE_PROJECT_ID: z.string().trim().default(''),
  ELSEWHERE_ALLOWED_APP_IDS: z.string().optional(),
  ELSEWHERE_STORAGE_BUCKETS: z.string().optional(),
  PROCESSING_SOFT_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  PROCESSING_LEASE_MS: z.coerce.number().int().positive().default(240000),
  CLOUD_RUN_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
  PROCESSING_CLEANUP_MARGIN_MS: z.coerce.number().int().positive().default(30000),
  MAX_INPUT_BYTES: z.coerce.number().int().positive().max(52428800).default(52428800),
  MAX_INPUT_PIXELS: z.coerce.number().int().positive().max(60000000).default(60000000),
  MAX_IMAGE_WIDTH: z.coerce.number().int().positive().max(20000).default(20000),
  MAX_IMAGE_HEIGHT: z.coerce.number().int().positive().max(20000).default(20000),
  MAX_PAGE_COUNT: z.coerce.number().int().positive().max(100).default(100),
  MAX_METADATA_DECOMPRESSED_BYTES: z.coerce.number()
    .int()
    .positive()
    .max(16777216)
    .default(16777216),
});

const invalidConfiguration = (fields) => (
  new Error(`Invalid backend configuration: ${fields.join(', ')}`)
);

function parseList(raw, fallback, field) {
  if (raw === undefined) return Object.freeze([...fallback]);
  const values = raw.split(',').map((value) => value.trim());
  if (values.some((value) => !value) || new Set(values).size !== values.length) {
    throw invalidConfiguration([field]);
  }
  return Object.freeze(values);
}

export function loadConfig(env = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid backend configuration: ${fields}`);
  }

  const value = parsed.data;
  const isProduction = value.NODE_ENV === 'production';
  const firebaseProjectId = value.FIREBASE_PROJECT_ID
    || (isProduction ? '' : 'demo-elsewhere');
  const allowedAppIds = parseList(
    value.ELSEWHERE_ALLOWED_APP_IDS,
    isProduction ? [] : ['elsewhere-web-local'],
    'ELSEWHERE_ALLOWED_APP_IDS',
  );
  const storageBuckets = parseList(
    value.ELSEWHERE_STORAGE_BUCKETS,
    isProduction ? [] : ['demo-elsewhere.appspot.com'],
    'ELSEWHERE_STORAGE_BUCKETS',
  );
  const missing = [];
  if (!firebaseProjectId) missing.push('FIREBASE_PROJECT_ID');
  if (value.ELSEWHERE_SERVICE_MODE === 'api' && allowedAppIds.length === 0) {
    missing.push('ELSEWHERE_ALLOWED_APP_IDS');
  }
  if (value.ELSEWHERE_SERVICE_MODE === 'ingestion' && storageBuckets.length === 0) {
    missing.push('ELSEWHERE_STORAGE_BUCKETS');
  }
  if (missing.length > 0) throw invalidConfiguration(missing);

  if (value.PROCESSING_SOFT_TIMEOUT_MS >= value.PROCESSING_LEASE_MS) {
    throw invalidConfiguration(['PROCESSING_SOFT_TIMEOUT_MS', 'PROCESSING_LEASE_MS']);
  }
  if (value.PROCESSING_LEASE_MS
    > value.CLOUD_RUN_REQUEST_TIMEOUT_MS - value.PROCESSING_CLEANUP_MARGIN_MS) {
    throw invalidConfiguration([
      'PROCESSING_LEASE_MS',
      'CLOUD_RUN_REQUEST_TIMEOUT_MS',
      'PROCESSING_CLEANUP_MARGIN_MS',
    ]);
  }

  const processing = Object.freeze({
    timeouts: Object.freeze({
      softMs: value.PROCESSING_SOFT_TIMEOUT_MS,
      leaseMs: value.PROCESSING_LEASE_MS,
      requestMs: value.CLOUD_RUN_REQUEST_TIMEOUT_MS,
      cleanupMarginMs: value.PROCESSING_CLEANUP_MARGIN_MS,
    }),
    limits: Object.freeze({
      maxInputBytes: value.MAX_INPUT_BYTES,
      maxInputPixels: value.MAX_INPUT_PIXELS,
      maxImageWidth: value.MAX_IMAGE_WIDTH,
      maxImageHeight: value.MAX_IMAGE_HEIGHT,
      maxPageCount: value.MAX_PAGE_COUNT,
      maxMetadataDecompressedBytes: value.MAX_METADATA_DECOMPRESSED_BYTES,
    }),
  });

  return Object.freeze({
    nodeEnv: value.NODE_ENV,
    host: value.HOST,
    port: value.PORT,
    bodyLimit: value.BODY_LIMIT_BYTES,
    logLevel: value.LOG_LEVEL,
    apiKey: value.GEMINI_API_KEY,
    useVertex: value.GOOGLE_GENAI_USE_VERTEXAI === 'true',
    vertexProject: value.GOOGLE_CLOUD_PROJECT,
    vertexLocation: value.GOOGLE_CLOUD_LOCATION,
    models: Object.freeze({
      FAST_MULTIMODAL: value.ELSE_MODEL_FAST,
      DEEP_REASONING: value.ELSE_MODEL_DEEP || value.ELSE_MODEL_FAST,
    }),
    corsOrigin: value.ELSE_CORS_ORIGIN,
    serviceMode: value.ELSEWHERE_SERVICE_MODE,
    firebaseProjectId,
    allowedAppIds,
    storageBuckets,
    processing,
    evidenceLimit: 40,
    maxQuestionLength: 500,
  });
}

export const config = loadConfig();

export const hasCredentials = () => Boolean(
  config.apiKey || (config.useVertex && config.vertexProject),
);
