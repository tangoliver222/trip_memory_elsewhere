import {
  cities,
  connections,
  discoveries,
  fragments,
  importBatches,
  journeys,
  places,
  scenes,
  userNotes,
  world,
} from './data.js';

function indexById(collection, name) {
  const result = {};
  for (const item of collection) {
    if (!item?.id) throw new Error(`${name} contains a record without id`);
    if (result[item.id]) throw new Error(`${name} contains duplicate id ${item.id}`);
    result[item.id] = item;
  }
  return Object.freeze(result);
}

export const indexes = {};
export const cityRouteIds = {};
let knownIds = new Set();

export function rebuildFixtureIndexes() {
  Object.assign(indexes, {
    citiesById: indexById(cities, 'cities'),
    journeysById: indexById(journeys, 'journeys'),
    fragmentsById: indexById(fragments, 'fragments'),
    scenesById: indexById(scenes, 'scenes'),
    placesById: indexById(places, 'places'),
    connectionsById: indexById(connections, 'connections'),
    discoveriesById: indexById(discoveries, 'discoveries'),
    importBatchesById: indexById(importBatches, 'importBatches'),
    userNotesById: indexById(userNotes, 'userNotes'),
  });
  for (const key of Object.keys(cityRouteIds)) delete cityRouteIds[key];
  Object.assign(cityRouteIds, Object.fromEntries(
    cities.flatMap((city) => [[city.id, city.id], [city.slug, city.id]]),
  ));
  knownIds = new Set([
    world.id,
    ...Object.values(indexes).flatMap((index) => Object.keys(index)),
  ]);
}

rebuildFixtureIndexes();

const missing = (problems, collection, id, field, value) => {
  if (value && !knownIds.has(value)) problems.push({ collection, id, field, missing: value });
};

export function validateDataGraph() {
  const problems = [];

  missing(problems, 'world', world.id, 'recommendedCityId', world.recommendedCityId);

  for (const city of cities) missing(problems, 'cities', city.id, 'journeyId', city.journeyId);
  for (const journey of journeys) missing(problems, 'journeys', journey.id, 'cityId', journey.cityId);

  for (const fragment of fragments) {
    missing(problems, 'fragments', fragment.id, 'cityId', fragment.cityId);
    missing(problems, 'fragments', fragment.id, 'journeyId', fragment.journeyId);
    missing(problems, 'fragments', fragment.id, 'sceneId', fragment.sceneId);
    missing(problems, 'fragments', fragment.id, 'placeId', fragment.placeId);
  }

  for (const scene of scenes) {
    missing(problems, 'scenes', scene.id, 'journeyId', scene.journeyId);
    missing(problems, 'scenes', scene.id, 'placeId', scene.placeId);
    scene.fragmentIds.forEach((id) => missing(problems, 'scenes', scene.id, 'fragmentIds', id));
  }

  for (const place of places) {
    missing(problems, 'places', place.id, 'journeyId', place.journeyId);
    place.sourceIds.forEach((id) => missing(problems, 'places', place.id, 'sourceIds', id));
  }

  for (const connection of connections) {
    [...connection.from, ...connection.to].forEach((id) => missing(problems, 'connections', connection.id, 'nodes', id));
    missing(problems, 'connections', connection.id, 'toEntityId', connection.toEntityId);
  }

  for (const discovery of discoveries) {
    discovery.supportingFragments.forEach((id) => missing(problems, 'discoveries', discovery.id, 'supportingFragments', id));
    discovery.connectionIds.forEach((id) => missing(problems, 'discoveries', discovery.id, 'connectionIds', id));
    missing(problems, 'discoveries', discovery.id, 'sharedEntityId', discovery.sharedEntityId);
  }

  for (const batch of importBatches) {
    missing(problems, 'importBatches', batch.id, 'journeyCandidate', batch.journeyCandidate);
    batch.representativeFragmentIds.forEach((id) => missing(problems, 'importBatches', batch.id, 'representativeFragmentIds', id));
  }

  for (const note of userNotes) note.related.forEach((id) => missing(problems, 'userNotes', note.id, 'related', id));

  return problems;
}
