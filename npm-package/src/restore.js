import fsp from 'node:fs/promises';
import path from 'node:path';
import { ERROR_CODES, ShipcleanError } from './errors.js';
import { isInsideRoot, resolveScanRoot, sha256File, toPosix } from './filesystem.js';
import { QUARANTINE_DIR } from './quarantine.js';

async function readManifest(root, id) {
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\') || path.isAbsolute(id)) {
    throw new ShipcleanError('Invalid batch id.', ERROR_CODES.MANIFEST_INVALID, 2);
  }
  const batchDir = path.join(root, QUARANTINE_DIR, id);
  if (!isInsideRoot(path.join(root, QUARANTINE_DIR), batchDir)) {
    throw new ShipcleanError('Batch directory escapes quarantine root.', ERROR_CODES.PATH_ESCAPE, 2);
  }
  const manifestPath = path.join(batchDir, 'manifest.json');
  let raw;
  try {
    raw = await fsp.readFile(manifestPath, 'utf8');
  } catch {
    throw new ShipcleanError(`No quarantine batch named ${id}.`, ERROR_CODES.PATH_NOT_FOUND, 1);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ShipcleanError('Quarantine manifest is not valid JSON.', ERROR_CODES.MANIFEST_INVALID, 1);
  }
  if (!parsed || parsed.schemaVersion !== 1 || parsed.id !== id || !Array.isArray(parsed.items)) {
    throw new ShipcleanError('Quarantine manifest failed validation.', ERROR_CODES.MANIFEST_INVALID, 1);
  }
  return { parsed, batchDir, manifestPath };
}

export async function listQuarantineBatches(root) {
  const resolvedRoot = await resolveScanRoot(root);
  const base = path.join(resolvedRoot, QUARANTINE_DIR);
  let names = [];
  try {
    names = await fsp.readdir(base);
  } catch (error) {
    if (error && error.code === 'ENOENT') return { root: resolvedRoot, batches: [] };
    throw error;
  }
  const batches = [];
  for (const name of names.sort()) {
    if (name.startsWith('.')) continue;
    try {
      const { parsed } = await readManifest(resolvedRoot, name);
      batches.push({
        id: parsed.id,
        createdAt: parsed.createdAt,
        itemCount: parsed.items.length
      });
    } catch {
      batches.push({ id: name, createdAt: null, itemCount: 0, warning: 'unreadable-manifest' });
    }
  }
  return { root: resolvedRoot, batches };
}

export async function restoreBatch({ root, id, dryRun = false }) {
  const resolvedRoot = await resolveScanRoot(root);
  const { parsed, batchDir } = await readManifest(resolvedRoot, id);
  const restored = [];
  for (const item of parsed.items) {
    const originalRelative = toPosix(item.originalRelative || '');
    const quarantineRelative = toPosix(item.quarantineRelative || '');
    if (!originalRelative || originalRelative.includes('..') || path.isAbsolute(originalRelative)) {
      throw new ShipcleanError('Manifest contains a traversal original path.', ERROR_CODES.PATH_ESCAPE, 2);
    }
    if (!quarantineRelative || quarantineRelative.includes('..') || path.isAbsolute(quarantineRelative)) {
      throw new ShipcleanError('Manifest contains a traversal quarantine path.', ERROR_CODES.PATH_ESCAPE, 2);
    }
    const from = path.resolve(resolvedRoot, quarantineRelative);
    const to = path.resolve(resolvedRoot, originalRelative);
    if (!isInsideRoot(batchDir, from) && !isInsideRoot(path.join(resolvedRoot, QUARANTINE_DIR), from)) {
      throw new ShipcleanError('Quarantine file is outside quarantine storage.', ERROR_CODES.PATH_ESCAPE, 2);
    }
    if (!isInsideRoot(resolvedRoot, to)) {
      throw new ShipcleanError('Restore destination escapes project root.', ERROR_CODES.PATH_ESCAPE, 2);
    }
    let destStats;
    try {
      destStats = await fsp.lstat(to);
    } catch {
      destStats = null;
    }
    if (destStats) {
      throw new ShipcleanError(`Refusing to overwrite existing file: ${originalRelative}`, ERROR_CODES.OVERWRITE_REFUSED, 1);
    }
    if (!dryRun) {
      const digest = await sha256File(from);
      if (item.sha256 && digest !== item.sha256) {
        throw new ShipcleanError(`Quarantined file hash mismatch: ${originalRelative}`, ERROR_CODES.CHANGED_SINCE_SCAN, 1);
      }
      await fsp.mkdir(path.dirname(to), { recursive: true });
      try {
        await fsp.rename(from, to);
      } catch (error) {
        if (error && error.code === 'EXDEV') {
          await fsp.copyFile(from, to);
          await fsp.unlink(from);
        } else {
          throw error;
        }
      }
    }
    restored.push(originalRelative);
  }
  return {
    schemaVersion: 1,
    id,
    dryRun,
    restored,
    notice: dryRun ? 'Dry run. No files were restored.' : 'Restore complete.'
  };
}
