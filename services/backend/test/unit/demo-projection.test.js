import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_ANCHORS,
  projectCompetitionSnapshot,
} from '../../src/demo/projection.js';
import {
  makePendingBatch,
  makeUploadedFragment,
} from '../fixtures/import.js';

const OWNER_ID = 'user_demo';
const BANGKOK_OFFSET_MINUTES = 420;

function fragment({
  id,
  capturedAt,
  lat = DEMO_ANCHORS[0].lat,
  lng = DEMO_ANCHORS[0].lng,
  type = 'photo',
  includeLocation = true,
} = {}) {
  return makeUploadedFragment({
    id,
    ownerId: OWNER_ID,
    batchId: 'batch_demo0001',
    type,
    status: 'placed',
    storage: {
      ...makeUploadedFragment().storage,
      originalPath: `users/${OWNER_ID}/originals/batch_demo0001/${id}`,
    },
    source: {
      ...makeUploadedFragment().source,
      originalName: `${id}.jpg`,
      sourceCreatedAt: capturedAt,
      sourceModifiedAt: capturedAt,
      timezoneOffsetMinutes: BANGKOK_OFFSET_MINUTES,
      locationHint: includeLocation ? {
        lat,
        lng,
        accuracyMeters: 10,
        source: 'camera_device',
      } : null,
    },
  });
}

function input(fragments, decisions = {}) {
  const uploads = Object.fromEntries(fragments.map((item) => [item.id, {
    fragmentId: item.id,
    sourceType: item.type,
    state: 'finalized',
    originalPath: item.storage.originalPath,
    declaredContentType: item.storage.contentType,
    declaredSizeBytes: item.storage.sizeBytes,
    allowedContentTypes: [item.storage.contentType],
    maxBytes: item.storage.sizeBytes,
    source: item.source,
    finalizedGeneration: item.storage.generation,
    failureCode: null,
  }]));
  const batch = makePendingBatch({
    id: 'batch_demo0001',
    ownerId: OWNER_ID,
    status: 'processing',
    uploadStatus: 'complete',
    inputCount: fragments.length || 1,
    counters: {
      saved: fragments.length,
      processed: fragments.length,
      failed: 0,
      needsReview: fragments.filter(({ source }) => source.locationHint === null).length,
    },
    uploads: fragments.length > 0 ? uploads : makePendingBatch().uploads,
  });
  return {
    ownerId: OWNER_ID,
    fragments,
    importBatches: fragments.length > 0 ? [batch] : [],
    decisions,
  };
}

function threeAriMorningInput() {
  return input([
    fragment({ id: 'frag_a', capturedAt: '2024-10-12T08:17:00+07:00' }),
    fragment({ id: 'frag_b', capturedAt: '2024-10-16T08:22:00+07:00' }),
    fragment({ id: 'frag_c', capturedAt: '2024-10-19T08:29:00+07:00', type: 'receipt' }),
  ]);
}

function withDeterministic(fragmentInput) {
  return {
    ...fragmentInput,
    processing: {
      deterministic: {
        taskId: `task_${fragmentInput.id}`,
        processorName: 'deterministic-media',
        processorVersion: 'v1',
        state: 'succeeded',
        metadataStatus: 'complete',
        thumbnailStatus: 'complete',
        perceptualHashStatus: 'complete',
        updatedAt: '2026-07-19T00:00:00.000Z',
      },
    },
  };
}

function processingSnapshot(fragmentInput, { ocrDecision = 'skipped', withResult = false } = {}) {
  const routePlanId = `route_${fragmentInput.id}`;
  const executionId = `execution_${fragmentInput.id}`;
  const resultId = `result_${fragmentInput.id}`;
  const sourceRevision = {
    bucket: fragmentInput.storage.bucket,
    objectName: fragmentInput.storage.originalPath,
    generation: fragmentInput.storage.generation,
    inputHash: 'a'.repeat(64),
  };
  const plan = {
    id: routePlanId,
    ownerId: OWNER_ID,
    revision: 1,
    state: withResult ? 'completed' : 'approved',
    fragmentRef: { type: 'fragment', id: fragmentInput.id },
    sourceRevision,
    representation: {
      role: 'independent',
      representativeRef: { type: 'fragment', id: fragmentInput.id },
      reasonCodes: ['not-near-duplicate'],
    },
    capabilities: {
      ocr: ocrDecision === 'approved'
        ? {
          decision: 'approved',
          executorClass: 'document-ocr',
          reasonCodes: ['declared-document-type'],
        }
        : {
          decision: 'skipped',
          executorClass: null,
          reasonCodes: ['not-document-like'],
        },
    },
  };
  return {
    routePlans: [plan],
    routingHeads: [{
      currentPlanRef: { type: 'routePlan', id: routePlanId },
      currentRevision: 1,
      fragmentRef: plan.fragmentRef,
      sourceRevision,
    }],
    capabilityExecutions: withResult ? [{
      id: executionId,
      ownerId: OWNER_ID,
      routePlanRef: { type: 'routePlan', id: routePlanId },
      routePlanRevision: 1,
      fragmentRef: plan.fragmentRef,
      sourceRevision,
      capability: 'ocr',
      state: 'completed',
      resultRef: { type: 'capabilityResult', id: resultId },
    }] : [],
    capabilityResults: withResult ? [{
      id: resultId,
      ownerId: OWNER_ID,
      executionRef: { type: 'capabilityExecution', id: executionId },
      routePlanRef: { type: 'routePlan', id: routePlanId },
      routePlanRevision: 1,
      fragmentRef: plan.fragmentRef,
      capability: 'ocr',
      providerName: 'document-ai-enterprise-ocr',
      providerVersion: 'pretrained-ocr-v1.0-2020-09-23',
      outcome: 'completed',
      pageCount: 1,
      actualCostMicros: 1_500,
      normalizedArtifactRef: {
        kind: 'normalized',
        bucket: fragmentInput.storage.bucket,
        objectName: `users/${OWNER_ID}/capability-results/${executionId}/normalized.json.gz`,
        generation: '1740000000000999',
        contentType: 'application/gzip',
        sizeBytes: 500,
        sha256: 'b'.repeat(64),
      },
    }] : [],
  };
}

test('empty owner produces an empty honest snapshot', () => {
  const snapshot = projectCompetitionSnapshot(input([]));

  assert.equal(snapshot.world.totalFragments, 0);
  assert.deepEqual(snapshot.cities, []);
  assert.deepEqual(snapshot.discoveries, []);
  assert.equal(Object.isFrozen(snapshot), true);
});

test('three distinct mornings at one anchor produce one evidence-first discovery', () => {
  const snapshot = projectCompetitionSnapshot(threeAriMorningInput());

  assert.equal(snapshot.discoveries.length, 1);
  assert.deepEqual(snapshot.discoveries[0].sourceIds, ['frag_a', 'frag_b', 'frag_c']);
  assert.equal(snapshot.discoveries[0].placeId, 'place-common-grounds');
  assert.deepEqual(snapshot.discoveries[0].evidence.map(({ fragmentId }) => fragmentId), [
    'frag_a',
    'frag_b',
    'frag_c',
  ]);
});

test('adding and removing fragments changes every aggregate deterministically', () => {
  const one = projectCompetitionSnapshot(input([
    fragment({ id: 'frag_01', capturedAt: '2024-10-12T08:17:00+07:00' }),
  ]));
  const twelve = projectCompetitionSnapshot(input(Array.from({ length: 12 }, (_, index) => fragment({
    id: `frag_${String(index + 1).padStart(2, '0')}`,
    capturedAt: `2024-10-${String(index + 1).padStart(2, '0')}T08:17:00+07:00`,
  }))));

  assert.notEqual(one.revision, twelve.revision);
  assert.notDeepEqual(one.world, twelve.world);
  assert.notDeepEqual(one.cities, twelve.cities);
  assert.notDeepEqual(one.places, twelve.places);
  assert.notDeepEqual(one.discoveries, twelve.discoveries);
});

test('projection is invariant to input order', () => {
  const source = threeAriMorningInput();
  const reversed = {
    ...source,
    fragments: [...source.fragments].reverse(),
    importBatches: [...source.importBatches].reverse(),
  };

  assert.deepEqual(projectCompetitionSnapshot(source), projectCompetitionSnapshot(reversed));
});

test('place matching uses an inclusive 80 metre maximum', () => {
  const anchor = DEMO_ANCHORS[0];
  const snapshot = projectCompetitionSnapshot(input([
    fragment({
      id: 'frag_inside',
      capturedAt: '2024-10-12T08:17:00+07:00',
      lat: anchor.lat + 0.00070,
    }),
    fragment({
      id: 'frag_outside',
      capturedAt: '2024-10-12T09:17:00+07:00',
      lat: anchor.lat + 0.00075,
    }),
  ]));

  assert.equal(snapshot.fragments.find(({ id }) => id === 'frag_inside').placeId, anchor.id);
  assert.equal(snapshot.fragments.find(({ id }) => id === 'frag_outside').placeId, null);
});

test('visits split after a 45 minute adjacent gap', () => {
  const snapshot = projectCompetitionSnapshot(input([
    fragment({ id: 'frag_0800', capturedAt: '2024-10-12T08:00:00+07:00' }),
    fragment({ id: 'frag_0845', capturedAt: '2024-10-12T08:45:00+07:00' }),
    fragment({ id: 'frag_0931', capturedAt: '2024-10-12T09:31:00+07:00' }),
  ]));

  assert.deepEqual(snapshot.visits.map(({ sourceIds }) => sourceIds), [
    ['frag_0800', 'frag_0845'],
    ['frag_0931'],
  ]);
});

test('discoveries require three distinct local dates inside 05:00–11:30', () => {
  const sameDate = projectCompetitionSnapshot(input([
    fragment({ id: 'frag_same_a', capturedAt: '2024-10-12T05:00:00+07:00' }),
    fragment({ id: 'frag_same_b', capturedAt: '2024-10-12T08:00:00+07:00' }),
    fragment({ id: 'frag_same_c', capturedAt: '2024-10-12T11:30:00+07:00' }),
  ]));
  const outsideBounds = projectCompetitionSnapshot(input([
    fragment({ id: 'frag_early', capturedAt: '2024-10-12T04:59:00+07:00' }),
    fragment({ id: 'frag_noon', capturedAt: '2024-10-16T11:31:00+07:00' }),
    fragment({ id: 'frag_valid', capturedAt: '2024-10-19T08:29:00+07:00' }),
  ]));

  assert.deepEqual(sameDate.discoveries, []);
  assert.deepEqual(outsideBounds.discoveries, []);
});

test('missing GPS remains visible as an unresolved Inbox item until decided', () => {
  const unresolved = fragment({
    id: 'frag_unplaced',
    capturedAt: '2024-10-12T08:17:00+07:00',
    type: 'receipt',
    includeLocation: false,
  });
  const before = projectCompetitionSnapshot(input([unresolved]));
  const item = before.inboxItems[0];
  const after = projectCompetitionSnapshot(input([unresolved], {
    [item.id]: { decision: 'later', decidedAt: '2026-07-19T00:00:00.000Z' },
  }));

  assert.equal(item.fragmentId, unresolved.id);
  assert.equal(item.reason, 'place-unresolved');
  assert.deepEqual(item.sourceIds, [unresolved.id]);
  assert.deepEqual(after.inboxItems, []);
});

test('deterministic presentation never invents emotional meaning', () => {
  const serialized = JSON.stringify(projectCompetitionSnapshot(threeAriMorningInput()));

  assert.doesNotMatch(serialized, /治愈|浪漫|喜欢|怀念|meaningful|felt|emotion/i);
});

test('processing trace uses only the frozen persisted stage vocabulary', () => {
  const source = withDeterministic(fragment({
    id: 'frag_trace',
    capturedAt: '2024-10-12T08:17:00+07:00',
  }));
  const projected = projectCompetitionSnapshot({
    ...input([source]),
    routingSnapshots: [processingSnapshot(source)],
    normalizedArtifacts: {},
  });
  const trace = projected.fragments[0].processingTrace;

  assert.deepEqual(trace.map(({ stage, status }) => [stage, status]), [
    ['original', 'completed'],
    ['deterministic', 'completed'],
    ['routing', 'completed'],
    ['ocr', 'skipped'],
    ['relationship', 'skipped'],
  ]);
  assert.ok(trace.every(({ status }) => [
    'pending', 'completed', 'skipped', 'unresolved', 'failed',
  ].includes(status)));
  assert.equal(Object.hasOwn(projected.fragments[0], 'ocr'), false);
  assert.deepEqual(projected.importBatches[0].processingTrace.map(({ status }) => status), [
    'completed', 'completed', 'completed', 'skipped', 'skipped',
  ]);
});

test('verified normalized OCR artifact changes only bounded OCR projection fields', () => {
  const source = withDeterministic(fragment({
    id: 'frag_receipt',
    capturedAt: '2024-10-19T08:29:00+07:00',
    type: 'receipt',
  }));
  const routing = processingSnapshot(source, { ocrDecision: 'approved', withResult: true });
  const resultId = routing.capabilityResults[0].id;
  const artifact = {
    schemaVersion: 1,
    executionId: routing.capabilityExecutions[0].id,
    fragmentId: source.id,
    text: 'COMMON GROUNDS\nAmericano 90.00\n',
    pageCount: 1,
    languageCodes: ['en'],
    qualitySummary: { averageConfidence: 0.94, defectCodes: [] },
    pages: [],
  };
  const withoutArtifact = projectCompetitionSnapshot({
    ...input([source]),
    routingSnapshots: [routing],
    normalizedArtifacts: {},
  });
  const withArtifact = projectCompetitionSnapshot({
    ...input([source]),
    routingSnapshots: [routing],
    normalizedArtifacts: { [resultId]: artifact },
  });

  assert.equal(Object.hasOwn(withoutArtifact.fragments[0], 'ocr'), false);
  assert.equal(withoutArtifact.fragments[0].processingTrace[3].status, 'unresolved');
  assert.deepEqual(withArtifact.fragments[0].ocr, {
    provider: 'Google Document AI',
    outcome: 'completed',
    pageCount: 1,
    actualCostMicros: 1_500,
    textExcerpt: 'COMMON GROUNDS\nAmericano 90.00',
    languageCodes: ['en'],
  });
  assert.equal(withArtifact.fragments[0].processingTrace[3].status, 'completed');
  assert.equal(Object.hasOwn(withArtifact.fragments[0].ocr, 'merchant'), false);
  assert.equal(Object.hasOwn(withArtifact.fragments[0].ocr, 'amount'), false);
});

test('processing projection is invariant to routing snapshot input order', () => {
  const first = withDeterministic(fragment({
    id: 'frag_order_a', capturedAt: '2024-10-12T08:17:00+07:00',
  }));
  const second = withDeterministic(fragment({
    id: 'frag_order_b', capturedAt: '2024-10-13T08:17:00+07:00',
  }));
  const base = input([first, second]);
  const routing = [processingSnapshot(first), processingSnapshot(second)];
  assert.deepEqual(
    projectCompetitionSnapshot({ ...base, routingSnapshots: routing }),
    projectCompetitionSnapshot({ ...base, routingSnapshots: [...routing].reverse() }),
  );
});
