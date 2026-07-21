import { IdSchema } from '../domain/index.js';
import {
  ExperienceCommandSchema,
  ExperienceStateSchema,
  emptyExperienceState,
  parseSettingInput,
} from './schemas.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function parseState(value) {
  return deepFreeze(ExperienceStateSchema.parse(value));
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function domainFields(state) {
  return {
    reviewDecisions: state.reviewDecisions,
    connectionDecisions: state.connectionDecisions,
    savedDiscoveryIds: state.savedDiscoveryIds,
    notes: state.notes,
    settings: state.settings,
    excludedJourneyIds: state.excludedJourneyIds,
  };
}

function applyCommand(current, command) {
  const next = structuredClone(current);
  if (command.type === 'review') {
    next.reviewDecisions[command.id] = { ...command.value, decidedAt: command.updatedAt };
  }
  if (command.type === 'connection') {
    next.connectionDecisions[command.id] = { ...command.value, decidedAt: command.updatedAt };
  }
  if (command.type === 'discovery') {
    next.savedDiscoveryIds = command.value.saved
      ? sortedUnique([...next.savedDiscoveryIds, command.id])
      : next.savedDiscoveryIds.filter((id) => id !== command.id);
  }
  if (command.type === 'note') {
    next.notes[command.id] = { text: command.value.text, updatedAt: command.updatedAt };
  }
  if (command.type === 'setting') {
    const setting = parseSettingInput(command.id, command.value);
    if (!setting) throw new TypeError('Experience setting command is invalid');
    next.settings[setting.key] = setting.value;
  }
  if (command.type === 'exclude_journey') {
    next.excludedJourneyIds = sortedUnique([...next.excludedJourneyIds, command.id]);
  }

  if (JSON.stringify(domainFields(next)) === JSON.stringify(domainFields(current))) return current;
  next.revision = current.revision + 1;
  next.updatedAt = command.updatedAt;
  return parseState(next);
}

export function createFirestoreExperienceState({ db } = {}) {
  if (!db) throw new TypeError('Firestore database is required');
  const reference = (ownerId) => db.doc(
    `users/${IdSchema.parse(ownerId)}/experienceState/current`,
  );

  return Object.freeze({
    async read(ownerId) {
      const snapshot = await reference(ownerId).get();
      return snapshot.exists ? parseState(snapshot.data()) : emptyExperienceState();
    },
    async apply(ownerId, input) {
      const command = ExperienceCommandSchema.parse(input);
      const document = reference(ownerId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(document);
        const current = snapshot.exists ? parseState(snapshot.data()) : emptyExperienceState();
        const next = applyCommand(current, command);
        if (next !== current) transaction.set(document, next);
        return next;
      });
    },
  });
}
