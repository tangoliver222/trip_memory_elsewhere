import {
  cities,
  connections,
  discoveries,
  fragments,
  importBatches,
  scenes,
  userNotes,
  world,
} from './fixtures/data.js';
import { cityRouteIds, indexes } from './fixtures/indexes.js';

export function getCityByRouteId(routeId = 'bangkok') {
  const id = cityRouteIds[routeId];
  return id ? indexes.citiesById[id] : null;
}

export function getJourneyByCity(routeId = 'bangkok') {
  const city = getCityByRouteId(routeId);
  return city ? indexes.journeysById[city.journeyId] : null;
}

export function getCityFragments(routeId = 'bangkok') {
  const city = getCityByRouteId(routeId);
  return city ? fragments.filter((fragment) => fragment.cityId === city.id) : [];
}

export function getSceneFragments(sceneId) {
  const scene = indexes.scenesById[sceneId];
  return scene ? scene.fragmentIds.map((id) => indexes.fragmentsById[id]).filter(Boolean) : [];
}

export function getRelatedNotes(id) {
  return userNotes.filter((note) => note.related.includes(id));
}

export function getFragmentContext(fragmentId) {
  const fragment = indexes.fragmentsById[fragmentId];
  if (!fragment) return null;

  const relatedConnections = connections.filter((connection) => (
    connection.from.includes(fragmentId) || connection.to.includes(fragmentId)
  ));

  return {
    fragment,
    city: indexes.citiesById[fragment.cityId] || null,
    journey: indexes.journeysById[fragment.journeyId] || null,
    scene: indexes.scenesById[fragment.sceneId] || null,
    place: indexes.placesById[fragment.placeId] || null,
    connections: relatedConnections,
    discoveries: discoveries.filter((discovery) => discovery.supportingFragments.includes(fragmentId)),
    userNotes: userNotes.filter((note) => (
      note.related.includes(fragmentId)
      || (fragment.sceneId && note.related.includes(fragment.sceneId))
      || (fragment.placeId && note.related.includes(fragment.placeId))
    )),
  };
}

export function getConnectionContext(connectionId) {
  const connection = indexes.connectionsById[connectionId];
  if (!connection) return null;
  return {
    connection,
    from: connection.from.map((id) => indexes.fragmentsById[id]).filter(Boolean),
    to: connection.to.map((id) => indexes.fragmentsById[id]).filter(Boolean),
    entity: indexes.placesById[connection.toEntityId] || null,
    discoveries: discoveries.filter((discovery) => discovery.connectionIds.includes(connectionId)),
  };
}

export function getDiscoveryContext(discoveryId) {
  const discovery = indexes.discoveriesById[discoveryId];
  if (!discovery) return null;
  return {
    discovery,
    fragments: discovery.supportingFragments.map((id) => indexes.fragmentsById[id]).filter(Boolean),
    connections: discovery.connectionIds.map((id) => indexes.connectionsById[id]).filter(Boolean),
    entity: indexes.placesById[discovery.sharedEntityId] || null,
    userNotes: getRelatedNotes(discoveryId),
  };
}

export const getImportBatch = (id) => indexes.importBatchesById[id] || importBatches[0] || null;

export function getPlaceScenes(placeId) {
  return scenes.filter((scene) => scene.placeId === placeId);
}

export function getElseContext(route, state = {}) {
  const path = typeof route === 'string' ? route.split('?')[0] : route?.path || '#/world';
  const fragmentId = state.selectedFragmentId;

  if (fragmentId) {
    const context = getFragmentContext(fragmentId);
    return {
      scope: fragmentId,
      label: context?.fragment.evidencePreview || '当前碎片',
      suggestedQuestions: ['它属于哪段旅程？', '哪些来源支持这个地点？'],
    };
  }

  const placeMatch = path.match(/^#\/world\/place\/([^/]+)$/);
  if (placeMatch) {
    const place = indexes.placesById[placeMatch[1]];
    if (place) return { scope: place.id, label: place.name, suggestedQuestions: ['哪些到访已确认？', '还有哪些地点缺口？'] };
  }

  const cityMatch = path.match(/^#\/world\/city\/([^/]+)/);
  if (cityMatch) {
    const city = getCityByRouteId(cityMatch[1]);
    if (city) return { scope: city.journeyId, label: `${city.name} · ${city.period}`, suggestedQuestions: ['河边的几次分别是哪一天？', '哪些碎片还没有落点？'] };
  }

  return {
    scope: world.id,
    label: '全部旅行世界',
    suggestedQuestions: ['我反复去过哪里？', '哪些碎片还没有落点？'],
    totals: { cities: cities.length, fragments: world.totalFragments },
  };
}
