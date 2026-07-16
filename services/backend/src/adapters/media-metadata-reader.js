import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { TechnicalMetadataSchema } from '../domain/processing-result.js';
import { getUploadPolicy } from '../imports/upload-policy.js';
import {
  retryableProcessingError,
  terminalProcessingError,
} from '../processing/errors.js';
import { runMediaMetadataWorker } from './media-metadata-worker-client.js';

const HARD_LIMITS = Object.freeze({
  maxInputBytes: 52_428_800,
  maxInputPixels: 60_000_000,
  maxImageWidth: 20_000,
  maxImageHeight: 20_000,
  maxPageCount: 100,
  maxMetadataDecompressedBytes: 16_777_216,
});

const CONTENT_FORMATS = Object.freeze({
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
  'text/plain': 'text',
});

function validateLimits(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Valid media processing limits are required');
  }
  const limits = {};
  for (const [name, hardMax] of Object.entries(HARD_LIMITS)) {
    const value = input[name];
    if (!Number.isInteger(value) || value <= 0 || value > hardMax) {
      throw new TypeError('Valid media processing limits are required');
    }
    limits[name] = value;
  }
  return Object.freeze(limits);
}

function checkActive(signal, deadlineAt) {
  if (signal?.aborted || Date.now() >= deadlineAt) {
    throw retryableProcessingError('processing/soft-timeout');
  }
}

function operationSignal(signal, deadlineAt) {
  const deadlineController = new AbortController();
  const delay = Math.min(2_147_483_647, Math.max(0, deadlineAt - Date.now()));
  const timer = setTimeout(() => deadlineController.abort(), delay);
  timer.unref?.();
  return {
    signal: signal
      ? AbortSignal.any([signal, deadlineController.signal])
      : deadlineController.signal,
    clear: () => clearTimeout(timer),
  };
}

function safeObservation(code, component, severity) {
  return Object.freeze({ code, component, severity });
}

function createEmitter(warningSink) {
  if (warningSink !== undefined && typeof warningSink !== 'function') {
    throw new TypeError('warningSink must be a function');
  }
  return (code, component, severity) => {
    if (!warningSink) return;
    try {
      warningSink(safeObservation(code, component, severity));
    } catch {
      // Observability must not change deterministic processing outcomes.
    }
  };
}

function formatFor(contentType) {
  return CONTENT_FORMATS[contentType] ?? null;
}

function emptyMetadata(format, metadataStatus = 'complete', warningCodes = []) {
  return {
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
    metadataStatus,
    warningCodes,
    processorVersion: 'v1',
  };
}

function freezeResult(technicalMetadata, factHints) {
  const metadata = Object.freeze(TechnicalMetadataSchema.parse(technicalMetadata));
  const warningCodes = Object.freeze([...metadata.warningCodes]);
  const frozenMetadata = Object.freeze({ ...metadata, warningCodes });
  const capturedAt = factHints.capturedAt === null
    ? null
    : Object.freeze({ ...factHints.capturedAt });
  const geo = factHints.geo === null ? null : Object.freeze({ ...factHints.geo });
  const frozenHints = Object.freeze({ capturedAt, geo });
  return Object.freeze({
    technicalMetadata: frozenMetadata,
    factHints: frozenHints,
    metadataStatus: frozenMetadata.metadataStatus,
    warningCodes,
  });
}

function normalizeWorkerMessage(message) {
  if (message?.kind === 'parser-error') {
    return {
      error: true,
      limitExceeded: message.limitExceeded === true,
      parserPartial: false,
      technicalExif: {},
      capturedAt: null,
      geo: null,
      image: null,
    };
  }
  if (message?.kind !== 'result') return null;
  const technical = message.technicalExif ?? {};
  return {
    error: message.parserError === true,
    limitExceeded: message.limitExceeded === true,
    parserPartial: message.parserPartial === true,
    technicalExif: {
      orientation: technical.orientation ?? null,
      cameraMake: technical.cameraMake ?? null,
      cameraModel: technical.cameraModel ?? null,
      lensModel: technical.lensModel ?? null,
      focalLengthMm: technical.focalLengthMm ?? null,
      apertureFNumber: technical.apertureFNumber ?? null,
      isoEquivalent: technical.isoEquivalent ?? null,
      exposureTimeSeconds: technical.exposureTimeSeconds ?? null,
    },
    capturedAt: message.capturedAt ?? null,
    geo: message.geo ?? null,
    image: message.image ?? null,
  };
}

async function readNativeMetadata(path, format, limits, signal) {
  try {
    const message = await runMediaMetadataWorker({
      path,
      format,
      maxMetadataDecompressedBytes: limits.maxMetadataDecompressedBytes,
      signal,
    });
    return normalizeWorkerMessage(message) ?? {
      error: true,
      limitExceeded: false,
      parserPartial: false,
      technicalExif: {},
      capturedAt: null,
      geo: null,
      image: null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw retryableProcessingError('processing/soft-timeout');
    }
    return {
      error: true,
      limitExceeded: false,
      parserPartial: false,
      technicalExif: {},
      capturedAt: null,
      geo: null,
      image: null,
    };
  }
}

async function readText(path, limits, signal, deadlineAt) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let byteCount = 0;
  try {
    for await (const chunk of createReadStream(path, { signal })) {
      checkActive(signal, deadlineAt);
      byteCount += chunk.byteLength;
      if (byteCount > limits.maxInputBytes) {
        throw terminalProcessingError('processing/media-limits-exceeded');
      }
      decoder.decode(chunk, { stream: true });
    }
    decoder.decode();
  } catch (error) {
    if (error?.code === 'processing/media-limits-exceeded') throw error;
    if (signal.aborted || Date.now() >= deadlineAt || error?.name === 'AbortError') {
      throw retryableProcessingError('processing/soft-timeout');
    }
    throw terminalProcessingError('processing/invalid-media');
  }
}

export function createMediaMetadataReader({ limits: rawLimits, warningSink } = {}) {
  const limits = validateLimits(rawLimits);
  const emit = createEmitter(warningSink);

  return Object.freeze({
    async read({ path, sourceType, contentType, signal, deadlineAt }) {
      const deadline = Date.parse(deadlineAt);
      if (typeof path !== 'string' || path.length === 0
        || !Number.isFinite(deadline)
        || !(signal instanceof AbortSignal)) {
        throw new TypeError('Valid media read input is required');
      }
      let policy;
      try {
        policy = getUploadPolicy(sourceType);
      } catch {
        throw new TypeError('Valid media read input is required');
      }
      checkActive(signal, deadline);
      const format = formatFor(contentType);
      if (!policy.allowedContentTypes.includes(contentType) || format === null) {
        throw terminalProcessingError('processing/invalid-media');
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
        if (format === 'pdf') {
          return freezeResult(emptyMetadata(
            'pdf',
            'partial',
            ['processing/page-count-unsupported'],
          ), { capturedAt: null, geo: null });
        }
        if (format === 'text') {
          await readText(path, limits, active.signal, deadline);
          checkActive(active.signal, deadline);
          return freezeResult(emptyMetadata('text'), { capturedAt: null, geo: null });
        }

        const exifRead = await readNativeMetadata(path, format, limits, active.signal);
        if (exifRead.limitExceeded) {
          emit('processing/media-limits-exceeded', 'exifreader', 'error');
          throw terminalProcessingError('processing/media-limits-exceeded');
        }

        if (format === 'heic' || format === 'heif') {
          if (exifRead.error || exifRead.tags === null) {
            return freezeResult(
              emptyMetadata(format, 'unsupported'),
              { capturedAt: null, geo: null },
            );
          }
          const hints = {
            capturedAt: exifRead.capturedAt,
            geo: exifRead.geo,
          };
          const hasHints = hints.capturedAt !== null || hints.geo !== null;
          return freezeResult(
            emptyMetadata(format, hasHints ? 'partial' : 'unsupported'),
            hints,
          );
        }

        const image = exifRead.image;
        if (image?.error !== false) {
          emit('processing/invalid-media', 'sharp', 'error');
          throw terminalProcessingError('processing/invalid-media');
        }

        const { width, height, pageCount: pages } = image;
        if (width === null || height === null
          || width > limits.maxImageWidth
          || height > limits.maxImageHeight
          || width * height > limits.maxInputPixels
          || (pages !== null && pages > limits.maxPageCount)) {
          throw terminalProcessingError('processing/media-limits-exceeded');
        }

        const parserPartial = exifRead.error || exifRead.parserPartial;
        if (parserPartial) emit('processing/invalid-media', 'exifreader', 'warning');
        const extracted = exifRead.technicalExif;
        const technicalMetadata = {
          ...emptyMetadata(format, parserPartial ? 'partial' : 'complete'),
          width,
          height,
          pageCount: pages,
          orientation: extracted.orientation ?? (
            image.orientation
          ),
          cameraMake: extracted.cameraMake,
          cameraModel: extracted.cameraModel,
          lensModel: extracted.lensModel,
          focalLengthMm: extracted.focalLengthMm,
          apertureFNumber: extracted.apertureFNumber,
          isoEquivalent: extracted.isoEquivalent,
          exposureTimeSeconds: extracted.exposureTimeSeconds,
        };
        return freezeResult(technicalMetadata, {
          capturedAt: exifRead.capturedAt,
          geo: exifRead.geo,
        });
      } finally {
        active.clear();
      }
    },
  });
}
