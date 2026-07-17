import { createCapabilityWorkerComposition } from '../../src/composition/capability-worker.js';

const appConfig = Object.freeze({
  nodeEnv: 'test',
  bodyLimit: 32 * 1024,
  logLevel: 'silent',
});

export function createCapabilityWorkerTestApp({ worker }) {
  return createCapabilityWorkerComposition({ appConfig, worker });
}
