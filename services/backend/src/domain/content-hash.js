import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

export const ContentHashSchema = z.strictObject({
  algorithm: z.literal('sha256'),
  algorithmVersion: z.literal('v1'),
  canonicalFragmentRef: z.strictObject({
    type: z.literal('fragment'),
    id: IdSchema,
  }),
  fragmentCount: z.number().int().positive(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const parseContentHash = (input) => ContentHashSchema.parse(input);
