import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  createSharpImageProcessor,
  getImageCapabilityReport,
} from '../../src/adapters/sharp-image-processor.js';
import { encodeDHash, splitDHashBands } from '../../src/processing/dhash.js';
import { syntheticHevcHeicBytes } from '../fixtures/media.js';

const SAFE_LIMITS = Object.freeze({
  maxInputBytes: 52_428_800,
  maxInputPixels: 60_000_000,
  maxImageWidth: 20_000,
  maxImageHeight: 20_000,
  maxPageCount: 100,
  maxMetadataDecompressedBytes: 16_777_216,
});

const activeInput = (path, overrides = {}) => ({
  path,
  contentType: 'image/png',
  signal: AbortSignal.timeout(10_000),
  deadlineAt: new Date(Date.now() + 10_000).toISOString(),
  ...overrides,
});

async function fixtureFile(t, bytes, name) {
  const directory = await mkdtemp(join(tmpdir(), 'elsewhere-image-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, name);
  await writeFile(path, bytes, { mode: 0o600 });
  return path;
}

function rgbPixels(width, height) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y * width) + x) * 3;
      pixels[offset] = ((x * x * 3) + (y * 11)) % 256;
      pixels[offset + 1] = ((x * 17) + (y * y * 5)) % 256;
      pixels[offset + 2] = ((x * 7) + (y * 19) + (x * y)) % 256;
    }
  }
  return pixels;
}

function rgbaPixels(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y * width) + x) * 4;
      pixels[offset] = ((x * 29) + (y * 7)) % 256;
      pixels[offset + 1] = ((x * 3) + (y * 31)) % 256;
      pixels[offset + 2] = (255 - (x * 11) + (y * 5)) % 256;
      pixels[offset + 3] = (x + y) % 3 === 0 ? 0 : ((x * 17) + (y * 13)) % 256;
    }
  }
  return pixels;
}

async function pngFixture(width, height, { alpha = false } = {}) {
  const channels = alpha ? 4 : 3;
  const pixels = alpha ? rgbaPixels(width, height) : rgbPixels(width, height);
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

async function animatedWebpFixture() {
  const width = 6;
  const pageHeight = 4;
  const pages = 3;
  const pixels = Buffer.alloc(width * pageHeight * pages * 4);
  const colours = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ];
  for (let page = 0; page < pages; page += 1) {
    for (let y = 0; y < pageHeight; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = ((((page * pageHeight) + y) * width) + x) * 4;
        pixels.set([...colours[page], 255], offset);
      }
    }
  }
  return sharp(pixels, {
    raw: {
      width,
      height: pageHeight * pages,
      channels: 4,
      pageHeight,
    },
  }).webp({ lossless: true, loop: 0, delay: [100, 200, 300] }).toBuffer();
}

async function referenceDHash(path) {
  const raw = await sharp(path, {
    limitInputPixels: 60_000_000,
    failOn: 'error',
    pages: 1,
  })
    .rotate()
    .flatten({ background: '#ffffff' })
    .grayscale()
    .resize(9, 8, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer();
  return encodeDHash(raw);
}

function assertFrozenResult(result) {
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.thumbnail), true);
  assert.equal(Object.isFrozen(result.perceptualHash), true);
  assert.equal(Object.isFrozen(result.perceptualHash.bands), true);
  assert.equal(Object.isFrozen(result.warnings), true);
}

test('applies orientation before 512px inside thumbnail sizing', async (t) => {
  const source = await sharp(rgbPixels(800, 400), {
    raw: { width: 800, height: 400, channels: 3 },
  }).jpeg({ quality: 94 }).withMetadata({ orientation: 6 }).toBuffer();
  const path = await fixtureFile(t, source, 'oriented.jpg');

  const result = await createSharpImageProcessor({ limits: SAFE_LIMITS }).process(activeInput(
    path,
    { contentType: 'image/jpeg' },
  ));

  assert.deepEqual(
    { width: result.thumbnail.width, height: result.thumbnail.height },
    { width: 256, height: 512 },
  );
  assert.equal(result.perceptualHash.value, '0880490082289049');
  assertFrozenResult(result);
});

test('does not enlarge a small image and emits WebP quality 82 without source EXIF', async (t) => {
  const source = await sharp(rgbPixels(47, 31), {
    raw: { width: 47, height: 31, channels: 3 },
  }).jpeg({ quality: 95 }).withMetadata({ orientation: 1 }).toBuffer();
  const path = await fixtureFile(t, source, 'small-with-exif.jpg');
  const expected = await sharp(path, {
    limitInputPixels: 60_000_000,
    failOn: 'error',
    pages: 1,
  })
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const result = await createSharpImageProcessor({ limits: SAFE_LIMITS }).process(activeInput(
    path,
    { contentType: 'image/jpeg' },
  ));
  const metadata = await sharp(result.thumbnail.buffer).metadata();

  assert.deepEqual(
    { width: result.thumbnail.width, height: result.thumbnail.height },
    { width: 47, height: 31 },
  );
  assert.deepEqual(result.thumbnail.buffer, expected);
  assert.equal(result.thumbnail.contentType, 'image/webp');
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.hasProfile, false);
});

test('flattens alpha on white and produces the frozen dHash vector', async (t) => {
  const path = await fixtureFile(t, await pngFixture(18, 16, { alpha: true }), 'alpha.png');

  const result = await createSharpImageProcessor({ limits: SAFE_LIMITS }).process(activeInput(path));

  assert.equal(await referenceDHash(path), 'fcf9b393e7a79fb3');
  assert.equal(result.perceptualHash.value, 'fcf9b393e7a79fb3');
  assert.deepEqual(result.perceptualHash.bands, [
    '0:fc', '1:f9', '2:b3', '3:93', '4:e7', '5:a7', '6:9f', '7:b3',
  ]);
});

test('uses Lanczos3 9x8 row-major MSB dHash and eight bands', async (t) => {
  const path = await fixtureFile(t, await pngFixture(37, 23), 'gradient.png');

  const result = await createSharpImageProcessor({ limits: SAFE_LIMITS }).process(activeInput(path));

  const expected = await referenceDHash(path);
  assert.equal(expected, '3326595ab54593cd');
  assert.equal(result.perceptualHash.value, expected);
  assert.deepEqual(result.perceptualHash.bands, splitDHashBands(expected));
  assert.equal(result.perceptualHash.bands.length, 8);
});

test('rejects reliable pixel dimension and frame counts above limits', async (t) => {
  const imagePath = await fixtureFile(t, await pngFixture(40, 20), 'limited.png');
  const animationPath = await fixtureFile(t, await animatedWebpFixture(), 'three-frames.webp');
  const cases = [
    [imagePath, 'image/png', { maxImageWidth: 39 }],
    [imagePath, 'image/png', { maxImageHeight: 19 }],
    [imagePath, 'image/png', { maxInputPixels: 799 }],
    [animationPath, 'image/webp', { maxPageCount: 2 }],
  ];

  for (const [path, contentType, limit] of cases) {
    const processor = createSharpImageProcessor({ limits: { ...SAFE_LIMITS, ...limit } });
    await assert.rejects(
      () => processor.process(activeInput(path, { contentType })),
      { code: 'processing/media-limits-exceeded', retryable: false },
    );
  }
});

test('processes only the first reliable frame and never all frames', async (t) => {
  const path = await fixtureFile(t, await animatedWebpFixture(), 'first-frame.webp');

  const result = await createSharpImageProcessor({ limits: SAFE_LIMITS }).process(activeInput(
    path,
    { contentType: 'image/webp' },
  ));
  const metadata = await sharp(result.thumbnail.buffer, { animated: true }).metadata();
  const { channels } = await sharp(result.thumbnail.buffer).stats();

  assert.deepEqual(
    { width: result.thumbnail.width, height: result.thumbnail.height },
    { width: 6, height: 4 },
  );
  assert.equal(metadata.pages ?? 1, 1);
  assert.equal(channels[0].mean > 240, true);
  assert.equal(channels[1].mean < 15, true);
  assert.equal(channels[2].mean < 15, true);
  assert.equal(result.perceptualHash.value, '0000000000000000');
});

test('abort or deadline terminates an actual in-flight Sharp worker', async (t) => {
  const source = await sharp({
    create: {
      width: 6_000,
      height: 6_000,
      channels: 3,
      background: { r: 41, g: 89, b: 137 },
    },
  }).png({ compressionLevel: 9 }).toBuffer();
  const path = await fixtureFile(t, source, 'inflight-secret.png');
  const processor = createSharpImageProcessor({ limits: SAFE_LIMITS });

  const controller = new AbortController();
  const aborted = processor.process(activeInput(path, { signal: controller.signal }));
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(
    () => aborted,
    { code: 'processing/soft-timeout', retryable: true },
  );

  const deadlineAt = new Date(Date.now() + 25).toISOString();
  assert.equal(Date.parse(deadlineAt) > Date.now(), true);
  await assert.rejects(
    () => processor.process(activeInput(path, { deadlineAt })),
    { code: 'processing/soft-timeout', retryable: true },
  );
});

test('reports HEIC capability from the actual runtime instead of the extension', () => {
  const report = getImageCapabilityReport();
  const heifSuffixes = sharp.format.heif.input.fileSuffix ?? [];
  const hasHeicEvidence = sharp.format.heif.input.file === true
    && heifSuffixes.includes('.heic');
  const hasHeifEvidence = sharp.format.heif.input.file === true
    && heifSuffixes.includes('.heif');
  const expected = {
    decode: {
      jpeg: sharp.format.jpeg.input.file === true,
      png: sharp.format.png.input.file === true,
      webp: sharp.format.webp.input.file === true,
      heic: hasHeicEvidence,
      heif: hasHeifEvidence,
    },
    encode: { webp: sharp.format.webp.output.buffer === true },
    versions: {
      sharp: sharp.versions.sharp,
      vips: sharp.versions.vips,
      heif: sharp.versions.heif ?? null,
      webp: sharp.versions.webp ?? null,
    },
  };

  assert.deepEqual(report, expected);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.decode), true);
  assert.equal(Object.isFrozen(report.encode), true);
  assert.equal(Object.isFrozen(report.versions), true);
  assert.equal(JSON.stringify(report).includes('.heic'), false);
  assert.deepEqual(heifSuffixes, ['.avif']);
  assert.equal(report.decode.heic, false);
  assert.equal(report.decode.heif, false);
});

test('AVIF-only generic HEIF support leaves phone HEIC and HEIF unsupported before I/O', async () => {
  const report = getImageCapabilityReport();
  const processor = createSharpImageProcessor({ limits: SAFE_LIMITS });

  assert.equal(report.decode.heic, false);
  assert.equal(report.decode.heif, false);
  for (const contentType of ['image/heic', 'image/heif']) {
    const result = await processor.process(activeInput('/does/not/exist/private-phone-media', {
      contentType,
    }));
    assert.deepEqual(result, {
      thumbnail: null,
      perceptualHash: null,
      warnings: [],
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.warnings), true);
  }
});

test('real synthetic HEVC HEIC follows the reported runtime capability', async (t) => {
  const bytes = syntheticHevcHeicBytes();
  assert.equal(bytes.subarray(4, 12).toString('ascii'), 'ftypheic');
  assert.equal(bytes.includes(Buffer.from('hvcC', 'ascii')), true);
  const path = await fixtureFile(t, bytes, 'synthetic-hevc.heic');
  const report = getImageCapabilityReport();

  const result = await createSharpImageProcessor({ limits: SAFE_LIMITS }).process(activeInput(
    path,
    { contentType: 'image/heic' },
  ));
  if (report.decode.heic) {
    assert.equal(result.thumbnail?.contentType, 'image/webp');
    assert.match(result.perceptualHash?.value, /^[a-f0-9]{16}$/);
  } else {
    assert.deepEqual(result, {
      thumbnail: null,
      perceptualHash: null,
      warnings: [],
    });
  }
});

test('returns frozen unsupported capabilities for PDF and text before native decode', async () => {
  const processor = createSharpImageProcessor({ limits: SAFE_LIMITS });

  for (const contentType of ['application/pdf', 'text/plain']) {
    const result = await processor.process(activeInput('/does/not/exist/private-source', { contentType }));
    assert.deepEqual(result, {
      thumbnail: null,
      perceptualHash: null,
      warnings: [],
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.warnings), true);
  }
});

test('does not expose source paths or native errors through the public contract', async (t) => {
  const secret = 'private-user-source-name.png';
  const path = await fixtureFile(t, Buffer.from('not an image'), secret);

  let caught;
  try {
    await createSharpImageProcessor({ limits: SAFE_LIMITS }).process(activeInput(path));
  } catch (error) {
    caught = error;
  }

  assert.equal(caught?.code, 'processing/invalid-media');
  assert.equal(caught?.retryable, false);
  assert.equal((caught?.message ?? '').includes(secret), false);
  assert.equal(caught?.message, 'Media is invalid');
});
