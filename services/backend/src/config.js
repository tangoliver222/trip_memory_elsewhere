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
});

export function loadConfig(env = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid backend configuration: ${fields}`);
  }

  const value = parsed.data;
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
    evidenceLimit: 40,
    maxQuestionLength: 500,
  });
}

export const config = loadConfig();

export const hasCredentials = () => Boolean(
  config.apiKey || (config.useVertex && config.vertexProject),
);
