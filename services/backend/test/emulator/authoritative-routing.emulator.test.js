import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp as deleteClientApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
} from 'firebase/firestore';
import { createFirebaseAdmin } from '../../src/adapters/firebase.js';
import { buildRoutingCohorts } from '../../src/routing/cohorts.js';
import { createAuthoritativeRouter } from '../../src/routing/service.js';
import { createFirestoreRepository } from '../../src/repositories/firestore.js';
import {
  makeCurrentRoutingFixture,
  makeLargeRoutingFixture,
  makeRoutingEvent,
  makeSmallRoutingFixture,
} from '../fixtures/routing.js';

const enabled = Boolean(
  process.env.FIREBASE_AUTH_EMULATOR_HOST
  && process.env.FIRESTORE_EMULATOR_HOST
  && process.env.FIREBASE_STORAGE_EMULATOR_HOST,
);
const projectId = 'demo-elsewhere';
const ROUTED_AT = '2026-07-17T13:00:00.000Z';

const emulatorAddress = (value) => {
  const url = new URL(`http://${value}`);
  return { host: url.hostname, port: Number(url.port), url: url.origin };
};

async function writeAll(database, entries) {
  for (let offset = 0; offset < entries.length; offset += 200) {
    const write = database.batch();
    for (const [path, value] of entries.slice(offset, offset + 200)) {
      write.set(database.doc(path), value);
    }
    await write.commit();
  }
}

async function seedFixture(database, fixture) {
  const entries = [];
  for (const { batch, processingTasks } of fixture.batches) {
    entries.push([`users/${fixture.ownerId}/importBatches/${batch.id}`, batch]);
    for (const task of processingTasks) {
      entries.push([`users/${fixture.ownerId}/processingTasks/${task.id}`, task]);
    }
  }
  for (const fragment of fixture.fragments) {
    entries.push([`users/${fixture.ownerId}/fragments/${fragment.id}`, fragment]);
  }
  for (const candidate of fixture.duplicateCandidates) {
    entries.push([`users/${fixture.ownerId}/duplicateCandidates/${candidate.id}`, candidate]);
  }
  await writeAll(database, entries);
}

function makeRouter(repository, fixture) {
  return createAuthoritativeRouter({
    repository,
    featureReader: {
      async read(fragment, { signal }) {
        assert.ok(signal instanceof AbortSignal);
        return fixture.features[fragment.id];
      },
    },
    clock: () => ROUTED_AT,
    randomUUID: () => '12345678-1234-4234-8234-123456789abc',
  });
}

async function routeFixture(repository, fixture) {
  const router = makeRouter(repository, fixture);
  const results = [];
  for (const { batch } of fixture.batches) {
    const fragment = fixture.fragments.find(({ batchId }) => batchId === batch.id);
    results.push(await router.handle(makeRoutingEvent(fragment)));
  }
  return { router, results };
}

function assertStableCohorts(fixture, expectedSizes) {
  const build = (fragments, duplicateCandidates) => buildRoutingCohorts({
    fragments,
    duplicateCandidates,
    routerVersion: 'v1',
  });
  const forward = build(fixture.fragments, fixture.duplicateCandidates);
  const reverse = build(
    [...fixture.fragments].reverse(),
    [...fixture.duplicateCandidates].reverse(),
  );
  assert.deepEqual(reverse, forward);
  assert.deepEqual(forward.map(({ memberRevisionRefs }) => memberRevisionRefs.length), expectedSizes);
}

test('Auth Firestore and Storage Emulators verify authoritative routing at 1/12/200 scale', {
  skip: !enabled,
  timeout: 180_000,
}, async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const clientApp = initializeApp({ apiKey: 'demo-api-key', projectId }, `routing-client-${suffix}`);
  const auth = getAuth(clientApp);
  const authAddress = emulatorAddress(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  connectAuthEmulator(auth, authAddress.url, { disableWarnings: true });
  const clientDb = getFirestore(clientApp);
  const firestoreAddress = emulatorAddress(process.env.FIRESTORE_EMULATOR_HOST);
  connectFirestoreEmulator(clientDb, firestoreAddress.host, firestoreAddress.port);
  const credential = await signInAnonymously(auth);
  const ownerIds = [
    credential.user.uid,
    `user_current_${suffix}`.replaceAll('-', '_'),
    `user_large_${suffix}`.replaceAll('-', '_'),
  ];
  const admin = createFirebaseAdmin({ projectId, appName: `routing-admin-${suffix}` });
  const repository = createFirestoreRepository({ db: admin.db });
  const fixtures = [
    makeSmallRoutingFixture({ ownerId: ownerIds[0] }),
    makeCurrentRoutingFixture({ ownerId: ownerIds[1] }),
    makeLargeRoutingFixture({ ownerId: ownerIds[2] }),
  ];

  t.after(async () => {
    for (const ownerId of ownerIds) {
      await admin.db.recursiveDelete(admin.db.doc(`users/${ownerId}`));
    }
    await admin.auth.deleteUser(credential.user.uid).catch(() => {});
    await deleteClientApp(clientApp);
    await deleteAdminApp(admin.app);
  });

  assert.deepEqual(fixtures.map(({ fragments }) => fragments.length), [1, 12, 200]);
  assert.deepEqual(fixtures.map(({ batches }) => batches.length), [1, 1, 4]);
  assert.equal(fixtures[2].batches.every(({ batch }) => batch.inputCount === 50), true);
  assertStableCohorts(fixtures[0], []);
  assertStableCohorts(fixtures[1], [2, 2, 3]);
  assertStableCohorts(fixtures[2], [200]);

  for (const fixture of fixtures) await seedFixture(admin.db, fixture);

  const routed = [];
  for (const fixture of fixtures) routed.push(await routeFixture(repository, fixture));
  assert.deepEqual(routed[0].results, [{ outcome: 'approved' }]);
  assert.equal(routed[1].results.every(({ outcome }) => (
    outcome === 'approved' || outcome === 'completed'
  )), true);
  assert.equal(routed[2].results.every(({ outcome }) => (
    outcome === 'approved' || outcome === 'completed'
  )), true);

  for (const fixture of fixtures) {
    const fragments = await admin.db.collection(`users/${fixture.ownerId}/fragments`).get();
    assert.equal(fragments.size, fixture.fragments.length);
    const plans = await admin.db.collection(`users/${fixture.ownerId}/routePlans`).get();
    assert.equal(plans.size, fixture.fragments.length);
    const beforeReplay = plans.docs.map((snapshot) => snapshot.data())
      .sort((left, right) => left.id.localeCompare(right.id));
    const first = fixture.fragments.find(({ batchId }) => batchId === fixture.batches[0].batch.id);
    assert.deepEqual(await routed[fixtures.indexOf(fixture)].router.handle(makeRoutingEvent(first)), {
      outcome: 'terminal_noop',
    });
    const afterReplay = (await admin.db.collection(`users/${fixture.ownerId}/routePlans`).get())
      .docs.map((snapshot) => snapshot.data())
      .sort((left, right) => left.id.localeCompare(right.id));
    assert.deepEqual(afterReplay, beforeReplay);
  }

  const current = fixtures[1];
  const currentSnapshot = await repository.loadRoutingSnapshot(
    current.ownerId,
    { batchId: current.batches[0].batch.id },
  );
  const supporting = currentSnapshot.routePlans.find(({ representation }) => (
    representation.role === 'supporting'
  ));
  assert.ok(supporting);
  assert.ok(await repository.getFragment(current.ownerId, supporting.fragmentRef.id));

  const small = fixtures[0];
  const firstSmallSnapshot = await repository.loadRoutingSnapshot(
    small.ownerId,
    { batchId: small.batches[0].batch.id },
  );
  assert.equal(firstSmallSnapshot.capabilityExecutions.length, 0);
  const changedFragment = structuredClone(small.fragments[0]);
  changedFragment.storage.generation = `${changedFragment.storage.generation}2`;
  changedFragment.processing.deterministic.taskId = 'task_small_revision2';
  changedFragment.processing.deterministic.updatedAt = ROUTED_AT;
  const changedTask = structuredClone(small.batches[0].processingTasks[0]);
  changedTask.id = changedFragment.processing.deterministic.taskId;
  changedTask.sourceRevision.generation = changedFragment.storage.generation;
  changedTask.updatedAt = ROUTED_AT;
  changedTask.completedAt = ROUTED_AT;
  const changedBatch = structuredClone(small.batches[0].batch);
  changedBatch.uploads[changedFragment.id].finalizedGeneration = changedFragment.storage.generation;
  changedBatch.updatedAt = ROUTED_AT;
  await writeAll(admin.db, [
    [`users/${small.ownerId}/fragments/${changedFragment.id}`, changedFragment],
    [`users/${small.ownerId}/processingTasks/${changedTask.id}`, changedTask],
    [`users/${small.ownerId}/importBatches/${changedBatch.id}`, changedBatch],
  ]);
  const revisedFixture = {
    ...small,
    fragments: [changedFragment],
    features: { [changedFragment.id]: small.features[small.fragments[0].id] },
  };
  const revisionRouter = makeRouter(repository, revisedFixture);
  assert.deepEqual(await revisionRouter.handle(makeRoutingEvent(changedFragment)), {
    outcome: 'approved',
  });
  const revisedSnapshot = await repository.loadRoutingSnapshot(
    small.ownerId,
    { batchId: changedBatch.id },
  );
  const currentHead = revisedSnapshot.routingHeads[0];
  assert.equal(currentHead.currentRevision, 2);
  assert.equal(currentHead.sourceRevision.generation, changedFragment.storage.generation);
  const currentPlan = revisedSnapshot.routePlans.find(({ id }) => id === currentHead.currentPlanRef.id);
  assert.equal(revisedSnapshot.capabilityExecutions.length, 0);

  assert.equal(currentPlan.capabilities.embedding.decision, 'approved');
  assert.equal(revisedSnapshot.budgetReservations.length > 0, true);
  const ledgers = await admin.db.collection(`users/${small.ownerId}/budgetLedgers`).get();
  assert.equal(ledgers.docs.every((snapshot) => snapshot.data().spentMicros === 0), true);
  assert.equal(ledgers.docs.some((snapshot) => snapshot.data().reservedMicros > 0), true);

  const visibleFragment = await getDoc(doc(
    clientDb,
    `users/${small.ownerId}/fragments/${changedFragment.id}`,
  ));
  assert.equal(visibleFragment.exists(), true);
  await assert.rejects(
    () => getDoc(doc(clientDb, `users/${small.ownerId}/routePlans/${currentPlan.id}`)),
    (error) => error.code === 'permission-denied',
  );
});
