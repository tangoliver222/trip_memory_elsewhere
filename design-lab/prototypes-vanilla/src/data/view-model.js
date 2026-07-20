import {
  cities,
  connections,
  discoveries,
  fragments,
  places,
  processingItems,
  reviewQueue,
  scenes,
  userNotes,
  world,
} from '../fixtures/data.js';

export function currentMemoryCatalog() {
  return {
    world,
    cities,
    fragments,
    places,
    scenes,
    connections,
    discoveries,
    reviewQueue,
    processingItems,
    userNotes,
  };
}

const normalized = (value) => String(value || '').trim().toLowerCase();

function fragmentClusterKey(fragment, catalog) {
  if (fragment.placeId) return fragment.placeId;
  const candidate = normalized(fragment.placeCandidate);
  const candidatePlace = catalog.places.find((place) => candidate.includes(normalized(place.name)));
  if (candidatePlace) return candidatePlace.id;
  return fragment.sceneId || 'unplaced';
}

function buildClusters(cityFragments, catalog) {
  const groups = new Map();
  for (const fragment of cityFragments) {
    const key = fragmentClusterKey(fragment, catalog);
    const group = groups.get(key) || [];
    group.push(fragment);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([id, members]) => {
      const place = catalog.places.find((item) => item.id === id) || null;
      const scene = catalog.scenes.find((item) => item.id === id) || null;
      const unresolved = members.filter(({ status }) => ['unresolved', 'suggested', 'conflicted'].includes(status)).length;
      return {
        id,
        label: place?.name || scene?.label || '地点待确认',
        detail: unresolved > 0
          ? `${members.length} 个碎片 · ${unresolved} 个待确认`
          : `${members.length} 个碎片`,
        status: unresolved > 0 ? 'unresolved' : 'confirmed',
        fragments: members,
      };
    })
    .sort((left, right) => right.fragments.length - left.fragments.length || left.id.localeCompare(right.id));
}

function buildCityContext(routeId, catalog) {
  const routeKey = normalized(routeId);
  const city = catalog.cities.find((item) => (
    normalized(item.slug) === routeKey
    || normalized(item.id) === routeKey
    || normalized(item.name) === routeKey
  ));
  if (!city) return null;

  const cityFragments = catalog.fragments.filter((fragment) => fragment.cityId === city.id);
  const fragmentIds = new Set(cityFragments.map(({ id }) => id));
  const cityScenes = catalog.scenes.filter((scene) => (
    scene.journeyId === city.journeyId
    || scene.fragmentIds?.some((id) => fragmentIds.has(id))
    || scene.sourceIds?.some((id) => fragmentIds.has(id))
  ));
  const sceneIds = new Set(cityScenes.map(({ id }) => id));
  const placeIds = new Set(cityFragments.map(({ placeId }) => placeId).filter(Boolean));
  const cityPlaces = catalog.places.filter((place) => (
    place.journeyId === city.journeyId || placeIds.has(place.id)
  ));
  const selectedPlaceIds = new Set(cityPlaces.map(({ id }) => id));
  const cityConnections = catalog.connections.filter((connection) => (
    connection.from?.some((id) => fragmentIds.has(id))
    || connection.to?.some((id) => fragmentIds.has(id))
    || selectedPlaceIds.has(connection.toEntityId)
  ));
  const cityDiscoveries = catalog.discoveries.filter((discovery) => (
    discovery.supportingFragments?.some((id) => fragmentIds.has(id))
    || selectedPlaceIds.has(discovery.sharedEntityId)
  ));
  const relatedIds = new Set([
    city.id,
    city.journeyId,
    ...fragmentIds,
    ...sceneIds,
    ...selectedPlaceIds,
    ...cityConnections.map(({ id }) => id),
    ...cityDiscoveries.map(({ id }) => id),
  ]);

  return {
    city,
    fragments: cityFragments,
    places: cityPlaces,
    scenes: cityScenes,
    connections: cityConnections,
    discoveries: cityDiscoveries,
    notes: catalog.userNotes.filter((note) => note.related?.some((id) => relatedIds.has(id))),
    clusters: buildClusters(cityFragments, catalog),
  };
}

export function createMemoryView(catalog = currentMemoryCatalog()) {
  const counts = {
    cities: Number(catalog.world.totalCities ?? catalog.cities.length),
    fragments: Number(catalog.world.totalFragments ?? catalog.fragments.length),
    connections: Number(catalog.world.totalConnections ?? catalog.connections.length),
  };
  const recommendedCity = catalog.cities.find(({ id }) => id === catalog.world.recommendedCityId)
    || catalog.cities[0]
    || null;
  const statusItems = [
    { key: 'review', count: catalog.reviewQueue.length, label: '个连接待判断' },
    { key: 'discoveries', count: catalog.discoveries.filter(({ status }) => status === 'new').length, label: '条新发现' },
    { key: 'processing', count: catalog.processingItems.length, label: '组内容正在整理' },
  ].filter(({ count }) => count > 0);

  return {
    world: {
      counts,
      hasFragments: counts.fragments > 0,
      recommendedCity,
      cities: catalog.cities,
      statusItems,
      particleItems: catalog.cities.map((city) => ({
        id: city.id,
        role: 'city',
        clusterId: city.id,
        status: city.status?.[0],
        weight: Math.max(1, city.fragmentCount || 1),
      })),
    },
    city: (routeId) => buildCityContext(routeId, catalog),
  };
}

export const getMemoryView = () => createMemoryView();
