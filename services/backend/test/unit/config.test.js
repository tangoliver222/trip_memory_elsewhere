import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';

test('loadConfig returns safe local defaults', () => {
  const result = loadConfig({ NODE_ENV: 'test' });

  assert.equal(result.nodeEnv, 'test');
  assert.equal(result.host, '127.0.0.1');
  assert.equal(result.port, 8787);
  assert.equal(result.bodyLimit, 32 * 1024);
});

test('loadConfig rejects an invalid port before startup', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'test', PORT: '70000' }),
    /Invalid backend configuration/,
  );
});
