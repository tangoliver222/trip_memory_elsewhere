import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  cities,
  connections,
  discoveries,
  fragments,
  importBatches,
  scenes,
} from '../../src/fixtures/data.js';
import { indexes, validateDataGraph } from '../../src/fixtures/indexes.js';
import { getCityByRouteId, getFragmentContext } from '../../src/selectors.js';

test('canonical totals agree with the authority fixtures', () => {
  assert.deepEqual(cities.map((city) => city.fragmentCount), [63, 28, 81]);
  assert.deepEqual(cities.map((city) => city.placeCount), [11, 7, 14]);
  assert.equal(importBatches[0].result.connections, 1);
});

test('representative records never pretend to be the complete collection', () => {
  assert.equal(fragments.length, 9);
  assert.equal(cities.reduce((total, city) => total + city.fragmentCount, 0), 172);
});

test('production originals are local or explicit required assets', () => {
  for (const fragment of fragments) {
    assert.equal(fragment.asset?.startsWith('http') ?? false, false, fragment.id);
    assert.ok(fragment.asset || fragment.requiredAsset, fragment.id);
  }
});

test('every declared local original exists in the canonical public package', () => {
  for (const fragment of fragments.filter((item) => item.asset)) {
    const file = new URL(`../../public${fragment.asset}`, import.meta.url);
    assert.equal(existsSync(file), true, fragment.asset);
  }
});

test('derived observations stay factual and avoid unsupported sensory or emotional claims', () => {
  const derivedCopy = [...scenes, ...discoveries]
    .map((item) => item.observation || item.fact || '')
    .join('\n');
  assert.doesNotMatch(derivedCopy, /香气|暖风|宁静|独自|治愈|完美|心境|余温|生活的重复频率/);
});

test('connections use only canonical relation states', () => {
  const allowed = new Set(['confirmed', 'suggested', 'unresolved', 'conflicted']);
  for (const connection of connections) assert.ok(allowed.has(connection.status), connection.id);
});

test('all required canonical indexes resolve their collections', () => {
  assert.equal(Object.keys(indexes.citiesById).length, cities.length);
  assert.equal(Object.keys(indexes.fragmentsById).length, fragments.length);
  assert.equal(Object.keys(indexes.connectionsById).length, connections.length);
  assert.equal(Object.keys(indexes.discoveriesById).length, discoveries.length);
  assert.deepEqual(validateDataGraph(), []);
});

test('selectors resolve route slugs and complete fragment context', () => {
  const city = getCityByRouteId('bangkok');
  assert.ok(city);
  assert.equal(city.id, 'city-bangkok-2024-autumn');
  const context = getFragmentContext('frag-river-1018-photo');
  assert.ok(context);
  assert.equal(context.city.localizedName, '曼谷');
  assert.equal(context.scene.id, 'scene-river-evening');
  assert.equal(context.place.id, 'place-chao-phraya-ferry');
  assert.deepEqual(context.connections.map((item) => item.id), ['rel-river-ticket-photo']);
});
