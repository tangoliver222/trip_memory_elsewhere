import { navigate, safeBack } from '../router.js';
import { answerElse } from '../else/answer-engine.js';
import { hydrateLiveCollections } from '../data/live-hydrator.js';
import { runLiveImport } from '../data/live-import.js';
import { resolveSnapshotMedia } from '../data/runtime.js';
import { askElseWithRuntime } from '../data/live-else.js';
import { currentMemoryCatalog } from '../data/view-model.js';

const valueFor = (element) => element.dataset.value ?? element.value;

export const SUPPORTED_ACTIONS = new Set([
  'navigate', 'run-live-import', 'back', 'toggle-else', 'close-overlay', 'open-original',
  'open-share', 'confirm-share', 'set-field-type', 'review-choice', 'connection-decision',
  'set-discovery-filter', 'save-discovery', 'ask-else', 'submit-else', 'open-delete',
  'confirm-delete', 'clear-cache', 'save-note', 'export-data', 'open-lens',
]);

const downloadBlob = (content, type, filename) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const xmlText = (value) => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const shareSvg = (title, copy) => `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="#050607"/>
  <circle cx="850" cy="330" r="190" fill="none" stroke="#64706f" stroke-opacity=".35"/>
  <circle cx="850" cy="330" r="7" fill="#eef2ef"/>
  <text x="86" y="116" fill="#aeb7b4" font-family="Arial" font-size="25" letter-spacing="8">ELSEWHERE</text>
  <text x="86" y="760" fill="#f1f3f0" font-family="Georgia" font-size="66">${xmlText(title)}</text>
  <foreignObject x="86" y="820" width="850" height="300"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#aeb7b4;font:34px/1.55 Georgia">${xmlText(copy)}</div></foreignObject>
  <text x="86" y="1260" fill="#66706e" font-family="Arial" font-size="18" letter-spacing="4">PRIVATE MEMORY CUT</text>
</svg>`;

export function createActionController({ root, store }) {
  const timers = new Set();
  const startLiveImport = async () => {
    const state = store.getState();
    const { client } = state.runtime;
    const files = state.importFlow.files;
    if (!client || files.length === 0 || ['creating', 'uploading', 'processing'].includes(state.importFlow.status)) return;
    let manifestByName = {};
    try {
      const response = await fetch('/competition-source-manifest.json');
      if (response.ok) manifestByName = await response.json();
    } catch {
      // Sidecar metadata is optional; source bytes remain authoritative.
    }
    try {
      const result = await runLiveImport({
        client,
        files,
        manifestByName,
        onState(value) {
          store.dispatch({ type: 'SET_IMPORT_FLOW', value });
        },
        async onSnapshot(snapshot) {
          const resolved = await resolveSnapshotMedia(snapshot, client);
          hydrateLiveCollections(resolved);
        },
      });
      if (result.batchId) navigate(`#/world/inbox/receipt/${result.batchId}`);
    } catch (error) {
      store.dispatch({
        type: 'SET_IMPORT_FLOW',
        value: { status: 'failed', error: error?.code || 'import/failed' },
      });
    }
  };
  const askElse = async (question) => {
    const query = question?.trim();
    if (!query) return;
    store.dispatch({ type: 'SET_ELSE', value: { open: true, state: 'reading', query, answer: null, sources: [] } });
    const state = store.getState();
    if (state.runtime.mode === 'live') {
      try {
        const answer = await askElseWithRuntime({
          runtime: state.runtime,
          route: state.route,
          selectedFragmentId: state.selectedFragmentId,
          question: query,
          fixtureAnswer: answerElse,
        });
        store.dispatch({ type: 'SET_ELSE', value: { open: true, state: answer.state, query, answer, sources: answer.sources } });
      } catch {
        const answer = {
          state: 'uncertain',
          answer: 'Else 当前无法连接 Gemini，请检查后端配置与网络后重试。',
          sources: [],
          uncertainty: '这次没有生成模型回答，也没有用固定文案替代。',
          nextAction: null,
          scope: { label: '当前记忆范围' },
        };
        store.dispatch({ type: 'SET_ELSE', value: { open: true, state: answer.state, query, answer, sources: [] } });
      }
      return;
    }
    const timer = setTimeout(async () => {
      timers.delete(timer);
      const answer = await askElseWithRuntime({
        runtime: state.runtime,
        route: state.route,
        selectedFragmentId: state.selectedFragmentId,
        question: query,
        fixtureAnswer: answerElse,
      });
      store.dispatch({ type: 'SET_ELSE', value: { open: true, state: answer.state, query, answer, sources: answer.sources } });
    }, 520);
    timers.add(timer);
  };

  const onClick = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !root.contains(target)) return;
    const action = target.dataset.action;

    if (action === 'navigate') navigate(target.dataset.route);
    if (action === 'run-live-import') void startLiveImport();
    if (action === 'back') safeBack(target.dataset.fallback);
    if (action === 'toggle-else') store.dispatch({ type: 'TOGGLE_ELSE' });
    if (action === 'close-overlay') {
      const result = store.dispatch({ type: 'CLOSE_OVERLAY' });
      queueMicrotask(() => {
        if (result.restore?.scrollY != null) document.querySelector('#page-content-layer')?.scrollTo(0, result.restore.scrollY);
        if (result.restore?.focusId) document.getElementById(result.restore.focusId)?.focus();
      });
    }
    if (action === 'open-original') store.dispatch({ type: 'OPEN_ORIGINAL' });
    if (action === 'open-share') store.dispatch({ type: 'OPEN_SHARE', payload: { title: target.dataset.title, text: target.dataset.text } });
    if (action === 'set-field-type') store.dispatch({ type: 'SET_FIELD_FILTERS', filters: { type: target.dataset.value } });
    if (action === 'review-choice') store.dispatch({ type: 'SET_REVIEW_DECISION', reviewId: target.dataset.reviewId, value: target.dataset.value });
    if (action === 'connection-decision') store.dispatch({ type: 'SET_CONNECTION_DECISION', connectionId: target.dataset.connectionId, value: target.dataset.value });
    if (action === 'set-discovery-filter') store.dispatch({ type: 'SET_DISCOVERY_FILTER', filter: target.dataset.value });
    if (action === 'save-discovery') store.dispatch({ type: 'SAVE_DISCOVERY', discoveryId: target.dataset.discoveryId });
    if (action === 'ask-else') void askElse(target.dataset.question);
    if (action === 'submit-else') void askElse(store.getState().else.query);
    if (action === 'open-delete') store.dispatch({ type: 'OPEN_DELETE', targetId: target.dataset.targetId });
    if (action === 'confirm-delete') store.dispatch({ type: 'CONFIRM_DELETE', targetId: target.dataset.targetId });
    if (action === 'clear-cache') store.dispatch({ type: 'CLEAR_CACHE' });
    if (action === 'save-note') navigate('#/me/writing');
    if (action === 'confirm-share' && typeof document !== 'undefined') {
      downloadBlob(shareSvg(target.dataset.title || '一段旅行记忆', target.dataset.text || '来源已隐藏敏感信息。'), 'image/svg+xml', 'elsewhere-memory.svg');
      store.dispatch({ type: 'CLOSE_OVERLAY' });
    }
    if (action === 'export-data' && typeof document !== 'undefined') {
      downloadBlob(JSON.stringify({ product: 'Elsewhere', exportedAt: new Date().toISOString(), data: currentMemoryCatalog() }, null, 2), 'application/json', 'elsewhere-export.json');
    }
    if (action === 'open-lens') {
      const layer = document.querySelector('#page-content-layer');
      store.dispatch({
        type: 'OPEN_LENS',
        fragmentId: target.dataset.fragmentId,
        snapshot: {
          route: window.location.hash,
          scrollY: layer?.scrollTop || 0,
          focusId: target.id || null,
          fieldCamera: store.getState().field.camera,
          filters: store.getState().field.filters,
          selectedFragmentId: store.getState().selectedFragmentId,
        },
      });
    }
  };

  const onInput = (event) => {
    const target = event.target.closest('[data-store-action]');
    if (!target) return;
    if (target.dataset.storeAction === 'field-query') store.dispatch({ type: 'SET_FIELD_FILTERS', filters: { query: target.value } });
    if (target.dataset.storeAction === 'field-type') store.dispatch({ type: 'SET_FIELD_FILTERS', filters: { type: valueFor(target) } });
    if (target.dataset.storeAction === 'setting') store.dispatch({ type: 'SET_SETTING', key: target.dataset.key, value: target.type === 'checkbox' ? target.checked : valueFor(target) });
    if (target.dataset.storeAction === 'else-query') store.dispatch({ type: 'SET_ELSE', value: { query: target.value }, silentRender: true });
    if (target.dataset.storeAction === 'note-editor') store.dispatch({ type: 'SET_NOTE', noteId: target.dataset.noteId, text: target.value, silentRender: true });
    if (target.dataset.storeAction === 'live-files') {
      store.dispatch({ type: 'SET_IMPORT_FILES', files: [...(target.files || [])] });
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  return () => {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onInput);
  };
}
