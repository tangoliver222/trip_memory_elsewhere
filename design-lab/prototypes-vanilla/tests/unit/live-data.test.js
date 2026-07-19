import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cities,
  fragments,
  world,
} from '../../src/fixtures/data.js';
import { createSemanticTarget } from '../../src/visual/particle-targets.js';
import { renderRoute } from '../../src/pages/render-route.js';
import { createInitialState } from '../../src/store.js';
import { hydrateLiveCollections } from '../../src/data/live-hydrator.js';
import {
  bootstrapLiveData,
  runtimeState,
} from '../../src/data/runtime.js';

function snapshotWith(ids) {
  const projectedFragments = ids.map((id, index) => ({
    id,
    ownerId: 'user_demo',
    batchId: 'batch_demo0001',
    type: index === ids.length - 1 ? 'receipt' : 'photo',
    status: index === ids.length - 1 ? 'unresolved' : 'placed',
    originalName: `${id}.jpg`,
    originalPath: `users/user_demo/originals/batch_demo0001/${id}`,
    thumbnailPath: `users/user_demo/derived/${id}/thumbnail.webp`,
    capturedAt: `2024-10-${String(index + 12).padStart(2, '0')}T01:20:00.000Z`,
    localDate: `2024-10-${String(index + 12).padStart(2, '0')}`,
    geo: { lat: 13.7791, lng: 100.5443 },
    placeId: 'place-common-grounds',
    placeName: 'Common Grounds',
    placeDistanceMeters: 2,
    cityId: 'city-bangkok',
    sourceIds: [id],
  }));
  return {
    ownerId: 'user_demo',
    revision: `revision-${ids.length}`,
    world: {
      totalFragments: ids.length,
      totalCities: ids.length > 0 ? 1 : 0,
      totalPlaces: ids.length > 0 ? 1 : 0,
      placedFragments: ids.length,
      unplacedFragments: 0,
      sourceIds: ids,
    },
    cities: ids.length > 0 ? [{
      id: 'city-bangkok',
      name: 'Bangkok',
      country: 'Thailand',
      fragmentCount: ids.length,
      placeCount: 1,
      sourceIds: ids,
    }] : [],
    fragments: projectedFragments,
    importBatches: [],
    places: ids.length > 0 ? [{
      id: 'place-common-grounds',
      name: 'Common Grounds',
      area: 'Ari',
      lat: 13.7791,
      lng: 100.5443,
      cityId: 'city-bangkok',
      fragmentCount: ids.length,
      sourceIds: ids,
    }] : [],
    visits: ids.map((id, index) => ({
      id: `visit-${index}`,
      placeId: 'place-common-grounds',
      placeName: 'Common Grounds',
      startedAt: projectedFragments[index].capturedAt,
      endedAt: projectedFragments[index].capturedAt,
      fragmentCount: 1,
      sourceIds: [id],
    })),
    connections: [],
    inboxItems: [],
    discoveries: [],
  };
}

test('live mode never silently returns fixture data after a failed bootstrap', async () => {
  await assert.rejects(() => bootstrapLiveData({
    fetchSnapshot: async () => { throw new Error('offline'); },
  }), /offline/);

  assert.equal(runtimeState.status, 'error');
  assert.equal(runtimeState.snapshot, null);
});

test('hydration changes world counts and fragment identities from the snapshot', () => {
  const snapshot = snapshotWith(['frag_real_1', 'frag_real_2']);
  hydrateLiveCollections(snapshot);

  assert.deepEqual(fragments.map(({ id }) => id), ['frag_real_1', 'frag_real_2']);
  assert.equal(world.totalFragments, 2);
  assert.deepEqual(cities.map(({ id }) => id), ['city-bangkok']);
});

test('storage identities remain paths until the Firebase client resolves them', () => {
  const snapshot = snapshotWith(['frag_real_path']);
  hydrateLiveCollections(snapshot);

  assert.equal(fragments[0].storagePath, snapshot.fragments[0].originalPath);
  assert.equal(fragments[0].thumbnailStoragePath, snapshot.fragments[0].thumbnailPath);
  assert.equal(fragments[0].asset, null);
});

test('particle targets consume the changed live collections', () => {
  hydrateLiveCollections(snapshotWith(['frag_particle_a']));
  const oneCityTarget = createSemanticTarget('globe', 120);
  hydrateLiveCollections(snapshotWith([]));
  const emptyTarget = createSemanticTarget('globe', 120);

  assert.notDeepEqual([...oneCityTarget], [...emptyTarget]);
});

test('live World and Fragment Field copy contains no frozen fixture totals', () => {
  hydrateLiveCollections(snapshotWith(['frag_live_a', 'frag_live_b']));
  const state = createInitialState({ runtime: { mode: 'live' } });
  const worldHtml = renderRoute('#/world', state).html;
  const fieldHtml = renderRoute('#/world/fragments', state).html;

  assert.match(worldHtml, /1 座城市/);
  assert.match(worldHtml, /2 个碎片/);
  assert.doesNotMatch(worldHtml, /三座城市/);
  assert.match(fieldHtml, /Bangkok · 2 碎片/);
  assert.doesNotMatch(fieldHtml, /172 个碎片|Tokyo · 81|Chiang Mai · 28/);
});
