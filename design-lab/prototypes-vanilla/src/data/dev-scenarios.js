import { hydrateLiveCollections } from './live-hydrator.js';

const validScenarios = new Set(['empty', 'small', 'dense']);
const cityBlueprints = [
  { id: 'city-bangkok', name: 'Bangkok', country: 'Thailand', lat: 13.7563, lng: 100.5018 },
  { id: 'city-tokyo', name: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503 },
  { id: 'city-lisbon', name: 'Lisbon', country: 'Portugal', lat: 38.7223, lng: -9.1393 },
  { id: 'city-kyoto', name: 'Kyoto', country: 'Japan', lat: 35.0116, lng: 135.7681 },
];
const fragmentTypes = ['photo', 'receipt', 'screenshot', 'menu', 'text'];
const bangkokAssets = [
  '/assets/bangkok-photo-04-ari-coffee.png',
  '/assets/bangkok-photo-01-ari-morning.jpg',
  '/assets/bangkok-photo-02-riverside.jpg',
];

export function readDevScenario(environment, search = '') {
  if (!environment?.DEV) return null;
  const value = new URLSearchParams(search).get('__scenario');
  return validScenarios.has(value) ? value : null;
}

function emptySnapshot() {
  return {
    ownerId: 'visual-scenario',
    revision: 'scenario-empty',
    world: {
      totalFragments: 0,
      totalCities: 0,
      totalPlaces: 0,
      placedFragments: 0,
      unplacedFragments: 0,
      sourceIds: [],
    },
    cities: [],
    fragments: [],
    importBatches: [],
    places: [],
    visits: [],
    connections: [],
    inboxItems: [],
    discoveries: [],
  };
}

function populatedSnapshot(cityCount, fragmentsPerCity, name) {
  const selectedCities = cityBlueprints.slice(0, cityCount);
  const fragments = [];
  const places = [];
  const visits = [];
  const connections = [];
  const discoveries = [];

  for (const [cityIndex, city] of selectedCities.entries()) {
    const cityFragments = [];
    const placeCount = Math.min(3, Math.max(1, Math.ceil(fragmentsPerCity / 6)));
    for (let placeIndex = 0; placeIndex < placeCount; placeIndex += 1) {
      const placeId = `place-${name}-${cityIndex}-${placeIndex}`;
      const placeSourceIds = [];
      const fragmentsForPlace = Math.ceil(fragmentsPerCity / placeCount);
      for (let localIndex = 0; localIndex < fragmentsForPlace && cityFragments.length < fragmentsPerCity; localIndex += 1) {
        const fragmentIndex = cityFragments.length;
        const fragmentId = `fragment-${name}-${cityIndex}-${fragmentIndex}`;
        const day = String(12 + (fragmentIndex % 10)).padStart(2, '0');
        const source = {
          id: fragmentId,
          ownerId: 'visual-scenario',
          batchId: `batch-${name}`,
          type: fragmentTypes[fragmentIndex % fragmentTypes.length],
          status: fragmentIndex % 7 === 6 ? 'unresolved' : 'placed',
          originalName: `${fragmentId}.jpg`,
          originalPath: `visual/${fragmentId}`,
          thumbnailPath: `visual/${fragmentId}/thumbnail.webp`,
          resolvedThumbnailUrl: cityIndex === 0 ? bangkokAssets[fragmentIndex % bangkokAssets.length] : null,
          capturedAt: `2026-07-${day}T${String(8 + (fragmentIndex % 9)).padStart(2, '0')}:30:00+07:00`,
          localDate: `2026-07-${day}`,
          geo: { lat: city.lat + placeIndex * 0.002, lng: city.lng + placeIndex * 0.002 },
          placeId,
          placeName: `${city.name} Place ${placeIndex + 1}`,
          placeDistanceMeters: 4,
          cityId: city.id,
          sourceIds: [fragmentId],
        };
        fragments.push(source);
        cityFragments.push(source);
        placeSourceIds.push(fragmentId);
      }
      places.push({
        id: placeId,
        name: `${city.name} Place ${placeIndex + 1}`,
        area: city.name,
        lat: city.lat + placeIndex * 0.002,
        lng: city.lng + placeIndex * 0.002,
        cityId: city.id,
        fragmentCount: placeSourceIds.length,
        sourceIds: placeSourceIds,
      });
      visits.push({
        id: `visit-${name}-${cityIndex}-${placeIndex}`,
        placeId,
        placeName: `${city.name} Place ${placeIndex + 1}`,
        startedAt: fragments.find(({ id }) => id === placeSourceIds[0])?.capturedAt,
        endedAt: fragments.find(({ id }) => id === placeSourceIds.at(-1))?.capturedAt,
        fragmentCount: placeSourceIds.length,
        sourceIds: placeSourceIds,
      });
    }
    const sourceIds = cityFragments.map(({ id }) => id);
    if (sourceIds.length > 1) {
      connections.push({
        id: `connection-${name}-${cityIndex}`,
        type: 'repeated_place',
        placeId: places.find(({ cityId }) => cityId === city.id)?.id,
        sourceIds: sourceIds.slice(0, 3),
      });
      discoveries.push({
        id: `discovery-${name}-${cityIndex}`,
        title: `${city.name} 的重复到访`,
        commonFact: `${sourceIds.length} 个原件来自同一城市`,
        explanation: '这些原件共享已保存的时间或地点来源。',
        placeId: places.find(({ cityId }) => cityId === city.id)?.id,
        sourceIds: sourceIds.slice(0, 3),
      });
    }
  }

  return {
    ownerId: 'visual-scenario',
    revision: `scenario-${name}`,
    world: {
      totalFragments: fragments.length,
      totalCities: selectedCities.length,
      totalPlaces: places.length,
      placedFragments: fragments.filter(({ status }) => status === 'placed').length,
      unplacedFragments: fragments.filter(({ status }) => status !== 'placed').length,
      sourceIds: fragments.map(({ id }) => id),
    },
    cities: selectedCities.map((city) => {
      const sourceIds = fragments.filter(({ cityId }) => cityId === city.id).map(({ id }) => id);
      return {
        ...city,
        fragmentCount: sourceIds.length,
        placeCount: places.filter(({ cityId }) => cityId === city.id).length,
        sourceIds,
      };
    }),
    fragments,
    importBatches: [],
    places,
    visits,
    connections,
    inboxItems: fragments.filter(({ status }) => status === 'unresolved').slice(0, 4).map((item) => ({
      id: `review-${item.id}`,
      type: 'place_candidate',
      sourceIds: [item.id],
    })),
    discoveries,
  };
}

export function createDevScenarioSnapshot(name) {
  if (name === 'empty') return emptySnapshot();
  if (name === 'small') return populatedSnapshot(1, 3, name);
  if (name === 'dense') return populatedSnapshot(4, 18, name);
  throw new TypeError(`Unknown development scenario: ${name}`);
}

export function applyDevScenario(environment, search) {
  const name = readDevScenario(environment, search);
  if (!name) return null;
  hydrateLiveCollections(createDevScenarioSnapshot(name));
  return name;
}
