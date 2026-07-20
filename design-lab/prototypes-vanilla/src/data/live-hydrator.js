import {
  cities,
  connections,
  discoveries,
  exceptions,
  fragments,
  importBatches,
  journeys,
  places,
  processingItems,
  reviewQueue,
  scenes,
  world,
} from '../fixtures/data.js';
import { rebuildFixtureIndexes } from '../fixtures/indexes.js';

function replace(target, values) {
  target.splice(0, target.length, ...values);
}

function dateLabel(value) {
  return value ? value.slice(0, 10) : '时间待确认';
}

function timeLabel(value) {
  return value ? value.slice(11, 16) : '时间待确认';
}

function journeyId(cityId) {
  return `journey-${cityId}`;
}

const fragmentTypeLabel = Object.freeze({
  photo: '照片',
  receipt: '小票',
  ticket: '票根',
  menu: '菜单',
  screenshot: '截图',
  text: '文字',
});

function mappedFragments(snapshot) {
  return snapshot.fragments.map((fragment) => ({
    id: fragment.id,
    type: fragment.type,
    capturedAt: fragment.capturedAt,
    asset: fragment.resolvedThumbnailUrl || fragment.resolvedOriginalUrl || null,
    storagePath: fragment.originalPath,
    thumbnailStoragePath: fragment.thumbnailPath,
    cityId: fragment.cityId,
    journeyId: fragment.cityId ? journeyId(fragment.cityId) : null,
    sceneId: snapshot.visits.find(({ sourceIds }) => sourceIds.includes(fragment.id))?.id ?? null,
    placeId: fragment.placeId,
    placeCandidate: fragment.placeName || '地点待确认',
    status: fragment.status === 'placed' ? 'confirmed' : fragment.status,
    displayRole: fragment.placeId ? 'primary-original' : 'unplaced-edge',
    evidencePreview: `${fragmentTypeLabel[fragment.type] || '原件'} · ${dateLabel(fragment.capturedAt)} · ${timeLabel(fragment.capturedAt)}`,
    source: '持久化原件与确定性 metadata',
    sourceIds: [fragment.id],
    processingTrace: Array.isArray(fragment.processingTrace)
      ? fragment.processingTrace.map((stage) => ({ ...stage }))
      : [],
    ...(fragment.ocr ? { ocr: { ...fragment.ocr } } : {}),
  }));
}

export function hydrateLiveCollections(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.fragments)) {
    throw new TypeError('Live snapshot is invalid');
  }
  const liveFragments = mappedFragments(snapshot);
  const byId = new Map(liveFragments.map((fragment) => [fragment.id, fragment]));
  const liveCities = snapshot.cities.map((city) => {
    const cityFragments = liveFragments.filter((fragment) => fragment.cityId === city.id);
    const cityPlaces = snapshot.places.filter((place) => place.cityId === city.id);
    const lat = Number.isFinite(city.lat) ? city.lat : cityPlaces.length > 0
      ? cityPlaces.reduce((sum, place) => sum + place.lat, 0) / cityPlaces.length
      : null;
    const lng = Number.isFinite(city.lng) ? city.lng : cityPlaces.length > 0
      ? cityPlaces.reduce((sum, place) => sum + place.lng, 0) / cityPlaces.length
      : null;
    return {
      id: city.id,
      slug: city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      journeyId: journeyId(city.id),
      name: city.name,
      localizedName: city.name === 'Bangkok' ? '曼谷' : city.name,
      coordinates: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
      period: '当前导入',
      placeCount: city.placeCount,
      fragmentCount: city.fragmentCount,
      status: ['current'],
      representativeAsset: cityFragments.find(({ asset }) => asset)?.asset ?? null,
      fact: `${city.fragmentCount} 个真实碎片，已确认 ${city.placeCount} 个地点。`,
      sourceIds: [...city.sourceIds],
    };
  });
  const liveJourneys = liveCities.map((city) => ({
    id: city.journeyId,
    cityId: city.id,
    label: `${city.name} · 当前导入`,
    range: null,
    timezone: city.timezone || null,
    representativeFragmentCount: city.sourceIds.length,
    totalFragmentCount: city.fragmentCount,
  }));
  const livePlaces = snapshot.places.map((place) => ({
    id: place.id,
    journeyId: journeyId(place.cityId),
    name: place.name,
    area: place.area,
    coordinates: { lat: place.lat, lng: place.lng },
    visitCount: snapshot.visits.filter(({ placeId }) => placeId === place.id).length,
    dateRange: '来自当前原件',
    status: 'confirmed',
    representativeAsset: place.sourceIds.map((id) => byId.get(id)?.asset).find(Boolean) ?? null,
    fact: `${place.fragmentCount} 个原件位于 80 米确定性锚点内。`,
    sourceIds: [...place.sourceIds],
  }));
  const liveScenes = snapshot.visits.map((visit) => {
    const sourceFragment = visit.sourceIds.map((id) => byId.get(id)).find(Boolean);
    const sourcePlace = snapshot.places.find(({ id }) => id === visit.placeId);
    const cityId = sourcePlace?.cityId || sourceFragment?.cityId || null;
    return {
      id: visit.id,
      journeyId: cityId ? journeyId(cityId) : null,
      date: dateLabel(visit.startedAt),
      label: `${visit.placeName} 的一次到访`,
      timeRange: `${timeLabel(visit.startedAt)}—${timeLabel(visit.endedAt)}`,
      placeId: visit.placeId,
      fragmentIds: [...visit.sourceIds],
      status: 'confirmed',
      primaryAsset: visit.sourceIds.map((id) => byId.get(id)?.asset).find(Boolean) ?? null,
      observation: `${visit.fragmentCount} 个原件在 45 分钟访问窗口内。`,
      sourceIds: [...visit.sourceIds],
    };
  });
  const liveConnections = snapshot.connections.map((connection) => ({
    id: connection.id,
    type: connection.type,
    from: connection.sourceIds.slice(0, 1),
    to: connection.sourceIds.slice(1),
    toEntityId: connection.placeId,
    status: 'confirmed',
    evidence: [`${connection.sourceIds.length} 个持久化来源参与这条关系`],
    uncertainty: null,
    sourceIds: [...connection.sourceIds],
  }));
  const connectionByPlace = new Map(liveConnections
    .filter(({ type }) => type === 'repeated_place')
    .map((connection) => [connection.toEntityId, connection.id]));
  const liveDiscoveries = snapshot.discoveries.map((discovery) => ({
    id: discovery.id,
    type: 'repeated_place',
    status: 'new',
    title: discovery.title,
    timeRange: discovery.commonFact,
    supportingFragments: [...discovery.sourceIds],
    sharedEntityId: discovery.placeId,
    connectionIds: connectionByPlace.has(discovery.placeId)
      ? [connectionByPlace.get(discovery.placeId)]
      : [],
    observation: discovery.explanation,
    uncertainty: null,
    saved: false,
  }));
  const liveBatches = snapshot.importBatches.map((batch) => ({
    id: batch.id,
    createdAt: null,
    itemCount: batch.inputCount,
    types: {},
    journeyCandidate: liveJourneys[0]?.id ?? null,
    representativeFragmentIds: [...batch.sourceIds],
    result: {
      saved: batch.counters.saved,
      cities: liveCities.length,
      places: livePlaces.length,
      connections: liveConnections.length,
      needsReview: batch.counters.needsReview,
      duplicates: 0,
      failed: batch.counters.failed,
    },
    status: batch.status,
    processingTrace: Array.isArray(batch.processingTrace)
      ? batch.processingTrace.map((stage) => ({ ...stage }))
      : [],
  }));
  const liveReviews = snapshot.inboxItems.map((item) => ({
    id: item.id,
    kind: item.type,
    prompt: '这个原件的地点仍未确认，是否稍后处理？',
    fragmentIds: [...item.sourceIds],
    choices: ['确认', '不是', '稍后'],
    status: 'needs_review',
  }));

  Object.assign(world, {
    id: 'world-private',
    totalCities: snapshot.world.totalCities,
    totalFragments: snapshot.world.totalFragments,
    totalConnections: liveConnections.length,
    recommendedCityId: liveCities[0]?.id ?? null,
    source: 'Firebase owner snapshot',
  });
  replace(cities, liveCities);
  replace(journeys, liveJourneys);
  replace(fragments, liveFragments);
  replace(places, livePlaces);
  replace(scenes, liveScenes);
  replace(connections, liveConnections);
  replace(discoveries, liveDiscoveries);
  replace(importBatches, liveBatches);
  replace(reviewQueue, liveReviews);
  replace(processingItems, liveFragments.flatMap((fragment) => {
    const stage = fragment.processingTrace.find(({ status }) => (
      ['pending', 'unresolved'].includes(status)
    ));
    return stage ? [{
      id: `processing-${fragment.id}`,
      label: `${fragment.evidencePreview} · ${stage.detail}`,
      stage: stage.stage,
      status: stage.status,
    }] : [];
  }));
  replace(exceptions, liveFragments.filter(({ status }) => status === 'failed').map((fragment) => ({
    id: `exception-${fragment.id}`,
    kind: 'processing_failed',
    label: `${fragment.evidencePreview} 处理失败`,
    status: 'failed',
  })));
  rebuildFixtureIndexes();
  return snapshot;
}
