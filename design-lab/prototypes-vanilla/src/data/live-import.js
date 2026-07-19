const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

const SOURCE_RULES = Object.freeze([
  Object.freeze({ pattern: /receipt|bill|check|小票/i, sourceType: 'receipt' }),
  Object.freeze({ pattern: /ticket|boarding|票根|船票/i, sourceType: 'ticket' }),
  Object.freeze({ pattern: /menu|菜单/i, sourceType: 'menu' }),
  Object.freeze({ pattern: /screenshot|screen|map|地图|截图/i, sourceType: 'screenshot' }),
]);

export function classifyImportFile(file, manifest = {}) {
  if (!file || !ALLOWED_MIME_TYPES.has(file.type) || !Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new TypeError(`不支持的文件：${file?.name || 'unknown'}`);
  }
  if (manifest.sourceType) return Object.freeze({ sourceType: manifest.sourceType });
  if (file.type === 'text/plain') return Object.freeze({ sourceType: 'text' });
  const matched = SOURCE_RULES.find(({ pattern }) => pattern.test(file.name));
  return Object.freeze({ sourceType: matched?.sourceType || 'photo' });
}

export function buildImportItem(file, manifest = {}) {
  const { sourceType } = classifyImportFile(file, manifest);
  const sourceCreatedAt = manifest.sourceCreatedAt || null;
  const sourceModifiedAt = Number.isFinite(file.lastModified)
    ? new Date(file.lastModified).toISOString()
    : null;
  const locationHint = manifest.locationHint || null;
  return Object.freeze({
    sourceType,
    declaredContentType: file.type,
    declaredSizeBytes: file.size,
    source: Object.freeze({
      schemaVersion: 1,
      provider: 'local_file',
      importMethod: 'file_picker',
      providerItemId: null,
      originalName: file.name,
      sourceCreatedAt,
      sourceModifiedAt,
      timezoneOffsetMinutes: manifest.timezoneOffsetMinutes ?? null,
      locationHint,
      media: manifest.media || null,
      providerMetadata: Object.freeze({}),
    }),
  });
}

function assertClient(client) {
  for (const method of [
    'createImportBatch',
    'uploadOriginal',
    'finalizeUpload',
    'getReceipt',
    'getSnapshot',
  ]) {
    if (typeof client?.[method] !== 'function') throw new TypeError(`Live client must implement ${method}()`);
  }
  return client;
}

export async function runLiveImport({
  client,
  files,
  manifestByName = {},
  onState = () => {},
  onSnapshot = () => {},
} = {}) {
  const api = assertClient(client);
  if (!Array.isArray(files) || files.length === 0) throw new TypeError('至少选择一个文件');
  if (typeof onState !== 'function' || typeof onSnapshot !== 'function') {
    throw new TypeError('Import callbacks must be functions');
  }
  const items = files.map((file) => buildImportItem(file, manifestByName[file.name] || {}));
  onState({ status: 'creating', progress: {} });
  const created = await api.createImportBatch(items);
  const batchId = created?.batch?.id;
  if (typeof batchId !== 'string' || created.uploads?.length !== files.length) {
    throw new Error('Import manifest response is invalid');
  }

  const progress = {};
  const succeeded = [];
  const failures = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const upload = created.uploads[index];
    try {
      onState({ status: 'uploading', batchId, progress: { ...progress } });
      await api.uploadOriginal(upload, file, (value) => {
        progress[upload.fragmentId] = value;
        onState({ status: 'uploading', batchId, progress: { ...progress } });
      });
      onState({ status: 'processing', batchId, progress: { ...progress } });
      await api.finalizeUpload(batchId, upload.fragmentId);
      succeeded.push(upload.fragmentId);
    } catch (error) {
      failures.push({
        fragmentId: upload.fragmentId,
        fileName: file.name,
        code: error?.code || 'import/item-failed',
      });
    }
  }

  const [receipt, snapshot] = await Promise.all([
    api.getReceipt(batchId),
    api.getSnapshot(),
  ]);
  await onSnapshot(snapshot);
  const status = failures.length === 0 ? 'complete' : (succeeded.length === 0 ? 'failed' : 'partial');
  const result = Object.freeze({
    status,
    batchId,
    receipt,
    snapshot,
    succeeded: Object.freeze([...succeeded]),
    failures: Object.freeze(failures.map((failure) => Object.freeze(failure))),
  });
  onState({ ...result, progress: { ...progress } });
  return result;
}
