import { Vector3 } from 'three';

const detectKind = (dataset = {}) => {
  if (dataset.particleKind) return dataset.particleKind;
  if (dataset.fragmentId) return 'fragment';
  if (dataset.sceneId) return 'scene';
  if (dataset.placeId) return 'place';
  if (dataset.connectionId) return 'connection';
  return 'entity';
};

const defaultProjector = ({ ndc, depth, camera }) => {
  if (!camera?.position) return { x: ndc.x * 20, y: ndc.y * 20, z: depth };
  const point = new Vector3(ndc.x, ndc.y, 0.5).unproject(camera);
  const direction = point.sub(camera.position).normalize();
  if (Math.abs(direction.z) < 0.0001) return { x: point.x, y: point.y, z: depth };
  const distance = (depth - camera.position.z) / direction.z;
  const world = camera.position.clone().add(direction.multiplyScalar(distance));
  return { x: world.x, y: world.y, z: depth };
};

export function createAnchorRegistry({ projector = defaultProjector } = {}) {
  let anchors = new Map();

  const measure = (root, camera, viewport = {}) => {
    const viewportRect = {
      left: viewport.left || 0,
      top: viewport.top || 0,
      width: Math.max(1, viewport.width || root?.clientWidth || globalThis.innerWidth || 1),
      height: Math.max(1, viewport.height || root?.clientHeight || globalThis.innerHeight || 1),
    };
    const next = new Map();
    const elements = [...(root?.querySelectorAll?.('[data-particle-anchor]') || [])];
    elements.forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const id = element.dataset.particleAnchor
        || element.dataset.fragmentId
        || element.dataset.sceneId
        || element.dataset.placeId
        || element.dataset.connectionId
        || `anchor-${index}`;
      const centerX = rect.left - viewportRect.left + rect.width / 2;
      const centerY = rect.top - viewportRect.top + rect.height / 2;
      const ndc = {
        x: (centerX / viewportRect.width) * 2 - 1,
        y: 1 - (centerY / viewportRect.height) * 2,
      };
      const depth = Number(element.dataset.particleDepth ?? -8);
      next.set(id, {
        id,
        kind: detectKind(element.dataset),
        element,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
        ndc,
        world: projector({ ndc, depth, camera, viewport: viewportRect, element }),
      });
    });
    anchors = next;
    return new Map(anchors);
  };

  return {
    measure,
    get: (id) => anchors.get(id),
    values: () => [...anchors.values()],
    clear: () => { anchors = new Map(); },
    debug: () => ({ count: anchors.size, ids: [...anchors.keys()] }),
  };
}
