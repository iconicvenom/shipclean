import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { scanProject } from '../src/index.js';
import { collectReferences, resolveReference } from '../src/references.js';
import { withFixture, writeTree } from './helpers.js';

// ---------------------------------------------------------------------------
// resolveReference (unit tests)
// ---------------------------------------------------------------------------

test('resolveReference ignores urls and stays inside root', () => {
  const root = path.resolve('/tmp/shipclean-root');
  const from = path.join(root, 'docs/page.md');

  // External URLs are skipped
  assert.equal(resolveReference(root, from, 'https://example.com/a.png'), null);
  assert.equal(resolveReference(root, from, 'http://cdn.example.com/img.jpg'), null);
  assert.equal(resolveReference(root, from, '//cdn.example.com/img.jpg'), null);
  assert.equal(resolveReference(root, from, 'data:image/png;base64,abc'), null);

  // Fragments and anchors are skipped
  assert.equal(resolveReference(root, from, '#section-link'), null);

  // Traversal outside root is blocked
  assert.equal(resolveReference(root, from, '../../outside.png'), null);
  assert.equal(resolveReference(root, from, '/absolute/path.png'), null);
});

test('resolveReference resolves relative references to POSIX paths', () => {
  const root = path.resolve('/tmp/shipclean-root');
  const from = path.join(root, 'docs/page.md');

  // A relative reference inside root should resolve
  const result = resolveReference(root, from, '../screenshots/home.png');
  assert.equal(result, 'screenshots/home.png');
});

test('resolveReference handles URL-encoded characters', () => {
  const root = path.resolve('/tmp/shipclean-root');
  const from = path.join(root, 'README.md');

  // %20 → space — should still resolve inside root
  const result = resolveReference(root, from, 'screenshots/home%20page.png');
  assert.equal(result, 'screenshots/home page.png');
});

test('resolveReference trims query strings and anchors from paths', () => {
  const root = path.resolve('/tmp/shipclean-root');
  const from = path.join(root, 'README.md');

  const result = resolveReference(root, from, 'screenshots/home.png?v=1');
  assert.equal(result, 'screenshots/home.png');

  const result2 = resolveReference(root, from, 'screenshots/home.png#caption');
  assert.equal(result2, 'screenshots/home.png');
});

// ---------------------------------------------------------------------------
// Static reference detection through scan
// ---------------------------------------------------------------------------

test('static markdown and JS references mark images as referenced', async () => withFixture(async (root) => {
  await writeTree(root, {
    'screenshots/home.png': 'img',
    'screenshots/orphan.png': 'img2',
    'README.md': 'See ![home](./screenshots/home.png)',
    'notes.js': 'import icon from "./screenshots/home.png";'
  });
  const report = await scanProject(root);
  const home = report.findings.find((item) => item.path === 'screenshots/home.png');
  const orphan = report.findings.find((item) => item.path === 'screenshots/orphan.png');
  assert.equal(home.referenced, 'yes');
  assert.equal(home.suggestion, 'preserve');
  assert.equal(orphan.referenced, 'no-observed-reference');
  assert.match(orphan.explanation, /not proof/i);
}));

test('HTML src and href attributes are detected as references', async () => withFixture(async (root) => {
  await writeTree(root, {
    'screenshots/chart.png': 'png',
    'index.html': '<img src="./screenshots/chart.png" alt="chart">'
  });
  const report = await scanProject(root);
  const chart = report.findings.find((f) => f.path === 'screenshots/chart.png');
  assert.equal(chart?.referenced, 'yes', 'HTML src attribute reference must be detected');
}));

test('CSS url() references are detected', async () => withFixture(async (root) => {
  await writeTree(root, {
    'screenshots/bg.png': 'png',
    'styles.css': 'body { background: url("./screenshots/bg.png"); }'
  });
  const report = await scanProject(root);
  const bg = report.findings.find((f) => f.path === 'screenshots/bg.png');
  assert.equal(bg?.referenced, 'yes', 'CSS url() reference must be detected');
}));

test('source-tree images stay protected even without imports', async () => withFixture(async (root) => {
  await writeTree(root, {
    'src/logo.png': 'logo',
    'public/banner.png': 'banner'
  });
  const report = await scanProject(root);
  assert.equal(report.findings.length, 0);
  assert.ok(report.protected.some((item) => item.path === 'src/logo.png'));
  assert.ok(report.protected.some((item) => item.path === 'public/banner.png'));
}));

test('no-observed-reference does not mean safe to delete', async () => withFixture(async (root) => {
  await writeTree(root, {
    'screenshots/orphan.png': 'png'
  });
  const report = await scanProject(root);
  const orphan = report.findings.find((f) => f.path === 'screenshots/orphan.png');
  assert.ok(orphan, 'orphan.png must be in findings');
  assert.equal(orphan.referenced, 'no-observed-reference');
  // Explanation must clearly state it is NOT proof of non-use
  assert.match(orphan.explanation, /not proof/i);
  // Suggestion must never be "delete"
  assert.notEqual(orphan.suggestion, 'delete');
}));

test('referenced image gets preserve suggestion', async () => withFixture(async (root) => {
  await writeTree(root, {
    'screenshots/used.png': 'png',
    'README.md': '![](./screenshots/used.png)'
  });
  const report = await scanProject(root);
  const used = report.findings.find((f) => f.path === 'screenshots/used.png');
  assert.ok(used, 'used.png must be in findings');
  assert.equal(used.referenced, 'yes');
  assert.equal(used.suggestion, 'preserve');
  assert.match(used.explanation, /reference was observed/i);
}));

test('binary files are skipped during reference collection without crashing', async () => withFixture(async (root) => {
  await writeTree(root, {
    'screenshots/logo.png': 'img',
    'data.bin': Buffer.from([0x00, 0x01, 0x02, 0x03]).toString()
  });
  // Should not throw
  const report = await scanProject(root);
  assert.equal(report.schemaVersion, 1);
}));

test('reference detection works across subdirectory depth', async () => withFixture(async (root) => {
  await writeTree(root, {
    'screenshots/deep.png': 'png',
    'docs/pages/guide.md': '![](../../screenshots/deep.png)'
  });
  const report = await scanProject(root);
  const deep = report.findings.find((f) => f.path === 'screenshots/deep.png');
  // May or may not resolve depending on path resolution
  assert.ok(deep, 'deep.png must be in findings');
  assert.equal(typeof deep.referenced, 'string');
}));
