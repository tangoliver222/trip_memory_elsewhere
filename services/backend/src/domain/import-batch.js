import { z } from 'zod';
import { CommonFields } from './common.js';

const CounterSchema = z.number().int().nonnegative();

export const ImportBatchSchema = z.strictObject({
  ...CommonFields,
  status: z.enum(['open', 'processing', 'completed', 'completed_with_errors', 'failed']),
  inputCount: z.number().int().nonnegative(),
  counters: z.strictObject({
    saved: CounterSchema,
    processed: CounterSchema,
    failed: CounterSchema,
    needsReview: CounterSchema,
  }),
}).superRefine((batch, context) => {
  for (const [name, count] of Object.entries(batch.counters)) {
    if (count > batch.inputCount) {
      context.addIssue({
        code: 'custom',
        message: `${name} cannot exceed inputCount`,
        path: ['counters', name],
      });
    }
  }
});

export const parseImportBatch = (input) => ImportBatchSchema.parse(input);
