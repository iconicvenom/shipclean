import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from '../src/cli.js';
import { snapshotTree, withFixture, writeTree, runBin } from './helpers.js';

test('parseArgs accepts scan aliases and rejects unknown flags', () => {
  assert.equal(parseArgs(['.']).command, 'scan');
  assert.equal(parseArgs(['scan', 'proj', '--json']).flags.json, true);
  assert.equal(parseArgs(['--explain']).flags.explain, true);
  assert.throws(() => parseArgs(['--wat']), /Unknown option/);
  assert.throws(() => parseArgs(['--clean']), /Deletion flags/);
  assert.throws(() => parseArgs(['a', 'b']), /at most one directory/);
});

test('help and version write to stdout and exit 0', async () => {
  const help = await runBin(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /shipclean/);
  const version = await runBin(['--version']);
  assert.equal(version.code, 0);
  assert.match(version.stdout, /^\d+\.\d+\.\d+\n$/);
});

test('JSON CLI is parseable and human CLI does not mutate', async () => withFixture(async (root) => {
  await writeTree(root, { 'TASKS.md': 'todo', 'README.md': 'keep' });
  const before = await snapshotTree(root);
  const json = await runBin(['scan', root, '--json']);
  assert.equal(json.code, 0);
  const report = JSON.parse(json.stdout);
  assert.equal(report.schemaVersion, 1);
  assert.ok(report.findings.some((item) => item.path === 'TASKS.md'));
  const human = await runBin([root]);
  assert.equal(human.code, 0);
  assert.match(human.stdout, /preview only/i);
  assert.deepEqual(await snapshotTree(root), before);
}));

test('filters, explain, out, and config init', async () => withFixture(async (root) => {
  await writeTree(root, {
    'TASKS.md': 'todo',
    'screenshots/a.png': 'img'
  });
  const md = await runBin(['scan', root, '--md', '--json']);
  const mdReport = JSON.parse(md.stdout);
  assert.ok(mdReport.findings.every((item) => item.category === 'ai-planning-document'));
  const images = await runBin(['scan', root, '--images', '--json']);
  const imageReport = JSON.parse(images.stdout);
  assert.ok(imageReport.findings.every((item) => item.category === 'reference-image'));
  const explain = await runBin(['scan', root, '--explain']);
  assert.match(explain.stdout, /level=/);
  const outFile = path.join(root, 'report.json');
  const written = await runBin(['scan', root, '--json', '--out', 'report.json'], { cwd: root });
  assert.equal(written.code, 0);
  const dumped = JSON.parse(await fs.readFile(outFile, 'utf8'));
  assert.equal(dumped.schemaVersion, 1);
  const init = await runBin(['config', 'init', root]);
  assert.equal(init.code, 0);
  const again = await runBin(['config', 'init', root]);
  assert.equal(again.code, 2);
}));

test('non-interactive clean without --select fails closed', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'x' });
  const result = await runBin(['clean', root]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /TTY/);
  assert.equal((await fs.readFile(path.join(root, 'debug.log'), 'utf8')), 'x');
}));

test('error on nonexistent directory does not throw uncaught', async () => withFixture(async (root) => {
  const result = await runBin(['scan', path.join(root, 'missing')]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /not found/i);
}));
