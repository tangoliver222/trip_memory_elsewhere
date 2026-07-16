import { IsoDateTimeSchema, parseFragment } from '../domain/index.js';
import { assertRepository } from '../repositories/contract.js';
import { IngestionError, retryableIngestionError } from './errors.js';

const defaultClock = () => new Date().toISOString();

const unregistered = () => new IngestionError(
  'ingestion/unregistered-original',
  { permanent: true },
);

const conflict = () => new IngestionError(
  'ingestion/original-conflict',
  { permanent: true },
);

function mapRepositoryError(error) {
  if (error instanceof IngestionError) return error;
  if (error?.code === 'repository/original-conflict') return conflict();
  if (error?.code === 'repository/unregistered-original'
    || error?.code === 'repository/owner-mismatch') {
    return unregistered();
  }
  return retryableIngestionError();
}

export function createOriginalFinalizer({
  repository,
  objectInspector,
  clock = defaultClock,
}) {
  const store = assertRepository(repository);
  if (typeof objectInspector?.inspectOriginal !== 'function') {
    throw new TypeError('Object inspector must implement inspectOriginal()');
  }
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');

  return Object.freeze({
    async handle(event) {
      let batch;
      try {
        batch = await store.getImportBatch(event.uid, event.batchId);
      } catch {
        throw retryableIngestionError();
      }
      const item = batch?.uploads?.[event.fragmentId];
      if (!batch || !item || item.originalPath !== event.objectName) throw unregistered();

      if (item.state !== 'pending') {
        if (item.finalizedGeneration === event.generation) {
          return Object.freeze({ outcome: 'duplicate' });
        }
        throw conflict();
      }

      let inspection;
      try {
        inspection = await objectInspector.inspectOriginal({
          bucket: event.bucket,
          objectName: event.objectName,
          generation: event.generation,
          expectedPolicy: {
            sourceType: item.sourceType,
            allowedContentTypes: [...item.allowedContentTypes],
            maxBytes: item.maxBytes,
          },
        });
      } catch (error) {
        if (!(error instanceof IngestionError)) throw retryableIngestionError();
        if (!error.permanent) throw error;
        if (error.code !== 'ingestion/invalid-original') throw error;

        let rejected;
        try {
          rejected = await store.rejectOriginal(event.uid, {
            batchId: event.batchId,
            fragmentId: event.fragmentId,
            originalPath: event.objectName,
            generation: event.generation,
            failureCode: error.code,
            updatedAt: IsoDateTimeSchema.parse(clock()),
          });
        } catch (repositoryError) {
          throw mapRepositoryError(repositoryError);
        }
        return Object.freeze({
          outcome: rejected.outcome === 'duplicate' ? 'duplicate' : 'rejected',
        });
      }

      const timestamp = IsoDateTimeSchema.parse(clock());
      let fragment;
      try {
        fragment = parseFragment({
          id: event.fragmentId,
          ownerId: event.uid,
          schemaVersion: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
          batchId: event.batchId,
          type: item.sourceType,
          status: 'uploaded',
          storage: {
            originalPath: event.objectName,
            ...inspection.storageFacts,
          },
          source: item.source,
          hashes: {},
          facts: {},
          journeyId: null,
          sceneId: null,
          placeId: null,
        });
      } catch {
        throw retryableIngestionError();
      }

      try {
        const finalized = await store.finalizeOriginal(event.uid, {
          batchId: event.batchId,
          fragmentId: event.fragmentId,
          originalPath: event.objectName,
          generation: event.generation,
          updatedAt: timestamp,
          fragment,
        });
        return Object.freeze({ outcome: finalized.outcome });
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
  });
}
