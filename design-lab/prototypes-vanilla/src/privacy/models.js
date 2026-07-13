import { cities, connections, discoveries, fragments, journeys, places, scenes, userNotes } from '../fixtures/data.js';

const DEFAULT_PRIVACY = Object.freeze({
  hideAmount: true,
  hidePreciseAddress: true,
  hidePrivateNotes: true,
});

const redactAmount = (value) => value.replace(/\b\d+(?:\.\d{1,2})?\s*(?:THB|฿)\b/gi, '金额已隐藏');

export function getDeleteImpact(targetId) {
  const journey = journeys.find((item) => item.id === targetId) || journeys[0];
  const affectedFragments = fragments.filter((item) => item.journeyId === journey.id);
  const fragmentIds = new Set(affectedFragments.map((item) => item.id));
  const affectedScenes = scenes.filter((item) => item.journeyId === journey.id);
  const affectedPlaces = places.filter((item) => item.journeyId === journey.id);
  const affectedConnections = connections.filter((item) => (
    item.from.some((id) => fragmentIds.has(id))
    || item.to.some((id) => fragmentIds.has(id))
    || affectedPlaces.some((place) => place.id === item.toEntityId)
  ));
  const connectionIds = new Set(affectedConnections.map((item) => item.id));
  const affectedDiscoveries = discoveries.filter((item) => (
    item.supportingFragments.some((id) => fragmentIds.has(id))
    || item.connectionIds.some((id) => connectionIds.has(id))
  ));
  const authorityIds = new Set([
    journey.id,
    ...fragmentIds,
    ...affectedScenes.map((item) => item.id),
    ...affectedPlaces.map((item) => item.id),
    ...connectionIds,
    ...affectedDiscoveries.map((item) => item.id),
  ]);

  return {
    target: { id: journey.id, label: journey.label },
    fragments: affectedFragments,
    scenes: affectedScenes,
    places: affectedPlaces,
    connections: affectedConnections,
    discoveries: affectedDiscoveries,
    userNotes: userNotes.filter((note) => note.related.some((id) => authorityIds.has(id))),
    capsule: { included: true, label: `${journey.label} · City Capsule` },
  };
}

export function getShareModel(targetId, options = {}) {
  const privacy = { ...DEFAULT_PRIVACY, ...options };
  const journey = journeys.find((item) => item.id === targetId) || journeys[0];
  const city = cities.find((item) => item.id === journey.cityId) || cities[0];
  const originals = fragments.filter((item) => item.journeyId === journey.id).slice(0, 5);
  const visibleContent = {
    title: `${city.name} · ${journey.range?.start.slice(0, 4) || city.period}`,
    summary: `${city.placeCount} 个地点 · ${city.fragmentCount} 个碎片`,
    originals: originals.map((fragment) => ({
      type: fragment.type,
      label: privacy.hideAmount ? redactAmount(fragment.evidencePreview) : fragment.evidencePreview,
      asset: fragment.asset,
      location: privacy.hidePreciseAddress ? (fragment.placeCandidate?.split(' · ')[0] || '地点已隐藏') : fragment.placeCandidate,
    })),
  };
  if (!privacy.hidePrivateNotes) visibleContent.userNotes = userNotes.filter((note) => note.related.includes(journey.id)).map((note) => note.text);
  return { targetId: journey.id, privacy, visibleContent };
}
