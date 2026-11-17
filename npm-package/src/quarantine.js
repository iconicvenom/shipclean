import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ERROR_CODES, ShipcleanError } from './errors.js';
import { isInsideRoot, resolveScanRoot, sha256File, toPosix } from './filesystem.js';
import { protectionFor } from './protect.js';
import { scanProject } from './scan.js';

export const QUARANTINE_DIR = '.shipclean-quarantine';

function batchId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = crypto.randomBytes(4).toString('hex');
  return `${stamp}-${rand}`;
}

export async function withLock(root, fn) {
  const dir = path.join(root, QUARANTINE_DIR);
  await fsp.mkdir(dir, { recursive: true });
  const lockPath = path.join(dir, '.lock');
  let handle;
  try {
    handle = await fsp.open(lockPath, 'wx');
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      throw new ShipcleanError(
        'Another shipclean cleanup is already in progress (lock file exists).',
        ERROR_CODES.LOCK_FAILED,
        1
      );
    }
    throw error;
  }
  try {
    await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
    return await fn();
  } finally {
    await handle.close();
    await fsp.unlink(lockPath).catch(() => {});
  }
}

async function moveFile(from, to) {
  await fsp.mkdir(path.dirname(to), { recursive: true });
  try {
    await fsp.rename(from, to);
  } catch (error) {
    if (error && error.code === 'EXDEV') {
      await fsp.copyFile(from, to);
      const [a, b] = await Promise.all([sha256File(from), sha256File(to)]);
      if (a !== b) {
        await fsp.unlink(to).catch(() => {});
        throw new ShipcleanError('Cross-device copy failed hash verification.', ERROR_CODES.SCAN_FAILED, 1);
      }
      await fsp.unlink(from);
      return;
    }
    throw error;
  }
}

export async function quarantineSelected({ root, selected, dryRun = false, scanReport }) {
  const resolvedRoot = await resolveScanRoot(root);
  const report = scanReport || await scanProject(resolvedRoot);
  const unique = [...new Set(selected.map((item) => toPosix(item)))];
  if (!unique.length) {
    return { id: null, dryRun, moved: [], skipped: [], notice: 'Nothing selected.' };
  }

  const byPath = new Map(report.findings.map((item) => [item.path, item]));
  const planned = [];
  for (const relative of unique) {
    if (relative.includes('..') || path.isAbsolute(relative)) {
      throw new ShipcleanError(`Refusing path that is not project-relative: ${relative}`, ERROR_CODES.PATH_ESCAPE, 2);
    }
    const absolute = path.resolve(resolvedRoot, relative);
    if (!isInsideRoot(resolvedRoot, absolute)) {
      throw new ShipcleanError(`Path escapes scan root: ${relative}`, ERROR_CODES.PATH_ESCAPE, 2);
    }
    const name = path.basename(relative);
    const protection = protectionFor(relative, name, []);
    if (protection.protected) {
      throw new ShipcleanError(`Refusing to quarantine protected path: ${relative}`, ERROR_CODES.PROTECTED_PATH, 2);
    }
    const finding = byPath.get(relative);
    if (!finding) {
      throw new ShipcleanError(`Not a current scan candidate: ${relative}`, ERROR_CODES.INVALID_USAGE, 2);
    }
    let stats;
    try {
      stats = await fsp.lstat(absolute);
    } catch {
      throw new ShipcleanError(`File missing during cleanup: ${relative}`, ERROR_CODES.CHANGED_SINCE_SCAN, 1);
    }
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new ShipcleanError(`Refusing non-regular file: ${relative}`, ERROR_CODES.PROTECTED_PATH, 2);
    }
    if (stats.size !== finding.sizeBytes) {
      throw new ShipcleanError(`File changed since scan: ${relative}`, ERROR_CODES.CHANGED_SINCE_SCAN, 1);
    }
    planned.push({ relative, absolute, sizeBytes: stats.size, mtimeMs: stats.mtimeMs, finding });
  }

  const id = batchId();
  if (dryRun) {
    return {
      schemaVersion: 1,
      id,
      dryRun: true,
      moved: planned.map((item) => item.relative),
      skipped: [],
      notice: 'Dry run. No files were moved.'
    };
  }

  return withLock(resolvedRoot, async () => {
    const batchDir = path.join(resolvedRoot, QUARANTINE_DIR, id);
    await fsp.mkdir(batchDir, { recursive: true });
    const items = [];
    for (const item of planned) {
      const digest = await sha256File(item.absolute);
      const dest = path.join(batchDir, item.relative);
      if (!isInsideRoot(batchDir, dest)) {
        throw new ShipcleanError('Quarantine destination escaped batch directory.', ERROR_CODES.PATH_ESCAPE, 2);
      }
      await moveFile(item.absolute, dest);
      items.push({
        originalRelative: item.relative,
        quarantineRelative: toPosix(path.relative(resolvedRoot, dest)),
        sizeBytes: item.sizeBytes,
        sha256: digest,
        mtimeMs: item.mtimeMs,
        ruleId: item.finding.ruleId
      });
    }
    const manifest = {
      schemaVersion: 1,
      id,
      createdAt: new Date().toISOString(),
      scanRoot: resolvedRoot,
      items
    };
    const manifestPath = path.join(batchDir, 'manifest.json');
    const tmp = `${manifestPath}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await fsp.rename(tmp, manifestPath);
    return {
      schemaVersion: 1,
      id,
      dryRun: false,
      moved: items.map((item) => item.originalRelative),
      skipped: [],
      manifestPath: toPosix(path.relative(resolvedRoot, manifestPath)),
      notice: 'Files were moved to quarantine. They were not permanently deleted.'
    };
  });
}
