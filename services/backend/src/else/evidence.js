const MAX_SOURCES = 40;

function scopeFragments(snapshot, scope) {
  if (scope.type === 'fragment') {
    return snapshot.fragments.filter(({ id }) => id === scope.id);
  }
  return snapshot.fragments;
}

function sourceLabel(fragment) {
  return fragment.original?.name || `${fragment.type} · ${fragment.id}`;
}

function factValue(fragment, name) {
  const fact = fragment.facts?.[name];
  if (!fact || ['rejected', 'conflicted'].includes(fact.status)) return null;
  return fact.value;
}

function evidenceLine(fragment) {
  const capturedAt = factValue(fragment, 'capturedAt')
    ?? fragment.source?.sourceCreatedAt
    ?? fragment.source?.sourceModifiedAt
    ?? '待确认';
  const geo = factValue(fragment, 'geo') ?? fragment.source?.locationHint ?? null;
  const place = fragment.relationships?.placeId
    ?? (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)
      ? `${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}`
      : '待确认');
  return `[${fragment.id}] 类型:${fragment.type} · 原件:${sourceLabel(fragment)} · 时间:${capturedAt} · 地点:${place}`;
}

function scopeLabel(scope, count) {
  if (scope.type === 'fragment') return count > 0 ? '当前碎片' : '未找到当前碎片';
  if (scope.type === 'fragments') return `全部碎片 · ${count} 个原件`;
  return '全部旅行世界';
}

export function buildElseEvidence(snapshot, scope = { type: 'world' }) {
  if (!snapshot || !Array.isArray(snapshot.fragments)) {
    throw new TypeError('MemorySnapshot is required');
  }
  const fragments = scopeFragments(snapshot, scope).slice(0, MAX_SOURCES);
  const sources = new Map(fragments.map((fragment) => [fragment.id, Object.freeze({
    fragmentId: fragment.id,
    label: sourceLabel(fragment),
    kind: fragment.type,
  })]));
  return Object.freeze({
    revision: snapshot.revision,
    label: scopeLabel(scope, fragments.length),
    evidence: fragments.map(evidenceLine).join('\n'),
    sourceIds: Object.freeze([...sources.keys()]),
    sources,
  });
}
