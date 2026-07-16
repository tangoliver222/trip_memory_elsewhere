import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSourceDescriptor,
  SourceTypeSchema,
} from '../../src/domain/source-descriptor.js';
import {
  getUploadPolicy,
  MAX_ORIGINAL_BYTES,
  validateDeclaredUpload,
} from '../../src/imports/upload-policy.js';

const baseSource = {
  schemaVersion: 1,
  providerItemId: null,
  originalName: null,
  sourceCreatedAt: null,
  sourceModifiedAt: null,
  timezoneOffsetMinutes: null,
  locationHint: null,
  media: null,
};

const localFileSource = {
  ...baseSource,
  provider: 'local_file',
  importMethod: 'file_picker',
  originalName: 'IMG_1842.JPG',
  sourceModifiedAt: '2026-07-12T10:22:14Z',
  timezoneOffsetMinutes: 420,
  media: { width: 4032, height: 3024 },
  providerMetadata: {},
};

test('accepts each frozen Source Descriptor v1 provider', () => {
  const descriptors = [
    localFileSource,
    {
      ...baseSource,
      provider: 'device_camera',
      importMethod: 'camera_capture',
      sourceCreatedAt: '2026-07-16T08:30:00+07:00',
      timezoneOffsetMinutes: 420,
      locationHint: {
        lat: 13.7563,
        lng: 100.5018,
        accuracyMeters: 8.5,
        source: 'camera_device',
      },
      media: { width: 3024, height: 4032 },
      providerMetadata: {},
    },
    {
      ...baseSource,
      provider: 'google_photos',
      importMethod: 'google_photos_picker',
      providerItemId: 'media-item-42',
      originalName: 'PXL_20260716.jpg',
      sourceCreatedAt: '2026-07-16T01:30:00Z',
      media: { width: 4080, height: 3072 },
      providerMetadata: {
        cameraMake: 'Google',
        cameraModel: 'Pixel',
        focalLengthMm: 6.8,
        apertureFNumber: 1.7,
        isoEquivalent: 80,
        exposureTimeSeconds: 0.004,
      },
    },
    {
      ...baseSource,
      provider: 'pasted_text',
      importMethod: 'paste',
      sourceCreatedAt: '2026-07-16T01:30:00Z',
      providerMetadata: { title: 'Bangkok notes' },
    },
  ];

  for (const descriptor of descriptors) {
    assert.deepEqual(parseSourceDescriptor(descriptor), descriptor);
  }
});

test('rejects provider and import method mismatches and unknown fields', () => {
  assert.throws(() => parseSourceDescriptor({
    ...localFileSource,
    importMethod: 'paste',
  }));
  assert.throws(() => parseSourceDescriptor({
    ...localFileSource,
    unexpected: true,
  }));
  assert.throws(() => parseSourceDescriptor({
    ...localFileSource,
    providerItemId: 'local-session-id',
  }));
});

test('rejects credential and temporary URL fields at every strict boundary', () => {
  assert.throws(() => parseSourceDescriptor({
    ...localFileSource,
    oauthToken: 'secret',
  }));
  assert.throws(() => parseSourceDescriptor({
    ...localFileSource,
    providerMetadata: { downloadUrl: 'https://temporary.invalid/object' },
  }));
  assert.throws(() => parseSourceDescriptor({
    ...baseSource,
    provider: 'google_photos',
    importMethod: 'google_photos_picker',
    providerItemId: 'media-item-42',
    providerMetadata: {
      cameraMake: null,
      cameraModel: null,
      focalLengthMm: null,
      apertureFNumber: null,
      isoEquivalent: null,
      exposureTimeSeconds: null,
      baseUrl: 'https://temporary.invalid/base',
    },
  }));
});

test('rejects invalid timestamps, timezone offsets, coordinates and dimensions', () => {
  for (const change of [
    { sourceModifiedAt: 'July 16' },
    { timezoneOffsetMinutes: 841 },
    {
      locationHint: {
        lat: 91,
        lng: 100.5018,
        accuracyMeters: 8,
        source: 'camera_device',
      },
    },
    { media: { width: 0, height: 3024 } },
  ]) {
    assert.throws(() => parseSourceDescriptor({ ...localFileSource, ...change }));
  }
});

test('derives immutable upload policy from sourceType', () => {
  const images = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const documents = [...images, 'application/pdf'];

  assert.deepEqual(getUploadPolicy('photo'), {
    allowedContentTypes: images,
    maxBytes: MAX_ORIGINAL_BYTES,
  });
  assert.deepEqual(getUploadPolicy('screenshot').allowedContentTypes, images);
  for (const sourceType of ['receipt', 'ticket', 'menu']) {
    assert.deepEqual(getUploadPolicy(sourceType).allowedContentTypes, documents);
  }
  assert.deepEqual(getUploadPolicy('text').allowedContentTypes, ['text/plain']);
  assert.equal(MAX_ORIGINAL_BYTES, 50 * 1024 * 1024);

  const policy = getUploadPolicy('photo');
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.allowedContentTypes), true);
  assert.throws(() => policy.allowedContentTypes.push('application/pdf'), TypeError);
  assert.deepEqual(getUploadPolicy('photo').allowedContentTypes, images);
});

test('validates declared upload without accepting client policy overrides', () => {
  assert.deepEqual(validateDeclaredUpload({
    sourceType: 'receipt',
    declaredContentType: 'application/pdf',
    declaredSizeBytes: MAX_ORIGINAL_BYTES,
  }), {
    declaredContentType: 'application/pdf',
    declaredSizeBytes: MAX_ORIGINAL_BYTES,
    allowedContentTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf',
    ],
    maxBytes: MAX_ORIGINAL_BYTES,
  });

  for (const input of [
    { sourceType: 'audio', declaredContentType: 'audio/mpeg', declaredSizeBytes: 1 },
    { sourceType: 'photo', declaredContentType: 'application/pdf', declaredSizeBytes: 1 },
    { sourceType: 'text', declaredContentType: 'text/plain', declaredSizeBytes: 0 },
    {
      sourceType: 'text',
      declaredContentType: 'text/plain',
      declaredSizeBytes: MAX_ORIGINAL_BYTES + 1,
    },
    {
      sourceType: 'text',
      declaredContentType: 'text/plain',
      declaredSizeBytes: 1,
      maxBytes: Number.MAX_SAFE_INTEGER,
    },
  ]) {
    assert.throws(() => validateDeclaredUpload(input));
  }

  assert.throws(() => SourceTypeSchema.parse('audio'));
});
