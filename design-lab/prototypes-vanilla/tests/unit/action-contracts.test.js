import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import {
  ACTION_AUTHORITIES,
  STORE_ACTION_AUTHORITIES,
  SUPPORTED_ACTIONS,
} from '../../src/controllers/action-controller.js';
import { renderInboxPage } from '../../src/pages/fragments.js';
import { renderConnectionDetail } from '../../src/pages/explore.js';
import { renderDeleteConfirmation } from '../../src/overlays/delete-confirmation.js';

const sourceRoots = ['../../src/pages', '../../src/components', '../../src/overlays'];

async function sourceFiles(relativeRoot) {
  const root = new URL(`${relativeRoot}/`, import.meta.url);
  const names = await readdir(root);
  return Promise.all(names.filter((name) => name.endsWith('.js')).map(async (name) => ({
    name: `${relativeRoot}/${name}`,
    source: await readFile(new URL(name, root), 'utf8'),
  })));
}

test('every rendered button declares a supported action or is explicitly disabled', async () => {
  const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
  const unsupported = [];
  const inert = [];

  for (const file of files) {
    for (const match of file.source.matchAll(/<button\b([^>]*)>/g)) {
      const attributes = match[1];
      const action = attributes.match(/data-action=["']([^"']+)["']/)?.[1];
      if (!action && !attributes.includes('disabled')) inert.push(file.name);
      if (action && !SUPPORTED_ACTIONS.has(action)) unsupported.push(`${file.name}:${action}`);
    }
  }

  assert.deepEqual(inert, []);
  assert.deepEqual(unsupported, []);
});

test('every click and form action has one explicit execution authority', async () => {
  const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
  const storeActions = new Set(files.flatMap(({ source }) => [...source.matchAll(
    /data-store-action=["']([^"']+)["']/g,
  )].map((match) => match[1])));

  assert.deepEqual([...SUPPORTED_ACTIONS].sort(), Object.keys(ACTION_AUTHORITIES).sort());
  assert.deepEqual([...storeActions].sort(), Object.keys(STORE_ACTION_AUTHORITIES).sort());
});

test('review and connection decisions carry the authority object they mutate', () => {
  assert.match(renderInboxPage().html, /data-action="review-choice"[^>]*data-review-id="review-river-1022-place"/);
  assert.match(renderConnectionDetail('rel-river-ticket-photo').html, /data-action="connection-decision"[^>]*data-connection-id="rel-river-ticket-photo"/);
});

test('decisions render a visible selected state instead of becoming silent clicks', () => {
  assert.match(renderInboxPage({ reviewDecisions: { 'review-river-1022-place': '1' } }).html, /data-value="1"[^>]*class="is-selected"/);
  assert.match(renderConnectionDetail('rel-river-ticket-photo', { connectionDecisions: { 'rel-river-ticket-photo': 'rejected' } }).html, /data-value="rejected"[^>]*class="is-selected"/);
});

test('destructive journey exclusion is disabled until its explicit acknowledgement', () => {
  const html = renderDeleteConfirmation('journey-bangkok-2024');
  assert.match(html, /data-store-action="delete-ack"/);
  assert.match(html, /data-action="confirm-delete"[^>]*disabled/);
});
