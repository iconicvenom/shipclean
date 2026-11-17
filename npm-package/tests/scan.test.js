import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanProject } from '../src/index.js';
import { snapshotTree, withFixture, writeTree } from './helpers.js';

test('scan is deterministic and does not mutate the tree', async () => withFixture(async (root) => {
  await writeTree(root, {
    'TASKS.md': 'todo',
    'README.md': 'keep',
    'debug.log': 'log',
    'src/index.js': 'export default 1;\n',
    'screenshots/home.png': 'fake-png'
  });
  const before = await snapshotTree(root);
  const first = await scanProject(root);
  const second = await scanProject(root);
  const after = await snapshotTree(root);
  assert.deepEqual(after, before);
  assert.deepEqual(first.findings.map((item) => item.path), second.findings.map((item) => item.path));
  assert.ok(first.findings.find((item) => item.path === 'TASKS.md'));
  assert.ok(first.findings.find((item) => item.path === 'debug.log'));
  assert.ok(first.findings.find((item) => item.path === 'screenshots/home.png'));
  assert.ok(first.protected.find((item) => item.path === 'README.md'));
  assert.ok(first.protected.find((item) => item.path === 'src/index.js'));
  assert.equal(first.findings.find((item) => item.path === 'src/index.js'), undefined);
}));

test('handles empty project, unicode names, and nested spaces', async () => withFixture(async (root) => {
  const empty = await scanProject(root);
  assert.equal(empty.findings.length, 0);
  await writeTree(root, {
    'docs/plans/my plan.md': 'plan',
    'notes/任务.md': 'x'
  });
  await fs.writeFile(path.join(root, 'scratch-notes.md'), 'scratch');
  const report = await scanProject(root);
  assert.ok(report.findings.some((item) => item.path === 'scratch-notes.md'));
  assert.ok(report.findings.some((item) => item.path.includes('plans/')));
}));

test('skips node_modules and does not follow outside symlinks', async () => withFixture(async (root) => {
  const outside = await fs.mkdtemp(path.join(path.dirname(root), 'outside-'));
  try {
    await writeTree(outside, { 'TASKS.md': 'secret' });
    await writeTree(root, {
      'node_modules/pkg/TASKS.md': 'dep',
      'ok/debug.log': '1'
    });
    await fs.symlink(outside, path.join(root, 'escape'));
    const report = await scanProject(root);
    assert.equal(report.findings.some((item) => item.path.includes('node_modules')), false);
    assert.equal(report.findings.some((item) => item.path.startsWith('escape/')), false);
    assert.ok(report.summary.symlinksSkipped >= 1);
    assert.ok(report.findings.some((item) => item.path === 'ok/debug.log'));
  } finally {
    await fs.rm(outside, { recursive: true, force: true });
  }
}));

test('rejects a file path and missing path', async () => withFixture(async (root) => {
  const file = path.join(root, 'only.txt');
  await fs.writeFile(file, 'x');
  await assert.rejects(() => scanProject(file), /not a directory/i);
  await assert.rejects(() => scanProject(path.join(root, 'nope')), /not found/i);
}));

test('partial scan warning when maxFiles is hit', async () => withFixture(async (root) => {
  await writeTree(root, { 'a.bak': '1', 'b.bak': '2', 'c.bak': '3' });
  const report = await scanProject(root, { maxFiles: 1 });
  assert.equal(report.summary.partial, true);
  assert.ok(report.warnings.some((item) => item.code === 'SCAN_LIMIT_REACHED'));
}));

test('JSON schema includes version, warnings, and stable finding fields', async () => withFixture(async (root) => {
  await writeTree(root, { 'TASKS.md': 'todo' });
  const report = await scanProject(root);
  assert.equal(report.schemaVersion, 1);
  const finding = report.findings[0];
  for (const key of ['path', 'category', 'ruleId', 'explanation', 'sizeBytes', 'level', 'referenced', 'suggestion']) {
    assert.ok(key in finding, `missing ${key}`);
  }
  assert.ok(['review', 'potentially-safe', 'protected', 'unknown'].includes(finding.level));
}));
