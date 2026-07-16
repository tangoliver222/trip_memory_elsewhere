import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMediaMetadataReader } from '../../src/adapters/media-metadata-reader.js';
import {
  alphaPngBytes,
  corruptExifJpegBytes,
  exifJpegBytes,
  malformedUtf8Bytes,
  minimalHeicBytes,
  minimalPdfBytes,
  pngWithCompressedMetadataBytes,
  strictUtf8Bytes,
} from '../fixtures/media.js';

const FUTURE_DEADLINE = '2099-01-01T00:00:00.000Z';
const SAFE_LIMITS = Object.freeze({
  maxInputBytes: 1024 * 1024,
  maxInputPixels: 1024 * 1024,
  maxImageWidth: 4096,
  maxImageHeight: 4096,
  maxPageCount: 10,
  maxMetadataDecompressedBytes: 1024 * 1024,
});

const emptyTechnicalMetadata = (format, overrides = {}) => ({
  format,
  width: null,
  height: null,
  orientation: null,
  pageCount: null,
  cameraMake: null,
  cameraModel: null,
  lensModel: null,
  focalLengthMm: null,
  apertureFNumber: null,
  isoEquivalent: null,
  exposureTimeSeconds: null,
  metadataStatus: 'complete',
  warningCodes: [],
  processorVersion: 'v1',
  ...overrides,
});

async function createFixtureFile(t, bytes, name = 'fixture.bin') {
  const directory = await mkdtemp(join(tmpdir(), 'elsewhere-metadata-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, name);
  await writeFile(path, bytes, { mode: 0o600 });
  return path;
}

const createReader = (overrides = {}) => createMediaMetadataReader({
  limits: SAFE_LIMITS,
  ...overrides,
});

const read = (reader, path, overrides = {}) => reader.read({
  path,
  sourceType: 'photo',
  contentType: 'image/jpeg',
  signal: new AbortController().signal,
  deadlineAt: FUTURE_DEADLINE,
  ...overrides,
});

test('JPEG returns only the frozen EXIF whitelist and unresolved local time', async (t) => {
  const path = await createFixtureFile(t, exifJpegBytes(), 'whitelist.jpg');

  const result = await read(createReader(), path);

  assert.deepEqual(result, {
    technicalMetadata: emptyTechnicalMetadata('jpeg', {
      width: 2,
      height: 2,
      orientation: 6,
      cameraMake: 'Elsewhere',
      cameraModel: 'Fixture One',
      lensModel: 'Fixture Lens',
      focalLengthMm: 35,
      apertureFNumber: 2.8,
      isoEquivalent: 125,
      exposureTimeSeconds: 0.008,
    }),
    factHints: {
      capturedAt: {
        localDateTime: '2024-10-12T08:42:00',
        offsetMinutes: null,
        zoneId: null,
        instant: null,
        sourceType: 'exif',
        status: 'unresolved',
      },
      geo: null,
    },
    metadataStatus: 'complete',
    warningCodes: [],
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.technicalMetadata), true);
  assert.equal(Object.isFrozen(result.factHints), true);
  assert.equal(Object.isFrozen(result.factHints.capturedAt), true);
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    'MakerNote',
    'private-maker-note',
    'private-device-serial',
    'private-unknown-tag',
    'private-xmp',
    'private-icc',
    'thumbnail',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('explicit EXIF offset yields an instant but remains suggested', async (t) => {
  const path = await createFixtureFile(
    t,
    exifJpegBytes({ offsetTimeOriginal: '+07:00' }),
    'offset.jpg',
  );

  const result = await read(createReader(), path);

  assert.deepEqual(result.factHints.capturedAt, {
    localDateTime: '2024-10-12T08:42:00',
    offsetMinutes: 420,
    zoneId: null,
    instant: '2024-10-12T01:42:00.000Z',
    sourceType: 'exif',
    status: 'suggested',
  });
  assert.notEqual(result.factHints.capturedAt.status, 'confirmed');
});

test('GPS becomes a suggested fact and never confirmed user truth', async (t) => {
  const path = await createFixtureFile(
    t,
    exifJpegBytes({ includeGps: true }),
    'gps.jpg',
  );

  const result = await read(createReader(), path);

  assert.deepEqual(result.factHints.geo, {
    lat: 13.7563,
    lng: 100.5018,
    sourceType: 'gps',
    status: 'suggested',
  });
  assert.notEqual(result.factHints.geo.status, 'confirmed');
});

test('PDF reports pageCount null and page-count-unsupported', async (t) => {
  const path = await createFixtureFile(t, minimalPdfBytes(), 'fixture.pdf');

  const result = await read(createReader(), path, {
    sourceType: 'receipt',
    contentType: 'application/pdf',
  });

  assert.deepEqual(result, {
    technicalMetadata: emptyTechnicalMetadata('pdf', {
      metadataStatus: 'partial',
      warningCodes: ['processing/page-count-unsupported'],
    }),
    factHints: { capturedAt: null, geo: null },
    metadataStatus: 'partial',
    warningCodes: ['processing/page-count-unsupported'],
  });
  assert.equal(result.technicalMetadata.pageCount, null);
});

test('text is revalidated as strict streaming UTF-8 with byte count', async (t) => {
  const validBytes = strictUtf8Bytes();
  const validPath = await createFixtureFile(t, validBytes, 'note.txt');
  const invalidPath = await createFixtureFile(t, malformedUtf8Bytes(), 'malformed.txt');
  const exactReader = createMediaMetadataReader({
    limits: { ...SAFE_LIMITS, maxInputBytes: validBytes.byteLength },
  });

  const result = await read(exactReader, validPath, {
    sourceType: 'text',
    contentType: 'text/plain',
  });

  assert.deepEqual(result, {
    technicalMetadata: emptyTechnicalMetadata('text'),
    factHints: { capturedAt: null, geo: null },
    metadataStatus: 'complete',
    warningCodes: [],
  });
  await assert.rejects(
    () => read(createReader(), invalidPath, {
      sourceType: 'text',
      contentType: 'text/plain',
    }),
    { code: 'processing/invalid-media', retryable: false },
  );
  await assert.rejects(
    () => read(createMediaMetadataReader({
      limits: { ...SAFE_LIMITS, maxInputBytes: validBytes.byteLength - 1 },
    }), validPath, {
      sourceType: 'text',
      contentType: 'text/plain',
    }),
    { code: 'processing/media-limits-exceeded', retryable: false },
  );
});

test('metadata decompression above 16 MiB becomes a stable bounded failure', async (t) => {
  const path = await createFixtureFile(t, pngWithCompressedMetadataBytes(512), 'bounded.png');
  const reader = createMediaMetadataReader({
    limits: { ...SAFE_LIMITS, maxMetadataDecompressedBytes: 64 },
  });

  await assert.rejects(
    () => read(reader, path, { contentType: 'image/png' }),
    { code: 'processing/media-limits-exceeded', retryable: false },
  );
});

test('third-party warnings and parser errors are converted and redacted', async (t) => {
  const secret = 'private-user-file-name-and-parser-payload';
  const path = await createFixtureFile(t, corruptExifJpegBytes(), `${secret}.jpg`);
  const observations = [];

  const result = await read(createReader({
    warningSink: (observation) => observations.push(observation),
  }), path);

  assert.equal(result.metadataStatus, 'partial');
  assert.deepEqual(result.warningCodes, []);
  assert.deepEqual(observations, [{
    code: 'processing/invalid-media',
    component: 'exifreader',
    severity: 'warning',
  }]);
  const serialized = JSON.stringify({ result, observations });
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes('private-parser-cause'), false);
});

test('unsupported HEIC metadata is partial or unsupported rather than fabricated', async (t) => {
  const path = await createFixtureFile(t, minimalHeicBytes(), 'minimal.heic');

  const result = await read(createReader(), path, { contentType: 'image/heic' });

  assert.equal(['partial', 'unsupported'].includes(result.metadataStatus), true);
  assert.deepEqual(result.technicalMetadata, emptyTechnicalMetadata('heic', {
    metadataStatus: result.metadataStatus,
  }));
  assert.deepEqual(result.factHints, { capturedAt: null, geo: null });
  assert.equal(result.technicalMetadata.width, null);
  assert.equal(result.technicalMetadata.height, null);
});

test('PNG returns the complete nullable technical metadata shape', async (t) => {
  const path = await createFixtureFile(t, alphaPngBytes(), 'alpha.png');

  const result = await read(createReader(), path, { contentType: 'image/png' });

  assert.deepEqual(result, {
    technicalMetadata: emptyTechnicalMetadata('png', { width: 1, height: 1 }),
    factHints: { capturedAt: null, geo: null },
    metadataStatus: 'complete',
    warningCodes: [],
  });
});

test('configured limits below hard caps reject reliable image facts', async (t) => {
  const path = await createFixtureFile(t, exifJpegBytes(), 'limited.jpg');
  const reader = createMediaMetadataReader({
    limits: {
      ...SAFE_LIMITS,
      maxInputPixels: 3,
      maxImageWidth: 1,
      maxImageHeight: 1,
      maxPageCount: 1,
    },
  });

  await assert.rejects(
    () => read(reader, path),
    { code: 'processing/media-limits-exceeded', retryable: false },
  );
});

test('pre-aborted signals and expired deadlines stop before parsing', async (t) => {
  const secret = 'deadline-secret.jpg';
  const path = await createFixtureFile(t, exifJpegBytes(), secret);
  const controller = new AbortController();
  controller.abort();

  for (const overrides of [
    { signal: controller.signal },
    { deadlineAt: '2020-01-01T00:00:00.000Z' },
  ]) {
    let caught;
    try {
      await read(createReader(), path, overrides);
    } catch (error) {
      caught = error;
    }
    assert.equal(caught?.code, 'processing/soft-timeout');
    assert.equal(caught?.retryable, true);
    assert.equal((caught?.message ?? '').includes(secret), false);
  }
});

test('fatal decoder errors expose only stable classifications to the sink', async (t) => {
  const secret = 'private-invalid-image';
  const path = await createFixtureFile(t, Buffer.from(secret), `${secret}.jpg`);
  const observations = [];
  let caught;

  try {
    await read(createReader({
      warningSink: (observation) => observations.push(observation),
    }), path);
  } catch (error) {
    caught = error;
  }

  assert.equal(caught?.code, 'processing/invalid-media');
  assert.equal(caught?.retryable, false);
  assert.deepEqual(observations, [{
    code: 'processing/invalid-media',
    component: 'sharp',
    severity: 'error',
  }]);
  assert.equal(JSON.stringify({ caught, observations }).includes(secret), false);
});
