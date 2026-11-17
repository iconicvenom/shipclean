import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, validateConfig, DEFAULT_CONFIG } from '../src/config.js';
import { scanProject } from '../src/index.js';
import { withFixture, writeTree } from './helpers.js';

test('defaults load when no config file exists', async () => withFixture(async (root) => {
  const config = await loadConfig(root);
  assert.equal(config.followSymlinks, false);
  assert.equal(config.maxFiles, DEFAULT_CONFIG.maxFiles);
}));

test('rejects unknown keys, symlink following, and bad bounds', () => {
  assert.throws(() => validateConfig({ mystery: true }), /Unknown config key/);
  assert.throws(() => validateConfig({ followSymlinks: true }), /followSymlinks/);
  assert.throws(() => validateConfig({ maxFiles: 0 }), /maxFiles/);
  assert.throws(() => validateConfig('nope'), /JSON object/);
});

test('parses project config and applies custom ignore/protect/candidates', async () => withFixture(async (root) => {
  await writeTree(root, {
    '.shipcleanrc.json': JSON.stringify({
      ignore: ['skip-me/'],
      protect: ['keep-me.md'],
      customCandidates: [{ pattern: 'TEAM_NOTES.md', explanation: 'team scratch' }],
      followSymlinks: false
    }),
    'skip-me/debug.log': 'hidden',
    'keep-me.md': 'protected by config',
    'TEAM_NOTES.md': 'notes'
  });
  const report = await scanProject(root);
  assert.equal(report.findings.some((item) => item.path.startsWith('skip-me/')), false);
  assert.ok(report.protected.some((item) => item.path === 'keep-me.md'));
  const custom = report.findings.find((item) => item.path === 'TEAM_NOTES.md');
  assert.ok(custom);
  assert.match(custom.explanation, /team scratch/);
}));

test('malformed JSON config fails closed', async () => withFixture(async (root) => {
  await fs.writeFile(path.join(root, '.shipcleanrc.json'), '{bad');
  await assert.rejects(() => loadConfig(root), /invalid JSON/i);
}));
