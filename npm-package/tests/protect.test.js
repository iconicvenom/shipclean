import test from 'node:test';
import assert from 'node:assert/strict';
import { protectionFor, shouldIgnoreDirectory, isHardIgnoredDirectory, isCredentialLike } from '../src/protect.js';

// ---------------------------------------------------------------------------
// Hard-protected names
// ---------------------------------------------------------------------------

test('protects canonical project and agent documents by name', () => {
  for (const name of [
    'README.md', 'CLAUDE.md', 'AGENTS.md', 'IMPLEMENTATION.md', 'MASTER_PROMPT.md',
    'LICENSE', 'package.json', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md'
  ]) {
    const info = protectionFor(name, name, []);
    assert.equal(info.protected, true, `${name} must be protected`);
    assert.equal(info.hard, true, `${name} must be hard-protected`);
  }
});

test('protects lockfiles from all major package managers', () => {
  for (const name of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'npm-shrinkwrap.json']) {
    const info = protectionFor(name, name, []);
    assert.equal(info.protected, true, `${name} must be protected`);
  }
});

test('protects TypeScript and build configs', () => {
  for (const name of ['tsconfig.json', 'jsconfig.json', 'vite.config.js', 'vite.config.ts', 'webpack.config.js', 'rollup.config.mjs']) {
    const info = protectionFor(name, name, []);
    assert.equal(info.protected, true, `${name} must be protected`);
  }
});

test('protects linter and formatter configs', () => {
  for (const name of ['.eslintrc.json', '.prettierrc', '.editorconfig', '.eslintignore', '.prettierignore']) {
    const info = protectionFor(name, name, []);
    assert.equal(info.protected, true, `${name} must be protected`);
  }
});

test('protects Docker and CI infrastructure files', () => {
  const info1 = protectionFor('dockerfile', 'dockerfile', []);
  assert.equal(info1.protected, true, 'dockerfile must be protected');

  const info2 = protectionFor('.docker-compose.yml', 'docker-compose.yml', []);
  assert.equal(info2.protected, true, 'docker-compose.yml must be protected');

  const info3 = protectionFor('.github/workflows/ci.yml', 'ci.yml', []);
  assert.equal(info3.protected, true, '.github/ paths must be protected');

  const info4 = protectionFor('.travis.yml', '.travis.yml', []);
  assert.equal(info4.protected, true, '.travis.yml must be protected');
});

test('protects agent-specific rule files by path pattern', () => {
  const cursorrules = protectionFor('.cursorrules', '.cursorrules', []);
  assert.equal(cursorrules.protected, true, '.cursorrules must be protected');

  const copilot = protectionFor('copilot-instructions.md', 'copilot-instructions.md', []);
  assert.equal(copilot.protected, true, 'copilot-instructions.md must be protected');
});

// ---------------------------------------------------------------------------
// Protected directory prefixes
// ---------------------------------------------------------------------------

test('protects src, public, and assets trees', () => {
  assert.equal(protectionFor('src/logo.png', 'logo.png', []).protected, true);
  assert.equal(protectionFor('src/components/Button.tsx', 'Button.tsx', []).protected, true);
  assert.equal(protectionFor('public/favicon.ico', 'favicon.ico', []).protected, true);
  assert.equal(protectionFor('public/images/hero.jpg', 'hero.jpg', []).protected, true);
  assert.equal(protectionFor('assets/hero.webp', 'hero.webp', []).protected, true);
  assert.equal(protectionFor('assets/fonts/inter.woff2', 'inter.woff2', []).protected, true);
});

test('protection for src/public/assets is case-insensitive', () => {
  // Case-insensitive path matching
  assert.equal(protectionFor('SRC/logo.png', 'logo.png', []).protected, true);
  assert.equal(protectionFor('Public/favicon.ico', 'favicon.ico', []).protected, true);
});

// ---------------------------------------------------------------------------
// Credential-like files
// ---------------------------------------------------------------------------

test('protects credential-like names', () => {
  assert.equal(protectionFor('.env', '.env', []).protected, true);
  assert.equal(protectionFor('.env.local', '.env.local', []).protected, true);
  assert.equal(protectionFor('.env.production', '.env.production', []).protected, true);
  assert.equal(protectionFor('certs/site.pem', 'site.pem', []).protected, true);
  assert.equal(protectionFor('credentials.json', 'credentials.json', []).protected, true);
  assert.equal(protectionFor('secrets.json', 'secrets.json', []).protected, true);
});

test('isCredentialLike identifies common secret file patterns', () => {
  assert.equal(isCredentialLike('.env', '.env'), true);
  assert.equal(isCredentialLike('keys/id_rsa', 'id_rsa'), true);
  assert.equal(isCredentialLike('certs/server.pem', 'server.pem'), true);
  assert.equal(isCredentialLike('credentials.json', 'credentials.json'), true);
  // Normal project files are not credential-like
  assert.equal(isCredentialLike('src/api.js', 'api.js'), false);
  assert.equal(isCredentialLike('README.md', 'README.md'), false);
});

// ---------------------------------------------------------------------------
// User-specified protection (soft protect)
// ---------------------------------------------------------------------------

test('user protect patterns are additive and cannot unprotect README', () => {
  const extra = protectionFor('docs/handbook.md', 'handbook.md', ['docs/handbook.md']);
  assert.equal(extra.protected, true);
  assert.equal(extra.hard, false);
  assert.match(extra.reason, /user protect pattern/i);

  // Hard protect is never overridden
  assert.equal(protectionFor('README.md', 'README.md', []).protected, true);
  assert.equal(protectionFor('README.md', 'README.md', []).hard, true);
});

test('user protect patterns match by basename', () => {
  const result = protectionFor('docs/notes.md', 'notes.md', ['notes.md']);
  assert.equal(result.protected, true);
  assert.equal(result.hard, false);
});

test('user protect patterns do not match unrelated files', () => {
  const result = protectionFor('other.md', 'other.md', ['notes.md', 'docs/guide.md']);
  assert.equal(result.protected, false);
});

// ---------------------------------------------------------------------------
// Hard-ignored directories
// ---------------------------------------------------------------------------

test('hard-ignores VCS and dependency directories', () => {
  assert.equal(isHardIgnoredDirectory('.git'), true);
  assert.equal(isHardIgnoredDirectory('node_modules'), true);
  assert.equal(shouldIgnoreDirectory('.shipclean-quarantine', '.shipclean-quarantine', []), true);
  assert.equal(shouldIgnoreDirectory('vendor', 'vendor', ['vendor/']), true);
  assert.equal(shouldIgnoreDirectory('src', 'src', []), false);
});

test('hard-ignores build and cache directories', () => {
  for (const dir of ['dist', 'build', 'coverage', '.turbo', '.cache', '.next', '.nuxt']) {
    assert.equal(isHardIgnoredDirectory(dir), true, `${dir} must be hard-ignored`);
  }
});

test('hard-ignore is case-insensitive for directory names', () => {
  assert.equal(isHardIgnoredDirectory('Node_Modules'), true);
  assert.equal(isHardIgnoredDirectory('DIST'), true);
});

test('shouldIgnoreDirectory respects user-specified ignore patterns', () => {
  assert.equal(shouldIgnoreDirectory('vendor', 'vendor', ['vendor']), true);
  assert.equal(shouldIgnoreDirectory('vendor', 'vendor', ['vendor/']), true);
  assert.equal(shouldIgnoreDirectory('docs', 'docs', ['vendor/']), false);
});

test('shouldIgnoreDirectory skips blank patterns safely', () => {
  assert.equal(shouldIgnoreDirectory('docs', 'docs', ['', '  ']), false);
});

// ---------------------------------------------------------------------------
// Files that must NOT be protected (negative cases)
// ---------------------------------------------------------------------------

test('ordinary markdown outside protected names is not automatically protected', () => {
  // A random markdown file should not be protected
  const info = protectionFor('docs/guide.md', 'guide.md', []);
  assert.equal(info.protected, false, 'docs/guide.md must not be automatically protected');
});

test('images in screenshots/ are not protected (they are candidates)', () => {
  const info = protectionFor('screenshots/home.png', 'home.png', []);
  assert.equal(info.protected, false, 'screenshots/ images must not be automatically protected');
});

test('debug.log and backup files are not protected', () => {
  assert.equal(protectionFor('debug.log', 'debug.log', []).protected, false);
  assert.equal(protectionFor('old.bak', 'old.bak', []).protected, false);
  assert.equal(protectionFor('TASKS.md', 'TASKS.md', []).protected, false);
});
