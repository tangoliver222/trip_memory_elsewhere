import { createHash } from 'node:crypto';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function safeFacts(facts) {
  return Object.fromEntries(Object.entries(facts).sort(([left], [right]) => (
    left.localeCompare(right)
  )).map(([name, fact]) => [name, {
    value: structuredClone(fact.value),
    sourceType: fact.sourceType,
    confidence: fact.confidence,
    status: fact.status,
    observedAt: fact.observedAt,
  }]));
}

function projectFragment(fragment) {
  const thumbnail = fragment.derivatives.thumbnail;
  const deterministic = fragment.processing.deterministic;
  return {
    id: fragment.id,
    batchId: fragment.batchId,
    type: fragment.type,
    status: fragment.status,
    createdAt: fragment.createdAt,
    updatedAt: fragment.updatedAt,
    original: {
      name: fragment.source.originalName,
      contentType: fragment.storage.contentType,
      sizeBytes: fragment.storage.sizeBytes,
      storagePath: fragment.storage.originalPath,
    },
    thumbnail: thumbnail ? {
      storagePath: thumbnail.path,
      contentType: thumbnail.contentType,
      width: thumbnail.width,
      height: thumbnail.height,
    } : null,
    source: {
      provider: fragment.source.provider,
      importMethod: fragment.source.importMethod,
      sourceCreatedAt: fragment.source.sourceCreatedAt,
      sourceModifiedAt: fragment.source.sourceModifiedAt,
      timezoneOffsetMinutes: fragment.source.timezoneOffsetMinutes,
      locationHint: fragment.source.locationHint
        ? { ...fragment.source.locationHint }
        : null,
      media: fragment.source.media ? { ...fragment.source.media } : null,
    },
    facts: safeFacts(fragment.facts),
    relationships: {
      journeyId: fragment.journeyId,
      sceneId: fragment.sceneId,
      placeId: fragment.placeId,
    },
    deterministic: deterministic ? {
      state: deterministic.state,
      metadataStatus: deterministic.metadataStatus,
      thumbnailStatus: deterministic.thumbnailStatus,
      perceptualHashStatus: deterministic.perceptualHashStatus,
      updatedAt: deterministic.updatedAt,
    } : null,
  };
}

function projectBatch(batch) {
  return {
    id: batch.id,
    status: batch.status,
    uploadStatus: batch.uploadStatus,
    inputCount: batch.inputCount,
    counters: { ...batch.counters },
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}

export function projectMemorySnapshot({
  ownerId,
  fragments,
  importBatches,
  totalFragments = fragments?.length,
  totalImportBatches = importBatches?.length,
  fragmentsTruncated = false,
  importBatchesTruncated = false,
} = {}) {
  if (typeof ownerId !== 'string' || !ownerId) throw new TypeError('ownerId is required');
  if (!Array.isArray(fragments) || !Array.isArray(importBatches)) {
    throw new TypeError('Snapshot collections are required');
  }
  if (fragments.some((fragment) => fragment.ownerId !== ownerId)
    || importBatches.some((batch) => batch.ownerId !== ownerId)) {
    throw new TypeError('Snapshot collections must belong to ownerId');
  }
  if (!Number.isSafeInteger(totalFragments) || totalFragments < fragments.length
    || !Number.isSafeInteger(totalImportBatches) || totalImportBatches < importBatches.length) {
    throw new TypeError('Snapshot counts are invalid');
  }

  const projectedFragments = [...fragments]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(projectFragment);
  const projectedBatches = [...importBatches]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(projectBatch);
  const projection = {
    summary: {
      totalFragments,
      totalImportBatches,
      returnedFragments: projectedFragments.length,
      returnedImportBatches: projectedBatches.length,
      needsReview: projectedBatches.reduce((sum, batch) => sum + batch.counters.needsReview, 0),
    },
    fragments: projectedFragments,
    importBatches: projectedBatches,
    page: {
      fragmentsTruncated: Boolean(fragmentsTruncated),
      importBatchesTruncated: Boolean(importBatchesTruncated),
    },
  };
  const revision = createHash('sha256')
    .update(JSON.stringify(projection))
    .digest('hex')
    .slice(0, 20);
  return deepFreeze({ revision, ...projection });
}
