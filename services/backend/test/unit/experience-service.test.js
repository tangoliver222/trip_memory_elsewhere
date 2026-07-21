import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperienceService } from '../../src/experience/service.js';

function harness() {
  const calls = [];
  const ownerState = Object.freeze({
    revision: 2,
    reviewDecisions: Object.freeze({
      'inbox-place-frag_12345678': Object.freeze({
        decision: 'later',
        decidedAt: '2026-07-21T01:00:00.000Z',
      }),
    }),
    connectionDecisions: Object.freeze({}),
    savedDiscoveryIds: Object.freeze([]),
    notes: Object.freeze({}),
    settings: Object.freeze({}),
    excludedJourneyIds: Object.freeze([]),
    updatedAt: '2026-07-21T01:00:00.000Z',
  });
  const memory = Object.freeze({
    fragments: Object.freeze([{ id: 'frag_12345678', ownerId: 'user_alpha' }]),
    importBatches: Object.freeze([{ id: 'batch_12345678', ownerId: 'user_alpha' }]),
  });
  const memorySnapshotReader = Object.freeze({
    async readOwnerSnapshot(ownerId) {
      calls.push(['readMemory', ownerId]);
      return memory;
    },
  });
  const stateRepository = Object.freeze({
    async read(ownerId) {
      calls.push(['readState', ownerId]);
      return ownerState;
    },
    async apply(ownerId, command) {
      calls.push(['apply', ownerId, command]);
      return Object.freeze({ ...ownerState, revision: ownerState.revision + 1 });
    },
  });
  const projectSnapshot = (input) => {
    calls.push(['project', input]);
    return Object.freeze({ revision: 'projected', world: Object.freeze({ totalFragments: 1 }) });
  };
  const service = createExperienceService({
    memorySnapshotReader,
    stateRepository,
    projectSnapshot,
    clock: () => '2026-07-21T02:00:00.000Z',
  });
  return { service, calls, ownerState };
}

test('experience snapshot combines deterministic owner memory with persisted user state', async () => {
  const { service, calls, ownerState } = harness();

  const snapshot = await service.getSnapshot('user_alpha');

  assert.equal(snapshot.revision, 'projected');
  assert.deepEqual(snapshot.userState, ownerState);
  assert.deepEqual(calls.slice(0, 2), [
    ['readMemory', 'user_alpha'],
    ['readState', 'user_alpha'],
  ]);
  const projectionInput = calls.find(([name]) => name === 'project')[1];
  assert.equal(projectionInput.ownerId, 'user_alpha');
  assert.equal(projectionInput.fragments[0].id, 'frag_12345678');
  assert.deepEqual(projectionInput.decisions, ownerState.reviewDecisions);
});

test('experience mutations compile explicit server-timestamped repository commands', async () => {
  const { service, calls } = harness();

  await service.saveReview('user_alpha', {
    itemId: 'inbox-place-frag_12345678', decision: 'yes', placeId: 'place-common-grounds',
  });
  await service.saveConnection('user_alpha', {
    connectionId: 'connection_12345678', decision: 'rejected',
  });
  await service.saveDiscovery('user_alpha', { discoveryId: 'discovery_12345678', saved: true });
  await service.saveNote('user_alpha', { noteId: 'note_12345678', text: '私人文字' });
  await service.saveSetting('user_alpha', { key: 'aiTone', value: 'fact' });
  await service.excludeJourney('user_alpha', { journeyId: 'journey_12345678' });

  const commands = calls.filter(([name]) => name === 'apply').map(([, ownerId, command]) => ({
    ownerId, command,
  }));
  assert.deepEqual(commands, [
    {
      ownerId: 'user_alpha',
      command: {
        type: 'review', id: 'inbox-place-frag_12345678',
        value: { decision: 'yes', placeId: 'place-common-grounds' },
        updatedAt: '2026-07-21T02:00:00.000Z',
      },
    },
    {
      ownerId: 'user_alpha',
      command: {
        type: 'connection', id: 'connection_12345678', value: { decision: 'rejected' },
        updatedAt: '2026-07-21T02:00:00.000Z',
      },
    },
    {
      ownerId: 'user_alpha',
      command: {
        type: 'discovery', id: 'discovery_12345678', value: { saved: true },
        updatedAt: '2026-07-21T02:00:00.000Z',
      },
    },
    {
      ownerId: 'user_alpha',
      command: {
        type: 'note', id: 'note_12345678', value: { text: '私人文字' },
        updatedAt: '2026-07-21T02:00:00.000Z',
      },
    },
    {
      ownerId: 'user_alpha',
      command: {
        type: 'setting', id: 'aiTone', value: { value: 'fact' },
        updatedAt: '2026-07-21T02:00:00.000Z',
      },
    },
    {
      ownerId: 'user_alpha',
      command: {
        type: 'exclude_journey', id: 'journey_12345678', value: {},
        updatedAt: '2026-07-21T02:00:00.000Z',
      },
    },
  ]);
});
