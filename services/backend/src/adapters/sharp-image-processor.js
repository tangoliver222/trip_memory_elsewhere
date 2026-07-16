import { stat } from 'node:fs/promises';
import sharp from 'sharp';
import { encodeDHash, splitDHashBands } from '../processing/dhash.js';
import {
  retryableProcessingError,
  terminalProcessingError,
} from '../processing/errors.js';
import { runSharpImageWorker } from './sharp-image-worker-client.js';

const MAX_THUMBNAIL_BYTES = (512 * 512 * 4) + 65_536;
const HARD_LIMITS = Object.freeze({
  maxInputBytes: 52_428_800,
  maxInputPixels: 60_000_000,
  maxImageWidth: 20_000,
  maxImageHeight: 20_000,
  maxPageCount: 100,
  maxMetadataDecompressedBytes: 16_777_216,
});
const PIXEL_FORMATS = Object.freeze({
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heif',
  'image/heif': 'heif',
});
const NON_PIXEL_TYPES = new Set(['application/pdf', 'text/plain']);

function runtimeFormat(format, direction, transport) {
  return sharp.format[format]?.[direction]?.[transport] === true;
}

function runtimeInputSuffix(format, suffix) {
  const input = sharp.format[format]?.input;
  return input?.file === true
    && Array.isArray(input.fileSuffix)
    && input.fileSuffix.includes(suffix);
}

const CAPABILITY_REPORT = Object.freeze({
  decode: Object.freeze({
    jpeg: runtimeFormat('jpeg', 'input', 'file'),
    png: runtimeFormat('png', 'input', 'file'),
    webp: runtimeFormat('webp', 'input', 'file'),
    heic: runtimeInputSuffix('heif', '.heic'),
    heif: runtimeInputSuffix('heif', '.heif'),
  }),
  encode: Object.freeze({
    webp: runtimeFormat('webp', 'output', 'buffer'),
  }),
  versions: Object.freeze({
    sharp: sharp.versions.sharp,
    vips: sharp.versions.vips,
    heif: sharp.versions.heif ?? null,
    webp: sharp.versions.webp ?? null,
  }),
});

function validateLimits(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Valid image processing limits are required');
  }
  const limits = {};
  for (const [name, hardMax] of Object.entries(HARD_LIMITS)) {
    const value = input[name];
    if (!Number.isInteger(value) || value <= 0 || value > hardMax) {
      throw new TypeError('Valid image processing limits are required');
    }
    limits[name] = value;
  }
  return Object.freeze(limits);
}

function checkActive(signal, deadlineAt) {
  if (signal.aborted || Date.now() >= deadlineAt) {
    throw retryableProcessingError('processing/soft-timeout');
  }
}

function operationSignal(signal, deadlineAt) {
  const deadlineController = new AbortController();
  const delay = Math.min(2_147_483_647, Math.max(0, deadlineAt - Date.now()));
  const timer = setTimeout(() => deadlineController.abort(), delay);
  timer.unref?.();
  return {
    signal: AbortSignal.any([signal, deadlineController.signal]),
    clear: () => clearTimeout(timer),
  };
}

function frozenUnsupported() {
  return Object.freeze({
    thumbnail: null,
    perceptualHash: null,
    warnings: Object.freeze([]),
  });
}

function expectedFacts(message, expectedFormat) {
  const facts = message?.facts;
  if (facts === null || typeof facts !== 'object' || Array.isArray(facts)
    || facts.format !== expectedFormat
    || !Number.isInteger(facts.width) || facts.width <= 0
    || !Number.isInteger(facts.height) || facts.height <= 0
    || !(facts.pages === null || (Number.isInteger(facts.pages) && facts.pages > 0))) {
    return null;
  }
  return facts;
}

function exceedsLimits(facts, limits) {
  return facts.width > limits.maxImageWidth
    || facts.height > limits.maxImageHeight
    || facts.width * facts.height > limits.maxInputPixels
    || (facts.pages !== null && facts.pages > limits.maxPageCount);
}

function isWebp(bytes) {
  return bytes.byteLength >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50;
}

function completeResult(message, facts, limits) {
  const thumbnail = message.thumbnail;
  const bytes = thumbnail?.bytes;
  const pixels = message.dhashPixels;
  if (!(bytes instanceof Uint8Array)
    || bytes.byteLength === 0
    || bytes.byteLength > MAX_THUMBNAIL_BYTES
    || !isWebp(bytes)
    || !Number.isInteger(thumbnail.width) || thumbnail.width <= 0 || thumbnail.width > 512
    || !Number.isInteger(thumbnail.height) || thumbnail.height <= 0 || thumbnail.height > 512
    || !(pixels instanceof Uint8Array) || pixels.byteLength !== 72
    || exceedsLimits(facts, limits)) {
    throw terminalProcessingError('processing/invalid-media');
  }
  const value = encodeDHash(pixels);
  return Object.freeze({
    thumbnail: Object.freeze({
      buffer: Buffer.from(bytes),
      width: thumbnail.width,
      height: thumbnail.height,
      contentType: 'image/webp',
    }),
    perceptualHash: Object.freeze({
      value,
      bands: Object.freeze(splitDHashBands(value)),
    }),
    warnings: Object.freeze([]),
  });
}

export function getImageCapabilityReport() {
  return CAPABILITY_REPORT;
}

export function createSharpImageProcessor({ limits: rawLimits } = {}) {
  const limits = validateLimits(rawLimits);

  return Object.freeze({
    async process({ path, contentType, signal, deadlineAt } = {}) {
      const deadline = Date.parse(deadlineAt);
      if (typeof path !== 'string' || path.length === 0
        || typeof contentType !== 'string'
        || !(signal instanceof AbortSignal)
        || !Number.isFinite(deadline)) {
        throw new TypeError('Valid image processing input is required');
      }
      checkActive(signal, deadline);

      if (NON_PIXEL_TYPES.has(contentType)) return frozenUnsupported();
      const expectedFormat = PIXEL_FORMATS[contentType];
      if (expectedFormat === undefined) {
        throw terminalProcessingError('processing/invalid-media');
      }
      if ((contentType === 'image/heic' && !CAPABILITY_REPORT.decode.heic)
        || (contentType === 'image/heif' && !CAPABILITY_REPORT.decode.heif)) {
        return frozenUnsupported();
      }

      let fileFacts;
      try {
        fileFacts = await stat(path);
      } catch {
        throw terminalProcessingError('processing/invalid-media');
      }
      checkActive(signal, deadline);
      if (!fileFacts.isFile()) throw terminalProcessingError('processing/invalid-media');
      if (fileFacts.size > limits.maxInputBytes) {
        throw terminalProcessingError('processing/media-limits-exceeded');
      }

      const active = operationSignal(signal, deadline);
      try {
        const message = await runSharpImageWorker({
          path,
          expectedFormat,
          limits: {
            maxInputPixels: limits.maxInputPixels,
            maxImageWidth: limits.maxImageWidth,
            maxImageHeight: limits.maxImageHeight,
            maxPageCount: limits.maxPageCount,
          },
          signal: active.signal,
        });
        checkActive(active.signal, deadline);
        if (message?.kind !== 'result') {
          throw terminalProcessingError('processing/invalid-media');
        }
        if (message.status === 'invalid') {
          throw terminalProcessingError('processing/invalid-media');
        }
        const facts = expectedFacts(message, expectedFormat);
        if (facts === null) throw terminalProcessingError('processing/invalid-media');
        const overLimit = exceedsLimits(facts, limits);
        if (message.status === 'limits') {
          if (!overLimit) throw terminalProcessingError('processing/invalid-media');
          throw terminalProcessingError('processing/media-limits-exceeded');
        }
        if (message.status !== 'complete' || overLimit) {
          throw terminalProcessingError(
            overLimit ? 'processing/media-limits-exceeded' : 'processing/invalid-media',
          );
        }
        return completeResult(message, facts, limits);
      } finally {
        active.clear();
      }
    },
  });
}
