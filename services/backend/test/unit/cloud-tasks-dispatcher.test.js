import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudTasksDispatcher } from '../../src/adapters/cloud-tasks-dispatcher.js';

const CONFIG = Object.freeze({
  projectId: 'elsewhere',
  location: 'us-central1',
  queue: 'elsewhere-ocr',
  workerUrl: 'https://worker.example/internal/capabilities/ocr',
  audience: 'https://worker.example',
  serviceAccountEmail: 'tasks@elsewhere.iam.gserviceaccount.com',
});
const PAYLOAD = Object.freeze({
  capabilityExecutionId: 'execute_12345678',
  ownerId: 'user_12345678',
  routePlanId: 'route_12345678',
  routePlanRevision: 2,
});
const TASK_NAME = 'ocr-task-12345678';

function harness(createTask = async () => [{}]) {
  const calls = [];
  let constructors = 0;
  const dispatcher = createCloudTasksDispatcher({
    config: CONFIG,
    clientFactory() {
      constructors += 1;
      return {
        async createTask(input) {
          calls.push(input);
          return createTask(input);
        },
      };
    },
  });
  return { dispatcher, calls, constructors: () => constructors };
}

test('lazily creates one client and sends the exact OIDC reference-only task', async () => {
  const { dispatcher, calls, constructors } = harness();
  assert.equal(constructors(), 0);

  assert.deepEqual(await dispatcher.enqueueOcrTask({ taskName: TASK_NAME, payload: PAYLOAD }), {
    outcome: 'created',
  });
  assert.equal(constructors(), 1);
  assert.deepEqual(calls, [{
    parent: 'projects/elsewhere/locations/us-central1/queues/elsewhere-ocr',
    task: {
      name: `projects/elsewhere/locations/us-central1/queues/elsewhere-ocr/tasks/${TASK_NAME}`,
      httpRequest: {
        httpMethod: 'POST',
        url: 'https://worker.example/internal/capabilities/ocr',
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(PAYLOAD)).toString('base64'),
        oidcToken: {
          serviceAccountEmail: 'tasks@elsewhere.iam.gserviceaccount.com',
          audience: 'https://worker.example',
        },
      },
    },
  }]);

  await dispatcher.enqueueOcrTask({ taskName: 'ocr-task-87654321', payload: PAYLOAD });
  assert.equal(constructors(), 1);
});

test('maps both official already-exists forms to duplicate', async () => {
  for (const code of [6, 'ALREADY_EXISTS']) {
    const { dispatcher } = harness(async () => {
      throw Object.assign(new Error('private provider detail'), { code });
    });
    assert.deepEqual(
      await dispatcher.enqueueOcrTask({ taskName: TASK_NAME, payload: PAYLOAD }),
      { outcome: 'duplicate' },
    );
  }
});

test('redacts every other provider failure as stable retryable dispatch error', async () => {
  const privateMessage = 'private queue and credential detail';
  const { dispatcher } = harness(async () => {
    throw Object.assign(new Error(privateMessage), { code: 13 });
  });
  let caught;
  try {
    await dispatcher.enqueueOcrTask({ taskName: TASK_NAME, payload: PAYLOAD });
  } catch (error) {
    caught = error;
  }
  assert.equal(caught?.code, 'capability/dispatch-unavailable');
  assert.equal(caught?.retryable, true);
  assert.equal(caught?.message.includes(privateMessage), false);
});

test('strict boundaries reject private payload fields and incomplete configuration before I/O', async () => {
  const { dispatcher, calls } = harness();
  for (const input of [
    { taskName: TASK_NAME, payload: { ...PAYLOAD, objectName: 'private/path' } },
    { taskName: TASK_NAME, payload: { ...PAYLOAD, imageBytes: 'private' } },
    { taskName: 'bad', payload: PAYLOAD },
    { taskName: TASK_NAME, payload: { ...PAYLOAD, routePlanRevision: 0 } },
  ]) {
    await assert.rejects(() => dispatcher.enqueueOcrTask(input), TypeError);
  }
  assert.equal(calls.length, 0);
  assert.throws(() => createCloudTasksDispatcher({
    config: { ...CONFIG, audience: '' },
    clientFactory() {},
  }), TypeError);
});
