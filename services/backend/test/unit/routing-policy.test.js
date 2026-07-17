import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COST_MODEL_V1,
  POLICY_V1,
  ROUTER_V1,
  classifyRoutingInput,
  compileCapabilityIntents,
} from '../../src/routing/policy.js';
import * as routingPolicy from '../../src/routing/policy.js';
import {
  makeEscalationRequest,
  makeRoutableFragment,
} from '../fixtures/routing.js';

const fragmentRef = (id) => ({ type: 'fragment', id });

function representation(fragment, overrides = {}) {
  return {
    role: 'independent',
    representativeRef: fragmentRef(fragment.id),
    cohortRefs: [],
    reasonCodes: ['independent-fragment'],
    ...overrides,
  };
}

function nonPixelFragment({ type, format }) {
  const base = makeRoutableFragment({ type, thumbnailStatus: 'unsupported' });
  return {
    ...base,
    storage: {
      ...base.storage,
      contentType: format === 'pdf' ? 'application/pdf' : 'text/plain',
    },
    source: { ...base.source, media: null },
    hashes: {
      sha256: base.hashes.sha256,
      perceptualHash: null,
      perceptualHashAlgorithm: null,
      perceptualHashVersion: null,
      perceptualHashBands: null,
    },
    technicalMetadata: {
      ...base.technicalMetadata,
      format,
      width: null,
      height: null,
      orientation: null,
      pageCount: null,
      metadataStatus: 'partial',
      warningCodes: format === 'pdf' ? ['processing/page-count-unsupported'] : [],
    },
    derivatives: { thumbnail: null },
    processing: {
      deterministic: {
        ...base.processing.deterministic,
        thumbnailStatus: 'unsupported',
        perceptualHashStatus: 'unsupported',
      },
    },
  };
}

function documentImage({
  type = 'receipt',
  format = 'jpeg',
  sizeBytes = 4_000_000,
  width = 2_000,
  height = 3_000,
} = {}) {
  const base = makeRoutableFragment({ type, width, height });
  return {
    ...base,
    storage: { ...base.storage, sizeBytes },
    technicalMetadata: {
      ...base.technicalMetadata,
      format,
      width,
      height,
    },
  };
}

const locationHint = {
  lat: 13.7563,
  lng: 100.5018,
  accuracyMeters: 12,
  source: 'camera_device',
};

const compile = (fragment, overrides = {}) => compileCapabilityIntents({
  fragment,
  representation: representation(fragment),
  features: null,
  priorResults: {},
  escalation: null,
  revision: 1,
  requestContext: { kind: 'automatic', serverAuthenticated: true },
  ...overrides,
});

test('routing policy identifiers are frozen and version exact', () => {
  assert.deepEqual(ROUTER_V1, { name: 'fragment-routing', version: 'v1' });
  assert.deepEqual(POLICY_V1, { name: 'authoritative-routing-policy', version: 'v1' });
  assert.deepEqual(COST_MODEL_V1, { name: 'routing-admission-costs', version: 'v1' });
  assert.equal(Object.isFrozen(ROUTER_V1), true);
  assert.equal(Object.isFrozen(POLICY_V1), true);
  assert.equal(Object.isFrozen(COST_MODEL_V1), true);
  assert.deepEqual(routingPolicy.POLICY_V2, {
    name: 'authoritative-routing-policy', version: 'v2',
  });
  assert.deepEqual(routingPolicy.COST_MODEL_V2, {
    name: 'routing-admission-costs', version: 'v2',
  });
  assert.equal(Object.isFrozen(routingPolicy.POLICY_V2), true);
  assert.equal(Object.isFrozen(routingPolicy.COST_MODEL_V2), true);
});

test('classification uses declared and deterministic fields without semantic guessing', () => {
  const cases = [
    [makeRoutableFragment({ type: 'photo' }), {
      mediaKind: 'image', documentKind: null,
    }],
    [makeRoutableFragment({ type: 'receipt' }), {
      mediaKind: 'document', documentKind: 'receipt',
    }],
    [makeRoutableFragment({ type: 'ticket' }), {
      mediaKind: 'document', documentKind: 'ticket',
    }],
    [makeRoutableFragment({ type: 'menu' }), {
      mediaKind: 'document', documentKind: 'menu',
    }],
    [makeRoutableFragment({ type: 'screenshot' }), {
      mediaKind: 'document', documentKind: 'screenshot',
    }],
    [nonPixelFragment({ type: 'text', format: 'text' }), {
      mediaKind: 'text', documentKind: null,
    }],
    [nonPixelFragment({ type: 'receipt', format: 'pdf' }), {
      mediaKind: 'document', documentKind: 'pdf',
    }],
  ];

  for (const [fragment, expected] of cases) {
    assert.deepEqual(classifyRoutingInput(fragment), {
      ...expected,
      confidence: 1,
      basis: ['fragment-type', 'technical-metadata-format'],
    });
  }

  const screenshot = makeRoutableFragment({ type: 'screenshot' });
  assert.equal(compile(screenshot, {
    features: {
      mean: 0.5,
      variance: 0.1,
      entropyBits: 2,
      edgeEnergy: 0.2,
      exposure: 'normal',
      lowInformation: false,
      guessedText: 'RECEIPT',
    },
  }).classification.documentKind, 'screenshot');
});

test('first-pass capability matrix is deterministic by input class', () => {
  const withContext = makeRoutableFragment({
    type: 'photo',
    capturedAt: '2024-10-12T08:42:00.000Z',
    sourceCreatedAt: null,
    locationHint,
  });
  const withoutContext = makeRoutableFragment({
    type: 'photo', sourceCreatedAt: null, locationHint: null,
  });
  const cases = [
    [withContext, {
      ocr: ['skip', 'not-document-like'],
      places: ['skip', 'gps-sufficient'],
      embedding: ['approve', 'independent-fragment'],
      gemini: ['defer', 'await-structured-results'],
    }],
    [withoutContext, {
      ocr: ['skip', 'not-document-like'],
      places: ['defer', 'await-location-clues'],
      embedding: ['approve', 'independent-fragment'],
      gemini: ['defer', 'await-structured-results'],
    }],
    [makeRoutableFragment({ type: 'receipt' }), {
      ocr: ['approve', 'document-ai-input-supported'],
      places: ['defer', 'await-ocr-result'],
      embedding: ['defer', 'await-ocr-result'],
      gemini: ['defer', 'await-structured-results'],
    }],
    [makeRoutableFragment({ type: 'ticket' }), {
      ocr: ['approve', 'document-ai-input-supported'],
      places: ['defer', 'await-ocr-result'],
      embedding: ['defer', 'await-ocr-result'],
      gemini: ['defer', 'await-structured-results'],
    }],
    [makeRoutableFragment({ type: 'menu' }), {
      ocr: ['approve', 'document-ai-input-supported'],
      places: ['defer', 'await-ocr-result'],
      embedding: ['defer', 'await-ocr-result'],
      gemini: ['defer', 'await-structured-results'],
    }],
    [makeRoutableFragment({ type: 'screenshot' }), {
      ocr: ['approve', 'document-ai-input-supported'],
      places: ['defer', 'await-ocr-result'],
      embedding: ['defer', 'await-ocr-result'],
      gemini: ['defer', 'await-structured-results'],
    }],
    [nonPixelFragment({ type: 'text', format: 'text' }), {
      ocr: ['skip', 'text-direct-input'],
      places: ['defer', 'await-text-place-clues'],
      embedding: ['approve', 'text-direct-input'],
      gemini: ['defer', 'await-structured-results'],
    }],
    [nonPixelFragment({ type: 'receipt', format: 'pdf' }), {
      ocr: ['defer', 'page-count-unknown'],
      places: ['defer', 'await-ocr-result'],
      embedding: ['defer', 'await-ocr-result'],
      gemini: ['defer', 'await-structured-results'],
    }],
  ];

  for (const [fragment, expected] of cases) {
    const result = compile(fragment);
    for (const [capability, [decision, reason]] of Object.entries(expected)) {
      assert.equal(result.intents[capability].decision, decision);
      assert.deepEqual(result.intents[capability].reasonCodes, [reason]);
    }
  }

  assert.deepEqual(compile(makeRoutableFragment({ type: 'receipt' }))
    .intents.gemini.reconsiderOn, [
    'ocr-completed',
    'ocr-insufficient-input',
    'policy-change',
    'user-request',
  ]);
});

test('policy v2 admits only bounded Document AI image inputs', () => {
  const cases = [
    ['small receipt JPEG', documentImage(), 'approve', 'document-ai-input-supported'],
    ['40 MB receipt', documentImage({ sizeBytes: 40_000_000 }), 'approve', 'document-ai-input-supported'],
    ['HEIC receipt', documentImage({ format: 'heic' }), 'block', 'document-ai-format-unsupported'],
    ['HEIF receipt', documentImage({ format: 'heif' }), 'block', 'document-ai-format-unsupported'],
    ['missing pixels', documentImage({ width: null, height: null }), 'defer', 'image-pixels-unknown'],
    ['over 40 MB', documentImage({ sizeBytes: 40_000_001 }), 'block', 'document-ai-online-limit'],
    ['over 40 MP', documentImage({ width: 8_000, height: 6_000 }), 'block', 'document-ai-online-limit'],
    ['unknown-page PDF', nonPixelFragment({ type: 'receipt', format: 'pdf' }), 'defer', 'page-count-unknown'],
  ];

  for (const [name, fragment, decision, reason] of cases) {
    const ocr = compile(fragment).intents.ocr;
    assert.equal(ocr.decision, decision, name);
    assert.deepEqual(ocr.reasonCodes, [reason], name);
  }

  assert.deepEqual(
    compile(documentImage({ width: null, height: null })).intents.ocr.reconsiderOn,
    ['policy-change', 'technical-facts-updated'],
  );
});

test('exact near and burst supporting photos skip their paid work', () => {
  const fragment = makeRoutableFragment({ id: 'frag_support01' });
  for (const [reasonCode, expected] of [
    ['exact-duplicate-supporting', 'exact-duplicate-reuse'],
    ['near-duplicate-supporting', 'near-duplicate-supporting'],
    ['burst-supporting', 'burst-supporting'],
  ]) {
    const result = compile(fragment, {
      representation: representation(fragment, {
        role: 'supporting',
        representativeRef: fragmentRef('frag_other001'),
        cohortRefs: [{ type: 'routingCohort', id: 'cohort_12345678' }],
        reasonCodes: [reasonCode],
      }),
    });
    assert.equal(Object.values(result.intents).every(({ decision }) => decision === 'skip'), true);
    assert.equal(Object.values(result.intents).every(({ reasonCodes }) => (
      reasonCodes.length === 1 && reasonCodes[0] === expected
    )), true);
    assert.equal(result.priority, 'low');
    assert.equal(result.budgetClass, 'deterministic_only');
  }
});

test('low-information and deterministic terminal inputs block all paid capabilities', () => {
  const low = compile(makeRoutableFragment(), {
    features: {
      mean: 0,
      variance: 0,
      entropyBits: 0,
      edgeEnergy: 0,
      exposure: 'under',
      lowInformation: true,
    },
  });
  assert.equal(Object.values(low.intents).every(({ decision }) => decision === 'block'), true);
  assert.equal(Object.values(low.intents).every(({ reasonCodes }) => (
    reasonCodes[0] === 'low-information'
  )), true);

  const base = makeRoutableFragment();
  const terminal = {
    ...base,
    processing: {
      deterministic: {
        ...base.processing.deterministic,
        state: 'failed_terminal',
        metadataStatus: 'failed',
        thumbnailStatus: 'failed',
        perceptualHashStatus: 'failed',
      },
    },
  };
  const failed = compile(terminal);
  assert.equal(Object.values(failed.intents).every(({ decision }) => decision === 'block'), true);
  assert.equal(Object.values(failed.intents).every(({ reasonCodes }) => (
    reasonCodes[0] === 'deterministic-terminal-failure'
  )), true);
});

test('structured OCR can avoid Gemini and selectively unlock place resolution', () => {
  const receipt = makeRoutableFragment({
    type: 'receipt', sourceCreatedAt: null, locationHint: null,
  });
  const priorResults = {
    ocr: {
      outcome: 'completed',
      structuredSufficient: true,
      placeClues: [{ kind: 'merchant', value: 'Ari Coffee' }],
    },
  };
  const withoutGps = compile(receipt, { priorResults });
  assert.equal(withoutGps.intents.gemini.decision, 'skip');
  assert.deepEqual(withoutGps.intents.gemini.reasonCodes, ['structured-result-sufficient']);
  assert.equal(withoutGps.intents.places.decision, 'approve');
  assert.deepEqual(withoutGps.intents.places.reasonCodes, ['structured-place-clue']);

  const withGps = compile({
    ...receipt,
    source: { ...receipt.source, locationHint },
  }, { priorResults });
  assert.equal(withGps.intents.places.decision, 'skip');
  assert.deepEqual(withGps.intents.places.reasonCodes, ['gps-sufficient']);
});

test('only a valid insufficient-input escalation may approve Gemini', () => {
  const receipt = makeRoutableFragment({ type: 'receipt' });
  const escalation = makeEscalationRequest();
  const first = compile(receipt, { escalation });
  const repeated = compile(receipt, { escalation: structuredClone(escalation) });

  assert.equal(first.intents.gemini.decision, 'approve');
  assert.deepEqual(first.intents.gemini.reasonCodes, ['ocr-insufficient-input']);
  assert.deepEqual(repeated, first);

  const successfulOcr = compile(receipt, {
    escalation,
    priorResults: {
      ocr: { outcome: 'completed', structuredSufficient: true, placeClues: [] },
    },
  });
  assert.equal(successfulOcr.intents.gemini.decision, 'skip');

  const photo = makeRoutableFragment({ type: 'photo' });
  assert.notEqual(compile(photo, { escalation }).intents.gemini.decision, 'approve');
});

test('automatic revision and priority gates are explicit', () => {
  const fragment = makeRoutableFragment();
  assert.throws(
    () => compile(fragment, { revision: 6 }),
    (error) => error.code === 'routing/revision-limit',
  );
  assert.equal(compile(fragment).priority, 'normal');
  assert.equal(compile(fragment, {
    requestContext: { kind: 'explicit_reprocess', serverAuthenticated: false },
  }).priority, 'normal');
  assert.equal(compile(fragment, {
    requestContext: { kind: 'explicit_reprocess', serverAuthenticated: true },
  }).priority, 'high');
  assert.equal(compile(fragment).budgetClass, 'standard');
});

test('policy source imports no provider client or outbound transport', async () => {
  const source = await readFile(new URL('../../src/routing/policy.js', import.meta.url), 'utf8');
  for (const forbidden of [
    '@google/genai',
    'documentai',
    'ml-kit',
    'node:https',
    'fetch(',
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
});
