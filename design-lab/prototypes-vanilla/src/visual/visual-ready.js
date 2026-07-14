const resolved = Promise.resolve();

export function createVisualReadyController({ window: windowObject = globalThis, document: documentObject = globalThis.document } = {}) {
  let token = 0;
  let routeKey = '';
  let ready = false;

  const publish = (value) => {
    ready = value;
    windowObject.__ELSEWHERE_VISUAL_READY__ = value;
    if (documentObject?.documentElement?.dataset) {
      documentObject.documentElement.dataset.visualReady = String(value);
    }
  };

  const begin = (nextRouteKey = '') => {
    token += 1;
    routeKey = nextRouteKey;
    publish(false);
    return token;
  };

  const waitForAssets = async (root) => {
    const fontPromise = documentObject?.fonts?.ready || resolved;
    const images = [...(root?.querySelectorAll?.('img') || [])];
    const imagePromises = images.map((image) => {
      if (typeof image.decode === 'function') return image.decode().catch(() => undefined);
      if (image.complete) return resolved;
      return new Promise((done) => {
        image.addEventListener?.('load', done, { once: true });
        image.addEventListener?.('error', done, { once: true });
      });
    });
    await Promise.all([fontPromise, ...imagePromises]);
  };

  const settle = async ({ token: requestedToken, root, scenePromise = resolved } = {}) => {
    await Promise.all([waitForAssets(root), scenePromise || resolved]);
    if (requestedToken !== token) return false;
    publish(true);
    return true;
  };

  return {
    begin,
    waitForAssets,
    settle,
    debug: () => ({ token, routeKey, ready }),
  };
}
