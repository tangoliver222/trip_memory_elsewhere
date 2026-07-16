export const NOW = '2026-07-16T00:00:00.000Z';

export function makeLocalFileSource(overrides = {}) {
  return {
    schemaVersion: 1,
    provider: 'local_file',
    importMethod: 'file_picker',
    providerItemId: null,
    originalName: 'IMG_1842.JPG',
    sourceCreatedAt: null,
    sourceModifiedAt: '2026-07-12T10:22:14Z',
    timezoneOffsetMinutes: 420,
    locationHint: null,
    media: { width: 4032, height: 3024 },
    providerMetadata: {},
    ...overrides,
  };
}

export function makeUploadItem(overrides = {}) {
  const {
    fragmentId = 'frag_12345678',
    ownerId = 'user_alpha',
    batchId = 'batch_12345678',
    ...itemOverrides
  } = overrides;

  return {
    fragmentId,
    sourceType: 'photo',
    state: 'pending',
    originalPath: `users/${ownerId}/originals/${batchId}/${fragmentId}`,
    declaredContentType: 'image/jpeg',
    declaredSizeBytes: 2_841_930,
    allowedContentTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ],
    maxBytes: 50 * 1024 * 1024,
    source: makeLocalFileSource(),
    finalizedGeneration: null,
    failureCode: null,
    ...itemOverrides,
  };
}

export function makePendingBatch(overrides = {}) {
  const id = overrides.id ?? 'batch_12345678';
  const ownerId = overrides.ownerId ?? 'user_alpha';
  const item = makeUploadItem({ ownerId, batchId: id });

  return {
    id,
    ownerId,
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    status: 'open',
    uploadStatus: 'pending',
    inputCount: 1,
    counters: { saved: 0, processed: 0, failed: 0, needsReview: 0 },
    uploads: { [item.fragmentId]: item },
    ...overrides,
  };
}

export function makeUploadedFragment(overrides = {}) {
  const id = overrides.id ?? 'frag_12345678';
  const ownerId = overrides.ownerId ?? 'user_alpha';
  const batchId = overrides.batchId ?? 'batch_12345678';

  return {
    id,
    ownerId,
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    batchId,
    type: 'photo',
    status: 'uploaded',
    storage: {
      originalPath: `users/${ownerId}/originals/${batchId}/${id}`,
      generation: '1740000000000001',
      contentType: 'image/jpeg',
      sizeBytes: 2_841_930,
      crc32c: 'ImIEBA==',
      md5Hash: null,
    },
    source: makeLocalFileSource(),
    hashes: {},
    facts: {},
    journeyId: null,
    sceneId: null,
    placeId: null,
    ...overrides,
  };
}
