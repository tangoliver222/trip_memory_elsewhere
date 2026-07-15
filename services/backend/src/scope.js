/**
 * Scope Resolver：页面范围 → 证据包。
 * 每条证据一行，以 [id] 开头；id 同时进入来源白名单，供回答后校验与前端深链。
 */
import { config } from './config.js';
import { getWorldData } from './datasource.js';

const FRAGMENT_TYPES = { photo: '照片', receipt: '小票', ticket: '票据', screenshot: '截图', menu: '菜单', text: '文字' };
const STATUS = {
  confirmed: '已确认', supported: '来源支持', suggested: '建议', unresolved: '未决',
  conflicted: '冲突', new: '新显影', needs_review: '待判断', processing: '处理中', private: '私人', draft: '草稿',
};
const CONNECTION_TYPES = {
  same_visit: '同一次到访', repeated_place: '重复出现',
  temporal_and_textual_near: '时间与文字接近', place_candidate: '地点候选',
};
const NOTE_TYPES = { city_reflection: '城市反思', user_name: '用户命名', scene_note: '场景补充', future_letter: '未来信件' };

const status = (value) => STATUS[value] || value || '未知';
const when = (iso) => (iso ? iso.replace('T', ' ').slice(0, 16) : '时间待确认');

class Pack {
  constructor(label) {
    this.label = label;
    this.lines = [];
    this.sources = new Map();
  }

  add(kind, object, line, sourceLabel) {
    if (!object?.id || this.sources.has(object.id) || this.sources.size >= config.evidenceLimit) return;
    this.sources.set(object.id, { id: object.id, kind, label: sourceLabel });
    this.lines.push(`[${object.id}] ${line}`);
  }
}

const addFragment = (pack, fragment) => fragment && pack.add('fragment', fragment,
  `${FRAGMENT_TYPES[fragment.type] || fragment.type} · ${when(fragment.capturedAt)} · ${fragment.placeCandidate || '地点待确认'} · ${fragment.evidencePreview} · 状态:${status(fragment.status)}`,
  fragment.evidencePreview);

const addScene = (pack, scene) => scene && pack.add('scene', scene,
  `场景 · ${scene.date} ${scene.timeRange || ''} · ${scene.label} · ${scene.observation} · 状态:${status(scene.status)}`,
  scene.label);

const addPlace = (pack, place) => place && pack.add('place', place,
  `地点 · ${place.name}（${place.area}） · 到访${place.visitCount ?? '?'}次 · ${place.dateRange} · ${place.fact} · 状态:${status(place.status)}`,
  place.name);

const addConnection = (pack, connection) => connection && pack.add('connection', connection,
  `连接/${CONNECTION_TYPES[connection.type] || connection.type} · 节点:${[...connection.from, ...connection.to].join('、')} · 证据:${connection.evidence.join('；')}${connection.uncertainty ? ` · 缺口:${connection.uncertainty}` : ''} · 状态:${status(connection.status)}`,
  CONNECTION_TYPES[connection.type] || connection.type);

const addDiscovery = (pack, discovery) => discovery && pack.add('discovery', discovery,
  `发现 · ${discovery.title} · ${discovery.timeRange} · ${discovery.observation}${discovery.uncertainty ? ` · 缺口:${discovery.uncertainty}` : ''} · 状态:${status(discovery.status)}`,
  discovery.title);

const addNote = (pack, note) => note && pack.add('note', note,
  `用户解释/${NOTE_TYPES[note.type] || note.type} · ${note.createdAt || '未注明日期'} · “${note.text}” · 关联:${note.related.join('、')}`,
  note.text);

const addBatch = (pack, batch) => batch && pack.add('batch', batch,
  `入库批次 · ${when(batch.createdAt)} · ${batch.itemCount} 项 · 已保存${batch.result.saved} · 新地点${batch.result.places} · 新连接${batch.result.connections} · 待判断${batch.result.needsReview}`,
  `入库批次 ${batch.itemCount} 项`);

const addReview = (pack, review) => review && pack.add('review', review,
  `待判断 · ${review.prompt} · 涉及:${review.fragmentIds.join('、')}`,
  review.prompt);

const addCity = (pack, city) => city && pack.add('city', { id: city.slug },
  `城市 · ${city.name}（${city.localizedName}） · ${city.period} · ${city.fragmentCount} 个碎片 / ${city.placeCount} 个地点 · ${city.fact}`,
  city.name);

const notesRelatedTo = (data, ids) => data.userNotes.filter((note) => note.related.some((ref) => ids.includes(ref)));

export function resolveScope(scope = {}) {
  const data = getWorldData();
  const { indexes } = data;
  const type = scope.type || 'world';
  const id = scope.id || '';

  if (type === 'city' && indexes.citiesBySlug[id]) {
    const city = indexes.citiesBySlug[id];
    const pack = new Pack(`${city.name} · ${city.period}`);
    addCity(pack, city);
    data.fragments.filter((f) => f.cityId === city.id).forEach((f) => addFragment(pack, f));
    data.scenes.filter((s) => s.journeyId === city.journeyId).forEach((s) => addScene(pack, s));
    data.places.filter((p) => p.journeyId === city.journeyId).forEach((p) => addPlace(pack, p));
    data.connections.forEach((c) => addConnection(pack, c));
    data.discoveries.forEach((d) => addDiscovery(pack, d));
    notesRelatedTo(data, [city.journeyId, ...Object.keys(indexes.places), ...Object.keys(indexes.scenes), ...Object.keys(indexes.connections)])
      .forEach((n) => addNote(pack, n));
    return pack;
  }

  if (type === 'fragment' && indexes.fragments[id]) {
    const fragment = indexes.fragments[id];
    const pack = new Pack(`碎片 · ${fragment.evidencePreview}`);
    addFragment(pack, fragment);
    addScene(pack, indexes.scenes[fragment.sceneId]);
    addPlace(pack, indexes.places[fragment.placeId]);
    data.connections.filter((c) => c.from.includes(id) || c.to.includes(id)).forEach((c) => addConnection(pack, c));
    data.discoveries.filter((d) => d.supportingFragments.includes(id)).forEach((d) => addDiscovery(pack, d));
    notesRelatedTo(data, [id, fragment.sceneId, fragment.placeId].filter(Boolean)).forEach((n) => addNote(pack, n));
    return pack;
  }

  if (type === 'scene' && indexes.scenes[id]) {
    const scene = indexes.scenes[id];
    const pack = new Pack(`场景 · ${scene.label}`);
    addScene(pack, scene);
    scene.fragmentIds.forEach((fid) => addFragment(pack, indexes.fragments[fid]));
    addPlace(pack, indexes.places[scene.placeId]);
    notesRelatedTo(data, [id]).forEach((n) => addNote(pack, n));
    return pack;
  }

  if (type === 'place' && indexes.places[id]) {
    const place = indexes.places[id];
    const pack = new Pack(`地点 · ${place.name}`);
    addPlace(pack, place);
    data.scenes.filter((s) => s.placeId === id).forEach((s) => addScene(pack, s));
    data.fragments.filter((f) => f.placeId === id).forEach((f) => addFragment(pack, f));
    notesRelatedTo(data, [id]).forEach((n) => addNote(pack, n));
    return pack;
  }

  if (type === 'connection' && indexes.connections[id]) {
    const connection = indexes.connections[id];
    const pack = new Pack(`连接 · ${CONNECTION_TYPES[connection.type] || connection.type}`);
    addConnection(pack, connection);
    [...connection.from, ...connection.to].forEach((fid) => addFragment(pack, indexes.fragments[fid]));
    addPlace(pack, indexes.places[connection.toEntityId]);
    data.discoveries.filter((d) => d.connectionIds.includes(id)).forEach((d) => addDiscovery(pack, d));
    return pack;
  }

  if (type === 'discovery' && indexes.discoveries[id]) {
    const discovery = indexes.discoveries[id];
    const pack = new Pack(`发现 · ${discovery.title}`);
    addDiscovery(pack, discovery);
    discovery.supportingFragments.forEach((fid) => addFragment(pack, indexes.fragments[fid]));
    discovery.connectionIds.forEach((cid) => addConnection(pack, indexes.connections[cid]));
    addPlace(pack, indexes.places[discovery.sharedEntityId]);
    notesRelatedTo(data, [id, ...discovery.connectionIds]).forEach((n) => addNote(pack, n));
    return pack;
  }

  if (type === 'discover') {
    const pack = new Pack('发现 · 全部');
    data.discoveries.forEach((d) => addDiscovery(pack, d));
    return pack;
  }

  if (type === 'inbox') {
    const pack = new Pack(`收件箱 · ${data.reviewQueue.length} 项待判断`);
    data.reviewQueue.forEach((r) => addReview(pack, r));
    data.reviewQueue.flatMap((r) => r.fragmentIds).forEach((fid) => addFragment(pack, indexes.fragments[fid]));
    data.importBatches.forEach((b) => addBatch(pack, b));
    data.processingItems.forEach((p) => pack.add('processing', p, `处理中 · ${p.label}`, p.label));
    data.exceptions.forEach((e) => pack.add('exception', e, `异常 · ${e.label}`, e.label));
    return pack;
  }

  if (type === 'receipt' && indexes.batches[id]) {
    const batch = indexes.batches[id];
    const pack = new Pack(`入库回执 · ${batch.itemCount} 项`);
    addBatch(pack, batch);
    batch.representativeFragmentIds.forEach((fid) => addFragment(pack, indexes.fragments[fid]));
    data.reviewQueue.forEach((r) => addReview(pack, r));
    return pack;
  }

  if (type === 'fragments') {
    const query = (scope.query || '').trim().toLowerCase();
    const pack = new Pack(query ? `全部碎片 · 搜索“${scope.query}”` : '全部碎片');
    const matches = (f) => !query
      || [f.evidencePreview, f.placeCandidate, f.type].filter(Boolean).some((v) => v.toLowerCase().includes(query));
    data.fragments.filter(matches).forEach((f) => addFragment(pack, f));
    if (query) data.places.filter((p) => p.name.toLowerCase().includes(query)).forEach((p) => addPlace(pack, p));
    data.cities.forEach((c) => addCity(pack, c));
    return pack;
  }

  // 默认 / world：世界总览
  const pack = new Pack(`我的世界 · ${data.world.totalCities} 座城市`);
  pack.add('world', { id: data.world.id },
    `世界 · ${data.world.totalCities} 座城市 · ${data.world.totalFragments} 个碎片 · ${data.world.totalConnections} 条已建立连接`,
    '世界概览');
  data.cities.forEach((c) => addCity(pack, c));
  data.discoveries.forEach((d) => addDiscovery(pack, d));
  data.importBatches.forEach((b) => addBatch(pack, b));
  data.reviewQueue.forEach((r) => addReview(pack, r));
  data.userNotes.forEach((n) => addNote(pack, n));
  return pack;
}
