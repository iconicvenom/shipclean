import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { quarantineSelected } from '../src/quarantine.js';
import { restoreBatch, listQuarantineBatches } from '../src/restore.js';
import { withFixture, writeTree } from './helpers.js';

test('quarantine and restore round-trip keeps bytes identical', async () => withFixture(async (root) => {
  const payload = 'exact-bytes-\u2603';
  await writeTree(root, { 'debug.log': payload });
  const moved = await quarantineSelected({ root, selected: ['debug.log'] });
  const restored = await restoreBatch({ root, id: moved.id });
  assert.deepEqual(restored.restored, ['debug.log']);
  assert.equal(await fs.readFile(path.join(root, 'debug.log'), 'utf8'), payload);
}));

test('restore dry-run leaves quarantine in place', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'x' });
  const moved = await quarantineSelected({ root, selected: ['debug.log'] });
  const dry = await restoreBatch({ root, id: moved.id, dryRun: true });
  assert.equal(dry.dryRun, true);
  await assert.rejects(() => fs.access(path.join(root, 'debug.log')));
}));

test('refuses overwrite and traversal entries in a tampered manifest', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'x' });
  const moved = await quarantineSelected({ root, selected: ['debug.log'] });
  await fs.writeFile(path.join(root, 'debug.log'), 'new');
  await assert.rejects(() => restoreBatch({ root, id: moved.id }), /overwrite/i);

  const manifestPath = path.join(root, moved.manifestPath);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.items[0].originalRelative = '../escape.txt';
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  await fs.rm(path.join(root, 'debug.log'));
  await assert.rejects(() => restoreBatch({ root, id: moved.id }), /traversal|escapes/i);
}));

test('list batches and reject absolute ids', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'x' });
  const moved = await quarantineSelected({ root, selected: ['debug.log'] });
  const listed = await listQuarantineBatches(root);
  assert.ok(listed.batches.some((batch) => batch.id === moved.id));
  await assert.rejects(() => restoreBatch({ root, id: '../x' }), /Invalid batch id/);
}));
