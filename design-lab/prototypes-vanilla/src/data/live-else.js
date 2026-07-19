export function scopeForElseRoute(route = '#/world', selectedFragmentId = null) {
  if (selectedFragmentId) return { type: 'fragment', id: selectedFragmentId };
  const path = String(route).split('?')[0];
  if (path === '#/world/fragments') return { type: 'fragments' };
  const city = path.match(/^#\/world\/city\/([^/]+)/);
  if (city) return { type: 'city', id: `city-${decodeURIComponent(city[1])}` };
  const discovery = path.match(/^#\/discover\/([^/]+)$/);
  if (discovery) return { type: 'discovery', id: decodeURIComponent(discovery[1]) };
  return { type: 'world' };
}

export async function askElseWithRuntime({
  runtime,
  route,
  selectedFragmentId = null,
  question,
  fixtureAnswer,
} = {}) {
  if (runtime?.mode === 'live') {
    if (typeof runtime.client?.askElse !== 'function') {
      throw new TypeError('Live Else client is unavailable');
    }
    return runtime.client.askElse(
      question,
      scopeForElseRoute(route, selectedFragmentId),
    );
  }
  if (typeof fixtureAnswer !== 'function') throw new TypeError('Fixture Else answer is required');
  return fixtureAnswer({ route, question });
}
