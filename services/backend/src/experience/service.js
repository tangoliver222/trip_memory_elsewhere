function assertMethod(port, method, name) {
  if (typeof port?.[method] !== 'function') throw new TypeError(`${name} must implement ${method}()`);
  return port;
}

export function createExperienceService({
  memorySnapshotReader,
  stateRepository,
  projectSnapshot,
  clock = () => new Date().toISOString(),
} = {}) {
  const memory = assertMethod(memorySnapshotReader, 'readOwnerSnapshot', 'Memory snapshot reader');
  const state = assertMethod(
    assertMethod(stateRepository, 'read', 'Experience state repository'),
    'apply',
    'Experience state repository',
  );
  if (typeof projectSnapshot !== 'function') throw new TypeError('projectSnapshot is required');
  if (typeof clock !== 'function') throw new TypeError('clock is required');

  const apply = (ownerId, type, id, value) => state.apply(ownerId, Object.freeze({
    type,
    id,
    value: Object.freeze({ ...value }),
    updatedAt: clock(),
  }));

  return Object.freeze({
    async getSnapshot(ownerId) {
      const [source, userState] = await Promise.all([
        memory.readOwnerSnapshot(ownerId),
        state.read(ownerId),
      ]);
      const projection = projectSnapshot({
        ownerId,
        fragments: source.fragments,
        importBatches: source.importBatches,
        decisions: userState.reviewDecisions,
      });
      return Object.freeze({ ...projection, userState });
    },
    saveReview(ownerId, { itemId, decision, placeId }) {
      return apply(ownerId, 'review', itemId, {
        decision,
        ...(placeId ? { placeId } : {}),
      });
    },
    saveConnection(ownerId, { connectionId, decision }) {
      return apply(ownerId, 'connection', connectionId, { decision });
    },
    saveDiscovery(ownerId, { discoveryId, saved }) {
      return apply(ownerId, 'discovery', discoveryId, { saved });
    },
    saveNote(ownerId, { noteId, text }) {
      return apply(ownerId, 'note', noteId, { text });
    },
    saveSetting(ownerId, { key, value }) {
      return apply(ownerId, 'setting', key, { value });
    },
    excludeJourney(ownerId, { journeyId }) {
      return apply(ownerId, 'exclude_journey', journeyId, {});
    },
  });
}
