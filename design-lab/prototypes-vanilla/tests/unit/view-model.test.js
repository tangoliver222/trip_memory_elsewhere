import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryView } from '../../src/data/view-model.js';
import { createDevScenarioSnapshot, readDevScenario } from '../../src/data/dev-scenarios.js';

const fragment = (id, cityId, placeId, sceneId, status = 'confirmed') => ({
  id,
  cityId,
  placeId,
  sceneId,
  status,
  type: 'photo',
  capturedAt: '2026-07-20T08:30:00+07:00',
  evidencePreview: id,
});

const city = (id, slug, fragmentCount) => ({
  id,
  slug,
  journeyId: `journey-${id}`,
  name: slug.toUpperCase(),
  localizedName: slug,
  period: '2026 夏',
  fragmentCount,
  placeCount: 1,
  coordinates: { lat: 10, lng: 20 },
  sourceIds: [],
});

function catalog({ cityCount = 0, fragmentsPerCity = 0 } = {}) {
  const cities = Array.from({ length: cityCount }, (_, index) => city(`city-${index}`, `city-${index}`, fragmentsPerCity));
  const fragments = cities.flatMap((entry, cityIndex) => Array.from(
    { length: fragmentsPerCity },
    (_, fragmentIndex) => fragment(
      `fragment-${cityIndex}-${fragmentIndex}`,
      entry.id,
      `place-${cityIndex}`,
      `scene-${cityIndex}-${fragmentIndex}`,
      fragmentIndex === fragmentsPerCity - 1 ? 'unresolved' : 'confirmed',
    ),
  ));
  const places = cities.map((entry, index) => ({
    id: `place-${index}`,
    journeyId: entry.journeyId,
    name: `Place ${index}`,
    status: 'confirmed',
    visitCount: fragmentsPerCity,
    sourceIds: fragments.filter(({ cityId }) => cityId === entry.id).map(({ id }) => id),
  }));
  const scenes = fragments.map((entry) => ({
    id: entry.sceneId,
    journeyId: cities.find(({ id }) => id === entry.cityId)?.journeyId,
    placeId: entry.placeId,
    fragmentIds: [entry.id],
    sourceIds: [entry.id],
    date: entry.capturedAt.slice(0, 10),
    status: entry.status,
  }));
  const connections = cities.map((entry, index) => ({
    id: `connection-${index}`,
    from: fragments.filter(({ cityId }) => cityId === entry.id).slice(0, 1).map(({ id }) => id),
    to: fragments.filter(({ cityId }) => cityId === entry.id).slice(1, 2).map(({ id }) => id),
    toEntityId: `place-${index}`,
    status: 'confirmed',
    evidence: ['fixture source'],
  }));
  return {
    world: {
      id: 'world-private',
      totalCities: cities.length,
      totalFragments: fragments.length,
      totalConnections: connections.length,
      recommendedCityId: cities[0]?.id ?? null,
    },
    cities,
    fragments,
    places,
    scenes,
    connections,
    discoveries: [],
    reviewQueue: [],
    processingItems: [],
    userNotes: [],
  };
}

test('memory view represents an empty world without invented cities or totals', () => {
  const view = createMemoryView(catalog());

  assert.equal(view.world.hasFragments, false);
  assert.equal(view.world.recommendedCity, null);
  assert.deepEqual(view.world.counts, { cities: 0, fragments: 0, connections: 0 });
  assert.deepEqual(view.world.statusItems, []);
  assert.equal(view.city('city-0'), null);
});

test('memory view scopes every city object to the selected city', () => {
  const view = createMemoryView(catalog({ cityCount: 2, fragmentsPerCity: 3 }));
  const selected = view.city('city-1');

  assert.equal(selected.city.id, 'city-1');
  assert.deepEqual(selected.fragments.map(({ cityId }) => cityId), ['city-1', 'city-1', 'city-1']);
  assert.deepEqual(selected.places.map(({ id }) => id), ['place-1']);
  assert.deepEqual(selected.scenes.map(({ id }) => id), ['scene-1-0', 'scene-1-1', 'scene-1-2']);
  assert.deepEqual(selected.connections.map(({ id }) => id), ['connection-1']);
  assert.equal(selected.clusters.reduce((sum, group) => sum + group.fragments.length, 0), 3);
});

test('memory view never falls back to another city for an unknown route', () => {
  const view = createMemoryView(catalog({ cityCount: 2, fragmentsPerCity: 2 }));

  assert.equal(view.city('missing-city'), null);
  assert.equal(view.city('CITY-0')?.city.id, 'city-0');
});

test('world density inputs change with small and dense catalogs', () => {
  const small = createMemoryView(catalog({ cityCount: 1, fragmentsPerCity: 1 }));
  const dense = createMemoryView(catalog({ cityCount: 4, fragmentsPerCity: 24 }));

  assert.deepEqual(small.world.counts, { cities: 1, fragments: 1, connections: 1 });
  assert.deepEqual(dense.world.counts, { cities: 4, fragments: 96, connections: 4 });
  assert.ok(dense.world.particleItems.length > small.world.particleItems.length);
});

test('development scenarios expose empty, small and dense snapshots only in development', () => {
  assert.equal(readDevScenario({ DEV: true }, '?__scenario=empty'), 'empty');
  assert.equal(readDevScenario({ DEV: false }, '?__scenario=dense'), null);
  assert.equal(readDevScenario({ DEV: true }, '?__scenario=unknown'), null);

  assert.equal(createDevScenarioSnapshot('empty').world.totalFragments, 0);
  assert.equal(createDevScenarioSnapshot('small').world.totalFragments, 3);
  assert.equal(createDevScenarioSnapshot('dense').world.totalFragments, 72);
});
