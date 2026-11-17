import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { displaySafe, globToRegExp, isInsideRoot, matchGlob, toPosix, walkTree, readTextFileBounded, sha256File } from '../src/filesystem.js';
import { withFixture, writeTree } from './helpers.js';

// ---------------------------------------------------------------------------
// toPosix
// ---------------------------------------------------------------------------

test('toPosix normalizes separators', () => {
  assert.equal(toPosix(`a${path.sep}b`), 'a/b');
  assert.equal(toPosix('already/posix'), 'already/posix');
  assert.equal(toPosix(''), '');
  assert.equal(toPosix(`a${path.sep}b${path.sep}c`), 'a/b/c');
});

// ---------------------------------------------------------------------------
// displaySafe
// ---------------------------------------------------------------------------

test('displaySafe strips ASCII control characters from names', () => {
  assert.equal(displaySafe('ok\u0007file.md'), 'ok\uFFFDfile.md');
  assert.equal(displaySafe('clean'), 'clean');
  assert.equal(displaySafe('\u0000null\u001f'), '\uFFFDnull\uFFFD');
  // DEL (0x7F) is also control
  assert.equal(displaySafe('a\u007Fb'), 'a\uFFFDb');
  // Unicode non-control characters must pass through unchanged
  assert.equal(displaySafe('任务.md'), '任务.md');
  assert.equal(displaySafe('emoji 😀'), 'emoji 😀');
  // Terminal escape sequence (ANSI color codes use ESC = 0x1b)
  assert.equal(displaySafe('\u001b[31mred\u001b[0m'), '\uFFFD[31mred\uFFFD[0m');
});

// ---------------------------------------------------------------------------
// isInsideRoot
// ---------------------------------------------------------------------------

test('isInsideRoot blocks parent traversal', () => {
  const root = path.resolve('/tmp/project');
  assert.equal(isInsideRoot(root, path.join(root, 'src', 'a.js')), true);
  assert.equal(isInsideRoot(root, path.resolve(root, '..', 'other')), false);
  // Exact match is treated as inside
  assert.equal(isInsideRoot(root, root), true);
  // Deep nesting
  assert.equal(isInsideRoot(root, path.join(root, 'a', 'b', 'c', 'd')), true);
  // Adjacent directory with same prefix should NOT match
  const adjacent = path.resolve('/tmp/project-sibling');
  assert.equal(isInsideRoot(root, adjacent), false);
});

// ---------------------------------------------------------------------------
// globToRegExp / matchGlob
// ---------------------------------------------------------------------------

test('glob matching understands * and **', () => {
  assert.equal(matchGlob('docs/plans/a.md', 'docs/plans/**'), true);
  assert.equal(matchGlob('notes.md', '*.md'), true);
  assert.equal(matchGlob('src/a.js', '*.md'), false);
  assert.ok(globToRegExp('screenshots/*.png').test('screenshots/home.png'));
});

test('globToRegExp handles special regex characters correctly', () => {
  // Dot must be literal
  assert.ok(globToRegExp('file.md').test('file.md'));
  assert.ok(!globToRegExp('file.md').test('filex md'));
  // Curly braces must be literal
  assert.ok(globToRegExp('{test}.json').test('{test}.json'));
});

test('matchGlob handles single-segment wildcard ?', () => {
  assert.ok(matchGlob('file1.txt', 'file?.txt'));
  assert.ok(!matchGlob('file12.txt', 'file?.txt'));
});

test('matchGlob ** handles cross-directory patterns', () => {
  assert.ok(matchGlob('a/b/c/d.txt', 'a/**/d.txt'));
  assert.ok(matchGlob('a/d.txt', 'a/**/d.txt'));
  assert.ok(matchGlob('a/b/c.txt', '**/c.txt'));
});

test('matchGlob is case-insensitive on all platforms', () => {
  assert.ok(matchGlob('README.MD', '*.md'));
  assert.ok(matchGlob('Debug.Log', '*.log'));
});

// ---------------------------------------------------------------------------
// walkTree
// ---------------------------------------------------------------------------

test('walkTree returns sorted files and skips symlinks', async () => withFixture(async (root) => {
  await writeTree(root, {
    'b.txt': 'b',
    'a.txt': 'a',
    'sub/c.txt': 'c'
  });
  await fs.symlink(path.join(root, 'b.txt'), path.join(root, 'link.txt'));
  const result = await walkTree(root);
  const relatives = result.files.map((f) => f.relative);
  // sorted order
  assert.deepEqual(relatives, ['a.txt', 'b.txt', 'sub/c.txt']);
  assert.equal(result.summary.symlinksSkipped, 1);
}));

test('walkTree respects maxFiles and emits SCAN_LIMIT_REACHED warning', async () => withFixture(async (root) => {
  await writeTree(root, { 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' });
  const result = await walkTree(root, { maxFiles: 2 });
  assert.equal(result.files.length, 2);
  assert.equal(result.summary.partial, true);
  assert.ok(result.warnings.some((w) => w.code === 'SCAN_LIMIT_REACHED'));
}));

test('walkTree respects maxDepth and warns', async () => withFixture(async (root) => {
  await writeTree(root, {
    'level1/level2/level3/deep.txt': 'deep'
  });
  const result = await walkTree(root, { maxDepth: 2 });
  assert.ok(result.warnings.some((w) => w.code === 'MAX_DEPTH'));
  assert.equal(result.files.some((f) => f.relative.includes('deep.txt')), false);
}));

test('walkTree invokes shouldIgnoreDir and skips matching dirs', async () => withFixture(async (root) => {
  await writeTree(root, {
    'keep/file.txt': 'keep',
    'skip/secret.txt': 'secret'
  });
  const result = await walkTree(root, {
    shouldIgnoreDir: (name) => name === 'skip'
  });
  assert.ok(result.files.some((f) => f.relative === 'keep/file.txt'));
  assert.equal(result.files.some((f) => f.relative.includes('secret')), false);
}));

test('walkTree tracks bytes, dirs, and files correctly', async () => withFixture(async (root) => {
  await writeTree(root, {
    'one.txt': '123',
    'sub/two.txt': '45'
  });
  const result = await walkTree(root);
  assert.equal(result.summary.filesScanned, 2);
  assert.ok(result.summary.dirsScanned >= 2);
  assert.equal(result.summary.bytesScanned, 5); // "123" = 3 bytes, "45" = 2 bytes
}));

test('walkTree does not follow symlinked directories', async () => withFixture(async (root) => {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
  try {
    await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
    await fs.symlink(outside, path.join(root, 'linked'));
    const result = await walkTree(root);
    assert.equal(result.files.some((f) => f.relative.includes('secret')), false);
    assert.ok(result.summary.symlinksSkipped >= 1);
  } finally {
    await fs.rm(outside, { recursive: true, force: true });
  }
}));

test('walkTree invokes onWarning callback', async () => withFixture(async (root) => {
  await writeTree(root, { 'file.txt': 'x' });
  const collected = [];
  await walkTree(root, {
    maxFiles: 0,
    onWarning: (w) => collected.push(w)
  });
  assert.ok(collected.some((w) => w.code === 'SCAN_LIMIT_REACHED'));
}));

// ---------------------------------------------------------------------------
// readTextFileBounded
// ---------------------------------------------------------------------------

test('readTextFileBounded skips binary files and respects size cap', async () => withFixture(async (root) => {
  // A file with a null byte (binary indicator)
  const binPath = path.join(root, 'data.bin');
  await fs.writeFile(binPath, Buffer.from([0x48, 0x00, 0x49]));
  const binResult = await readTextFileBounded(binPath, 1_000_000);
  assert.equal(binResult.skipped, true);
  assert.equal(binResult.reason, 'binary');

  // A file that is too large
  const bigPath = path.join(root, 'big.txt');
  await fs.writeFile(bigPath, 'a'.repeat(10));
  const bigResult = await readTextFileBounded(bigPath, 5);
  assert.equal(bigResult.skipped, true);
  assert.equal(bigResult.reason, 'too-large');

  // A normal text file
  const textPath = path.join(root, 'text.md');
  await fs.writeFile(textPath, '# Hello\n');
  const textResult = await readTextFileBounded(textPath, 1_000_000);
  assert.equal(textResult.skipped, false);
  assert.match(textResult.content, /Hello/);
}));

// ---------------------------------------------------------------------------
// sha256File
// ---------------------------------------------------------------------------

test('sha256File produces the same digest for identical content', async () => withFixture(async (root) => {
  const a = path.join(root, 'a.txt');
  const b = path.join(root, 'b.txt');
  await fs.writeFile(a, 'identical content here');
  await fs.writeFile(b, 'identical content here');
  const [hashA, hashB] = await Promise.all([sha256File(a), sha256File(b)]);
  assert.equal(hashA, hashB);
  // Verify it is a 64-character hex string (SHA-256)
  assert.match(hashA, /^[0-9a-f]{64}$/);
}));

test('sha256File produces different digests for different content', async () => withFixture(async (root) => {
  const a = path.join(root, 'a.txt');
  const b = path.join(root, 'b.txt');
  await fs.writeFile(a, 'content-a');
  await fs.writeFile(b, 'content-b');
  const [hashA, hashB] = await Promise.all([sha256File(a), sha256File(b)]);
  assert.notEqual(hashA, hashB);
}));
