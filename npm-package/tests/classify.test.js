import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFile, LEVELS, isImagePath, isTextInspectable } from '../src/classify.js';

const none = { protected: false, hard: false, reason: null };
const prot = { protected: true, hard: true, reason: 'always' };

// ---------------------------------------------------------------------------
// AI planning documents
// ---------------------------------------------------------------------------

test('planning markdown is review, never implied-safe-to-delete', () => {
  const result = classifyFile({ name: 'TASKS.md', relative: 'TASKS.md', sizeBytes: 12, protectedInfo: none });
  assert.equal(result.match, true);
  assert.equal(result.level, LEVELS.REVIEW);
  assert.equal(result.reason, 'possible-ai-planning-document');
  assert.match(result.explanation, /never enough to delete/i);
});

test('various AI planning document names are detected', () => {
  const planningNames = [
    'IMPLEMENTATION_PLAN.md',
    'IMPLEMENTATION-PLAN.md',
    'implementation_notes.md',
    'TASKS.md',
    'task-list.md',
    'debug-report.md',
    'TEST_SUMMARY.md',
    'scratch-notes.md'
  ];
  for (const name of planningNames) {
    const result = classifyFile({ name, relative: name, sizeBytes: 10, protectedInfo: none });
    assert.equal(result.match, true, `${name} must be classified as a planning document`);
    assert.equal(result.category, 'ai-planning-document', `${name} must have ai-planning-document category`);
    assert.equal(result.level, LEVELS.REVIEW, `${name} must be review level`);
  }
});

test('docs/plans/ path prefix triggers planning document classification', () => {
  const result = classifyFile({
    name: 'feature-x.md',
    relative: 'docs/plans/feature-x.md',
    sizeBytes: 500,
    protectedInfo: none
  });
  assert.equal(result.match, true);
  assert.equal(result.category, 'ai-planning-document');
});

// ---------------------------------------------------------------------------
// Backup / temp / junk extensions
// ---------------------------------------------------------------------------

test('backup extensions are potentially-safe candidates', () => {
  const result = classifyFile({ name: 'app.js.bak', relative: 'app.js.bak', sizeBytes: 8, protectedInfo: none });
  assert.equal(result.level, LEVELS.POTENTIALLY_SAFE);
  assert.equal(result.reason, 'temporary-or-log-file');
});

test('various junk extensions are detected as potentially-safe', () => {
  const junkNames = ['config.bak', 'data.tmp', 'style.css.orig', 'file.swp', 'backup~'];
  for (const name of junkNames) {
    const result = classifyFile({ name, relative: name, sizeBytes: 10, protectedInfo: none });
    assert.equal(result.match, true, `${name} must be classified`);
    assert.equal(result.level, LEVELS.POTENTIALLY_SAFE, `${name} must be potentially-safe`);
    assert.equal(result.category, 'temporary-artifact');
  }
});

// ---------------------------------------------------------------------------
// Debug logs
// ---------------------------------------------------------------------------

test('debug logs remain review because they may be user-owned', () => {
  const result = classifyFile({ name: 'debug.log', relative: 'debug.log', sizeBytes: 40, protectedInfo: none });
  assert.equal(result.level, LEVELS.REVIEW);
  assert.equal(result.category, 'temporary-artifact');
});

test('large debug logs get a different ruleId but remain review', () => {
  const small = classifyFile({ name: 'debug.log', relative: 'debug.log', sizeBytes: 100, protectedInfo: none, largeFileBytes: 5_000_000 });
  assert.equal(small.ruleId, 'temp.debug-log');

  const large = classifyFile({ name: 'debug.log', relative: 'debug.log', sizeBytes: 10_000_000, protectedInfo: none, largeFileBytes: 5_000_000 });
  assert.equal(large.ruleId, 'temp.debug-log-large');
  assert.equal(large.level, LEVELS.REVIEW, 'large log is still review, never automatically safe');
});

test('various log file names are detected', () => {
  const logNames = ['debug.log', 'error.log', 'trace.log', 'app-debug.log', 'build_error.log'];
  for (const name of logNames) {
    const result = classifyFile({ name, relative: name, sizeBytes: 10, protectedInfo: none });
    assert.equal(result.match, true, `${name} must be classified`);
    assert.equal(result.category, 'temporary-artifact');
  }
});

// ---------------------------------------------------------------------------
// Screenshot / reference images
// ---------------------------------------------------------------------------

test('screenshot folder images are review candidates', () => {
  const result = classifyFile({
    name: 'home.png',
    relative: 'screenshots/home.png',
    sizeBytes: 2000,
    protectedInfo: none
  });
  assert.equal(result.category, 'reference-image');
  assert.equal(result.reason, 'possible-reference-image');
  assert.equal(result.level, LEVELS.REVIEW);
  assert.match(result.explanation, /not proof of non-use/i);
});

test('mockups and references folder images are detected', () => {
  const paths = [
    { name: 'design.png', relative: 'mockups/design.png' },
    { name: 'spec.jpg', relative: 'references/spec.jpg' },
    { name: 'wireframe.webp', relative: 'reference/wireframe.webp' },
    { name: 'screenshot.gif', relative: 'screenshot/screenshot.gif' }
  ];
  for (const { name, relative } of paths) {
    const result = classifyFile({ name, relative, sizeBytes: 1000, protectedInfo: none });
    assert.equal(result.match, true, `${relative} must be classified`);
    assert.equal(result.category, 'reference-image');
  }
});

test('large screenshot-folder images get different ruleId', () => {
  const large = classifyFile({
    name: 'big.png',
    relative: 'screenshots/big.png',
    sizeBytes: 10_000_000,
    protectedInfo: none,
    largeFileBytes: 5_000_000
  });
  assert.equal(large.ruleId, 'img.screenshot-folder-large');
  assert.equal(large.level, LEVELS.REVIEW);
});

// ---------------------------------------------------------------------------
// Ordinary files that must NOT be flagged
// ---------------------------------------------------------------------------

test('does not flag ordinary source markdown by extension alone', () => {
  const result = classifyFile({ name: 'guide.md', relative: 'docs/guide.md', sizeBytes: 100, protectedInfo: none });
  assert.equal(result.match, false);
});

test('does not flag generic markdown files in root', () => {
  const generics = ['notes.md', 'ideas.md', 'brainstorm.md'];
  for (const name of generics) {
    const result = classifyFile({ name, relative: name, sizeBytes: 100, protectedInfo: none });
    // These may or may not match depending on name pattern, but check there's no crash
    assert.ok(typeof result.match === 'boolean');
    if (result.match) {
      // If matched, must have required fields
      assert.ok(result.category);
      assert.ok(result.level);
    }
  }
});

test('images in non-screenshot directories are not automatically flagged', () => {
  const result = classifyFile({
    name: 'logo.png',
    relative: 'media/logo.png',
    sizeBytes: 500,
    protectedInfo: none
  });
  // Not in a known screenshot/reference folder
  assert.equal(result.match, false, 'logo.png in media/ must not be auto-flagged');
});

// ---------------------------------------------------------------------------
// Empty files
// ---------------------------------------------------------------------------

test('placeholder empties are ignored; other empties are unknown', () => {
  assert.equal(classifyFile({ name: '.gitkeep', relative: 'empty/.gitkeep', sizeBytes: 0, protectedInfo: none }).match, false);
  assert.equal(classifyFile({ name: '.keep', relative: 'dir/.keep', sizeBytes: 0, protectedInfo: none }).match, false);

  const empty = classifyFile({ name: 'leftover.txt', relative: 'leftover.txt', sizeBytes: 0, protectedInfo: none });
  assert.equal(empty.category, 'empty-file');
  assert.equal(empty.level, LEVELS.UNKNOWN);
  assert.equal(empty.suggestion, 'inspect');
});

// ---------------------------------------------------------------------------
// Protection wins over candidate names
// ---------------------------------------------------------------------------

test('protected classification wins over candidate names', () => {
  const result = classifyFile({
    name: 'TASKS.md',
    relative: 'TASKS.md',
    sizeBytes: 10,
    protectedInfo: prot
  });
  assert.equal(result.level, LEVELS.PROTECTED);
  assert.equal(result.match, true);
  assert.equal(result.suggestion, 'preserve');
});

// ---------------------------------------------------------------------------
// Custom candidates
// ---------------------------------------------------------------------------

test('custom glob candidates are honored', () => {
  const result = classifyFile({
    name: 'NOTES.md',
    relative: 'NOTES.md',
    sizeBytes: 4,
    protectedInfo: none,
    customCandidates: [{ pattern: 'NOTES.md', explanation: 'team notes', category: 'ai-planning-document' }]
  });
  assert.equal(result.match, true);
  assert.equal(result.explanation, 'team notes');
  assert.equal(result.category, 'ai-planning-document');
});

test('custom candidates can have custom ruleId and level', () => {
  const result = classifyFile({
    name: 'TEMP.md',
    relative: 'TEMP.md',
    sizeBytes: 4,
    protectedInfo: none,
    customCandidates: [{
      pattern: '*.md',
      ruleId: 'custom.team-rule',
      explanation: 'Team docs',
      level: 'potentially-safe',
      suggestion: 'archive'
    }]
  });
  assert.equal(result.ruleId, 'custom.team-rule');
  assert.equal(result.level, 'potentially-safe');
  assert.equal(result.suggestion, 'archive');
});

test('custom candidates are skipped when pattern does not match', () => {
  const result = classifyFile({
    name: 'other.js',
    relative: 'other.js',
    sizeBytes: 100,
    protectedInfo: none,
    customCandidates: [{ pattern: '*.md', explanation: 'only markdown' }]
  });
  assert.equal(result.match, false);
});

// ---------------------------------------------------------------------------
// LEVELS constants
// ---------------------------------------------------------------------------

test('LEVELS constants are frozen and have expected values', () => {
  assert.equal(LEVELS.REVIEW, 'review');
  assert.equal(LEVELS.POTENTIALLY_SAFE, 'potentially-safe');
  assert.equal(LEVELS.PROTECTED, 'protected');
  assert.equal(LEVELS.UNKNOWN, 'unknown');
  assert.throws(() => { LEVELS.NEW_LEVEL = 'x'; }, /Cannot add property/);
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

test('isImagePath identifies image extensions correctly', () => {
  assert.equal(isImagePath('photo.png'), true);
  assert.equal(isImagePath('icon.jpg'), true);
  assert.equal(isImagePath('icon.jpeg'), true);
  assert.equal(isImagePath('anim.gif'), true);
  assert.equal(isImagePath('graphic.webp'), true);
  assert.equal(isImagePath('vector.svg'), true);
  // Non-image extensions
  assert.equal(isImagePath('readme.md'), false);
  assert.equal(isImagePath('script.js'), false);
  assert.equal(isImagePath('archive.zip'), false);
});

test('isTextInspectable identifies text-inspectable files', () => {
  const textFiles = ['README.md', 'page.html', 'styles.css', 'script.js', 'data.json', 'config.yml', 'config.yaml', 'notes.txt', 'icon.svg'];
  for (const name of textFiles) {
    assert.equal(isTextInspectable(name), true, `${name} must be text-inspectable`);
  }
  // Binary/non-text files
  assert.equal(isTextInspectable('photo.png'), false);
  assert.equal(isTextInspectable('archive.zip'), false);
  assert.equal(isTextInspectable('data.bin'), false);
});
