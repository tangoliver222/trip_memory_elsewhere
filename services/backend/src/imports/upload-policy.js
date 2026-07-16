import { z } from 'zod';
import { SourceTypeSchema } from '../domain/source-descriptor.js';

export const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;

const IMAGE_CONTENT_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const DOCUMENT_CONTENT_TYPES = Object.freeze([
  ...IMAGE_CONTENT_TYPES,
  'application/pdf',
]);

const CONTENT_TYPES_BY_SOURCE = Object.freeze({
  photo: IMAGE_CONTENT_TYPES,
  screenshot: IMAGE_CONTENT_TYPES,
  receipt: DOCUMENT_CONTENT_TYPES,
  ticket: DOCUMENT_CONTENT_TYPES,
  menu: DOCUMENT_CONTENT_TYPES,
  text: Object.freeze(['text/plain']),
});

const DeclaredUploadSchema = z.strictObject({
  sourceType: SourceTypeSchema,
  declaredContentType: z.string().trim().min(1),
  declaredSizeBytes: z.number().int().positive().max(MAX_ORIGINAL_BYTES),
});

const freezePolicy = (allowedContentTypes) => Object.freeze({
  allowedContentTypes: Object.freeze([...allowedContentTypes]),
  maxBytes: MAX_ORIGINAL_BYTES,
});

export function getUploadPolicy(sourceType) {
  const parsedSourceType = SourceTypeSchema.parse(sourceType);
  return freezePolicy(CONTENT_TYPES_BY_SOURCE[parsedSourceType]);
}

export function validateDeclaredUpload(input) {
  const parsed = DeclaredUploadSchema.parse(input);
  const policy = getUploadPolicy(parsed.sourceType);
  if (!policy.allowedContentTypes.includes(parsed.declaredContentType)) {
    throw new TypeError('Content type is not allowed for source type');
  }

  return Object.freeze({
    declaredContentType: parsed.declaredContentType,
    declaredSizeBytes: parsed.declaredSizeBytes,
    allowedContentTypes: policy.allowedContentTypes,
    maxBytes: policy.maxBytes,
  });
}
