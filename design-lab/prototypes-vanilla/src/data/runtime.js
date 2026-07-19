import { hydrateLiveCollections } from './live-hydrator.js';

export const runtimeState = {
  mode: 'fixture',
  status: 'idle',
  client: null,
  snapshot: null,
  error: null,
};

export function isLiveDataMode(environment = {}) {
  return environment.VITE_ELSEWHERE_DATA_MODE === 'live';
}

export async function bootstrapLiveData({
  client = null,
  fetchSnapshot = null,
  hydrate = hydrateLiveCollections,
} = {}) {
  if (fetchSnapshot !== null && typeof fetchSnapshot !== 'function') {
    throw new TypeError('fetchSnapshot must be a function');
  }
  if (typeof hydrate !== 'function') throw new TypeError('hydrate must be a function');
  runtimeState.mode = 'live';
  runtimeState.status = 'connecting';
  runtimeState.client = client;
  runtimeState.snapshot = null;
  runtimeState.error = null;

  try {
    if (!fetchSnapshot) {
      if (typeof client?.signIn !== 'function' || typeof client?.getSnapshot !== 'function') {
        throw new TypeError('Live client must implement signIn() and getSnapshot()');
      }
      await client.signIn();
    }
    const snapshot = await (fetchSnapshot ? fetchSnapshot() : client.getSnapshot());
    hydrate(snapshot);
    runtimeState.status = 'ready';
    runtimeState.snapshot = snapshot;
    return snapshot;
  } catch (error) {
    runtimeState.status = 'error';
    runtimeState.snapshot = null;
    runtimeState.error = error;
    throw error;
  }
}
