import { z } from 'zod';
import { CommonFields, IdSchema } from './common.js';
import { ProvenanceSchema } from './provenance.js';

export const FragmentSchema = z.strictObject({
  ...CommonFields,
  batchId: IdSchema,
  type: z.enum(['photo', 'receipt', 'ticket', 'screenshot', 'menu', 'text', 'audio']),
  status: z.enum(['uploaded', 'processing', 'placed', 'unresolved', 'failed']),
  storage: z.strictObject({
    originalPath: z.string().min(1),
  }),
  hashes: z.strictObject({
    sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    perceptualHash: z.string().min(1).optional(),
  }),
  facts: z.record(z.string(), ProvenanceSchema),
  journeyId: IdSchema.nullable(),
  sceneId: IdSchema.nullable(),
  placeId: IdSchema.nullable(),
}).superRefine((fragment, context) => {
  const expectedPath = `users/${fragment.ownerId}/originals/${fragment.batchId}/${fragment.id}`;
  if (fragment.storage.originalPath !== expectedPath) {
    context.addIssue({
      code: 'custom',
      message: 'Original path must be scoped to the fragment owner and batch',
      path: ['storage', 'originalPath'],
    });
  }
});

export const parseFragment = (input) => FragmentSchema.parse(input);
