import { isDeepStrictEqual } from 'node:util';
import {
  IdSchema,
  IsoDateTimeSchema,
  deriveImportBatchState,
  parseFragment,
  parseImportBatch,
} from '../domain/index.js';
import {
  RepositoryOriginalConflictError,
  RepositoryOwnerError,
  RepositoryUnregisteredOriginalError,
} from './errors.js';

function normalizeBase(uid, input) {
  if (!IdSchema.safeParse(uid).success) throw new RepositoryOwnerError();
  const fields = ['batchId', 'fragmentId', 'originalPath', 'generation', 'updatedAt'];
  if (!input || fields.some((field) => typeof input[field] !== 'string' || !input[field])) {
    throw new RepositoryUnregisteredOriginalError();
  }
  if (!IdSchema.safeParse(input.batchId).success
    || !IdSchema.safeParse(input.fragmentId).success
    || !IsoDateTimeSchema.safeParse(input.updatedAt).success) {
    throw new RepositoryUnregisteredOriginalError();
  }
  return {
    batchId: input.batchId,
    fragmentId: input.fragmentId,
    originalPath: input.originalPath,
    generation: input.generation,
    updatedAt: input.updatedAt,
  };
}

export function normalizeFinalizedOriginal(uid, input) {
  const normalized = normalizeBase(uid, input);
  if (uid !== input?.fragment?.ownerId) throw new RepositoryOwnerError();

  let fragment;
  try {
    fragment = parseFragment(input.fragment);
  } catch {
    throw new RepositoryUnregisteredOriginalError();
  }
  if (fragment.id !== normalized.fragmentId
    || fragment.batchId !== normalized.batchId
    || fragment.storage.originalPath !== normalized.originalPath
    || fragment.storage.generation !== normalized.generation) {
    throw new RepositoryUnregisteredOriginalError();
  }
  return { ...normalized, fragment };
}

export function normalizeRejectedOriginal(uid, input) {
  const normalized = normalizeBase(uid, input);
  if (typeof input.failureCode !== 'string'
    || !input.failureCode
    || input.failureCode.length > 128) {
    throw new RepositoryUnregisteredOriginalError();
  }
  return { ...normalized, failureCode: input.failureCode };
}

export function applyOriginalOutcome(uid, batch, input, state) {
  if (!batch) throw new RepositoryUnregisteredOriginalError();
  if (batch.ownerId !== uid) throw new RepositoryOwnerError();

  const item = batch.uploads[input.fragmentId];
  if (!item
    || batch.id !== input.batchId
    || item.fragmentId !== input.fragmentId
    || item.originalPath !== input.originalPath) {
    throw new RepositoryUnregisteredOriginalError();
  }

  if (item.state !== 'pending') {
    if (item.finalizedGeneration === input.generation) {
      return Object.freeze({ outcome: 'duplicate', batch });
    }
    throw new RepositoryOriginalConflictError();
  }

  if (state === 'finalized') {
    const { fragment } = input;
    if (fragment.type !== item.sourceType
      || !item.allowedContentTypes.includes(fragment.storage.contentType)
      || fragment.storage.sizeBytes > item.maxBytes
      || !isDeepStrictEqual(fragment.source, item.source)) {
      throw new RepositoryUnregisteredOriginalError();
    }
  }

  const uploads = {
    ...batch.uploads,
    [input.fragmentId]: {
      ...item,
      state,
      finalizedGeneration: input.generation,
      failureCode: state === 'failed' ? input.failureCode : null,
    },
  };
  const derived = deriveImportBatchState(uploads, batch.counters);
  const nextBatch = parseImportBatch({
    ...batch,
    ...derived,
    uploads,
    updatedAt: input.updatedAt,
  });
  return Object.freeze({ outcome: 'applied', batch: nextBatch });
}
