import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { IdSchema } from '../domain/index.js';
import { CapabilityError, retryableCapabilityError } from '../capabilities/errors.js';
import { assertOcrInput } from '../capabilities/ocr-policy.js';

export const OCR_FIELD_MASK = [
  'text',
  'pages.pageNumber',
  'pages.dimension',
  'pages.layout',
  'pages.blocks',
  'pages.paragraphs',
  'pages.lines',
  'pages.tokens',
  'pages.detectedLanguages',
  'pages.imageQualityScores',
].join(',');

const CONFIG_KEYS = ['endpoint', 'location', 'processorId', 'processorVersion', 'projectId'];
const INPUT_KEYS = [
  'clientRequestId',
  'executionId',
  'filePath',
  'format',
  'height',
  'mimeType',
  'signal',
  'sizeBytes',
  'width',
];
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function stableError(code, retryable) {
  return new CapabilityError(code, { retryable, billingUncertain: false });
}

function normalizeConfig(input) {
  if (!input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).sort().join('\0') !== CONFIG_KEYS.join('\0')
    || Object.values(input).some((value) => typeof value !== 'string' || !LABEL.test(value))) {
    throw new TypeError('Document AI config is invalid');
  }
  return Object.freeze({ ...input });
}

function normalizeInput(input) {
  if (!input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).sort().join('\0') !== INPUT_KEYS.join('\0')
    || !IdSchema.safeParse(input.clientRequestId).success
    || !IdSchema.safeParse(input.executionId).success
    || typeof input.filePath !== 'string'
    || !input.filePath.startsWith('/')
    || !(input.signal instanceof AbortSignal)) {
    throw new TypeError('Document AI OCR input is invalid');
  }
  const facts = assertOcrInput({
    format: input.format,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width,
    height: input.height,
  });
  return { ...input, ...facts };
}

async function readBoundedSource(input) {
  let file;
  try {
    if (input.signal.aborted) throw new Error('aborted');
    file = await open(input.filePath, 'r');
    const before = await file.stat();
    if (before.size !== input.sizeBytes) {
      throw stableError('capability/input-unsupported', false);
    }
    const bytes = Buffer.allocUnsafe(input.sizeBytes);
    let offset = 0;
    while (offset < bytes.byteLength) {
      if (input.signal.aborted) throw new Error('aborted');
      const result = await file.read(bytes, offset, bytes.byteLength - offset, offset);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    const after = await file.stat();
    if (offset !== bytes.byteLength || after.size !== input.sizeBytes) {
      throw stableError('capability/input-unsupported', false);
    }
    return bytes;
  } catch (error) {
    if (error instanceof CapabilityError) throw error;
    throw retryableCapabilityError('capability/provider-unavailable');
  } finally {
    await file?.close().catch(() => {});
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function createDocumentAiOcr({
  config: configInput,
  clientFactory,
} = {}) {
  const config = normalizeConfig(configInput);
  const factory = clientFactory ?? ((options) => new DocumentProcessorServiceClient(options));
  if (typeof factory !== 'function') throw new TypeError('clientFactory is invalid');
  const name = [
    `projects/${config.projectId}`,
    `locations/${config.location}`,
    `processors/${config.processorId}`,
    `processorVersions/${config.processorVersion}`,
  ].join('/');
  let client = null;
  const getClient = () => {
    client ??= factory({ apiEndpoint: config.endpoint });
    if (typeof client?.processDocument !== 'function') {
      throw new TypeError('Document AI client is invalid');
    }
    return client;
  };

  return Object.freeze({
    async process(inputValue) {
      const input = normalizeInput(inputValue);
      const content = await readBoundedSource(input);
      let response;
      try {
        response = await getClient().processDocument({
          name,
          rawDocument: { content, mimeType: input.mimeType },
          fieldMask: OCR_FIELD_MASK,
          labels: {
            execution: createHash('sha256').update(input.executionId).digest('hex').slice(0, 16),
            executor: 'v1',
          },
        });
      } catch {
        throw retryableCapabilityError('capability/provider-unavailable');
      }
      const document = response?.[0]?.document;
      if (!document || typeof document !== 'object' || Array.isArray(document)) {
        throw stableError('capability/provider-result-invalid', false);
      }
      const rawRequestId = response?.[1]?.requestId ?? response?.[0]?.requestId;
      const providerRequestId = typeof rawRequestId === 'string'
        && rawRequestId.length > 0
        && rawRequestId.length <= 256
        ? rawRequestId
        : null;
      return deepFreeze({
        document: structuredClone(document),
        providerRequestId,
      });
    },
  });
}
