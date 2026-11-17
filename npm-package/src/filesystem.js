import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { ShipcleanError, ERROR_CODES } from './errors.js';

export function toPosix(relativePath) {
  return String(relativePath).split(path.sep).join('/');
}

export function displaySafe(value) {
  return String(value).replace(/[\u0000-\u001F\u007F]/g, '\uFFFD');
}

export function isInsideRoot(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedRoot === resolvedTarget) return true;
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function createLimiter(max) {
  const limit = Math.max(1, Number(max) || 1);
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= limit || queue.length === 0) return;
    const job = queue.shift();
    active += 1;
    Promise.resolve()
      .then(job.fn)
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    pump();
  });
}

export async function sha256File(absolutePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(absolutePath), hash);
  return hash.digest('hex');
}

export async function resolveScanRoot(inputPath) {
  const resolved = path.resolve(inputPath);
  let stats;
  try {
    stats = await fsp.lstat(resolved);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new ShipcleanError(`Path not found: ${displaySafe(resolved)}`, ERROR_CODES.PATH_NOT_FOUND, 1);
    }
    throw new ShipcleanError(`Cannot access path: ${error.message}`, ERROR_CODES.SCAN_FAILED, 1);
  }
  if (stats.isSymbolicLink()) {
    const targetStats = await fsp.stat(resolved);
    if (!targetStats.isDirectory()) {
      throw new ShipcleanError('Target is not a directory', ERROR_CODES.NOT_A_DIRECTORY, 1);
    }
  } else if (!stats.isDirectory()) {
    throw new ShipcleanError('Target is not a directory', ERROR_CODES.NOT_A_DIRECTORY, 1);
  }
  return fsp.realpath(resolved);
}

export function globToRegExp(pattern) {
  const normalized = String(pattern).replace(/\\/g, '/');
  let source = '';
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '*' && normalized[i + 1] === '*') {
      const after = normalized[i + 2];
      if (after === '/') {
        source += '(?:.*/)?';
        i += 2;
      } else {
        source += '.*';
        i += 1;
      }
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    if ('\\^$+{}[]()|/.'.includes(char)) source += `\\${char}`;
    else source += char;
  }
  return new RegExp(`^${source}$`, 'i');
}

export function matchGlob(posixPath, pattern) {
  const normalizedPattern = String(pattern).replace(/\\/g, '/');
  const regex = globToRegExp(normalizedPattern);
  if (regex.test(posixPath)) return true;
  const base = posixPath.split('/').pop();
  return regex.test(base);
}

export async function walkTree(root, {
  shouldIgnoreDir,
  maxFiles = 20000,
  maxDepth = 40,
  onWarning
} = {}) {
  const files = [];
  const warnings = [];
  const warn = (warning) => {
    warnings.push(warning);
    if (onWarning) onWarning(warning);
  };
  let filesScanned = 0;
  let dirsScanned = 0;
  let bytesScanned = 0;
  let symlinksSkipped = 0;
  let skippedEntries = 0;
  let partial = false;
  const stack = [{ dir: root, depth: 0 }];

  while (stack.length) {
    const { dir, depth } = stack.pop();
    dirsScanned += 1;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (error) {
      skippedEntries += 1;
      warn({
        code: 'READDIR_FAILED',
        path: toPosix(path.relative(root, dir)),
        message: error.message
      });
      continue;
    }

    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (!isInsideRoot(root, absolute)) {
        skippedEntries += 1;
        warn({
          code: 'PATH_OUTSIDE_ROOT',
          path: displaySafe(entry.name),
          message: 'Skipped a path that resolved outside the scan root.'
        });
        continue;
      }
      const relative = toPosix(path.relative(root, absolute));
      let stats;
      try {
        stats = await fsp.lstat(absolute);
      } catch (error) {
        skippedEntries += 1;
        warn({ code: 'STAT_FAILED', path: relative, message: error.message });
        continue;
      }
      if (stats.isSymbolicLink()) {
        symlinksSkipped += 1;
        skippedEntries += 1;
        continue;
      }
      if (stats.isDirectory()) {
        if (depth + 1 > maxDepth) {
          skippedEntries += 1;
          warn({ code: 'MAX_DEPTH', path: relative, message: `Directory exceeds max depth ${maxDepth}.` });
          continue;
        }
        if (shouldIgnoreDir && shouldIgnoreDir(entry.name, relative)) {
          skippedEntries += 1;
          continue;
        }
        stack.push({ dir: absolute, depth: depth + 1 });
        continue;
      }
      if (!stats.isFile()) {
        skippedEntries += 1;
        continue;
      }
      if (filesScanned >= maxFiles) {
        partial = true;
        skippedEntries += 1;
        continue;
      }
      filesScanned += 1;
      bytesScanned += stats.size;
      files.push({
        absolute,
        relative,
        name: entry.name,
        sizeBytes: stats.size,
        mtimeMs: stats.mtimeMs,
        mode: stats.mode
      });
    }
  }

  if (partial) {
    warn({
      code: 'SCAN_LIMIT_REACHED',
      path: '.',
      message: `Stopped after ${maxFiles} files. Results are partial.`
    });
  }

  files.sort((a, b) => a.relative.localeCompare(b.relative));
  return {
    files,
    warnings,
    summary: {
      filesScanned,
      dirsScanned,
      bytesScanned,
      symlinksSkipped,
      skippedEntries,
      partial
    }
  };
}

export async function readTextFileBounded(absolutePath, maxBytes) {
  const stats = await fsp.lstat(absolutePath);
  if (!stats.isFile()) return { skipped: true, reason: 'not-a-file' };
  if (stats.size > maxBytes) return { skipped: true, reason: 'too-large', sizeBytes: stats.size };
  const buffer = await fsp.readFile(absolutePath);
  if (buffer.includes(0)) return { skipped: true, reason: 'binary' };
  return { skipped: false, content: buffer.toString('utf8'), sizeBytes: stats.size };
}
