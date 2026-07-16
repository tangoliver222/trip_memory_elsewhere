import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { brotliDecompressSync, inflateSync } from 'node:zlib';
import ExifReader from 'exifreader';
import sharp from 'sharp';
import { TechnicalMetadataSchema } from '../domain/processing-result.js';
import {
  retryableProcessingError,
  terminalProcessingError,
} from '../processing/errors.js';

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

const SOURCE_TYPES = new Set(['photo', 'receipt', 'ticket', 'screenshot', 'menu', 'text']);
const EXIF_TAGS = Object.freeze([
  'Orientation',
  'Make',
  'Model',
  'DateTimeOriginal',
  'OffsetTimeOriginal',
  'LensModel',
  'FocalLength',
  'FNumber',
  'ISOSpeedRatings',
  'PhotographicSensitivity',
  'ExposureTime',
  'GPSLatitudeRef',
  'GPSLatitude',
  'GPSLongitudeRef',
  'GPSLongitude',
]);

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
  if (typeof contentType !== 'string') return null;
  if (contentType.startsWith('text/plain;')) return 'text';
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

function stringTag(tag, maxLength = 256) {
  const value = typeof tag?.computed === 'string'
    ? tag.computed
    : (typeof tag?.description === 'string' ? tag.description : null);
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function positiveNumberTag(tag, max) {
  const value = typeof tag?.computed === 'number' ? tag.computed : null;
  return Number.isFinite(value) && value > 0 && value <= max ? value : null;
}

function integerTag(tag, max) {
  const value = positiveNumberTag(tag, max);
  return value !== null && Number.isInteger(value) ? value : null;
}

function parseLocalDateTime(value) {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (local.getUTCFullYear() !== year
    || local.getUTCMonth() !== month - 1
    || local.getUTCDate() !== day
    || local.getUTCHours() !== hour
    || local.getUTCMinutes() !== minute
    || local.getUTCSeconds() !== second) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
    + `-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}`
    + `:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function parseOffsetMinutes(value) {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
  return (match[1] === '-' ? -1 : 1) * ((hours * 60) + minutes);
}

function capturedAtHint(exif) {
  const localDateTime = parseLocalDateTime(stringTag(exif?.DateTimeOriginal));
  if (localDateTime === null) return null;
  const offsetMinutes = parseOffsetMinutes(stringTag(exif?.OffsetTimeOriginal));
  const instant = offsetMinutes === null
    ? null
    : new Date(Date.parse(`${localDateTime}Z`) - (offsetMinutes * 60_000)).toISOString();
  return {
    localDateTime,
    offsetMinutes,
    zoneId: null,
    instant,
    sourceType: 'exif',
    status: offsetMinutes === null ? 'unresolved' : 'suggested',
  };
}

function geoHint(gps) {
  const lat = gps?.Latitude;
  const lng = gps?.Longitude;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90
    || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return null;
  }
  return {
    lat: Math.round(lat * 1_000_000) / 1_000_000,
    lng: Math.round(lng * 1_000_000) / 1_000_000,
    sourceType: 'gps',
    status: 'suggested',
  };
}

function exifMetadata(tags) {
  const exif = tags?.exif ?? {};
  return {
    orientation: integerTag(exif.Orientation, 8),
    cameraMake: stringTag(exif.Make),
    cameraModel: stringTag(exif.Model),
    lensModel: stringTag(exif.LensModel),
    focalLengthMm: positiveNumberTag(exif.FocalLength, 100_000),
    apertureFNumber: positiveNumberTag(exif.FNumber, 1_000),
    isoEquivalent: integerTag(
      exif.PhotographicSensitivity ?? exif.ISOSpeedRatings,
      10_000_000,
    ),
    exposureTimeSeconds: positiveNumberTag(exif.ExposureTime, 86_400),
  };
}

function createBoundedDecompressors(maxOutputLength, state) {
  const bounded = (operation) => (input) => {
    try {
      return operation(input, { maxOutputLength });
    } catch (error) {
      if (error?.code === 'ERR_BUFFER_TOO_LARGE') state.limitExceeded = true;
      throw error;
    }
  };
  return {
    deflate: bounded(inflateSync),
    brotli: bounded(brotliDecompressSync),
    maxDecompressedSize: maxOutputLength,
  };
}

async function readExif(path, limits) {
  const state = { limitExceeded: false };
  try {
    const tags = await ExifReader.load(path, {
      length: 'auto',
      expanded: true,
      includeOffsets: true,
      async: true,
      computed: true,
      includeUnknown: false,
      includeTags: {
        exif: EXIF_TAGS,
        gps: true,
        png: ['Raw profile type exif'],
      },
      excludeTags: {
        makerNotes: true,
        mpf: true,
        thumbnail: true,
        xmp: true,
        icc: true,
      },
      decompress: createBoundedDecompressors(
        limits.maxMetadataDecompressedBytes,
        state,
      ),
    });
    return { tags, limitExceeded: state.limitExceeded, error: null };
  } catch {
    return { tags: null, limitExceeded: state.limitExceeded, error: true };
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
        || !SOURCE_TYPES.has(sourceType)
        || !Number.isFinite(deadline)
        || signal === null
        || typeof signal !== 'object') {
        throw new TypeError('Valid media read input is required');
      }
      checkActive(signal, deadline);
      const format = formatFor(contentType);
      if (format === null || (sourceType === 'text') !== (format === 'text')) {
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

        const exifRead = await readExif(path, limits);
        checkActive(active.signal, deadline);
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
            capturedAt: capturedAtHint(exifRead.tags.exif),
            geo: geoHint(exifRead.tags.gps),
          };
          const hasHints = hints.capturedAt !== null || hints.geo !== null;
          return freezeResult(
            emptyMetadata(format, hasHints ? 'partial' : 'unsupported'),
            hints,
          );
        }

        let image;
        try {
          image = await sharp(path, {
            limitInputPixels: HARD_LIMITS.maxInputPixels,
            failOn: 'error',
            pages: 1,
          }).metadata();
        } catch {
          emit('processing/invalid-media', 'sharp', 'error');
          throw terminalProcessingError('processing/invalid-media');
        }
        checkActive(active.signal, deadline);

        const width = Number.isInteger(image.width) && image.width > 0 ? image.width : null;
        const height = Number.isInteger(image.height) && image.height > 0 ? image.height : null;
        const pages = Number.isInteger(image.pages) && image.pages > 0 ? image.pages : null;
        if (width === null || height === null
          || width > limits.maxImageWidth
          || height > limits.maxImageHeight
          || width * height > limits.maxInputPixels
          || (pages !== null && pages > limits.maxPageCount)) {
          throw terminalProcessingError('processing/media-limits-exceeded');
        }

        const claimedExif = exifRead.tags?.metadataRange?.blocks?.some(
          ({ type }) => type === 'exif',
        ) ?? false;
        const parserPartial = exifRead.error
          || (claimedExif && Object.keys(exifRead.tags?.exif ?? {}).length === 0);
        if (parserPartial) emit('processing/invalid-media', 'exifreader', 'warning');
        const extracted = exifMetadata(exifRead.tags);
        const technicalMetadata = {
          ...emptyMetadata(format, parserPartial ? 'partial' : 'complete'),
          width,
          height,
          pageCount: pages,
          orientation: extracted.orientation ?? (
            Number.isInteger(image.orientation) && image.orientation >= 1 && image.orientation <= 8
              ? image.orientation
              : null
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
          capturedAt: capturedAtHint(exifRead.tags?.exif),
          geo: geoHint(exifRead.tags?.gps),
        });
      } finally {
        active.clear();
      }
    },
  });
}
