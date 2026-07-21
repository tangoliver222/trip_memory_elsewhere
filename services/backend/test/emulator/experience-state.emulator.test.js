import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirestoreExperienceState } from '../../src/experience/firestore-state.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

test('experience state is owner-scoped, transactional and idempotent', {
  skip: !enabled,
  concurrency: false,
}, async (t) => {
  const app = initializeApp(
    { projectId: 'demo-elsewhere' },
    `experience-state-${process.pid}-${Date.now()}`,
  );
  const db = getFirestore(app);
  const ownerA = 'user_experience01';
  const ownerB = 'user_experience02';
  await Promise.all([
    db.recursiveDelete(db.doc(`users/${ownerA}`)),
    db.recursiveDelete(db.doc(`users/${ownerB}`)),
  ]);
  t.after(async () => {
    await Promise.all([
      db.recursiveDelete(db.doc(`users/${ownerA}`)),
      db.recursiveDelete(db.doc(`users/${ownerB}`)),
    ]);
    await deleteApp(app);
  });

  const repository = createFirestoreExperienceState({ db });
  const empty = await repository.read(ownerA);
  assert.equal(empty.revision, 0);
  assert.deepEqual(empty.savedDiscoveryIds, []);

  const commands = [
    {
      type: 'review', id: 'inbox-place-frag_12345678',
      value: { decision: 'yes', placeId: 'place-common-grounds' },
      updatedAt: '2026-07-21T02:00:00.000Z',
    },
    {
      type: 'connection', id: 'connection_12345678', value: { decision: 'confirmed' },
      updatedAt: '2026-07-21T02:00:01.000Z',
    },
    {
      type: 'discovery', id: 'discovery_12345678', value: { saved: true },
      updatedAt: '2026-07-21T02:00:02.000Z',
    },
    {
      type: 'note', id: 'note_12345678', value: { text: '私人文字' },
      updatedAt: '2026-07-21T02:00:03.000Z',
    },
    {
      type: 'setting', id: 'aiTone', value: { value: 'fact' },
      updatedAt: '2026-07-21T02:00:04.000Z',
    },
    {
      type: 'exclude_journey', id: 'journey_12345678', value: {},
      updatedAt: '2026-07-21T02:00:05.000Z',
    },
  ];

  await Promise.all(commands.map((command) => repository.apply(ownerA, command)));
  const stored = await repository.read(ownerA);
  assert.equal(stored.revision, commands.length);
  assert.equal(stored.reviewDecisions['inbox-place-frag_12345678'].decision, 'yes');
  assert.equal(stored.connectionDecisions.connection_12345678.decision, 'confirmed');
  assert.deepEqual(stored.savedDiscoveryIds, ['discovery_12345678']);
  assert.equal(stored.notes.note_12345678.text, '私人文字');
  assert.equal(stored.settings.aiTone, 'fact');
  assert.deepEqual(stored.excludedJourneyIds, ['journey_12345678']);
  assert.equal((await repository.read(ownerB)).revision, 0);

  const repeated = await repository.apply(ownerA, commands[2]);
  assert.equal(repeated.revision, commands.length);
  assert.deepEqual(repeated.savedDiscoveryIds, ['discovery_12345678']);

  const persisted = await db.doc(`users/${ownerA}/experienceState/current`).get();
  assert.equal(persisted.exists, true);
  assert.equal(JSON.stringify(persisted.data()).includes(ownerB), false);
});
