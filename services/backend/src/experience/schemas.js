import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from '../domain/index.js';

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
  aiTone: z.enum(['fact', 'balanced', 'narrative']),
});

export function parseSettingInput(key, body) {
  const valueSchema = SettingValueSchemas[key];
  if (!valueSchema) return null;
  const parsed = z.strictObject({ value: valueSchema }).safeParse(body);
  return parsed.success ? { key, value: parsed.data.value } : null;
}

const ReviewDecisionSchema = z.strictObject({
  decision: z.enum(['yes', 'no', 'later']),
  placeId: IdSchema.optional(),
  decidedAt: IsoDateTimeSchema,
});

const ConnectionDecisionSchema = z.strictObject({
  decision: z.enum(['confirmed', 'rejected']),
  decidedAt: IsoDateTimeSchema,
});

const NoteStateSchema = z.strictObject({
  text: z.string().max(10_000),
  updatedAt: IsoDateTimeSchema,
});

export const ExperienceStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  reviewDecisions: z.record(z.string(), ReviewDecisionSchema),
  connectionDecisions: z.record(z.string(), ConnectionDecisionSchema),
  savedDiscoveryIds: z.array(IdSchema).max(500),
  notes: z.record(z.string(), NoteStateSchema),
  settings: z.strictObject({
    sensitiveBlur: z.boolean().optional(),
    highAccuracyGPS: z.boolean().optional(),
    cloudProcessing: z.boolean().optional(),
    appLock: z.boolean().optional(),
    photoAccess: z.boolean().optional(),
    aiTone: z.enum(['fact', 'balanced', 'narrative']).optional(),
  }),
  excludedJourneyIds: z.array(IdSchema).max(200),
  updatedAt: IsoDateTimeSchema.nullable(),
});

const CommandIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const ExperienceCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('review'), id: IdSchema, value: ReviewInputSchema, updatedAt: IsoDateTimeSchema,
  }),
  z.strictObject({
    type: z.literal('connection'), id: IdSchema, value: ConnectionInputSchema,
    updatedAt: IsoDateTimeSchema,
  }),
  z.strictObject({
    type: z.literal('discovery'), id: IdSchema, value: DiscoveryInputSchema,
    updatedAt: IsoDateTimeSchema,
  }),
  z.strictObject({
    type: z.literal('note'), id: IdSchema, value: NoteInputSchema, updatedAt: IsoDateTimeSchema,
  }),
  z.strictObject({
    type: z.literal('setting'), id: CommandIdSchema,
    value: z.strictObject({ value: z.union([z.boolean(), z.enum(['fact', 'balanced', 'narrative'])]) }),
    updatedAt: IsoDateTimeSchema,
  }),
  z.strictObject({
    type: z.literal('exclude_journey'), id: IdSchema, value: z.strictObject({}),
    updatedAt: IsoDateTimeSchema,
  }),
]);

export function emptyExperienceState() {
  return Object.freeze({
    schemaVersion: 1,
    revision: 0,
    reviewDecisions: Object.freeze({}),
    connectionDecisions: Object.freeze({}),
    savedDiscoveryIds: Object.freeze([]),
    notes: Object.freeze({}),
    settings: Object.freeze({}),
    excludedJourneyIds: Object.freeze([]),
    updatedAt: null,
  });
}

export { IdSchema };
