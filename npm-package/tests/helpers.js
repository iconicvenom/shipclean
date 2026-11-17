import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'shipclean.js');

export async function withFixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'shipclean-'));
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

export async function writeTree(root, tree) {
  for (const [relative, contents] of Object.entries(tree)) {
    const full = path.join(root, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    if (contents === null) await fs.mkdir(full, { recursive: true });
    else await fs.writeFile(full, contents);
  }
}

export function runBin(args, { cwd = process.cwd(), env = process.env, input = null } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd,
      env: { ...env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

export async function snapshotTree(root) {
  const listing = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        listing.push(`${rel}/`);
        stack.push(full);
      } else if (entry.isSymbolicLink()) {
        listing.push(`${rel}@`);
      } else {
        const stat = await fs.stat(full);
        listing.push(`${rel}:${stat.size}`);
      }
    }
  }
  return listing.sort();
}
