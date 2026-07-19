import { createHash } from 'node:crypto';

const EARTH_RADIUS_METERS = 6_371_000;
const PLACE_MATCH_METERS = 80;
const VISIT_GAP_MS = 45 * 60 * 1000;
const MORNING_START_MINUTES = 5 * 60;
const MORNING_END_MINUTES = (11 * 60) + 30;
const ACCEPTED_FACT_STATES = new Set(['suggested', 'confirmed', 'corrected']);
const PROCESSING_STAGES = Object.freeze([
  'original', 'deterministic', 'routing', 'ocr', 'relationship',
]);

export const DEMO_ANCHORS = Object.freeze([
  Object.freeze({
    id: 'place-common-grounds',
    name: 'Common Grounds',
    area: 'Ari',
    lat: 13.7791,
    lng: 100.5443,
  }),
  Object.freeze({
    id: 'place-chao-phraya-ferry',
    name: 'Chao Phraya Ferry',
    area: 'Riverside',
    lat: 13.7331,
    lng: 100.5101,
  }),
]);

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function compareIds(left, right) {
  return left.id.localeCompare(right.id);
}

function localParts(localDateTime) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(localDateTime);
  if (!match) return null;
  return {
    localDate: match[1],
    localMinutes: (Number(match[2]) * 60) + Number(match[3]),
  };
}

function localPartsAt(timestamp, offsetMinutes) {
  const local = new Date(timestamp + (offsetMinutes * 60_000)).toISOString();
  return localParts(local);
}

function temporalFromString(value, offsetMinutes) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const explicitParts = localParts(value);
  const parts = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !value.endsWith('Z')
    ? explicitParts
    : localPartsAt(timestamp, offsetMinutes ?? 0);
  if (!parts) return null;
  return {
    capturedAt: new Date(timestamp).toISOString(),
    timestamp,
    ...parts,
  };
}

function resolveTemporal(fragment) {
  const fact = fragment.facts?.capturedAt;
  if (fact && ACCEPTED_FACT_STATES.has(fact.status)) {
    if (typeof fact.value === 'string') {
      const parsed = temporalFromString(fact.value, fragment.source.timezoneOffsetMinutes);
      if (parsed) return parsed;
    }
    if (fact.value && typeof fact.value === 'object') {
      const local = typeof fact.value.localDateTime === 'string'
        ? localParts(fact.value.localDateTime)
        : null;
      const instant = typeof fact.value.instant === 'string'
        ? temporalFromString(fact.value.instant, fragment.source.timezoneOffsetMinutes)
        : null;
      if (instant) return local ? { ...instant, ...local } : instant;
      if (local) {
        const offset = Number.isInteger(fact.value.offsetMinutes)
          ? fact.value.offsetMinutes
          : fragment.source.timezoneOffsetMinutes;
        const suffix = Number.isInteger(offset)
          ? `${offset < 0 ? '-' : '+'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`
          : 'Z';
        const parsed = temporalFromString(`${fact.value.localDateTime}${suffix}`, offset);
        if (parsed) return { ...parsed, ...local };
      }
    }
  }

  for (const candidate of [fragment.source.sourceCreatedAt, fragment.source.sourceModifiedAt]) {
    if (typeof candidate !== 'string') continue;
    const parsed = temporalFromString(candidate, fragment.source.timezoneOffsetMinutes);
    if (parsed) return parsed;
  }
  return null;
}

function resolveGeo(fragment) {
  const fact = fragment.facts?.geo;
  const value = fact && ACCEPTED_FACT_STATES.has(fact.status) ? fact.value : null;
  if (value && Number.isFinite(value.lat) && Number.isFinite(value.lng)) {
    return { lat: value.lat, lng: value.lng };
  }
  const hint = fragment.source.locationHint;
  if (hint && Number.isFinite(hint.lat) && Number.isFinite(hint.lng)) {
    return { lat: hint.lat, lng: hint.lng };
  }
  return null;
}

function haversineMeters(left, right) {
  const radians = (degrees) => degrees * (Math.PI / 180);
  const lat1 = radians(left.lat);
  const lat2 = radians(right.lat);
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(right.lng - left.lng);
  const value = (Math.sin(deltaLat / 2) ** 2)
    + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(deltaLng / 2) ** 2));
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function nearestAnchor(geo) {
  if (!geo) return null;
  const matches = DEMO_ANCHORS
    .map((anchor) => ({ anchor, distanceMeters: haversineMeters(geo, anchor) }))
    .filter(({ distanceMeters }) => distanceMeters <= PLACE_MATCH_METERS + 1e-9)
    .sort((left, right) => left.distanceMeters - right.distanceMeters
      || left.anchor.id.localeCompare(right.anchor.id));
  return matches[0] ?? null;
}

function addUnique(map, key, value, label) {
  const serialized = JSON.stringify(value);
  const existing = map.get(key);
  if (existing && existing.serialized !== serialized) {
    throw new TypeError(`Conflicting ${label}`);
  }
  if (!existing) map.set(key, { value, serialized });
}

function processingIndex(routingSnapshots, normalizedArtifacts, ownerId) {
  if (!Array.isArray(routingSnapshots)
    || !normalizedArtifacts
    || typeof normalizedArtifacts !== 'object'
    || Array.isArray(normalizedArtifacts)) {
    throw new TypeError('Processing projection inputs are invalid');
  }
  const plans = new Map();
  const heads = new Map();
  const executions = new Map();
  const results = new Map();
  for (const snapshot of routingSnapshots) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new TypeError('Routing snapshot is invalid');
    }
    for (const plan of snapshot.routePlans ?? []) {
      if (plan.ownerId !== ownerId) throw new TypeError('RoutePlan owner is invalid');
      addUnique(plans, plan.id, plan, 'RoutePlan');
    }
    for (const head of snapshot.routingHeads ?? []) {
      addUnique(heads, head.fragmentRef.id, head, 'RoutingHead');
    }
    for (const execution of snapshot.capabilityExecutions ?? []) {
      if (execution.ownerId !== ownerId) throw new TypeError('CapabilityExecution owner is invalid');
      addUnique(executions, execution.id, execution, 'CapabilityExecution');
    }
    for (const result of snapshot.capabilityResults ?? []) {
      if (result.ownerId !== ownerId) throw new TypeError('CapabilityResult owner is invalid');
      addUnique(results, result.id, result, 'CapabilityResult');
    }
  }
  return Object.freeze({
    plans: new Map([...plans].map(([id, entry]) => [id, entry.value])),
    heads: new Map([...heads].map(([id, entry]) => [id, entry.value])),
    executions: [...executions.values()].map(({ value }) => value).sort(compareIds),
    results: new Map([...results].map(([id, entry]) => [id, entry.value])),
    artifacts: new Map(Object.entries(normalizedArtifacts).sort(([left], [right]) => (
      left.localeCompare(right)
    ))),
  });
}

function traceStage(stage, status, label, provider, detail) {
  return { stage, status, label, provider, detail };
}

function deterministicStage(fragment) {
  const state = fragment.processing?.deterministic?.state;
  if (state === 'succeeded') {
    return traceStage(
      'deterministic', 'completed', '确定性整理', 'Elsewhere',
      '格式、时间、GPS、Hash 与重复信息已读取',
    );
  }
  if (state === 'failed_terminal') {
    return traceStage(
      'deterministic', 'failed', '确定性整理', 'Elsewhere',
      '原件已保留，确定性处理未完成',
    );
  }
  return traceStage('deterministic', 'pending', '确定性整理', 'Elsewhere', '等待确定性事实');
}

function routingStage(fragment, plan) {
  if (!plan) {
    return traceStage(
      'routing',
      fragment.processing?.deterministic?.state === 'failed_terminal' ? 'skipped' : 'pending',
      '执行计划',
      'Authoritative Router',
      '等待确定性事实后编译计划',
    );
  }
  if (plan.state === 'rejected') {
    return traceStage('routing', 'failed', '执行计划', 'Authoritative Router', '执行计划未获批准');
  }
  if (['draft', 'superseded'].includes(plan.state)) {
    return traceStage('routing', 'pending', '执行计划', 'Authoritative Router', '执行计划正在更新');
  }
  const role = plan.representation?.role === 'supporting' ? '辅助原件' : '代表原件';
  return traceStage('routing', 'completed', '执行计划', 'Authoritative Router', `${role}的能力清单已确定`);
}

function readableOcrSkip(reasonCodes = []) {
  if (reasonCodes.includes('not-document-like')) return '普通影像无需票据识别';
  if (reasonCodes.includes('result-already-available')) return '已有可验证识别结果';
  if (reasonCodes.includes('exact-duplicate')) return '重复原件复用代表项结果';
  return '路由策略判定无需票据识别';
}

function boundedOcr(result, artifact) {
  if (!result || !artifact
    || artifact.executionId !== result.executionRef?.id
    || artifact.fragmentId !== result.fragmentRef?.id
    || typeof artifact.text !== 'string'
    || !Number.isSafeInteger(artifact.pageCount)
    || artifact.pageCount !== result.pageCount
    || !Array.isArray(artifact.languageCodes)
    || artifact.languageCodes.some((code) => typeof code !== 'string')) return null;
  const textExcerpt = artifact.text.trim().slice(0, 320);
  return {
    provider: 'Google Document AI',
    outcome: result.outcome,
    pageCount: result.pageCount,
    actualCostMicros: result.actualCostMicros,
    textExcerpt,
    languageCodes: [...new Set(artifact.languageCodes)].sort(),
  };
}

function ocrStage(plan, execution, result, ocr) {
  const decision = plan?.capabilities?.ocr;
  if (!decision) {
    return traceStage('ocr', 'pending', '票据识别', 'Google Document AI', '等待执行计划');
  }
  if (['skipped', 'blocked'].includes(decision.decision)) {
    return traceStage('ocr', 'skipped', '票据识别', 'Google Document AI', readableOcrSkip(decision.reasonCodes));
  }
  if (decision.decision === 'deferred') {
    return traceStage('ocr', 'unresolved', '票据识别', 'Google Document AI', '等待前置事实');
  }
  if (!execution || ['reserved', 'queued', 'claimed', 'calling', 'provider_succeeded', 'settling'].includes(execution.state)) {
    return traceStage('ocr', 'pending', '票据识别', 'Google Document AI', '已批准，等待持久化结果');
  }
  if (execution.state === 'failed_terminal') {
    return traceStage('ocr', 'failed', '票据识别', 'Google Document AI', '识别未完成，原件仍保留');
  }
  if (['failed_retryable', 'billing_uncertain'].includes(execution.state)) {
    return traceStage('ocr', 'unresolved', '票据识别', 'Google Document AI', '识别结果尚未确认');
  }
  if (result?.outcome === 'unsupported') {
    return traceStage('ocr', 'skipped', '票据识别', 'Google Document AI', '当前格式不支持识别');
  }
  if (result?.outcome === 'insufficient_input') {
    return traceStage('ocr', 'unresolved', '票据识别', 'Google Document AI', '文字不足，未生成结构化结论');
  }
  if (execution.state === 'completed' && result?.outcome === 'completed' && ocr) {
    return traceStage('ocr', 'completed', '票据识别', 'Google Document AI', `${ocr.pageCount} 页文字已验证`);
  }
  return traceStage('ocr', 'unresolved', '票据识别', 'Google Document AI', '持久化 artifact 尚未通过验证');
}

function processingFor(fragment, index) {
  const head = index.heads.get(fragment.id);
  const plan = head ? index.plans.get(head.currentPlanRef.id) : null;
  const execution = plan ? index.executions.find((value) => (
    value.routePlanRef?.id === plan.id
      && value.routePlanRevision === plan.revision
      && value.fragmentRef?.id === fragment.id
      && value.capability === 'ocr'
  )) : null;
  const result = execution?.resultRef ? index.results.get(execution.resultRef.id) : null;
  const artifact = result ? index.artifacts.get(result.id) : null;
  const ocr = boundedOcr(result, artifact);
  return {
    trace: [
      traceStage('original', 'completed', '原件已保存', 'Firebase Storage', '原件完整保留'),
      deterministicStage(fragment),
      routingStage(fragment, plan),
      ocrStage(plan, execution, result, ocr),
      traceStage('relationship', 'skipped', '记忆关系', 'Firestore projection', '尚未形成关系'),
    ],
    ocr,
  };
}

function projectedFragment(fragment, index) {
  const temporal = resolveTemporal(fragment);
  const geo = resolveGeo(fragment);
  const place = nearestAnchor(geo);
  const processing = processingFor(fragment, index);
  return {
    id: fragment.id,
    ownerId: fragment.ownerId,
    batchId: fragment.batchId,
    type: fragment.type,
    status: fragment.status,
    originalName: fragment.source.originalName,
    originalPath: fragment.storage.originalPath,
    thumbnailPath: fragment.derivatives?.thumbnail?.path ?? null,
    capturedAt: temporal?.capturedAt ?? null,
    localDate: temporal?.localDate ?? null,
    localMinutes: temporal?.localMinutes ?? null,
    timestamp: temporal?.timestamp ?? null,
    geo,
    placeId: place?.anchor.id ?? null,
    placeName: place?.anchor.name ?? null,
    placeDistanceMeters: place ? Math.round(place.distanceMeters * 10) / 10 : null,
    cityId: place ? 'city-bangkok' : null,
    sourceIds: [fragment.id],
    processingTrace: processing.trace,
    ...(processing.ocr ? { ocr: processing.ocr } : {}),
    terminalFailure: fragment.status === 'failed'
      || fragment.processing?.deterministic?.state === 'failed_terminal',
  };
}

function makePlaces(fragments) {
  return DEMO_ANCHORS.map((anchor) => {
    const members = fragments.filter(({ placeId }) => placeId === anchor.id);
    if (members.length === 0) return null;
    return {
      ...anchor,
      cityId: 'city-bangkok',
      fragmentCount: members.length,
      sourceIds: members.map(({ id }) => id).sort(),
    };
  }).filter(Boolean);
}

function makeVisits(fragments, placesById) {
  const visits = [];
  for (const [placeId, place] of placesById) {
    const timed = fragments
      .filter((fragment) => fragment.placeId === placeId && fragment.timestamp !== null)
      .sort((left, right) => left.timestamp - right.timestamp || compareIds(left, right));
    let current = [];
    for (const fragment of timed) {
      if (current.length === 0 || fragment.timestamp - current.at(-1).timestamp <= VISIT_GAP_MS) {
        current.push(fragment);
      } else {
        visits.push({ place, fragments: current });
        current = [fragment];
      }
    }
    if (current.length > 0) visits.push({ place, fragments: current });
  }
  return visits.map(({ place, fragments: members }, index) => ({
    id: `visit-${place.id}-${String(index + 1).padStart(2, '0')}`,
    placeId: place.id,
    placeName: place.name,
    startedAt: members[0].capturedAt,
    endedAt: members.at(-1).capturedAt,
    fragmentCount: members.length,
    sourceIds: members.map(({ id }) => id),
  })).sort((left, right) => left.startedAt.localeCompare(right.startedAt)
    || left.id.localeCompare(right.id));
}

function makeConnections(visits, places) {
  const sameVisit = visits.filter(({ sourceIds }) => sourceIds.length > 1).map((visit) => ({
    id: `connection-${visit.id}`,
    type: 'same_visit',
    placeId: visit.placeId,
    sourceIds: [...visit.sourceIds],
  }));
  const repeatedPlace = places.map((place) => {
    const placeVisits = visits.filter(({ placeId }) => placeId === place.id);
    if (placeVisits.length < 2) return null;
    return {
      id: `connection-${place.id}-repeated`,
      type: 'repeated_place',
      placeId: place.id,
      visitIds: placeVisits.map(({ id }) => id),
      sourceIds: [...new Set(placeVisits.flatMap(({ sourceIds }) => sourceIds))].sort(),
    };
  }).filter(Boolean);
  return [...sameVisit, ...repeatedPlace].sort(compareIds);
}

function makeDiscoveries(fragments, placesById) {
  const discoveries = [];
  for (const [placeId, place] of placesById) {
    const morning = fragments.filter((fragment) => fragment.placeId === placeId
      && !fragment.terminalFailure
      && fragment.localDate !== null
      && fragment.localMinutes >= MORNING_START_MINUTES
      && fragment.localMinutes <= MORNING_END_MINUTES)
      .sort((left, right) => left.timestamp - right.timestamp || compareIds(left, right));
    const representativeByDate = new Map();
    for (const fragment of morning) {
      if (!representativeByDate.has(fragment.localDate)) {
        representativeByDate.set(fragment.localDate, fragment);
      }
    }
    const evidenceFragments = [...representativeByDate.values()];
    if (evidenceFragments.length < 3) continue;
    const sourceIds = evidenceFragments.map(({ id }) => id);
    discoveries.push({
      id: `discovery-${placeId}-repeated-mornings`,
      type: 'repeated_place_time_window',
      state: 'ready',
      placeId,
      placeName: place.name,
      sourceIds,
      evidence: evidenceFragments.map((fragment) => ({
        fragmentId: fragment.id,
        capturedAt: fragment.capturedAt,
        localDate: fragment.localDate,
      })),
      commonFact: `${place.name} · ${evidenceFragments.length} 个不同日期 · 05:00–11:30`,
      title: `${evidenceFragments.length} 个早晨都从 ${place.name} 开始`,
      explanation: `${evidenceFragments.length} 个不同日期的原件在同一地点及早晨时段出现。`,
    });
  }
  return discoveries.sort(compareIds);
}

function makeInboxItems(fragments, decisions) {
  return fragments.filter((fragment) => (
    fragment.placeId === null || (fragment.type === 'receipt' && fragment.status === 'unresolved')
  )).map((fragment) => ({
    id: `inbox-place-${fragment.id}`,
    type: 'place_confirmation',
    fragmentId: fragment.id,
    reason: 'place-unresolved',
    sourceIds: [fragment.id],
  })).filter(({ id }) => !Object.hasOwn(decisions, id)).sort(compareIds);
}

function aggregateStage(members, stage) {
  const statuses = members.map((fragment) => (
    fragment.processingTrace.find((item) => item.stage === stage)?.status ?? 'pending'
  ));
  if (statuses.length === 0) return 'pending';
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('unresolved')) return 'unresolved';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.every((status) => status === 'skipped')) return 'skipped';
  return 'completed';
}

function emptyStage(stage) {
  return {
    original: traceStage('original', 'pending', '原件已保存', 'Firebase Storage', '等待原件'),
    deterministic: traceStage('deterministic', 'pending', '确定性整理', 'Elsewhere', '等待确定性事实'),
    routing: traceStage('routing', 'pending', '执行计划', 'Authoritative Router', '等待执行计划'),
    ocr: traceStage('ocr', 'pending', '票据识别', 'Google Document AI', '等待执行计划'),
    relationship: traceStage('relationship', 'skipped', '记忆关系', 'Firestore projection', '尚未形成关系'),
  }[stage];
}

function projectBatches(importBatches, fragments) {
  return importBatches.map((batch) => ({
    id: batch.id,
    status: batch.status,
    uploadStatus: batch.uploadStatus,
    inputCount: batch.inputCount,
    counters: { ...batch.counters },
    sourceIds: Object.keys(batch.uploads).sort(),
    processingTrace: PROCESSING_STAGES.map((stage) => {
      const members = fragments.filter((fragment) => fragment.batchId === batch.id);
      const example = members[0]?.processingTrace.find((item) => item.stage === stage)
        ?? emptyStage(stage);
      return { ...example, status: aggregateStage(members, stage) };
    }),
  })).sort(compareIds);
}

function revisionFor(snapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0, 20);
}

export function projectCompetitionSnapshot({
  ownerId,
  fragments,
  importBatches,
  decisions = {},
  routingSnapshots = [],
  normalizedArtifacts = {},
} = {}) {
  if (typeof ownerId !== 'string' || ownerId.length === 0) throw new TypeError('ownerId is required');
  if (!Array.isArray(fragments) || !Array.isArray(importBatches)) {
    throw new TypeError('fragments and importBatches must be arrays');
  }
  if (decisions === null || typeof decisions !== 'object' || Array.isArray(decisions)) {
    throw new TypeError('decisions must be an object');
  }
  if (fragments.some((fragment) => fragment.ownerId !== ownerId)
    || importBatches.some((batch) => batch.ownerId !== ownerId)) {
    throw new TypeError('projection inputs must belong to ownerId');
  }

  const index = processingIndex(routingSnapshots, normalizedArtifacts, ownerId);
  let projectedFragments = [...fragments].sort(compareIds).map((fragment) => (
    projectedFragment(fragment, index)
  ));
  const places = makePlaces(projectedFragments);
  const placesById = new Map(places.map((place) => [place.id, place]));
  const visits = makeVisits(projectedFragments, placesById);
  const connections = makeConnections(visits, places);
  const discoveries = makeDiscoveries(projectedFragments, placesById);
  const relatedSourceIds = new Set([
    ...connections.flatMap(({ sourceIds }) => sourceIds),
    ...discoveries.flatMap(({ sourceIds }) => sourceIds),
  ]);
  projectedFragments = projectedFragments.map((fragment) => ({
    ...fragment,
    processingTrace: fragment.processingTrace.map((item) => item.stage === 'relationship'
      ? traceStage(
        'relationship',
        relatedSourceIds.has(fragment.id) ? 'completed' : 'skipped',
        '记忆关系',
        'Firestore projection',
        relatedSourceIds.has(fragment.id) ? '已形成可回看的关系' : '尚未形成关系',
      )
      : item),
  }));
  const inboxItems = makeInboxItems(projectedFragments, decisions);
  const batches = projectBatches(importBatches, projectedFragments);
  const placedFragments = projectedFragments.filter(({ cityId }) => cityId !== null);
  const cities = placedFragments.length === 0 ? [] : [{
    id: 'city-bangkok',
    name: 'Bangkok',
    country: 'Thailand',
    fragmentCount: placedFragments.length,
    placeCount: places.length,
    sourceIds: placedFragments.map(({ id }) => id).sort(),
  }];
  const world = {
    totalFragments: projectedFragments.length,
    totalCities: cities.length,
    totalPlaces: places.length,
    placedFragments: placedFragments.length,
    unplacedFragments: projectedFragments.length - placedFragments.length,
    sourceIds: projectedFragments.map(({ id }) => id),
  };
  const projection = {
    ownerId,
    world,
    cities,
    fragments: projectedFragments.map(({ timestamp, localMinutes, terminalFailure, ...fragment }) => fragment),
    importBatches: batches,
    places,
    visits,
    connections,
    inboxItems,
    discoveries,
  };
  return deepFreeze({
    ownerId,
    revision: revisionFor({ projection, decisions }),
    ...projection,
  });
}
