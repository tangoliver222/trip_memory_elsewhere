import { navigate, safeBack } from '../router.js';
import { answerElse } from '../else/answer-engine.js';

const valueFor = (element) => element.dataset.value ?? element.value;

export function createActionController({ root, store }) {
  const timers = new Set();
  const askElse = (question) => {
    const query = question?.trim();
    if (!query) return;
    store.dispatch({ type: 'SET_ELSE', value: { open: true, state: 'reading', query, answer: null, sources: [] } });
    const timer = setTimeout(() => {
      timers.delete(timer);
      const answer = answerElse({ route: store.getState().route, question: query });
      store.dispatch({ type: 'SET_ELSE', value: { open: true, state: answer.state, query, answer, sources: answer.sources } });
    }, 520);
    timers.add(timer);
  };

  const onClick = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !root.contains(target)) return;
    const action = target.dataset.action;

    if (action === 'navigate') navigate(target.dataset.route);
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
    if (action === 'review-choice') store.dispatch({ type: 'SET_REVIEW_DECISION', reviewId: 'review-river-1022-place', value: target.dataset.value });
    if (action === 'connection-decision') store.dispatch({ type: 'SET_CONNECTION_DECISION', value: target.dataset.value });
    if (action === 'set-discovery-filter') store.dispatch({ type: 'SET_DISCOVERY_FILTER', filter: target.dataset.value });
    if (action === 'save-discovery') store.dispatch({ type: 'SAVE_DISCOVERY', discoveryId: target.dataset.discoveryId });
    if (action === 'ask-else') askElse(target.dataset.question);
    if (action === 'submit-else') askElse(store.getState().else.query);
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
    if (target.dataset.storeAction === 'else-query') store.dispatch({ type: 'SET_ELSE', value: { query: target.value } });
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
