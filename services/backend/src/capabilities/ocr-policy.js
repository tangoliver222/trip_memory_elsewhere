import { CapabilityError } from './errors.js';

const INPUT_KEYS = ['format', 'height', 'mimeType', 'sizeBytes', 'width'];
const FORMATS = Object.freeze({
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
});
export const OCR_MAX_BYTES = 40_000_000;
export const OCR_MAX_PIXELS = 40_000_000;

function unsupported() {
  throw new CapabilityError('capability/input-unsupported', {
    retryable: false,
    billingUncertain: false,
  });
}

export function assertOcrInput(input) {
  if (!input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).sort().join('\0') !== INPUT_KEYS.join('\0')
    || FORMATS[input.format] !== input.mimeType
    || !Number.isSafeInteger(input.sizeBytes)
    || input.sizeBytes < 1
    || input.sizeBytes > OCR_MAX_BYTES
    || !Number.isSafeInteger(input.width)
    || input.width < 1
    || !Number.isSafeInteger(input.height)
    || input.height < 1
    || input.width * input.height > OCR_MAX_PIXELS) {
    unsupported();
  }
  return Object.freeze({ ...input });
}
