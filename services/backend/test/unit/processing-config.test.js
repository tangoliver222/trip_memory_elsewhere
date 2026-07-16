import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';
import { PROCESSING_ERROR_CODES } from '../../src/domain/processing-task.js';
import {
  ProcessingError,
  retryableProcessingError,
  terminalProcessingError,
} from '../../src/processing/errors.js';

const safeEnv = (overrides = {}) => ({ NODE_ENV: 'test', ...overrides });

test('processing config uses the exact deeply frozen safe defaults', () => {
  const { processing } = loadConfig(safeEnv());

  assert.deepEqual(processing, {
    timeouts: {
      softMs: 180000,
      leaseMs: 240000,
      requestMs: 300000,
      cleanupMarginMs: 30000,
    },
    limits: {
      maxInputBytes: 52428800,
      maxInputPixels: 60000000,
      maxImageWidth: 20000,
      maxImageHeight: 20000,
      maxPageCount: 100,
      maxMetadataDecompressedBytes: 16777216,
    },
  });
  assert.equal(Object.isFrozen(processing), true);
  assert.equal(Object.isFrozen(processing.timeouts), true);
  assert.equal(Object.isFrozen(processing.limits), true);
});

test('processing config parses every design environment field as an integer', () => {
  const { processing } = loadConfig(safeEnv({
    PROCESSING_SOFT_TIMEOUT_MS: '1000',
    PROCESSING_LEASE_MS: '2000',
    CLOUD_RUN_REQUEST_TIMEOUT_MS: '5000',
    PROCESSING_CLEANUP_MARGIN_MS: '3000',
    MAX_INPUT_BYTES: '1024',
    MAX_INPUT_PIXELS: '2048',
    MAX_IMAGE_WIDTH: '512',
    MAX_IMAGE_HEIGHT: '256',
    MAX_PAGE_COUNT: '10',
    MAX_METADATA_DECOMPRESSED_BYTES: '4096',
  }));

  assert.deepEqual(processing, {
    timeouts: {
      softMs: 1000,
      leaseMs: 2000,
      requestMs: 5000,
      cleanupMarginMs: 3000,
    },
    limits: {
      maxInputBytes: 1024,
      maxInputPixels: 2048,
      maxImageWidth: 512,
      maxImageHeight: 256,
      maxPageCount: 10,
      maxMetadataDecompressedBytes: 4096,
    },
  });
});

test('processing timeout order rejects soft deadlines at or after the lease', () => {
  for (const softMs of ['240000', '240001']) {
    assert.throws(
      () => loadConfig(safeEnv({ PROCESSING_SOFT_TIMEOUT_MS: softMs })),
      /Invalid backend configuration/,
    );
  }
});

test('processing timeout order rejects leases beyond the request cleanup boundary', () => {
  assert.throws(
    () => loadConfig(safeEnv({ PROCESSING_LEASE_MS: '270001' })),
    /Invalid backend configuration/,
  );
});

test('processing numeric fields reject zero and negative values', () => {
  const fields = [
    'PROCESSING_SOFT_TIMEOUT_MS',
    'PROCESSING_LEASE_MS',
    'CLOUD_RUN_REQUEST_TIMEOUT_MS',
    'PROCESSING_CLEANUP_MARGIN_MS',
    'MAX_INPUT_BYTES',
    'MAX_INPUT_PIXELS',
    'MAX_IMAGE_WIDTH',
    'MAX_IMAGE_HEIGHT',
    'MAX_PAGE_COUNT',
    'MAX_METADATA_DECOMPRESSED_BYTES',
  ];

  for (const field of fields) {
    for (const value of ['0', '-1']) {
      assert.throws(
        () => loadConfig(safeEnv({ [field]: value })),
        /Invalid backend configuration/,
      );
    }
  }
});

test('processing media limits cannot exceed the design hard caps', () => {
  for (const [field, value] of [
    ['MAX_INPUT_BYTES', '52428801'],
    ['MAX_INPUT_PIXELS', '60000001'],
    ['MAX_IMAGE_WIDTH', '20001'],
    ['MAX_IMAGE_HEIGHT', '20001'],
    ['MAX_PAGE_COUNT', '101'],
    ['MAX_METADATA_DECOMPRESSED_BYTES', '16777217'],
  ]) {
    assert.throws(
      () => loadConfig(safeEnv({ [field]: value })),
      /Invalid backend configuration/,
    );
  }
});

test('invalid processing configuration messages never echo raw values', () => {
  for (const { field, value } of [
    { field: 'MAX_INPUT_BYTES', value: 'private-storage-token-value' },
    { field: 'PROCESSING_SOFT_TIMEOUT_MS', value: '240000' },
  ]) {
    let caught;
    try {
      loadConfig(safeEnv({ [field]: value }));
    } catch (error) {
      caught = error;
    }
    assert.match(caught?.message ?? '', /Invalid backend configuration/);
    assert.equal((caught?.message ?? '').includes(value), false);
  }
});

test('stable processing errors expose only safe code message and retryability', () => {
  const retryableCodes = PROCESSING_ERROR_CODES.slice(0, 4);
  const terminalCodes = PROCESSING_ERROR_CODES.slice(4);
  const rawCause = new Error('private provider cause message');

  for (const [factory, codes, retryable] of [
    [retryableProcessingError, retryableCodes, true],
    [terminalProcessingError, terminalCodes, false],
  ]) {
    for (const code of codes) {
      const error = factory(code, rawCause);
      assert.equal(error instanceof ProcessingError, true);
      assert.deepEqual({
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      }, {
        code,
        message: factory(code).message,
        retryable,
      });
      assert.equal(error.cause, undefined);
      assert.equal(error.message.includes(rawCause.message), false);
    }
  }

  assert.throws(
    () => retryableProcessingError('processing/not-real'),
    TypeError,
  );
});
