import { parentPort, workerData } from 'node:worker_threads';
import { brotliDecompressSync, inflateSync } from 'node:zlib';
import ExifReader from 'exifreader';
import sharp from 'sharp';

console.warn = () => {};
console.error = () => {};

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

function rawRef(tag, allowed) {
  const value = tag?.value;
  return Array.isArray(value)
    && value.length === 1
    && allowed.includes(value[0])
    ? value[0]
    : null;
}

function rawDms(tag, maximumDegrees) {
  if (!Array.isArray(tag?.value) || tag.value.length !== 3) return null;
  const values = [];
  for (const tuple of tag.value) {
    if (!Array.isArray(tuple)
      || tuple.length !== 2
      || !Number.isInteger(tuple[0])
      || tuple[0] < 0
      || !Number.isInteger(tuple[1])
      || tuple[1] <= 0) {
      return null;
    }
    values.push(tuple[0] / tuple[1]);
  }
  const [degrees, minutes, seconds] = values;
  if (!Number.isFinite(degrees)
    || !Number.isFinite(minutes)
    || !Number.isFinite(seconds)
    || degrees < 0
    || degrees > maximumDegrees
    || minutes < 0
    || minutes >= 60
    || seconds < 0
    || seconds >= 60
    || (degrees === maximumDegrees && (minutes !== 0 || seconds !== 0))) {
    return null;
  }
  return degrees + (minutes / 60) + (seconds / 3600);
}

function geoHint(exif) {
  const latRef = rawRef(exif?.GPSLatitudeRef, ['N', 'S']);
  const lngRef = rawRef(exif?.GPSLongitudeRef, ['E', 'W']);
  const lat = rawDms(exif?.GPSLatitude, 90);
  const lng = rawDms(exif?.GPSLongitude, 180);
  if (latRef === null || lngRef === null || lat === null || lng === null) return null;
  return {
    lat: Math.round((latRef === 'S' ? -lat : lat) * 1_000_000) / 1_000_000,
    lng: Math.round((lngRef === 'W' ? -lng : lng) * 1_000_000) / 1_000_000,
    sourceType: 'gps',
    status: 'suggested',
  };
}

function technicalExif(exif) {
  return {
    orientation: integerTag(exif?.Orientation, 8),
    cameraMake: stringTag(exif?.Make),
    cameraModel: stringTag(exif?.Model),
    lensModel: stringTag(exif?.LensModel),
    focalLengthMm: positiveNumberTag(exif?.FocalLength, 100_000),
    apertureFNumber: positiveNumberTag(exif?.FNumber, 1_000),
    isoEquivalent: integerTag(
      exif?.PhotographicSensitivity ?? exif?.ISOSpeedRatings,
      10_000_000,
    ),
    exposureTimeSeconds: positiveNumberTag(exif?.ExposureTime, 86_400),
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

async function extractExif() {
  const state = { limitExceeded: false };
  parentPort.postMessage({ kind: 'stage', stage: 'exif' });
  try {
    const tags = await ExifReader.load(workerData.path, {
      length: 'auto',
      expanded: true,
      includeOffsets: true,
      async: true,
      computed: true,
      includeUnknown: false,
      includeTags: {
        exif: EXIF_TAGS,
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
        workerData.maxMetadataDecompressedBytes,
        state,
      ),
    });
    const claimedExif = tags.metadataRange?.blocks?.some(({ type }) => type === 'exif') ?? false;
    const exif = tags.exif ?? {};
    return {
      limitExceeded: state.limitExceeded,
      parserError: false,
      parserPartial: claimedExif && Object.keys(exif).length === 0,
      technicalExif: technicalExif(exif),
      capturedAt: capturedAtHint(exif),
      geo: geoHint(exif),
    };
  } catch {
    return {
      limitExceeded: state.limitExceeded,
      parserError: true,
      parserPartial: false,
      technicalExif: {},
      capturedAt: null,
      geo: null,
    };
  }
}

async function extractImage() {
  if (!['jpeg', 'png', 'webp'].includes(workerData.format)) return null;
  parentPort.postMessage({ kind: 'stage', stage: 'sharp' });
  try {
    const image = await sharp(workerData.path, {
      limitInputPixels: 60_000_000,
      failOn: 'error',
      pages: 1,
    }).metadata();
    return {
      error: false,
      width: Number.isInteger(image.width) && image.width > 0 ? image.width : null,
      height: Number.isInteger(image.height) && image.height > 0 ? image.height : null,
      pageCount: Number.isInteger(image.pages) && image.pages > 0 ? image.pages : null,
      orientation: Number.isInteger(image.orientation)
        && image.orientation >= 1
        && image.orientation <= 8
        ? image.orientation
        : null,
    };
  } catch {
    return {
      error: true,
      width: null,
      height: null,
      pageCount: null,
      orientation: null,
    };
  }
}

const exif = await extractExif();
const image = exif.limitExceeded ? null : await extractImage();
parentPort.postMessage({ kind: 'result', ...exif, image });
