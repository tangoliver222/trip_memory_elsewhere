import { z } from 'zod';
import { IdSchema } from '../domain/index.js';

export const ReviewInputSchema = z.strictObject({
  decision: z.enum(['yes', 'no', 'later']),
  placeId: IdSchema.optional(),
});

export const ConnectionInputSchema = z.strictObject({
  decision: z.enum(['confirmed', 'rejected']),
});

export const DiscoveryInputSchema = z.strictObject({
  saved: z.boolean(),
});

export const NoteInputSchema = z.strictObject({
  text: z.string().max(10_000),
});

const SettingValueSchemas = Object.freeze({
  sensitiveBlur: z.boolean(),
  highAccuracyGPS: z.boolean(),
  cloudProcessing: z.boolean(),
  appLock: z.boolean(),
  photoAccess: z.boolean(),
  aiTone: z.enum(['fact', 'gentle', 'narrative']),
});

export function parseSettingInput(key, body) {
  const valueSchema = SettingValueSchemas[key];
  if (!valueSchema) return null;
  const parsed = z.strictObject({ value: valueSchema }).safeParse(body);
  return parsed.success ? { key, value: parsed.data.value } : null;
}

export { IdSchema };
