import { randomUUID as nodeRandomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  IdSchema,
  IsoDateTimeSchema,
  SourceDescriptorSchema,
  SourceTypeSchema,
  parseImportBatch,
} from '../domain/index.js';
import { assertImportBatchRepository } from '../repositories/contract.js';
import { ImportServiceError } from './errors.js';
import { validateDeclaredUpload } from './upload-policy.js';

const RequestItemSchema = z.strictObject({
  sourceType: SourceTypeSchema,
  declaredContentType: z.string().trim().min(1),
  declaredSizeBytes: z.number().int().positive(),
  source: SourceDescriptorSchema,
});

const CreateBatchRequestSchema = z.strictObject({
  items: z.array(RequestItemSchema).min(1).max(50),
});

const defaultClock = () => new Date().toISOString();

const freezeCounters = (counters) => Object.freeze({
  saved: counters.saved,
  processed: counters.processed,
  failed: counters.failed,
  needsReview: counters.needsReview,
});

function createProjection(batch) {
  return Object.freeze({
    id: batch.id,
    status: batch.status,
    uploadStatus: batch.uploadStatus,
    inputCount: batch.inputCount,
    counters: freezeCounters(batch.counters),
  });
}

function uploadProjection(item) {
  return Object.freeze({
    fragmentId: item.fragmentId,
    originalPath: item.originalPath,
    allowedContentTypes: Object.freeze([...item.allowedContentTypes]),
    maxBytes: item.maxBytes,
  });
}

function receiptProjection(batch) {
  const items = Object.values(batch.uploads).map((item) => Object.freeze({
    fragmentId: item.fragmentId,
    sourceType: item.sourceType,
    state: item.state,
  }));
  return Object.freeze({
    ...createProjection(batch),
    items: Object.freeze(items),
  });
}

export function createImportService({
  repository,
  randomUUID = nodeRandomUUID,
  clock = defaultClock,
}) {
  const store = assertImportBatchRepository(repository);
  if (typeof randomUUID !== 'function') throw new TypeError('randomUUID must be a function');
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');

  return Object.freeze({
    async createBatch(uid, input) {
      let request;
      try {
        request = CreateBatchRequestSchema.parse(input);
        request.items = request.items.map((item) => {
          const policy = validateDeclaredUpload({
            sourceType: item.sourceType,
            declaredContentType: item.declaredContentType,
            declaredSizeBytes: item.declaredSizeBytes,
          });
          return { ...item, ...policy };
        });
      } catch {
        throw new ImportServiceError('import/invalid-request');
      }

      const ownerId = IdSchema.parse(uid);
      const timestamp = IsoDateTimeSchema.parse(clock());
      const batchId = IdSchema.parse(`batch_${randomUUID()}`);
      const uploads = Object.fromEntries(request.items.map((item) => {
        const fragmentId = IdSchema.parse(`frag_${randomUUID()}`);
        return [fragmentId, {
          fragmentId,
          sourceType: item.sourceType,
          state: 'pending',
          originalPath: `users/${ownerId}/originals/${batchId}/${fragmentId}`,
          declaredContentType: item.declaredContentType,
          declaredSizeBytes: item.declaredSizeBytes,
          allowedContentTypes: [...item.allowedContentTypes],
          maxBytes: item.maxBytes,
          source: item.source,
          finalizedGeneration: null,
          failureCode: null,
        }];
      }));

      const batch = parseImportBatch({
        id: batchId,
        ownerId,
        schemaVersion: 1,
        status: 'open',
        uploadStatus: 'pending',
        inputCount: request.items.length,
        counters: { saved: 0, processed: 0, failed: 0, needsReview: 0 },
        processingSummary: null,
        uploads,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      });

      try {
        await store.createImportBatch(ownerId, batch);
      } catch (error) {
        if (error?.code === 'repository/conflict') {
          throw new ImportServiceError('import/batch-conflict');
        }
        throw error;
      }

      return Object.freeze({
        batch: createProjection(batch),
        uploads: Object.freeze(Object.values(batch.uploads).map(uploadProjection)),
      });
    },

    async getReceipt(uid, batchId) {
      if (!IdSchema.safeParse(uid).success || !IdSchema.safeParse(batchId).success) {
        throw new ImportServiceError('import/batch-not-found');
      }
      const batch = await store.getImportBatch(uid, batchId);
      if (!batch) throw new ImportServiceError('import/batch-not-found');
      return receiptProjection(batch);
    },
  });
}
