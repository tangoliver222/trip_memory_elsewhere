import { parseFragment } from '../domain/fragment.js';

const CAPABILITIES = ['ocr', 'places', 'embedding', 'gemini'];
const PRIMARY_PRIORITY = new Map([
  ['exact_duplicate', 0],
  ['near_duplicate', 1],
  ['burst', 2],
  ['same_time_place', 3],
  ['document_sequence', 4],
]);

const fragmentRef = (id) => Object.freeze({ type: 'fragment', id });

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cohortKey(cohort) {
  return cohort.id ?? `${cohort.type}:${cohort.memberRevisionRefs
    .map(({ fragmentId }) => fragmentId).sort().join(',')}`;
}

function normalizeCohort(cohort, fragmentsById) {
  if (!cohort || typeof cohort !== 'object' || !PRIMARY_PRIORITY.has(cohort.type)
    || !Array.isArray(cohort.memberRevisionRefs)
    || cohort.memberRevisionRefs.length < 2
    || cohort.memberRevisionRefs.length > 200) {
    throw new TypeError('cohort is invalid');
  }
  const memberIds = cohort.memberRevisionRefs.map(({ fragmentId }) => fragmentId);
  if (new Set(memberIds).size !== memberIds.length
    || memberIds.some((id) => !fragmentsById.has(id))) {
    throw new TypeError('cohort members are invalid');
  }
  if (cohort.type === 'exact_duplicate'
    && !memberIds.includes(cohort.canonicalFragmentRef?.id)) {
    throw new TypeError('exact cohort canonical is invalid');
  }
  return { cohort, memberIds: [...memberIds].sort(), key: cohortKey(cohort) };
}

function hasCompleteThumbnail(fragment) {
  return fragment.processing.deterministic?.thumbnailStatus === 'complete'
    && fragment.derivatives.thumbnail !== null;
}

function pixelArea(fragment) {
  const media = fragment.source.media;
  if (media !== null) return media.width * media.height;
  const metadata = fragment.technicalMetadata;
  return (metadata?.width ?? 0) * (metadata?.height ?? 0);
}

function compareFragments(left, right, features) {
  const leftFeature = features[left.id] ?? null;
  const rightFeature = features[right.id] ?? null;
  const comparisons = [
    Number(hasCompleteThumbnail(right)) - Number(hasCompleteThumbnail(left)),
    Number(!(rightFeature?.lowInformation ?? true)) - Number(!(leftFeature?.lowInformation ?? true)),
    Number(rightFeature?.exposure === 'normal') - Number(leftFeature?.exposure === 'normal'),
    (rightFeature?.edgeEnergy ?? -1) - (leftFeature?.edgeEnergy ?? -1),
    pixelArea(right) - pixelArea(left),
  ];
  return comparisons.find((value) => value !== 0) ?? left.id.localeCompare(right.id);
}

function selectCount(type, count) {
  if (type === 'exact_duplicate') return 1;
  if (['near_duplicate', 'burst', 'same_time_place'].includes(type)) {
    return count >= 5 ? 2 : 1;
  }
  return count;
}

function refs(ids) {
  return [...ids].sort().map(fragmentRef);
}

function capabilityRefs(type, fragments, representativeIds) {
  const memberIds = fragments.map(({ id }) => id);
  const nonPhotoIds = fragments.filter(({ type: fragmentType }) => fragmentType !== 'photo')
    .map(({ id }) => id);
  const semanticIds = [...new Set([...nonPhotoIds, ...representativeIds])];
  if (type === 'same_time_place') {
    return {
      ocr: refs(memberIds),
      places: refs(memberIds),
      embedding: refs(semanticIds),
      gemini: refs(semanticIds),
    };
  }
  if (['near_duplicate', 'burst'].includes(type)) {
    return {
      ocr: refs(semanticIds),
      places: refs(semanticIds),
      embedding: refs(representativeIds),
      gemini: refs(representativeIds),
    };
  }
  return Object.fromEntries(CAPABILITIES.map((capability) => [
    capability,
    refs(representativeIds),
  ]));
}

export function selectRoutingRepresentatives({ fragments, cohorts, features } = {}) {
  if (!Array.isArray(fragments) || !Array.isArray(cohorts)
    || !features || typeof features !== 'object' || Array.isArray(features)) {
    throw new TypeError('selector input is invalid');
  }
  const normalizedFragments = fragments.map(parseFragment);
  const fragmentsById = new Map(normalizedFragments.map((fragment) => [fragment.id, fragment]));
  if (fragmentsById.size !== normalizedFragments.length) {
    throw new TypeError('fragments must be unique');
  }
  const normalizedCohorts = cohorts.map((cohort) => normalizeCohort(cohort, fragmentsById));
  const selections = normalizedCohorts.map(({ cohort, memberIds, key }) => {
    const members = memberIds.map((id) => fragmentsById.get(id));
    let eligible = members;
    if (cohort.type === 'same_time_place') {
      const photos = members.filter(({ type }) => type === 'photo');
      if (photos.length > 0) eligible = photos;
    }
    const ranked = [...eligible].sort((left, right) => compareFragments(left, right, features));
    const representativeIds = cohort.type === 'exact_duplicate'
      ? [cohort.canonicalFragmentRef.id]
      : ranked.slice(0, selectCount(cohort.type, ranked.length)).map(({ id }) => id);
    return {
      cohortId: cohort.id ?? null,
      cohortKey: key,
      type: cohort.type,
      memberRefs: refs(memberIds),
      representativeRefs: refs(representativeIds),
      capabilityRepresentativeRefs: capabilityRefs(cohort.type, members, representativeIds),
    };
  });
  selections.sort((left, right) => left.cohortKey.localeCompare(right.cohortKey));
  return deepFreeze(selections);
}

function supportingReason(type) {
  return {
    exact_duplicate: 'exact-duplicate-supporting',
    near_duplicate: 'near-duplicate-supporting',
    burst: 'burst-supporting',
    same_time_place: 'same-time-place-supporting',
    document_sequence: 'document-sequence-supporting',
  }[type];
}

export function deriveRepresentationForFragment({ fragmentId, cohorts, selections } = {}) {
  if (typeof fragmentId !== 'string' || !Array.isArray(cohorts) || !Array.isArray(selections)) {
    throw new TypeError('representation input is invalid');
  }
  const selectionByKey = new Map(selections.map((selection) => [selection.cohortKey, selection]));
  const memberships = cohorts.map((cohort) => ({
    cohort,
    selection: selectionByKey.get(cohortKey(cohort)),
  })).filter(({ cohort, selection }) => selection
    && cohort.memberRevisionRefs.some((member) => member.fragmentId === fragmentId));
  const cohortRefs = memberships
    .filter(({ cohort }) => typeof cohort.id === 'string')
    .map(({ cohort }) => ({ type: 'routingCohort', id: cohort.id }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const supporting = memberships
    .filter(({ selection }) => !selection.representativeRefs.some(({ id }) => id === fragmentId))
    .sort((left, right) => PRIMARY_PRIORITY.get(left.cohort.type)
      - PRIMARY_PRIORITY.get(right.cohort.type));
  if (supporting.length > 0) {
    const primary = supporting[0];
    return deepFreeze({
      role: 'supporting',
      representativeRef: primary.selection.representativeRefs[0],
      cohortRefs,
      reasonCodes: [supportingReason(primary.cohort.type)],
    });
  }
  if (memberships.length > 0) {
    return deepFreeze({
      role: 'representative',
      representativeRef: fragmentRef(fragmentId),
      cohortRefs,
      reasonCodes: ['cohort-representative'],
    });
  }
  return deepFreeze({
    role: 'independent',
    representativeRef: fragmentRef(fragmentId),
    cohortRefs: [],
    reasonCodes: ['independent-fragment'],
  });
}
