import { FieldPath } from 'firebase-admin/firestore';
import { IdSchema, parseFragment, parseImportBatch } from '../domain/index.js';

const FRAGMENT_LIMIT = 200;
const IMPORT_BATCH_LIMIT = 50;

async function readCollection(collection, limit, parse) {
  const [documents, count] = await Promise.all([
    collection.orderBy(FieldPath.documentId()).limit(limit + 1).get(),
    collection.count().get(),
  ]);
  return Object.freeze({
    values: Object.freeze(documents.docs.slice(0, limit).map((document) => parse(document.data()))),
    total: count.data().count,
    truncated: documents.size > limit,
  });
}

export function createFirestoreMemorySnapshotReader({ db } = {}) {
  if (!db) throw new TypeError('Firestore database is required');
  return Object.freeze({
    async readOwnerSnapshot(ownerId) {
      const uid = IdSchema.parse(ownerId);
      const fragments = db.collection(`users/${uid}/fragments`);
      const importBatches = db.collection(`users/${uid}/importBatches`);
      const [fragmentResult, batchResult] = await Promise.all([
        readCollection(fragments, FRAGMENT_LIMIT, parseFragment),
        readCollection(importBatches, IMPORT_BATCH_LIMIT, parseImportBatch),
      ]);
      return Object.freeze({
        fragments: fragmentResult.values,
        importBatches: batchResult.values,
        totalFragments: fragmentResult.total,
        totalImportBatches: batchResult.total,
        fragmentsTruncated: fragmentResult.truncated,
        importBatchesTruncated: batchResult.truncated,
      });
    },
  });
}
