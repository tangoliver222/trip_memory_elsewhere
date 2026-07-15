import { z } from 'zod';
import { IsoDateTimeSchema, ReferenceSchema } from './common.js';

export const ProvenanceSchema = z.strictObject({
  value: z.json(),
  sourceType: z.enum(['exif', 'ocr', 'gps', 'places', 'gemini', 'system', 'user']),
  sourceRefs: z.array(ReferenceSchema),
  processor: z.strictObject({
    name: z.string().min(1),
    version: z.string().min(1),
    modelAlias: z.string().min(1).nullable(),
    promptVersion: z.string().min(1).nullable(),
  }),
  confidence: z.number().min(0).max(1),
  status: z.enum(['suggested', 'confirmed', 'corrected', 'rejected', 'unresolved', 'conflicted']),
  observedAt: IsoDateTimeSchema,
});

export const parseProvenance = (input) => ProvenanceSchema.parse(input);
