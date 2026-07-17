import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createCapabilityScheduler } from '../../src/capabilities/scheduler.js';
import { normalizeDocumentAiOcr } from '../../src/capabilities/ocr-normalizer.js';
import { createOcrCapabilityWorker } from '../../src/capabilities/worker.js';
import { createFirestoreRepository } from '../../src/repositories/firestore.js';
import { makeCapabilityArtifactRef } from '../fixtures/capabilities.js';
import {
  seedApprovedOcr,
  SUPPORTED_VERSIONS,
} from '../contract/capability-repository.contract.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const DOCUMENT = JSON.parse(await readFile(
  new URL('../fixtures/document-ai/one-page-response.json', import.meta.url),
  'utf8',
));

test('approved OCR dispatch and repeated delivery are durable and idempotent', {
  skip: !enabled,
  concurrency: false,
}, async (t) => {
  const app = initializeApp(
    { projectId: 'demo-elsewhere' },
    `capability-emulator-${process.pid}-${Date.now()}`,
  );
  const database = getFirestore(app);
  const ownerId = 'user_capability_e2e01';
  const ownerRef = database.doc(`users/${ownerId}`);
  await database.recursiveDelete(ownerRef);
  t.after(async () => {
    await database.recursiveDelete(ownerRef);
    await deleteApp(app);
  });

  const repository = createFirestoreRepository({ db: database });
  const seeded = await seedApprovedOcr(repository, ownerId, 'e2e00001');
  const dispatchCalls = [];
  const scheduler = createCapabilityScheduler({
    repository,
    dispatcher: {
      async enqueueOcrTask(input) {
        dispatchCalls.push(structuredClone(input));
        return { outcome: 'created' };
      },
    },
    providerVersion: 'fake-processor-v1',
    clock: () => '2026-07-17T13:10:00.000Z',
  });

  const scheduleInput = { uid: ownerId, batchId: seeded.batch.id };
  await scheduler.handle(scheduleInput);
  await scheduler.handle(scheduleInput);
  assert.equal(dispatchCalls.length, 1);

  const providerCalls = [];
  let tick = 0;
  const clock = () => new Date(
    Date.parse('2026-07-17T13:11:00.000Z') + tick++ * 1_000,
  ).toISOString();
  const artifact = (kind) => makeCapabilityArtifactRef({
    kind,
    bucket: seeded.fragment.storage.bucket,
    objectName: `users/${ownerId}/capability-results/${seeded.execution.id}/${kind}.json.gz`,
    generation: kind === 'provider' ? '1740000000000200' : '1740000000000201',
  });
  const worker = createOcrCapabilityWorker({
    repository,
    materializer: {
      async materialize() {
        return {
          path: '/tmp/fake-generation-pinned-source',
          sizeBytes: seeded.fragment.storage.sizeBytes,
          inputHash: seeded.fragment.hashes.sha256,
          async cleanup() {},
        };
      },
    },
    ocrProvider: {
      async process() {
        providerCalls.push('process');
        return { document: structuredClone(DOCUMENT), providerRequestId: null };
      },
    },
    artifactStore: {
      async putProviderArtifact() { return artifact('provider'); },
      async putNormalizedArtifact() { return artifact('normalized'); },
    },
    normalizer: normalizeDocumentAiOcr,
    clock,
    leaseOwnerFactory: () => 'delivery_emulator01',
    supportedVersions: SUPPORTED_VERSIONS,
    providerMetadata: {
      endpointRegion: 'us',
      pricingVersion: 'document-ai-enterprise-ocr-2026-07-17',
      processorAuditId: 'processoraudit_emulator01',
      unitCostMicros: 1_500,
    },
  });
  const task = { ...dispatchCalls[0].payload, taskDeliveryCount: 1 };
  assert.deepEqual(await worker.handle(task), { outcome: 'completed', retryable: false });
  assert.deepEqual(await worker.handle({ ...task, taskDeliveryCount: 2 }), {
    outcome: 'terminal_noop', retryable: false,
  });
  assert.equal(providerCalls.length, 1);

  const [result, reservation, batch] = await Promise.all([
    database.doc(`users/${ownerId}/capabilityResults/${seeded.identity.resultId}`).get(),
    database.doc(`users/${ownerId}/budgetReservations/${seeded.reservation.id}`).get(),
    database.doc(`users/${ownerId}/importBatches/${seeded.batch.id}`).get(),
  ]);
  assert.equal(result.data().outcome, 'completed');
  assert.equal(reservation.data().state, 'settled');
  assert.equal(batch.data().capabilitySummary.completed, 1);
});
