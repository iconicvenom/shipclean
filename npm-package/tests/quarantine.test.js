import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { quarantineSelected } from '../src/quarantine.js';
import { scanProject } from '../src/index.js';
import { withFixture, writeTree, snapshotTree, runBin } from './helpers.js';

test('dry-run clean does not move files', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'log-bytes' });
  const before = await snapshotTree(root);
  const result = await quarantineSelected({ root, selected: ['debug.log'], dryRun: true });
  assert.equal(result.dryRun, true);
  assert.deepEqual(await snapshotTree(root), before);
}));

test('quarantine moves candidates and writes a manifest', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'log-bytes', 'README.md': 'keep' });
  const result = await quarantineSelected({ root, selected: ['debug.log'] });
  assert.equal(result.moved.length, 1);
  await assert.rejects(() => fs.access(path.join(root, 'debug.log')));
  const manifest = JSON.parse(await fs.readFile(path.join(root, result.manifestPath), 'utf8'));
  assert.equal(manifest.items[0].originalRelative, 'debug.log');
  assert.equal(await fs.readFile(path.join(root, 'README.md'), 'utf8'), 'keep');
}));

test('refuses protected files, traversal, and changed content', async () => withFixture(async (root) => {
  await writeTree(root, { 'TASKS.md': 'todo', 'debug.log': 'log' });
  await assert.rejects(
    () => quarantineSelected({ root, selected: ['README.md'] }),
    /protected|not a current scan candidate/i
  );
  await assert.rejects(
    () => quarantineSelected({ root, selected: ['../outside'] }),
    /project-relative|escapes/i
  );
  const report = await scanProject(root);
  await fs.writeFile(path.join(root, 'debug.log'), 'changed');
  await assert.rejects(
    () => quarantineSelected({ root, selected: ['debug.log'], scanReport: report }),
    /changed since scan/i
  );
}));

test('--select non-interactive clean quarantines listed paths', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'abc' });
  const result = await runBin(['clean', root, '--select', 'debug.log', '--json']);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.moved, ['debug.log']);
}));
