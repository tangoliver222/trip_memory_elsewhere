import { z } from 'zod';
import {
  IdSchema,
  IsoDateTimeSchema,
  parseFragment,
  parseImportBatch,
} from '../domain/index.js';

const DecisionSchema = z.strictObject({
  decision: z.enum(['yes', 'no', 'later']),
  placeId: IdSchema.optional(),
  decidedAt: IsoDateTimeSchema,
});

function sortById(values) {
  return values.sort((left, right) => left.id.localeCompare(right.id));
}

function positiveIntegerString(value, name) {
  const normalized = String(value);
  if (!/^[1-9][0-9]*$/.test(normalized)) throw new Error(`Invalid ${name}`);
  return normalized;
}

export function createDemoRepository({
  db,
  storage,
  storageBucket,
  routingRepository,
  artifactReader,
}) {
  if (!db) throw new TypeError('Firestore database is required');
  if (!storage) throw new TypeError('Storage manager is required');
  if (typeof storageBucket !== 'string' || !storageBucket) {
    throw new TypeError('storageBucket is required');
  }
  if (typeof routingRepository?.loadRoutingSnapshot !== 'function') {
    throw new TypeError('routingRepository is required');
  }
  if (typeof artifactReader?.readNormalizedArtifact !== 'function') {
    throw new TypeError('artifactReader is required');
  }

  const collection = (ownerId, name) => db.collection(`users/${ownerId}/${name}`);

  async function list(ownerId, name, parse) {
    const uid = IdSchema.parse(ownerId);
    const snapshot = await collection(uid, name).get();
    return Object.freeze(sortById(snapshot.docs.map((document) => parse(document.data()))));
  }

  return Object.freeze({
    listFragments(ownerId) {
      return list(ownerId, 'fragments', parseFragment);
    },

    listImportBatches(ownerId) {
      return list(ownerId, 'importBatches', parseImportBatch);
    },

    async listRoutingSnapshots(ownerId, batchIds) {
      const uid = IdSchema.parse(ownerId);
      if (!Array.isArray(batchIds)
        || batchIds.length > 100
        || batchIds.some((id) => !IdSchema.safeParse(id).success)
        || new Set(batchIds).size !== batchIds.length) {
        throw new TypeError('batchIds are invalid');
      }
      const snapshots = await Promise.all([...batchIds].sort().map((batchId) => (
        routingRepository.loadRoutingSnapshot(uid, { batchId })
      )));
      return Object.freeze(snapshots.filter(Boolean));
    },

    async readNormalizedArtifacts(ownerId, routingSnapshots) {
      const uid = IdSchema.parse(ownerId);
      if (!Array.isArray(routingSnapshots)) throw new TypeError('routingSnapshots are invalid');
      const results = new Map();
      for (const snapshot of routingSnapshots) {
        for (const result of snapshot?.capabilityResults ?? []) {
          if (result.ownerId !== uid) throw new TypeError('CapabilityResult owner is invalid');
          if (result.normalizedArtifactRef) results.set(result.id, result);
        }
      }
      const artifacts = {};
      for (const result of [...results.values()].sort(sortById)) {
        try {
          artifacts[result.id] = await artifactReader.readNormalizedArtifact({
            ownerId: uid,
            executionId: result.executionRef.id,
            artifactRef: result.normalizedArtifactRef,
          });
        } catch {
          // A missing or unverifiable private artifact remains unresolved in the public projection.
        }
      }
      return Object.freeze(artifacts);
    },

    async listDecisions(ownerId) {
      const uid = IdSchema.parse(ownerId);
      const snapshot = await collection(uid, 'demoDecisions').get();
      return Object.freeze(Object.fromEntries(snapshot.docs
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((document) => [document.id, DecisionSchema.parse(document.data())])));
    },

    async getImportBatch(ownerId, batchId) {
      const uid = IdSchema.parse(ownerId);
      const id = IdSchema.parse(batchId);
      const snapshot = await collection(uid, 'importBatches').doc(id).get();
      return snapshot.exists ? parseImportBatch(snapshot.data()) : null;
    },

    async getObjectFacts({ bucket, objectName } = {}) {
      if (bucket !== storageBucket
        || typeof objectName !== 'string'
        || !objectName.startsWith('users/')) {
        throw new Error('Storage object is outside the demo boundary');
      }
      const [metadata] = await storage.bucket(storageBucket).file(objectName).getMetadata();
      const generation = positiveIntegerString(metadata.generation, 'generation');
      const sizeString = positiveIntegerString(metadata.size, 'size');
      const sizeBytes = Number(sizeString);
      if (!Number.isSafeInteger(sizeBytes) || typeof metadata.contentType !== 'string') {
        throw new Error('Storage metadata is invalid');
      }
      return Object.freeze({
        bucket: storageBucket,
        objectName,
        generation,
        sizeBytes,
        contentType: metadata.contentType,
      });
    },

    async saveDecision(ownerId, itemId, decision) {
      const uid = IdSchema.parse(ownerId);
      const id = IdSchema.parse(itemId);
      const parsed = DecisionSchema.parse(decision);
      await collection(uid, 'demoDecisions').doc(id).set(parsed);
      return parsed;
    },

    async resetOwner(ownerId) {
      const uid = IdSchema.parse(ownerId);
      await db.recursiveDelete(db.doc(`users/${uid}`));
      await storage.bucket(storageBucket).deleteFiles({ prefix: `users/${uid}/` });
      return Object.freeze({ ownerId: uid, deleted: true });
    },
  });
}
