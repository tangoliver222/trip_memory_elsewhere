import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoRepository } from '../../src/demo/repository.js';

test('reads multiple normalized OCR artifacts in stable result id order', async () => {
  const calls = [];
  const repository = createDemoRepository({
    db: {},
    storage: {},
    storageBucket: 'elsewhere-memory-tyx-2026.firebasestorage.app',
    routingRepository: { async loadRoutingSnapshot() {} },
    artifactReader: {
      async readNormalizedArtifact(input) {
        calls.push(input);
        return { result: input.artifactRef.result };
      },
    },
  });
  const result = (id, executionId) => ({
    id,
    ownerId: 'user_demo0001',
    executionRef: { type: 'capabilityExecution', id: executionId },
    normalizedArtifactRef: { result: id },
  });
  const second = result('capresult_0002', 'execution_0002');
  const first = result('capresult_0001', 'execution_0001');

  const artifacts = await repository.readNormalizedArtifacts('user_demo0001', [{
    capabilityResults: [second, first],
  }]);

  assert.deepEqual(calls.map(({ executionId }) => executionId), [
    'execution_0001',
    'execution_0002',
  ]);
  assert.deepEqual(artifacts, {
    capresult_0001: { result: 'capresult_0001' },
    capresult_0002: { result: 'capresult_0002' },
  });
});
