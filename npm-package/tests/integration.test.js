/**
 * integration.test.js
 *
 * End-to-end integration tests that exercise the complete Shipclean workflow:
 * scan → clean → restore, using realistic fixture project trees.
 *
 * All tests use temporary directories; no real project files are modified.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanProject } from '../src/index.js';
import { quarantineSelected } from '../src/quarantine.js';
import { restoreBatch, listQuarantineBatches } from '../src/restore.js';
import { formatHumanReport, formatJson } from '../src/report.js';
import { withFixture, writeTree, runBin, snapshotTree } from './helpers.js';

// ---------------------------------------------------------------------------
// Realistic fixture: typical AI-assisted dev project
// ---------------------------------------------------------------------------

const REALISTIC_TREE = {
  // Protected: source
  'src/index.js': 'export default function main() {}',
  'src/api.js': 'export const api = {};',
  'src/components/Button.jsx': 'export const Button = () => null;',
  // Protected: config and docs
  'package.json': '{"name":"test-app","version":"1.0.0"}',
  'README.md': '# Test App',
  'LICENSE': 'MIT License',
  '.gitignore': 'node_modules/',
  // Protected: agent instructions
  'CLAUDE.md': 'You are a helpful assistant.',
  'AGENTS.md': '# Agent instructions',
  // Candidates: AI planning docs
  'IMPLEMENTATION_PLAN.md': '# Plan\n- Step 1\n- Step 2',
  'TASKS.md': '- [x] Done\n- [ ] TODO',
  'docs/plans/feature-x.md': '# Feature X Plan',
  // Candidates: debug artifacts
  'debug.log': '[ERROR] Something went wrong\n[DEBUG] Processing...',
  'api-errors.log': '[ERROR] 500 Internal Server Error',
  'backup/config.bak': '# Old config',
  'config.orig': '# Original config',
  // Candidates: screenshots in screenshot folder
  'screenshots/login-flow.png': 'PNG_DATA',
  'screenshots/homepage.png': 'PNG_DATA_2',
  // Protected: image in public (should not be flagged)
  'public/logo.png': 'LOGO_PNG',
  'public/favicon.ico': 'ICO_DATA',
  // Candidates: duplicate files
  'notes-copy-1.txt': 'shared content',
  'notes-copy-2.txt': 'shared content',
  // Public assets (protected)
  'assets/hero.webp': 'WEBP_DATA'
};

test('realistic fixture: scan correctly categorizes all file types', async () => withFixture(async (root) => {
  await writeTree(root, REALISTIC_TREE);
  const report = await scanProject(root);

  // Protected items should not appear in findings
  const findingPaths = new Set(report.findings.map((f) => f.path));
  assert.ok(!findingPaths.has('src/index.js'), 'src/index.js must be protected');
  assert.ok(!findingPaths.has('package.json'), 'package.json must be protected');
  assert.ok(!findingPaths.has('README.md'), 'README.md must be protected');
  assert.ok(!findingPaths.has('CLAUDE.md'), 'CLAUDE.md must be protected');
  assert.ok(!findingPaths.has('public/logo.png'), 'public/logo.png must be protected');
  assert.ok(!findingPaths.has('assets/hero.webp'), 'assets/hero.webp must be protected');

  // AI planning docs should be flagged
  assert.ok(findingPaths.has('IMPLEMENTATION_PLAN.md'), 'IMPLEMENTATION_PLAN.md must be flagged');
  assert.ok(findingPaths.has('TASKS.md'), 'TASKS.md must be flagged');
  assert.ok(findingPaths.has('docs/plans/feature-x.md'), 'docs/plans/feature-x.md must be flagged');

  // Debug logs should be flagged
  assert.ok(findingPaths.has('debug.log'), 'debug.log must be flagged');

  // Screenshots should be flagged
  assert.ok(findingPaths.has('screenshots/login-flow.png'), 'screenshots/login-flow.png must be flagged');

  // Duplicate detection
  assert.ok(report.duplicates.length >= 1, 'must detect at least one duplicate group');
  const dupPaths = report.duplicates[0].paths;
  assert.ok(dupPaths.includes('notes-copy-1.txt') && dupPaths.includes('notes-copy-2.txt'));

  // Summary sanity
  assert.equal(report.schemaVersion, 1);
  assert.ok(report.summary.filesScanned > 0);
  assert.ok(report.summary.flaggedFiles >= 5);
  assert.ok(report.summary.protectedFiles >= 5);
}));

test('realistic fixture: scan is completely read-only', async () => withFixture(async (root) => {
  await writeTree(root, REALISTIC_TREE);
  const before = await snapshotTree(root);
  await scanProject(root);
  await scanProject(root); // second scan
  const after = await snapshotTree(root);
  assert.deepEqual(after, before, 'scanProject must not modify the filesystem');
}));

test('realistic fixture: human report contains expected sections', async () => withFixture(async (root) => {
  await writeTree(root, REALISTIC_TREE);
  const report = await scanProject(root);
  const human = formatHumanReport(report, { color: false });

  assert.match(human, /preview only/i);
  assert.match(human, /REVIEW/);
  assert.match(human, /Nothing changed/);
  assert.ok(!human.includes('\u001b['), 'No ANSI color when color=false');
  // Should contain the notice about not proof of non-use
  assert.match(human, /not proof/i);
}));

test('realistic fixture: JSON report parses and matches schema', async () => withFixture(async (root) => {
  await writeTree(root, REALISTIC_TREE);
  const report = await scanProject(root);
  const jsonText = formatJson(report);
  const parsed = JSON.parse(jsonText);

  assert.equal(parsed.schemaVersion, 1);
  assert.ok(Array.isArray(parsed.findings));
  assert.ok(Array.isArray(parsed.protected));
  assert.ok(Array.isArray(parsed.duplicates));
  assert.ok(Array.isArray(parsed.warnings));
  assert.ok(typeof parsed.summary === 'object');
  assert.ok(typeof parsed.root === 'string');
  assert.ok(typeof parsed.notice === 'string');

  // Every finding must have required fields
  for (const finding of parsed.findings) {
    for (const key of ['path', 'category', 'ruleId', 'explanation', 'sizeBytes', 'level', 'referenced', 'suggestion']) {
      assert.ok(key in finding, `finding missing key: ${key}`);
    }
    assert.ok(['review', 'potentially-safe', 'protected', 'unknown'].includes(finding.level));
    assert.ok(['yes', 'no-observed-reference', 'unresolved'].includes(finding.referenced));
  }
}));

// ---------------------------------------------------------------------------
// Full workflow: scan → quarantine → restore
// ---------------------------------------------------------------------------

test('full workflow: quarantine then restore is lossless', async () => withFixture(async (root) => {
  const content = 'important notes\nwith unicode: 🚀\nand special chars: &<>';
  await writeTree(root, {
    'TASKS.md': content,
    'debug.log': 'log data',
    'README.md': 'keep this'
  });
  const beforeSnapshot = await snapshotTree(root);

  // Quarantine both candidates
  const cleanResult = await quarantineSelected({
    root,
    selected: ['TASKS.md', 'debug.log']
  });

  assert.equal(cleanResult.moved.length, 2);
  assert.equal(cleanResult.dryRun, false);
  assert.ok(cleanResult.id, 'must produce a batch id');
  assert.ok(cleanResult.manifestPath, 'must produce a manifest path');

  // The files should be gone from their original locations
  await assert.rejects(() => fs.access(path.join(root, 'TASKS.md')));
  await assert.rejects(() => fs.access(path.join(root, 'debug.log')));

  // README must still be there
  assert.equal(await fs.readFile(path.join(root, 'README.md'), 'utf8'), 'keep this');

  // List batches
  const listed = await listQuarantineBatches(root);
  assert.ok(listed.batches.some((b) => b.id === cleanResult.id));

  // Restore the batch
  const restoreResult = await restoreBatch({ root, id: cleanResult.id });
  assert.equal(restoreResult.dryRun, false);
  assert.deepEqual(restoreResult.restored.sort(), ['TASKS.md', 'debug.log'].sort());

  // Content must be byte-identical after restore
  assert.equal(await fs.readFile(path.join(root, 'TASKS.md'), 'utf8'), content);

  // Tree must match what it was before quarantine
  const afterSnapshot = await snapshotTree(root);
  // Filter out quarantine directory (which may linger as empty dir)
  const normalize = (snap) => snap.filter((s) => !s.startsWith('.shipclean-quarantine'));
  assert.deepEqual(normalize(afterSnapshot).sort(), normalize(beforeSnapshot).sort());
}));

test('quarantine prevents duplicated paths in one batch', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'x' });
  const result = await quarantineSelected({ root, selected: ['debug.log', 'debug.log'] });
  // De-duplicated: should only move one file
  assert.equal(result.moved.length, 1);
}));

test('dry-run quarantine followed by real quarantine both succeed', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'data' });
  const dry = await quarantineSelected({ root, selected: ['debug.log'], dryRun: true });
  assert.equal(dry.dryRun, true);
  // File still exists
  assert.equal(await fs.readFile(path.join(root, 'debug.log'), 'utf8'), 'data');

  // Now do the real thing
  const real = await quarantineSelected({ root, selected: ['debug.log'], dryRun: false });
  assert.equal(real.moved.length, 1);
  await assert.rejects(() => fs.access(path.join(root, 'debug.log')));
}));

// ---------------------------------------------------------------------------
// Config file integration
// ---------------------------------------------------------------------------

test('config file affects scan results correctly', async () => withFixture(async (root) => {
  await writeTree(root, {
    '.shipcleanrc.json': JSON.stringify({
      ignore: ['vendor/'],
      protect: ['NOTES.md'],
      customCandidates: [{
        pattern: 'SPRINT_NOTES.md',
        category: 'ai-planning-document',
        explanation: 'Sprint planning notes are project-specific AI artifacts.'
      }],
      followSymlinks: false
    }),
    'vendor/debug.log': 'hidden by ignore',
    'NOTES.md': 'protected by user config',
    'SPRINT_NOTES.md': 'custom candidate',
    'debug.log': 'regular candidate'
  });

  const report = await scanProject(root);

  // vendor/ is ignored
  assert.equal(report.findings.some((f) => f.path.startsWith('vendor/')), false);

  // NOTES.md is user-protected
  const notesProtected = report.protected.find((p) => p.path === 'NOTES.md');
  assert.ok(notesProtected, 'NOTES.md must be in protected list');

  // SPRINT_NOTES.md is a custom candidate
  const sprintNotes = report.findings.find((f) => f.path === 'SPRINT_NOTES.md');
  assert.ok(sprintNotes, 'SPRINT_NOTES.md must be in findings');
  assert.match(sprintNotes.explanation, /Sprint planning/);

  // debug.log still found
  assert.ok(report.findings.some((f) => f.path === 'debug.log'));
}));

// ---------------------------------------------------------------------------
// Protection enforcement during cleanup
// ---------------------------------------------------------------------------

test('quarantine refuses to move protected files even if explicitly selected', async () => withFixture(async (root) => {
  await writeTree(root, {
    'README.md': 'keep',
    'debug.log': 'data'
  });
  // Try to quarantine a hard-protected file
  await assert.rejects(
    () => quarantineSelected({ root, selected: ['README.md'] }),
    /protected|not a current scan candidate/i
  );
  // debug.log should still be quarantinable
  const result = await quarantineSelected({ root, selected: ['debug.log'] });
  assert.equal(result.moved.length, 1);
}));

test('quarantine refuses path traversal attempts', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'x' });
  await assert.rejects(
    () => quarantineSelected({ root, selected: ['../outside'] }),
    /project-relative|traversal|escapes/i
  );
  await assert.rejects(
    () => quarantineSelected({ root, selected: ['/absolute/path'] }),
    /project-relative|traversal|escapes/i
  );
}));

test('restore refuses to overwrite existing files', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'original' });
  const moved = await quarantineSelected({ root, selected: ['debug.log'] });

  // Recreate the file at the original location
  await fs.writeFile(path.join(root, 'debug.log'), 'new content');

  // Restore should refuse to overwrite
  await assert.rejects(
    () => restoreBatch({ root, id: moved.id }),
    /overwrite/i
  );
}));

// ---------------------------------------------------------------------------
// CLI integration tests
// ---------------------------------------------------------------------------

test('CLI scan command is fully read-only and exits 0', async () => withFixture(async (root) => {
  await writeTree(root, {
    'TASKS.md': 'todo',
    'README.md': 'keep',
    'debug.log': 'log'
  });
  const before = await snapshotTree(root);
  const result = await runBin(['scan', root]);
  assert.equal(result.code, 0, `CLI scan exited ${result.code}: ${result.stderr}`);
  assert.match(result.stdout, /preview only/i);
  const after = await snapshotTree(root);
  assert.deepEqual(after, before, 'CLI scan must not modify filesystem');
}));

test('CLI --json produces parseable structured output with stable schema', async () => withFixture(async (root) => {
  await writeTree(root, { 'TASKS.md': 'x', 'debug.log': 'y', 'README.md': 'z' });
  const result = await runBin(['scan', root, '--json']);
  assert.equal(result.code, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 1);
  assert.ok(Array.isArray(report.findings));
  assert.ok(typeof report.summary.filesScanned === 'number');
  assert.ok(report.findings.some((f) => f.path === 'TASKS.md'));
  assert.ok(report.protected.some((p) => p.path === 'README.md'));
}));

test('CLI rejects unknown flags and exits 2', async () => withFixture(async (root) => {
  const result = await runBin(['scan', root, '--foobar']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unknown option|foobar/i);
}));

test('CLI --explain includes level= and referenced= in output', async () => withFixture(async (root) => {
  await writeTree(root, { 'TASKS.md': 'plan', 'debug.log': 'log' });
  const result = await runBin(['scan', root, '--explain']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /level=/);
  assert.match(result.stdout, /referenced=/);
}));

test('CLI --md filter returns only ai-planning-document findings', async () => withFixture(async (root) => {
  await writeTree(root, {
    'TASKS.md': 'todo',
    'debug.log': 'log',
    'screenshots/a.png': 'img'
  });
  const result = await runBin(['scan', root, '--md', '--json']);
  assert.equal(result.code, 0);
  const report = JSON.parse(result.stdout);
  assert.ok(report.findings.every((f) => f.category === 'ai-planning-document'));
  assert.equal(report.findings.some((f) => f.path === 'debug.log'), false);
}));

test('CLI --images filter returns only reference-image findings', async () => withFixture(async (root) => {
  await writeTree(root, {
    'TASKS.md': 'todo',
    'debug.log': 'log',
    'screenshots/a.png': 'img'
  });
  const result = await runBin(['scan', root, '--images', '--json']);
  assert.equal(result.code, 0);
  const report = JSON.parse(result.stdout);
  assert.ok(report.findings.every((f) => f.category === 'reference-image'));
  assert.equal(report.findings.some((f) => f.path === 'TASKS.md'), false);
}));

test('CLI --out writes JSON to a file inside cwd', async () => withFixture(async (root) => {
  await writeTree(root, { 'TASKS.md': 'plan' });
  const result = await runBin(['scan', root, '--out', 'report.json'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const written = JSON.parse(await fs.readFile(path.join(root, 'report.json'), 'utf8'));
  assert.equal(written.schemaVersion, 1);
}));

test('CLI clean --dry-run does not move files', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'x' });
  const result = await runBin(['clean', root, '--select', 'debug.log', '--dry-run', '--json']);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  // File still present
  assert.equal(await fs.readFile(path.join(root, 'debug.log'), 'utf8'), 'x');
}));

test('CLI restore --dry-run lists files without restoring', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'x' });
  const cleanResult = await runBin(['clean', root, '--select', 'debug.log', '--json']);
  const { id } = JSON.parse(cleanResult.stdout);

  const dryResult = await runBin(['restore', root, '--id', id, '--dry-run', '--json']);
  assert.equal(dryResult.code, 0);
  const payload = JSON.parse(dryResult.stdout);
  assert.equal(payload.dryRun, true);
  assert.deepEqual(payload.restored, ['debug.log']);
  // File is still in quarantine
  await assert.rejects(() => fs.access(path.join(root, 'debug.log')));
}));

test('CLI restore list shows batches', async () => withFixture(async (root) => {
  await writeTree(root, { 'debug.log': 'x', 'TASKS.md': 'y' });
  await runBin(['clean', root, '--select', 'debug.log', '--json']);
  const result = await runBin(['restore', root]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /file/i);
}));

test('CLI --version outputs semantic version number', async () => {
  const result = await runBin(['--version']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^\d+\.\d+\.\d+\n$/);
});

test('CLI --help includes all major commands', async () => {
  const result = await runBin(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /scan/);
  assert.match(result.stdout, /clean/);
  assert.match(result.stdout, /restore/);
  assert.match(result.stdout, /config/);
  assert.match(result.stdout, /--json/);
  assert.match(result.stdout, /--explain/);
});

test('CLI config init creates .shipcleanrc.json and refuses to overwrite', async () => withFixture(async (root) => {
  const first = await runBin(['config', 'init', root]);
  assert.equal(first.code, 0);
  const cfg = JSON.parse(await fs.readFile(path.join(root, '.shipcleanrc.json'), 'utf8'));
  assert.ok(Array.isArray(cfg.ignore));
  assert.ok(typeof cfg.maxFiles === 'number');

  // Second init must fail with exit 2
  const second = await runBin(['config', 'init', root]);
  assert.equal(second.code, 2);
  assert.match(second.stderr, /already exists/i);
}));

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('empty project produces zero findings and no errors', async () => withFixture(async (root) => {
  const report = await scanProject(root);
  assert.equal(report.findings.length, 0);
  assert.equal(report.duplicates.length, 0);
  assert.equal(report.warnings.length, 0);
  assert.equal(report.schemaVersion, 1);
}));

test('project with only protected files produces zero findings', async () => withFixture(async (root) => {
  await writeTree(root, {
    'README.md': 'docs',
    'package.json': '{}',
    'src/app.js': 'app',
    'public/index.html': '<html/>',
    'LICENSE': 'MIT'
  });
  const report = await scanProject(root);
  assert.equal(report.findings.length, 0, 'no findings when only protected files exist');
  assert.ok(report.protected.length >= 3);
}));

test('unicode filenames and spaces are handled without error', async () => withFixture(async (root) => {
  await writeTree(root, {
    '任务.md': '待办事项',
    'notes with spaces.md': 'content',
    'TASKS.md': 'todo',
    'screenshots/页面截图.png': 'png'
  });
  const report = await scanProject(root);
  assert.ok(report.findings.some((f) => f.path === 'TASKS.md'));
  // Unicode markdown is not a planning doc by pattern — should not throw
  assert.ok(!report.findings.some((f) => f.path === '任务.md'));
  // Did not crash
  assert.equal(report.schemaVersion, 1);
}));

test('findings are sorted by path alphabetically', async () => withFixture(async (root) => {
  await writeTree(root, {
    'z-tasks.md': 'z',
    'a-tasks.md': 'a',
    'TASKS.md': 't'
  });
  // Classify z-tasks.md / a-tasks.md as candidates by using TASKS pattern workaround:
  // create them with planning names
  await fs.rm(path.join(root, 'z-tasks.md'));
  await fs.rm(path.join(root, 'a-tasks.md'));
  await writeTree(root, {
    'z_implementation_plan.md': 'z',
    'a_implementation_plan.md': 'a',
    'TASKS.md': 't'
  });
  const report = await scanProject(root);
  const paths = report.findings.map((f) => f.path);
  const sorted = [...paths].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(paths, sorted, 'findings must be sorted by path');
}));

test('scan handles maxFiles from config correctly', async () => withFixture(async (root) => {
  await writeTree(root, {
    'a.bak': '1',
    'b.bak': '2',
    'c.bak': '3',
    'd.bak': '4'
  });
  const report = await scanProject(root, { maxFiles: 2 });
  assert.equal(report.summary.partial, true);
  assert.ok(report.warnings.some((w) => w.code === 'SCAN_LIMIT_REACHED'));
}));
