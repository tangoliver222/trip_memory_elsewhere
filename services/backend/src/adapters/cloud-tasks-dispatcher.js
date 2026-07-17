import { CloudTasksClient } from '@google-cloud/tasks';
import { z } from 'zod';
import { IdSchema } from '../domain/index.js';
import { retryableCapabilityError } from '../capabilities/errors.js';

const LabelSchema = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/);
const UrlSchema = z.string().url().refine((value) => value.startsWith('https://'));
const ConfigSchema = z.strictObject({
  projectId: LabelSchema,
  location: LabelSchema,
  queue: LabelSchema,
  workerUrl: UrlSchema,
  audience: UrlSchema,
  serviceAccountEmail: z.string().email(),
});
const PayloadSchema = z.strictObject({
  capabilityExecutionId: IdSchema,
  ownerId: IdSchema,
  routePlanId: IdSchema,
  routePlanRevision: z.number().int().positive().max(5),
});
const EnqueueSchema = z.strictObject({
  taskName: IdSchema,
  payload: PayloadSchema,
});

const isDuplicate = (error) => (
  error?.code === 6
  || error?.code === '6'
  || error?.code === 'ALREADY_EXISTS'
  || error?.code === 'already-exists'
);

function parse(schema, input, name) {
  const result = schema.safeParse(input);
  if (!result.success) throw new TypeError(`${name} is invalid`);
  return result.data;
}

export function createCloudTasksDispatcher({
  config: configInput,
  clientFactory = () => new CloudTasksClient(),
} = {}) {
  const config = parse(ConfigSchema, configInput, 'Cloud Tasks config');
  if (typeof clientFactory !== 'function') throw new TypeError('clientFactory is required');
  const parent = `projects/${config.projectId}/locations/${config.location}/queues/${config.queue}`;
  let client = null;
  const getClient = () => {
    client ??= clientFactory();
    if (typeof client?.createTask !== 'function') {
      throw new TypeError('Cloud Tasks client is invalid');
    }
    return client;
  };

  return Object.freeze({
    async enqueueOcrTask(input) {
      const { taskName, payload } = parse(EnqueueSchema, input, 'Cloud Tasks input');
      const request = {
        parent,
        task: {
          name: `${parent}/tasks/${taskName}`,
          httpRequest: {
            httpMethod: 'POST',
            url: config.workerUrl,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify(payload)).toString('base64'),
            oidcToken: {
              serviceAccountEmail: config.serviceAccountEmail,
              audience: config.audience,
            },
          },
        },
      };
      try {
        await getClient().createTask(request);
        return Object.freeze({ outcome: 'created' });
      } catch (error) {
        if (isDuplicate(error)) return Object.freeze({ outcome: 'duplicate' });
        throw retryableCapabilityError('capability/dispatch-unavailable');
      }
    },
  });
}
