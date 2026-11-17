import { createLimiter, sha256File } from './filesystem.js';

export async function findDuplicateGroups(files, { concurrency = 4 } = {}) {
  const bySize = new Map();
  for (const file of files) {
    const key = file.sizeBytes;
    const group = bySize.get(key) ?? [];
    group.push(file);
    bySize.set(key, group);
  }

  const limiter = createLimiter(concurrency);
  const duplicateGroups = [];

  for (const [sizeBytes, group] of bySize) {
    if (group.length < 2) continue;
    if (sizeBytes === 0) {
      duplicateGroups.push(formatGroup(group, sizeBytes, 'zero-byte-identical-files'));
      continue;
    }
    const hashes = new Map();
    await Promise.all(group.map((file) => limiter(async () => {
      const digest = await sha256File(file.absolute);
      const matches = hashes.get(digest) ?? [];
      matches.push(file);
      hashes.set(digest, matches);
    })));
    for (const [digest, matches] of hashes) {
      if (matches.length > 1) {
        duplicateGroups.push({
          ...formatGroup(matches, sizeBytes, 'byte-identical-files'),
          sha256: digest
        });
      }
    }
  }

  duplicateGroups.sort((a, b) => a.paths[0].localeCompare(b.paths[0]));
  return duplicateGroups;
}

function formatGroup(matches, sizeBytes, reason) {
  const paths = matches.map((item) => item.relative).sort((a, b) => a.localeCompare(b));
  return {
    paths,
    sizeBytes,
    extraCopies: paths.length - 1,
    reclaimableBytes: sizeBytes * (paths.length - 1),
    reason,
    action: 'review',
    explanation: sizeBytes === 0
      ? 'Multiple empty files. Grouped as a finding; emptiness is not a deletion order.'
      : 'Files have identical SHA-256 content. Duplicate detection does not say which copy is unused.'
  };
}
