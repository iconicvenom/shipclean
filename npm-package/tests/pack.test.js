import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('npm pack --dry-run ships runtime files and excludes handoff docs', async () => {
  // Use a temporary cache directory to avoid permission issues with root-owned npm cache.
  const tmpCache = path.join(os.tmpdir(), `npm-pack-cache-${process.pid}`);
  const result = await run('npm', ['pack', '--dry-run', '--json', '--cache', tmpCache], pkgRoot);
  assert.equal(result.code, 0, `npm pack failed:\n${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  const files = (parsed[0]?.files || parsed.files || []).map((item) => item.path || item);
  const joined = files.join('\n');
  // Runtime files must be included
  assert.match(joined, /bin\/shipclean\.js/, 'bin/shipclean.js must be in tarball');
  assert.match(joined, /src\/scan\.js/, 'src/scan.js must be in tarball');
  assert.match(joined, /src\/classify\.js/, 'src/classify.js must be in tarball');
  assert.match(joined, /src\/protect\.js/, 'src/protect.js must be in tarball');
  assert.match(joined, /README\.md/, 'README.md must be in tarball');
  // Root handoff docs must NOT be included
  assert.equal(files.some((file) => String(file).includes('IMPLEMENTATION.md')), false,
    'IMPLEMENTATION.md must not be in tarball');
  assert.equal(files.some((file) => String(file).includes('MASTER_PROMPT.md')), false,
    'MASTER_PROMPT.md must not be in tarball');
  // Test files must NOT be included
  assert.equal(files.some((file) => String(file).includes('tests/')), false,
    'tests/ must not be in tarball');
  // project-notes must NOT be included
  assert.equal(files.some((file) => String(file).includes('project-notes')), false,
    'project-notes must not be in tarball');
});
